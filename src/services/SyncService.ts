/**
 * BOIMS Offline Capability & Synchronization Service
 * Phase 5 — Canonical IndexedDB Integration & Automatic Offline Queue Replay
 *
 * Connects the Phase 4 IndexedDB mutation queue to Firestore remote synchronization:
 * - Authoritative canonical queue: IndexedDB 'offlineQueue' store
 * - Automatic background replay on offline -> online transitions and startup
 * - Payload normalization (offline image upload reconciliation, certificate rules compliance)
 * - Safe concurrency control & re-entrancy prevention
 * - Deterministic idempotency for creates, updates, and deletes
 * - Local cache reconciliation against 'offlineEntities' store
 * - Permanent vs Transient error classification & retry limit enforcement
 * - Seamless backward compatibility with legacy SyncQueueItem consumers
 */

import { SyncQueueItem, User } from '../types';
import { db } from '../firebase/config';
import { doc, setDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { storageService } from './storageService';
import { offlineStorage } from '../offline/storage';
import { offlineMutationQueue } from '../offline/mutationQueue';
import { dlqService } from '../offline/dlqService';
import {
  OfflineQueueItem,
  OfflineOperation,
  OfflineMutableCollection,
  toSyncQueueItem,
  DeadLetterItem,
  DLQStats,
  DLQFailureReason,
  calculateBackoffDelay,
  isPermanentError,
} from '../offline/types';
import { syncQueueMigration, normalizeCollectionName } from '../offline/syncMigration';

const MAX_RETRIES = 3;

type QueueListener = (queue: SyncQueueItem[]) => void;

class SyncService {
  private listeners: Set<QueueListener> = new Set();
  private isProcessing: boolean = false;
  private memoryQueue: SyncQueueItem[] = [];
  private isInitialized: boolean = false;

  constructor() {
    this.init();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncService] Network status: Online. Auto-triggering Sync Queue processing...');
        this.processQueue();
      });
    }

    // Subscribe to OfflineMutationQueue to keep memory snapshot synchronized
    offlineMutationQueue.subscribe((mutations) => {
      this.memoryQueue = mutations.map(toSyncQueueItem);
      this.notifyListeners(this.memoryQueue);
    });
  }

  /**
   * Initializes queue from IndexedDB and migrates any legacy localStorage items.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 1. Migrate legacy localStorage queue items if present
      await syncQueueMigration.migrateLegacyQueue();

      // 2. Load current canonical queue from IndexedDB
      await this.refreshMemoryQueue();
      this.isInitialized = true;

      // 3. If online, trigger queue processing
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setTimeout(() => this.processQueue(), 250);
      }
    } catch (e) {
      console.error('[SyncService] Failed to initialize canonical sync queue:', e);
    }
  }

  /**
   * Refreshes the in-memory queue snapshot from IndexedDB.
   */
  public async refreshMemoryQueue(): Promise<SyncQueueItem[]> {
    try {
      const items = await offlineStorage.getQueue();
      this.memoryQueue = items.map(toSyncQueueItem);
      this.notifyListeners(this.memoryQueue);
      return this.memoryQueue;
    } catch (e) {
      console.error('[SyncService] Error refreshing memory queue:', e);
      return this.memoryQueue;
    }
  }

  /**
   * Returns the current synchronous snapshot of the queue.
   */
  public getQueue(): SyncQueueItem[] {
    return [...this.memoryQueue];
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getQueue());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(queue: SyncQueueItem[]): void {
    this.listeners.forEach((listener) => listener(queue));
  }

  /**
   * Enqueue a pending mutation into the canonical IndexedDB queue.
   */
  public enqueue(
    operationType: 'create' | 'update' | 'delete',
    collectionName: string,
    recordId: string,
    payload: any
  ): SyncQueueItem | null {
    if (!recordId || recordId === 'undefined' || recordId === 'null') {
      console.warn(
        `[SyncService] Refusing to enqueue operation ${operationType} on ${collectionName} with invalid recordId:`,
        recordId
      );
      return null;
    }

    const normalizedCollection = normalizeCollectionName(collectionName);
    const queueId = `MUT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const syncItem: SyncQueueItem = {
      queueId,
      operationType,
      collectionName: normalizedCollection,
      recordId,
      payload,
      timestamp: now,
      retryCount: 0,
      status: 'pending',
    };

    // Optimistically update memory queue immediately for responsive UI
    this.memoryQueue = [...this.memoryQueue, syncItem];
    this.notifyListeners(this.memoryQueue);

    // Persist via offlineMutationQueue to IndexedDB & apply optimistic cache
    offlineMutationQueue
      .enqueue({
        operation: operationType as OfflineOperation,
        collectionName: normalizedCollection as OfflineMutableCollection,
        recordId,
        payload,
        clientGeneratedId: true,
        applyOptimistic: true,
      })
      .then(async () => {
        await this.refreshMemoryQueue();
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          setTimeout(() => this.processQueue(), 300);
        }
      })
      .catch((err) => {
        console.error('[SyncService] Failed to persist mutation to IndexedDB:', err);
      });

    console.info(`[SyncService] Enqueued operation ${operationType} on ${normalizedCollection}/${recordId}`);
    return syncItem;
  }

  /**
   * Prepares and reconciles item payload before writing to Firestore.
   * Uploads any temporary offline Data URLs to Firebase Storage,
   * normalizes certificate creation fields, and strips forbidden attributes.
   */
  public async preparePayloadForSync(item: OfflineQueueItem | SyncQueueItem): Promise<any> {
    const payload = { ...item.payload };
    const collectionName = normalizeCollectionName(item.collectionName);

    // 1. Reconcile temporary offline base64 images for reports
    if (
      collectionName === 'reports' &&
      payload &&
      Array.isArray(payload.imageUrls) &&
      payload.imageUrls.some((u: any) => typeof u === 'string' && u.startsWith('data:image/'))
    ) {
      console.info(`[SyncService] Reconciling offline photo attachments for report ${item.recordId}...`);
      try {
        const reconciledUrls = await storageService.reconcileReportImages(
          payload.imageUrls,
          item.recordId
        );
        payload.imageUrls = reconciledUrls;
        item.payload.imageUrls = reconciledUrls;
      } catch (uploadErr) {
        console.warn('[SyncService] Image reconciliation warning (proceeding with best effort):', uploadErr);
      }
    }

    // 2. Normalize certificate creation payload to comply strictly with Firestore security rules
    const op = 'operation' in item ? item.operation : item.operationType;
    if (collectionName === 'certificateRequests' && op === 'create' && payload) {
      if (!payload.orNumber) {
        delete payload.orNumber;
      }
      delete payload.issuedAt;
      delete payload.expiresAt;
      delete payload.approvedAt;
      delete payload.releasedAt;
      delete payload.claimedAt;
      delete payload.rejectedAt;
      delete payload.issuedBy;
      delete payload.approvedBy;
      delete payload.releasedBy;
      delete payload.rejectedBy;
      delete payload.claimMethod;
      delete payload.rejectionReason;
    }

    return payload;
  }

  /**
   * Process all pending items in the canonical IndexedDB sync queue sequentially.
   */
  public async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      console.log('[SyncService] processQueue already in progress. Skipping duplicate invocation.');
      return { processed: 0, failed: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[SyncService] Cannot process queue: Client is offline.');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    try {
      const queue = await offlineStorage.getQueue();
      // Filter for pending items and sort FIFO (chronological by createdAt)
      const pendingItems = queue
        .filter((item) => item.status === 'pending')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (pendingItems.length === 0) {
        this.isProcessing = false;
        await this.refreshMemoryQueue();
        return { processed: 0, failed: 0 };
      }

      console.info(`[SyncService] Starting automatic replay of ${pendingItems.length} pending mutation(s)...`);

      for (const item of pendingItems) {
        // Re-check online status before each item
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.warn('[SyncService] Connection lost during replay. Suspending sync loop.');
          break;
        }

        // Validate recordId — invalid identifiers are permanently quarantined to DLQ
        if (!item.recordId || item.recordId === 'undefined' || item.recordId === 'null') {
          console.warn(`[SyncService] Moving invalid recordId item ${item.queueId} to DLQ.`);
          await offlineStorage.moveToDLQ(item, 'structural_validation_failed', {
            code: 'invalid-argument',
            message: 'Invalid or missing recordId',
          });
          failed++;
          continue;
        }

        // Check retry limit — mutations exceeding max retries are quarantined to DLQ
        if (item.retryCount >= MAX_RETRIES) {
          console.warn(`[SyncService] Moving exhausted item ${item.queueId} (attempts: ${item.retryCount}) to DLQ.`);
          await offlineStorage.moveToDLQ(item, 'max_retries_exceeded', {
            code: item.lastErrorCode || 'max_retries_exceeded',
            message: item.lastError || 'Max retries exceeded',
          });
          failed++;
          continue;
        }

        // Transition to 'syncing'
        item.status = 'syncing';
        item.updatedAt = new Date().toISOString();
        await offlineStorage.putQueueItem(item);
        await this.refreshMemoryQueue();

        try {
          const preparedPayload = await this.preparePayloadForSync(item);
          const normalizedCollection = normalizeCollectionName(item.collectionName);
          const docRef = doc(db, normalizedCollection, item.recordId);

          if (item.operation === 'create') {
            await setDoc(
              docRef,
              { ...preparedPayload, updatedAt: new Date().toISOString() },
              { merge: true }
            );
          } else if (item.operation === 'update') {
            const { timelineEvent, ...otherUpdates } = preparedPayload || {};
            const updatePayload: any = { ...otherUpdates, updatedAt: new Date().toISOString() };
            if (timelineEvent && timelineEvent.eventId) {
              updatePayload.timeline = arrayUnion(timelineEvent);
            }
            await setDoc(docRef, updatePayload, { merge: true });
          } else if (item.operation === 'delete') {
            await deleteDoc(docRef);
          }

          // Remote execution succeeded — reconcile local IndexedDB cache
          if (item.operation === 'delete') {
            await offlineStorage.deleteCachedEntity(normalizedCollection, item.recordId);
          } else {
            await offlineStorage.putCachedEntity(
              normalizedCollection,
              item.recordId,
              preparedPayload,
              { updatedAt: new Date().toISOString() }
            );
          }

          // Remove resolved item from canonical IndexedDB queue
          await offlineStorage.deleteQueueItem(item.queueId);
          processed++;
          console.info(`[SyncService] Replay succeeded for ${item.operation} on ${normalizedCollection}/${item.recordId}`);
        } catch (err: any) {
          const errCode = err?.code || '';
          const errMsg = err?.message || String(err);
          const isNonRetryable = isPermanentError(err);

          if (isNonRetryable) {
            const failureReason: DLQFailureReason =
              errCode === 'permission-denied' || errMsg.toLowerCase().includes('permission')
                ? 'security_rejection'
                : errCode === 'unauthenticated' || errMsg.toLowerCase().includes('unauthenticated')
                ? 'authentication_required'
                : 'permanent_error';

            console.warn(
              `[SyncService] Non-retryable error (${errCode || 'permanent'}) syncing item ${item.queueId} on ${item.collectionName}/${item.recordId}. Moving to DLQ.`,
              errMsg
            );

            await offlineStorage.moveToDLQ(item, failureReason, err);
          } else {
            console.error(`[SyncService] Transient error syncing item ${item.queueId}:`, err);
            item.retryCount += 1;

            if (item.retryCount >= MAX_RETRIES) {
              console.warn(`[SyncService] Max retries (${MAX_RETRIES}) reached for item ${item.queueId}. Moving to DLQ.`);
              await offlineStorage.moveToDLQ(item, 'max_retries_exceeded', err);
            } else {
              const backoffMs = calculateBackoffDelay(item.retryCount);
              console.info(`[SyncService] Backoff calculated for item ${item.queueId} (attempt ${item.retryCount}): ${backoffMs}ms`);
              item.status = 'pending';
              item.lastErrorCode = errCode || 'unavailable';
              item.lastError = errMsg;
              item.updatedAt = new Date().toISOString();
              await offlineStorage.putQueueItem(item);
            }
          }
          failed++;
        }
      }
    } catch (loopErr) {
      console.error('[SyncService] Unexpected error during processQueue execution:', loopErr);
    } finally {
      this.isProcessing = false;
      await this.refreshMemoryQueue();
    }

    // Check if new pending items arrived while processing and drain if still online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const remaining = this.getQueue().filter((item) => item.status === 'pending');
      if (remaining.length > 0) {
        setTimeout(() => this.processQueue(), 300);
      }
    }

    return { processed, failed };
  }

  /**
   * Retry a single failed or pending queue item.
   */
  public async retryItem(queueId: string): Promise<boolean> {
    try {
      const item = await offlineStorage.getQueueItem(queueId);
      if (!item) return false;

      item.retryCount = 0;
      item.status = 'syncing';
      item.updatedAt = new Date().toISOString();
      await offlineStorage.putQueueItem(item);
      await this.refreshMemoryQueue();

      const preparedPayload = await this.preparePayloadForSync(item);
      const normalizedCollection = normalizeCollectionName(item.collectionName);
      const docRef = doc(db, normalizedCollection, item.recordId);

      if (item.operation === 'create') {
        await setDoc(
          docRef,
          { ...preparedPayload, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } else if (item.operation === 'update') {
        const { timelineEvent, ...otherUpdates } = preparedPayload || {};
        const updatePayload: any = { ...otherUpdates, updatedAt: new Date().toISOString() };
        if (timelineEvent && timelineEvent.eventId) {
          updatePayload.timeline = arrayUnion(timelineEvent);
        }
        await setDoc(docRef, updatePayload, { merge: true });
      } else if (item.operation === 'delete') {
        await deleteDoc(docRef);
      }

      // Update local cache
      if (item.operation === 'delete') {
        await offlineStorage.deleteCachedEntity(normalizedCollection, item.recordId);
      } else {
        await offlineStorage.putCachedEntity(
          normalizedCollection,
          item.recordId,
          preparedPayload,
          { updatedAt: new Date().toISOString() }
        );
      }

      // Remove from queue
      await offlineStorage.deleteQueueItem(queueId);
      await this.refreshMemoryQueue();
      return true;
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = err?.message || String(err);
      const isNonRetryable =
        errCode === 'permission-denied' ||
        errCode === 'unauthenticated' ||
        errCode === 'invalid-argument' ||
        errMsg.includes('Missing or insufficient permissions') ||
        errMsg.includes('Permission denied');

      const item = await offlineStorage.getQueueItem(queueId);
      if (item) {
        if (isNonRetryable) {
          item.status = 'failed';
          item.lastErrorCode = errCode || 'permission-denied';
          item.lastError = errMsg;
        } else {
          item.retryCount += 1;
          item.status = item.retryCount >= MAX_RETRIES ? 'failed' : 'pending';
          item.lastErrorCode = errCode || 'unknown_error';
          item.lastError = errMsg;
        }
        item.updatedAt = new Date().toISOString();
        await offlineStorage.putQueueItem(item);
      }

      await this.refreshMemoryQueue();
      return false;
    }
  }

  /**
   * Seed offline queue (Disabled in production)
   */
  public seedTestOfflineQueue(): void {
    return;
  }

  /**
   * Export the entire offline queue as JSON string.
   */
  public exportQueueJSON(): string {
    return JSON.stringify(this.getQueue(), null, 2);
  }

  /**
   * Clear all items in the canonical IndexedDB queue.
   */
  public clearQueue(): void {
    offlineStorage
      .clearQueue()
      .then(() => {
        this.memoryQueue = [];
        this.notifyListeners([]);
      })
      .catch((err) => {
        console.error('[SyncService] Failed to clear IndexedDB queue:', err);
      });
  }

  /**
   * Remove a single item from the canonical IndexedDB queue.
   */
  public removeItem(queueId: string): void {
    offlineStorage
      .deleteQueueItem(queueId)
      .then(() => {
        this.memoryQueue = this.memoryQueue.filter((item) => item.queueId !== queueId);
        this.notifyListeners(this.memoryQueue);
      })
      .catch((err) => {
        console.error(`[SyncService] Failed to delete queue item ${queueId}:`, err);
      });
  }

  // =========================================================================
  // Phase 6 — Dead Letter Queue (DLQ) Integration
  // =========================================================================

  /**
   * Retrieves all items from the Dead Letter Queue.
   */
  public async getDLQ(): Promise<DeadLetterItem[]> {
    return await dlqService.getDLQItems();
  }

  /**
   * Retrieves aggregated statistics for Dead Letter Queue items.
   */
  public async getDLQStats(): Promise<DLQStats> {
    return await dlqService.getDLQStats();
  }

  /**
   * Manually retries a quarantined Dead Letter Queue item.
   * Restores the item to the active queue after revalidating user permissions.
   */
  public async retryDLQItem(
    dlqId: string,
    contextUser?: User | null
  ): Promise<boolean> {
    try {
      await dlqService.retryDLQItem(dlqId, contextUser);
      await this.refreshMemoryQueue();

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setTimeout(() => this.processQueue(), 250);
      }
      return true;
    } catch (err) {
      console.error(`[SyncService] Failed to retry DLQ item ${dlqId}:`, err);
      return false;
    }
  }

  /**
   * Permanently dismisses/deletes an item from the Dead Letter Queue.
   */
  public async deleteDLQItem(dlqId: string): Promise<void> {
    await dlqService.deleteDLQItem(dlqId);
  }

  /**
   * Clears all quarantined items from the Dead Letter Queue.
   */
  public async clearDLQ(): Promise<void> {
    await dlqService.clearDLQ();
  }
}

export const syncService = new SyncService();
