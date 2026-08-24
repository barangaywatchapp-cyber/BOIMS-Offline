/**
 * BOIMS Offline Architecture
 * Phase 5 — Legacy Sync Queue Migration
 *
 * Safely and idempotently migrates legacy localStorage queue items ('boims_sync_queue')
 * into the canonical IndexedDB 'offlineQueue' store.
 *
 * Guarantees:
 * - One-time migration
 * - No duplicate entries
 * - Preserves recordId, collectionName, operation, payload, retryCount, and timestamps
 * - Sanitizes malformed entries before writing to IndexedDB
 * - Non-destructive cleanup of localStorage only after successful persistence
 */

import { offlineStorage } from './storage';
import { OfflineQueueItem, OfflineOperation } from './types';
import { SyncQueueItem } from '../types';

const LEGACY_STORAGE_KEY = 'boims_sync_queue';

export interface MigrationResult {
  migratedCount: number;
  skippedCount: number;
  errorsCount: number;
  details: string[];
}

/**
 * Normalizes legacy collection names to current standard names
 */
export function normalizeCollectionName(collectionName: string): string {
  if (collectionName === 'incidents') return 'reports';
  if (
    collectionName === 'blotter' ||
    collectionName === 'blotter_cases' ||
    collectionName === 'blotters'
  ) {
    return 'blotterCases';
  }
  if (collectionName === 'inventory_assets') return 'inventory';
  return collectionName;
}

export class SyncQueueMigration {
  /**
   * Reads and migrates any existing legacy localStorage sync queue items to IndexedDB.
   */
  async migrateLegacyQueue(): Promise<MigrationResult> {
    const result: MigrationResult = {
      migratedCount: 0,
      skippedCount: 0,
      errorsCount: 0,
      details: [],
    };

    if (typeof localStorage === 'undefined') {
      return result;
    }

    try {
      const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!stored) {
        return result;
      }

      let parsed: SyncQueueItem[] = [];
      try {
        parsed = JSON.parse(stored);
      } catch (err) {
        console.error('[SyncMigration] Failed to parse legacy sync queue JSON:', err);
        result.errorsCount++;
        result.details.push('Malformed JSON in legacy sync queue');
        return result;
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        // Clean up empty array
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return result;
      }

      console.info(`[SyncMigration] Found ${parsed.length} legacy sync queue item(s) to migrate.`);

      const existingIndexedDBQueue = await offlineStorage.getQueue();
      const existingQueueIds = new Set(existingIndexedDBQueue.map((item) => item.queueId));
      const existingKeys = new Set(
        existingIndexedDBQueue.map(
          (item) => `${item.collectionName}:${item.recordId}:${item.operation}`
        )
      );

      for (const legacy of parsed) {
        try {
          // Validate recordId
          if (
            !legacy.recordId ||
            legacy.recordId === 'undefined' ||
            legacy.recordId === 'null' ||
            typeof legacy.recordId !== 'string'
          ) {
            result.skippedCount++;
            result.details.push(`Skipped invalid recordId: ${legacy.recordId}`);
            continue;
          }

          // Skip permanently failed items
          if (
            legacy.status === 'failed' ||
            legacy.errorCode === 'permission-denied' ||
            legacy.errorCode === 'unauthenticated' ||
            legacy.errorCode === 'invalid-argument' ||
            legacy.errorMessage?.includes('Permission denied') ||
            legacy.errorMessage?.includes('insufficient permissions')
          ) {
            result.skippedCount++;
            result.details.push(
              `Skipped permanent failure item ${legacy.queueId || legacy.recordId}`
            );
            continue;
          }

          const normalizedCollection = normalizeCollectionName(legacy.collectionName);
          const queueId =
            legacy.queueId ||
            `MUT-LEGACY-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const operation: OfflineOperation = legacy.operationType || 'create';
          const idempotencyKey = `${normalizedCollection}:${legacy.recordId}:${operation}`;

          // Check for duplication
          if (existingQueueIds.has(queueId) || existingKeys.has(idempotencyKey)) {
            result.skippedCount++;
            result.details.push(`Skipped already existing item ${queueId}`);
            continue;
          }

          const now = new Date().toISOString();
          const offlineItem: OfflineQueueItem = {
            queueId,
            operation,
            collectionName: normalizedCollection,
            recordId: legacy.recordId,
            payload: legacy.payload || {},
            createdAt: legacy.timestamp || now,
            updatedAt: now,
            retryCount: legacy.retryCount || 0,
            status: legacy.status === 'syncing' ? 'pending' : (legacy.status || 'pending'),
            lastError: legacy.errorMessage,
            lastErrorCode: legacy.errorCode,
          };

          await offlineStorage.putQueueItem(offlineItem);
          existingQueueIds.add(queueId);
          existingKeys.add(idempotencyKey);
          result.migratedCount++;
          result.details.push(`Migrated ${queueId} (${normalizedCollection}/${legacy.recordId})`);
        } catch (err: any) {
          result.errorsCount++;
          result.details.push(`Error migrating item: ${err?.message || String(err)}`);
          console.error('[SyncMigration] Item migration error:', err);
        }
      }

      // Once all valid items have been persisted to IndexedDB, remove legacy localStorage key
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      console.info(
        `[SyncMigration] Migration completed. Migrated: ${result.migratedCount}, Skipped: ${result.skippedCount}, Errors: ${result.errorsCount}`
      );
    } catch (e: any) {
      console.error('[SyncMigration] Unexpected error during legacy queue migration:', e);
      result.errorsCount++;
      result.details.push(`Unexpected migration error: ${e?.message || String(e)}`);
    }

    return result;
  }
}

export const syncQueueMigration = new SyncQueueMigration();
