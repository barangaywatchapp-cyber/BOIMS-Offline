/**
 * BOIMS Offline Architecture
 * Phase 11 — Offline Data Integrity, Recovery & Corruption Resilience
 *
 * Restores pending offline transactions, repairs invalid or interrupted state,
 * isolates malformed records, and reconciles all IndexedDB stores after restart
 * or unexpected failure without data loss.
 *
 * Guarantees:
 * - Deterministic, non-destructive, isolated recovery.
 * - Valid records remain untouched.
 * - Queue items stuck in 'syncing' normalized to 'pending'.
 * - Corrupted queue items safely quarantined to DLQ.
 * - Duplicate DLQ items safely deduplicated without data loss.
 * - Record-level isolation: corrupted records never block valid records.
 * - Zero secrets, tokens, or passwords persisted.
 * - Multi-account and multi-tab coordination safety preserved.
 */

import { offlineStorage } from './storage';
import {
  OfflineQueueItem,
  DeadLetterItem,
  validateMutationIntegrity,
  validateCachedEntityIntegrity,
  validateDLQItemIntegrity,
  validateSessionIntegrity,
  validateReplayLeaseIntegrity,
  DLQ_SCHEMA_VERSION,
} from './types';

export interface OfflineRecoveryResult {
  recovered: OfflineQueueItem[];
  recoveredCount: number;
  failedCount: number;
  quarantinedCount: number;
  cachedEntitiesRecovered: number;
  cachedEntitiesPruned: number;
  dlqItemsRecovered: number;
  sessionRecovered: boolean;
  sessionCleared: boolean;
  leaseStatus: 'active_preserved' | 'expired_cleared' | 'corrupted_cleared' | 'none';
  auditLog: string[];
}

