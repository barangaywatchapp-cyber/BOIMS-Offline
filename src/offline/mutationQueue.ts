/**
 * BOIMS Offline Architecture
 * Phase 4 — Offline CRUD & Mutation Queue
 *
 * Implements the standardized offline mutation queue manager:
 * - Enqueues mutations with authorization and structural validation
 * - Persists mutations directly to IndexedDB 'offlineQueue' store
 * - Applies optimistic state updates to the 'offlineEntities' cache
 * - Provides FIFO queue inspection, filtering, and subscription hooks
 * - Strictly decouples from network sync/replay (reserved for Phase 5)
 */

import { offlineStorage } from './storage';
import {
  OfflineMutation,
  CreateMutationParams,
  validateOfflineMutation,
  isMutationAuthorized,
  OfflineItemStatus,
} from './types';
import type { User } from '../types';

export type MutationQueueListener = (mutations: OfflineMutation[]) => void;

export class OfflineMutationQueue {
  private listeners: Set<MutationQueueListener> = new Set();

  /**
   * Enqueues an offline mutation with validation, authorization check,
   * IndexedDB persistence, and optimistic entity cache application.
   */
  async enqueue<T = unknown>(
    params: CreateMutationParams<T>,
    contextUser?: User | null
  ): Promise<OfflineMutation<T>> {
    // 1. Resolve author user for authorization check
    let authorUser: User | null = contextUser || null;
    if (!authorUser) {
      try {
        const activeSession = await offlineStorage.getSession();
        if (activeSession && activeSession.user) {
          authorUser = activeSession.user;
        }
      } catch {
        // Fallback if session read fails
      }
    }

    // 2. Enforce Role-Based Authorization
    if (authorUser && !isMutationAuthorized(params, authorUser)) {
      throw new Error(
        `Unauthorized offline mutation: Role '${authorUser.role}' is not permitted to perform '${params.operation}' on collection '${params.collectionName}'.`
      );
    }

    const now = new Date().toISOString();
    const queueId = `MUT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const mutation: OfflineMutation<T> = {
      queueId,
      operation: params.operation,
      collectionName: params.collectionName,
      recordId: params.recordId,
      payload: params.payload,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      status: 'pending',
      userId: params.userId || authorUser?.uid,
      userRole: params.userRole || authorUser?.role,
      clientGeneratedId: params.clientGeneratedId ?? true,
      idempotencyKey: params.idempotencyKey || `${params.collectionName}:${params.recordId}:${params.operation}`,
      optimistic: params.applyOptimistic !== false,
    };

    // 3. Validate mutation structural integrity
    const validation = validateOfflineMutation(mutation);
    if (!validation.valid) {
      throw new Error(`Invalid offline mutation: ${validation.error}`);
    }

    // 4. Persist mutation to IndexedDB offlineQueue store
    await offlineStorage.putQueueItem({
      queueId: mutation.queueId,
      operation: mutation.operation,
      collectionName: mutation.collectionName,
      recordId: mutation.recordId,
      payload: mutation.payload,
      createdAt: mutation.createdAt,
      updatedAt: mutation.updatedAt,
      retryCount: mutation.retryCount,
      status: mutation.status,
    });

    // 5. Apply local optimistic state to offlineEntities cache if requested
    if (params.applyOptimistic !== false) {
      await this.applyOptimisticState(mutation);
    }

    // 6. Notify reactive subscribers
    this.notifySubscribers();

    return mutation;
  }

  /**
   * Applies the mutation optimistically to the local entity cache (offlineEntities store).
   */
  async applyOptimisticState<T = unknown>(mutation: OfflineMutation<T>): Promise<void> {
    try {
      const { collectionName, recordId, operation, payload, updatedAt } = mutation;

      if (operation === 'create') {
        await offlineStorage.putCachedEntity(collectionName, recordId, payload, {
          updatedAt,
        });
      } else if (operation === 'update') {
        const existing = await offlineStorage.getCachedEntity<any>(collectionName, recordId);
        let mergedPayload = payload;
        if (existing && existing.data && typeof existing.data === 'object' && typeof payload === 'object') {
          mergedPayload = {
            ...existing.data,
            ...payload,
            updatedAt: updatedAt || new Date().toISOString(),
          };
        }
        await offlineStorage.putCachedEntity(collectionName, recordId, mergedPayload, {
          updatedAt,
        });
      } else if (operation === 'delete') {
        // Retrieve existing and mark soft-deleted if record exists, or remove from cache
        const existing = await offlineStorage.getCachedEntity<any>(collectionName, recordId);
        if (existing && existing.data && typeof existing.data === 'object') {
          const softDeleted = {
            ...existing.data,
            isDeleted: true,
            deletedAt: updatedAt || new Date().toISOString(),
          };
          await offlineStorage.putCachedEntity(collectionName, recordId, softDeleted, {
            updatedAt,
          });
        } else {
          await offlineStorage.deleteCachedEntity(collectionName, recordId);
        }
      }
    } catch (err) {
      console.warn('[OfflineMutationQueue] Failed to apply optimistic state to cache:', err);
    }
  }

  /**
   * Retrieves pending offline mutations, optionally filtered by collection name.
   * Sorted FIFO (chronological).
   */
  async getPendingMutations(collectionName?: string): Promise<OfflineMutation[]> {
    const rawItems = await offlineStorage.getQueue();
    let pending = rawItems.filter((item) => item.status === 'pending');

    if (collectionName) {
      pending = pending.filter((item) => item.collectionName === collectionName);
    }

    return pending.map((item) => ({
      queueId: item.queueId,
      operation: item.operation,
      collectionName: item.collectionName,
      recordId: item.recordId,
      payload: item.payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      retryCount: item.retryCount,
      status: item.status,
      lastError: item.lastError,
      lastErrorCode: item.lastErrorCode,
    }));
  }

  /**
   * Retrieves all offline mutations regardless of status.
   */
  async getAllMutations(): Promise<OfflineMutation[]> {
    const rawItems = await offlineStorage.getQueue();
    return rawItems.map((item) => ({
      queueId: item.queueId,
      operation: item.operation,
      collectionName: item.collectionName,
      recordId: item.recordId,
      payload: item.payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      retryCount: item.retryCount,
      status: item.status,
      lastError: item.lastError,
      lastErrorCode: item.lastErrorCode,
    }));
  }

  /**
   * Retrieves a single mutation by queue ID.
   */
  async getMutationById(queueId: string): Promise<OfflineMutation | null> {
    const item = await offlineStorage.getQueueItem(queueId);
    if (!item) return null;

    return {
      queueId: item.queueId,
      operation: item.operation,
      collectionName: item.collectionName,
      recordId: item.recordId,
      payload: item.payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      retryCount: item.retryCount,
      status: item.status,
      lastError: item.lastError,
      lastErrorCode: item.lastErrorCode,
    };
  }

  /**
   * Retrieves all mutations targeting a specific record in a collection.
   */
  async getMutationsByRecordId(
    collectionName: string,
    recordId: string
  ): Promise<OfflineMutation[]> {
    const all = await this.getAllMutations();
    return all.filter(
      (m) => m.collectionName === collectionName && m.recordId === recordId
    );
  }

  /**
   * Removes a specific mutation from the queue.
   */
  async removeMutation(queueId: string): Promise<void> {
    await offlineStorage.deleteQueueItem(queueId);
    this.notifySubscribers();
  }

  /**
   * Clears all mutations from the queue.
   */
  async clearQueue(): Promise<void> {
    await offlineStorage.clearQueue();
    this.notifySubscribers();
  }

  /**
   * Gets total count of pending mutations, optionally filtered by collection.
   */
  async getPendingCount(collectionName?: string): Promise<number> {
    const pending = await this.getPendingMutations(collectionName);
    return pending.length;
  }

  /**
   * Subscribes to queue changes.
   */
  subscribe(listener: MutationQueueListener): () => void {
    this.listeners.add(listener);
    this.getAllMutations().then((mutations) => listener(mutations)).catch(() => {});

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifySubscribers(): void {
    this.getAllMutations().then((mutations) => {
      this.listeners.forEach((listener) => {
        try {
          listener(mutations);
        } catch (err) {
          console.error('[OfflineMutationQueue] Listener notification error:', err);
        }
      });
    }).catch(() => {});
  }
}

export const offlineMutationQueue = new OfflineMutationQueue();
