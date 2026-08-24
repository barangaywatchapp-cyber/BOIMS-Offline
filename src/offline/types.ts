/**
 * BOIMS Offline Architecture
 * Phase 1 — Core Offline Types
 *
 * These types define the contract for the new offline layer.
 * Existing services are not modified yet.
 */

export type OfflineOperation = 'create' | 'update' | 'delete';

export type OfflineItemStatus =
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'resolved';

export interface OfflineQueueItem {
  queueId: string;

  operation: OfflineOperation;

  collectionName: string;

  recordId: string;

  payload: unknown;

  createdAt: string;

  updatedAt: string;

  retryCount: number;

  status: OfflineItemStatus;

  lastError?: string;

  lastErrorCode?: string;
}

export interface OfflineSyncResult {
  processed: number;

  failed: number;

  remaining: number;
}

export interface OfflineStorageMetadata {
  schemaVersion: number;

  lastUpdatedAt: string;

  deviceId?: string;
}