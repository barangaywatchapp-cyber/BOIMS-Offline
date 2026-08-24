/**
 * BOIMS Offline Architecture
 * Phase 6 — Dead Letter Queue (DLQ) & Failure Recovery Service
 *
 * Provides dedicated diagnostics, monitoring, and authorized manual recovery
 * for mutations that exceeded maximum retries or encountered permanent failures.
 *
 * Guarantees:
 * - Complete diagnostic preservation (error codes, failure reasons, retry counts)
 * - Zero credentials/tokens/secrets stored or exposed
 * - Multi-account safety (verifies originating user or admin authorization before retry)
 * - Crash-safe queue transitions
 * - No automatic replay of quarantined DLQ items
 */

import { offlineStorage } from './storage';
import {
  DeadLetterItem,
  DLQStats,
  DLQFailureReason,
  OfflineMutation,
  isMutationAuthorized,
  validateOfflineMutation,
} from './types';
import type { User } from '../types';

export class DeadLetterQueueService {
  /**
   * Retrieves all items currently quarantined in the Dead Letter Queue.
   */
  async getDLQItems(): Promise<DeadLetterItem[]> {
    return await offlineStorage.getDLQ();
  }

  /**
   * Retrieves a single DLQ item by its unique DLQ identifier.
   */
  async getDLQItem(dlqId: string): Promise<DeadLetterItem | null> {
    return await offlineStorage.getDLQItem(dlqId);
  }

  /**
   * Retrieves a DLQ item by its original queue identifier.
   */
  async getDLQItemByOriginalQueueId(originalQueueId: string): Promise<DeadLetterItem | null> {
    return await offlineStorage.getDLQItemByOriginalQueueId(originalQueueId);
  }

  /**
   * Generates aggregated statistics and failure breakdown from the DLQ.
   */
  async getDLQStats(): Promise<DLQStats> {
    const items = await this.getDLQItems();
    const byCollection: Record<string, number> = {};
    const byReason: Record<DLQFailureReason, number> = {
      max_retries_exceeded: 0,
      permanent_error: 0,
      security_rejection: 0,
      structural_validation_failed: 0,
      authentication_required: 0,
      manual_quarantine: 0,
    };

    let lastFailedAt: string | null = null;

    for (const item of items) {
      byCollection[item.collectionName] = (byCollection[item.collectionName] || 0) + 1;
      if (item.failureReason in byReason) {
        byReason[item.failureReason]++;
      }

      if (!lastFailedAt || new Date(item.failedAt).getTime() > new Date(lastFailedAt).getTime()) {
        lastFailedAt = item.failedAt;
      }
    }

    return {
      totalFailed: items.length,
      lastFailedAt,
      byCollection,
      byReason,
    };
  }

  /**
   * Manually retries a quarantined DLQ item.
   *
   * Security & Safety Rules:
   * 1. Verifies that the DLQ item exists.
   * 2. If a context user is supplied:
   *    - Revalidates that the user is active and not suspended.
   *    - Checks multi-account ownership: non-admin users cannot retry mutations authored by other users.
   *    - Revalidates role-based authorization for the collection and operation.
   * 3. Validates mutation structural integrity.
   * 4. Resets retryCount to 0 and status to 'pending'.
   * 5. Persists the recovered item back into the active 'offlineQueue' store.
   * 6. Deletes the item from the 'offlineDLQ' store.
   */
  async retryDLQItem(
    dlqId: string,
    contextUser?: User | null
  ): Promise<OfflineMutation> {
    const item = await offlineStorage.getDLQItem(dlqId);
    if (!item) {
      throw new Error(`DLQ Item '${dlqId}' not found.`);
    }

    // Authorization & Multi-Account Safety Check
    if (contextUser) {
      if (!contextUser.role || contextUser.isDeleted || contextUser.status === 'suspended') {
        throw new Error('Unauthorized DLQ retry: User account is inactive or suspended.');
      }

      const isPrivilegedAdmin =
        contextUser.role === 'admin' ||
        contextUser.role === 'superAdmin' ||
        contextUser.role === 'chairman' ||
        contextUser.role === 'developer';

      // Non-admins cannot retry items authored by another user
      if (
        item.originatingUserId &&
        item.originatingUserId !== contextUser.uid &&
        !isPrivilegedAdmin
      ) {
        throw new Error(
          `Unauthorized DLQ retry: User '${contextUser.uid}' cannot retry a failed mutation authored by '${item.originatingUserId}'.`
        );
      }

      // Check role permissions for operation/collection
      const authorized = isMutationAuthorized(
        {
          operation: item.operation,
          collectionName: item.collectionName,
          recordId: item.recordId,
          payload: item.payload,
        },
        contextUser
      );

      if (!authorized) {
        throw new Error(
          `Unauthorized DLQ retry: Role '${contextUser.role}' is not permitted to perform '${item.operation}' on '${item.collectionName}'.`
        );
      }
    }

    const now = new Date().toISOString();
    const restoredQueueId = item.originalQueueId || `MUT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const restoredMutation: OfflineMutation = {
      queueId: restoredQueueId,
      operation: item.operation,
      collectionName: item.collectionName,
      recordId: item.recordId,
      payload: item.payload,
      createdAt: item.originalCreatedAt || now,
      updatedAt: now,
      retryCount: 0,
      status: 'pending',
      userId: contextUser?.uid || item.originatingUserId,
      userRole: contextUser?.role || item.originatingUserRole,
      clientGeneratedId: true,
      optimistic: true,
    };

    // Validate structural integrity
    const validation = validateOfflineMutation(restoredMutation);
    if (!validation.valid) {
      throw new Error(`Cannot retry invalid DLQ mutation: ${validation.error}`);
    }

    // Step 1: Write back into active offlineQueue store
    await offlineStorage.putQueueItem({
      queueId: restoredMutation.queueId,
      operation: restoredMutation.operation,
      collectionName: restoredMutation.collectionName,
      recordId: restoredMutation.recordId,
      payload: restoredMutation.payload,
      createdAt: restoredMutation.createdAt,
      updatedAt: restoredMutation.updatedAt,
      retryCount: 0,
      status: 'pending',
    });

    // Step 2: Delete from DLQ store
    await offlineStorage.deleteDLQItem(dlqId);

    console.info(
      `[DLQService] Successfully returned DLQ item ${dlqId} to active queue as ${restoredMutation.queueId}.`
    );

    return restoredMutation;
  }

  /**
   * Permanently dismisses/deletes an item from the Dead Letter Queue.
   */
  async deleteDLQItem(dlqId: string): Promise<void> {
    await offlineStorage.deleteDLQItem(dlqId);
  }

  /**
   * Clears all quarantined items from the Dead Letter Queue.
   */
  async clearDLQ(): Promise<void> {
    await offlineStorage.clearDLQ();
  }
}

export const dlqService = new DeadLetterQueueService();
