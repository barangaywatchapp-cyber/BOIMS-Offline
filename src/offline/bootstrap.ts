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
import { OfflineQueueItem } from './types';

export interface OfflineBootstrapResult {
  available: boolean;
  recovered: OfflineQueueItem[];
  recoveredCount: number;
  failedCount: number;
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
      };
    }

    const recoveryResult = await offlineRecovery.recover();

    console.info(
      `[OfflineBootstrap] Initialization complete. Recovered ${recoveryResult.recoveredCount} queue item(s).`
    );

    return {
      available: true,
      recovered: recoveryResult.recovered,
      recoveredCount: recoveryResult.recoveredCount,
      failedCount: recoveryResult.failedCount,
    };
  }
}

export const offlineBootstrap = new OfflineBootstrap();