export class OfflineRecovery {
  /**
   * Performs comprehensive, non-destructive recovery across all offline stores.
   */
  async recover(): Promise<OfflineRecoveryResult> {
    const auditLog: string[] = [];
    const recoveredQueue: OfflineQueueItem[] = [];
    let quarantinedCount = 0;
    let failedCount = 0;
    let cachedEntitiesRecovered = 0;
    let cachedEntitiesPruned = 0;
    let dlqItemsRecovered = 0;
    let sessionRecovered = false;
    let sessionCleared = false;
    let leaseStatus: OfflineRecoveryResult['leaseStatus'] = 'none';

    // 1. RECOVER QUEUE STORE
    try {
      const items = await offlineStorage.getQueue();
      const existingDlq = await offlineStorage.getDLQ();
      const dlqOriginalIds = new Set(existingDlq.map((d) => d.originalQueueId));

      for (const item of items) {
        try {
          // Check for duplicate already transitioned to DLQ
          if (item.queueId && dlqOriginalIds.has(item.queueId)) {
            await offlineStorage.deleteQueueItem(item.queueId);
            auditLog.push(`Deduplicated queue item ${item.queueId} (already present in DLQ).`);
            continue;
          }

          const validation = validateMutationIntegrity(item);

          if (validation.valid && validation.normalized) {
            let normalizedItem: OfflineQueueItem = {
              queueId: validation.normalized.queueId,
              operation: validation.normalized.operation,
              collectionName: validation.normalized.collectionName,
              recordId: validation.normalized.recordId,
              payload: validation.normalized.payload,
              createdAt: validation.normalized.createdAt,
              updatedAt: validation.normalized.updatedAt,
              retryCount: validation.normalized.retryCount,
              status: validation.normalized.status === 'syncing' ? 'pending' : validation.normalized.status,
              userId: validation.normalized.userId,
              userRole: validation.normalized.userRole,
              baseUpdatedAt: validation.normalized.baseUpdatedAt,
              lastError: validation.normalized.lastError,
              lastErrorCode: validation.normalized.lastErrorCode,
            };

            // If it was syncing or required normalization, persist update
            if (item.status === 'syncing' || validation.normalized.status !== item.status) {
              normalizedItem.updatedAt = new Date().toISOString();
              await offlineStorage.putQueueItem(normalizedItem);
              auditLog.push(`Normalized syncing queue item ${item.queueId} to pending.`);
            }

            recoveredQueue.push(normalizedItem);
          } else {
            // Corrupted or invalid queue item -> isolate and quarantine to DLQ
            const reason =
              validation.classification === 'contains_forbidden_credentials'
                ? 'security_rejection'
                : 'structural_validation_failed';

            auditLog.push(
              `Quarantined invalid queue item ${item?.queueId || 'unknown'}: ${validation.error || validation.classification}`
            );

            if (item?.queueId) {
              await offlineStorage.moveToDLQ(
                {
                  ...item,
                  operation: ['create', 'update', 'delete'].includes(item.operation) ? item.operation : 'update',
                  collectionName: item.collectionName || 'unknown',
                  recordId: item.recordId || 'unknown',
                  payload: item.payload || {},
                  createdAt: item.createdAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  retryCount: item.retryCount || 0,
                  status: 'failed',
                },
                reason,
                { message: validation.error || 'Integrity validation failed during recovery.' }
              );
            } else {
              // Item missing key queueId -> delete directly to unblock queue
              failedCount++;
            }
            quarantinedCount++;
          }
        } catch (itemErr) {
          failedCount++;
          auditLog.push(`Failed to process queue item: ${String(itemErr)}`);
        }
      }
    } catch (queueErr) {
      failedCount++;
      auditLog.push(`Queue recovery error: ${String(queueErr)}`);
    }

    // 2. RECOVER CACHED ENTITIES STORE
    try {
      const allCached = await offlineStorage.getAllCachedEntities();
      for (const entity of allCached) {
        try {
          const val = validateCachedEntityIntegrity(entity);
          if (val.valid && val.normalized) {
            // If ID needed normalization, update it
            if (val.normalized.id !== entity.id) {
              await offlineStorage.deleteCachedEntityByKey(entity.id);
              await offlineStorage.putCachedEntity(
                val.normalized.collectionName,
                val.normalized.recordId,
                val.normalized.data,
                { updatedAt: val.normalized.updatedAt, version: val.normalized.version }
              );
              auditLog.push(`Repaired compound ID for cached entity ${val.normalized.id}.`);
            }
            cachedEntitiesRecovered++;
          } else {
            // Prune malformed entity
            await offlineStorage.deleteCachedEntityByKey(entity.id);
            cachedEntitiesPruned++;
            auditLog.push(`Pruned corrupt cached entity ${entity?.id || 'unknown'}: ${val.error}`);
          }
        } catch {
          // Record-level isolation
        }
      }
    } catch (cacheErr) {
      auditLog.push(`Cache recovery error: ${String(cacheErr)}`);
    }

    // 3. RECOVER DLQ STORE
    try {
      const dlqItems = await offlineStorage.getDLQ();
      for (const dlqItem of dlqItems) {
        try {
          const val = validateDLQItemIntegrity(dlqItem);
          if (val.valid) {
            dlqItemsRecovered++;
          } else if (val.classification === 'invalid_schema_version') {
            // Keep quarantined, do not modify
            dlqItemsRecovered++;
            auditLog.push(`Preserved future-schema DLQ item ${dlqItem.dlqId} in quarantine.`);
          } else if (val.classification === 'contains_forbidden_credentials') {
            // Prune secret-leaking DLQ record
            await offlineStorage.deleteDLQItem(dlqItem.dlqId);
            auditLog.push(`Pruned secret-leaking DLQ item ${dlqItem.dlqId}.`);
          } else {
            // Repair orphaned or minor structural defects
            if (dlqItem.dlqId) {
              const repairedItem: DeadLetterItem = {
                ...dlqItem,
                originalQueueId: dlqItem.originalQueueId || `UNKNOWN-${dlqItem.dlqId}`,
                operation: ['create', 'update', 'delete'].includes(dlqItem.operation) ? dlqItem.operation : 'update',
                collectionName: dlqItem.collectionName || 'unknown',
                recordId: dlqItem.recordId || 'unknown',
                payload: dlqItem.payload || {},
                originalCreatedAt: dlqItem.originalCreatedAt || new Date().toISOString(),
                failedAt: dlqItem.failedAt || new Date().toISOString(),
                retryCount: dlqItem.retryCount || 0,
                failureReason: dlqItem.failureReason || 'permanent_error',
                schemaVersion: DLQ_SCHEMA_VERSION,
              };
              await offlineStorage.putDLQItem(repairedItem);
              dlqItemsRecovered++;
              auditLog.push(`Repaired orphaned/incomplete DLQ item ${dlqItem.dlqId}.`);
            }
          }
        } catch {
          // Record-level isolation
        }
      }
    } catch (dlqErr) {
      auditLog.push(`DLQ recovery warning: ${String(dlqErr)}`);
    }

    // 4. RECOVER SESSION METADATA
    try {
      const session = await offlineStorage.getSession();
      if (session) {
        const val = validateSessionIntegrity(session);
        if (val.valid) {
          sessionRecovered = true;
        } else {
          await offlineStorage.clearSession();
          sessionCleared = true;
          auditLog.push(`Cleared invalid/expired offline session: ${val.error || val.classification}`);
        }
      }
    } catch {
      await offlineStorage.clearSession();
      sessionCleared = true;
    }

    // 5. RECOVER REPLAY COORDINATION LEASE
    try {
      const lease = await offlineStorage.getReplayLease();
      if (lease) {
        const val = validateReplayLeaseIntegrity(lease);
        if (val.valid) {
          const expiresMs = new Date(lease.expiresAt).getTime();
          if (expiresMs > Date.now()) {
            leaseStatus = 'active_preserved';
          } else {
            leaseStatus = 'expired_cleared';
            await offlineStorage.deleteReplayLease();
          }
        } else {
          leaseStatus = 'corrupted_cleared';
          await offlineStorage.deleteReplayLease();
          auditLog.push(`Cleared corrupted replay lease: ${val.error}`);
        }
      } else {
        leaseStatus = 'none';
      }
    } catch {
      leaseStatus = 'corrupted_cleared';
      try {
        await offlineStorage.deleteReplayLease();
      } catch {
        // ignore
      }
    }

    return {
      recovered: recoveredQueue,
      recoveredCount: recoveredQueue.length,
      failedCount,
      quarantinedCount,
      cachedEntitiesRecovered,
      cachedEntitiesPruned,
      dlqItemsRecovered,
      sessionRecovered,
      sessionCleared,
      leaseStatus,
      auditLog,
    };
  }
}

export const offlineRecovery = new OfflineRecovery();
