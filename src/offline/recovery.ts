/**
 * BOIMS Offline Architecture
 * Phase 1 — Queue Recovery
 *
 * Restores pending offline transactions from IndexedDB
 * after application restart.
 *
 * This module does NOT modify the existing SyncService yet.
 */

import { offlineStorage } from './storage';
import { OfflineQueueItem } from './types';

export interface OfflineRecoveryResult {
  recovered: OfflineQueueItem[];
  recoveredCount: number;
  failedCount: number;
}

class OfflineRecovery {
  /**
   * Recover all persisted offline queue items.
   *
   * Items that were "syncing" when the application was closed
   * are restored as "pending" because no in-memory sync operation
   * can survive an application shutdown.
   */
  async recover(): Promise<OfflineRecoveryResult> {
    try {
      const items = await offlineStorage.getQueue();

      if (items.length === 0) {
        console.info('[OfflineRecovery] No persisted queue items found.');

        return {
          recovered: [],
          recoveredCount: 0,
          failedCount: 0,
        };
      }

      const recovered: OfflineQueueItem[] = [];

      for (const item of items) {
        try {
          const normalizedItem: OfflineQueueItem =
            item.status === 'syncing'
              ? {
                  ...item,
                  status: 'pending',
                  updatedAt: new Date().toISOString(),
                }
              : item;

          if (normalizedItem !== item) {
            await offlineStorage.putQueueItem(normalizedItem);
          }

          recovered.push(normalizedItem);
        } catch (error) {
          console.error(
            `[OfflineRecovery] Failed to recover queue item ${item.queueId}:`,
            error
          );
        }
      }

      console.info(
        `[OfflineRecovery] Recovered ${recovered.length} of ${items.length} persisted queue items.`
      );

      return {
        recovered,
        recoveredCount: recovered.length,
        failedCount: items.length - recovered.length,
      };
    } catch (error) {
      console.error('[OfflineRecovery] Queue recovery failed:', error);

      return {
        recovered: [],
        recoveredCount: 0,
        failedCount: 1,
      };
    }
  }
}

export const offlineRecovery = new OfflineRecovery();