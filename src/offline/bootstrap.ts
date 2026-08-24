/**
 * BOIMS Offline Architecture
 * Phase 1 — Offline Bootstrap
 *
 * Initializes the offline persistence layer and recovers
 * previously persisted queue items before the application
 * begins normal offline/sync operations.
 */

import { offlineStorage } from './storage';
import { offlineRecovery } from './recovery';
import { syncQueueMigration } from './syncMigration';
import { OfflineQueueItem, OfflineStorageMetadata } from './types';

export interface OfflineBootstrapResult {
  available: boolean;
  recovered: OfflineQueueItem[];
  recoveredCount: number;
  failedCount: number;
  metadata?: OfflineStorageMetadata | null;
}

class OfflineBootstrap {
  async initialize(): Promise<OfflineBootstrapResult> {
    const available = await offlineStorage.isAvailable();

    if (!available) {
      console.warn('[OfflineBootstrap] IndexedDB is unavailable.');

      return {
        available: false,
        recovered: [],
        recoveredCount: 0,
        failedCount: 1,
        metadata: null,
      };
    }

    let metadata: OfflineStorageMetadata | null = null;
    try {
      metadata = await offlineStorage.putMetadata({
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (metaErr) {
      console.warn('[OfflineBootstrap] Could not update storage metadata:', metaErr);
    }

    // 1. Recover interrupted 'syncing' queue items -> 'pending'
    const recoveryResult = await offlineRecovery.recover();

    // 2. Migrate legacy localStorage sync queue to IndexedDB if present
    try {
      await syncQueueMigration.migrateLegacyQueue();
    } catch (migErr) {
      console.warn('[OfflineBootstrap] Legacy queue migration warning:', migErr);
    }

    console.info(
      `[OfflineBootstrap] Initialization complete. Recovered ${recoveryResult.recoveredCount} queue item(s).`
    );

    return {
      available: true,
      recovered: recoveryResult.recovered,
      recoveredCount: recoveryResult.recoveredCount,
      failedCount: recoveryResult.failedCount,
      metadata,
    };
  }
}

export const offlineBootstrap = new OfflineBootstrap();