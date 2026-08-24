/**
 * BOIMS Offline Capability & Synchronization Service
 * Implements the Offline Queue Engine specified in MDG Volume 14
 */

import { SyncQueueItem } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { doc, setDoc, updateDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { storageService } from './storageService';

const QUEUE_STORAGE_KEY = 'boims_sync_queue';
const MAX_RETRIES = 3;

type QueueListener = (queue: SyncQueueItem[]) => void;

class SyncService {
  private listeners: Set<QueueListener> = new Set();
  private isProcessing: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('Network status: Online. Auto-triggering Sync Queue processing...');
        this.processQueue();
      });
    }
  }

  public getQueue(): SyncQueueItem[] {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!stored) return [];
      const parsed: SyncQueueItem[] = JSON.parse(stored);

      // Filter out operations that permanently failed due to non-retryable errors or failed status, or malformed recordId
      const sanitized = parsed.filter(
        (item) =>
          item.recordId &&
          item.recordId !== 'undefined' &&
          item.recordId !== 'null' &&
          item.status !== 'failed' &&
          item.errorCode !== 'permission-denied' &&
          item.errorCode !== 'unauthenticated' &&
          item.errorCode !== 'invalid-argument' &&
          !item.errorMessage?.includes('Permission denied') &&
          !item.errorMessage?.includes('insufficient permissions')
      );

      if (sanitized.length !== parsed.length) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(sanitized));
      }

      // Remap legacy collection names if present
      return sanitized.map((item) => {
        if (item.collectionName === 'incidents') {
          return { ...item, collectionName: 'reports' };
        }
        if (item.collectionName === 'blotter' || item.collectionName === 'blotter_cases' || item.collectionName === 'blotters') {
          return { ...item, collectionName: 'blotterCases' };
        }
        if (item.collectionName === 'inventory_assets') {
          return { ...item, collectionName: 'inventory' };
        }
        return item;
      });
    } catch (e) {
      console.error('Failed to read sync queue from localStorage:', e);
      return [];
    }
  }

  private saveQueue(queue: SyncQueueItem[]): void {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      this.notifyListeners(queue);
    } catch (e) {
      console.error('Failed to persist sync queue:', e);
    }
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
   * Enqueue a pending mutation for deferred synchronization
   */
  public enqueue(
    operationType: 'create' | 'update' | 'delete',
    collectionName: string,
    recordId: string,
    payload: any
  ): SyncQueueItem | null {
    if (!recordId || recordId === 'undefined' || recordId === 'null') {
      console.warn(`[SyncQueue] Refusing to enqueue operation ${operationType} on ${collectionName} with invalid recordId:`, recordId);
      return null;
    }

    const newItem: SyncQueueItem = {
      queueId: `SYNC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      operationType,
      collectionName,
      recordId,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    const queue = this.getQueue();
    queue.push(newItem);
    this.saveQueue(queue);
    console.info(`[SyncQueue] Enqueued operation ${operationType} on ${collectionName}/${recordId}`);

    // If online, attempt immediate sync
    if (navigator.onLine) {
      setTimeout(() => this.processQueue(), 500);
    }

    return newItem;
  }

  /**
   * Prepares and reconciles item payload before writing to Firestore.
   * Uploads any temporary offline Data URLs (e.g. report photos) to Firebase Storage,
   * replacing them with stable Storage download URLs.
   */
  private async preparePayloadForSync(item: SyncQueueItem): Promise<any> {
    const payload = { ...item.payload };

    if (
      item.collectionName === 'reports' &&
      payload &&
      Array.isArray(payload.imageUrls) &&
      payload.imageUrls.some((u: any) => typeof u === 'string' && u.startsWith('data:image/'))
    ) {
      console.info(`[SyncQueue] Reconciling offline photo attachments for report ${item.recordId}...`);
      const reconciledUrls = await storageService.reconcileReportImages(payload.imageUrls, item.recordId);
      payload.imageUrls = reconciledUrls;
      // Update item payload so successfully uploaded storage URLs persist in the queue
      item.payload.imageUrls = reconciledUrls;
    }

    if (item.collectionName === 'certificateRequests' && item.operationType === 'create' && payload) {
      // Remove any forbidden or undefined fields from initial creation payload
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
   * Process all pending items in the sync queue sequentially
   */
  public async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.warn('[SyncQueue] Cannot process queue: Client is offline.');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let queue = this.getQueue();
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      if (item.status === 'resolved') continue;
      if (!item.recordId || item.recordId === 'undefined' || item.recordId === 'null') {
        item.status = 'failed';
        item.errorCode = 'invalid-argument';
        item.errorMessage = 'Invalid recordId';
        continue;
      }
      if (item.retryCount >= MAX_RETRIES) {
        item.status = 'failed';
        continue;
      }

      item.status = 'syncing';
      this.saveQueue(queue);

      try {
        const preparedPayload = await this.preparePayloadForSync(item);
        const docRef = doc(db, item.collectionName, item.recordId);

        if (item.operationType === 'create') {
          await setDoc(docRef, { ...preparedPayload, updatedAt: new Date().toISOString() }, { merge: true });
        } else if (item.operationType === 'update') {
          const { timelineEvent, ...otherUpdates } = preparedPayload || {};
          const updatePayload: any = { ...otherUpdates, updatedAt: new Date().toISOString() };
          if (timelineEvent && timelineEvent.eventId) {
            updatePayload.timeline = arrayUnion(timelineEvent);
          }
          await setDoc(docRef, updatePayload, { merge: true });
        } else if (item.operationType === 'delete') {
          await deleteDoc(docRef);
        }

        item.status = 'resolved';
        processed++;
      } catch (err: any) {
        const errCode = err?.code || '';
        const errMsg = err?.message || String(err);
        const isNonRetryable =
          errCode === 'permission-denied' ||
          errCode === 'unauthenticated' ||
          errCode === 'invalid-argument' ||
          errMsg.includes('Missing or insufficient permissions') ||
          errMsg.includes('Permission denied');

        if (isNonRetryable) {
          console.warn(`[SyncQueue] Non-retryable error (${errCode || 'permission-denied'}) syncing item ${item.queueId} on ${item.collectionName}/${item.recordId}:`, errMsg);
          item.status = 'failed';
          item.errorCode = errCode || 'permission-denied';
          item.errorMessage = errMsg;
        } else {
          console.error(`[SyncQueue] Error syncing item ${item.queueId}:`, err);
          item.retryCount += 1;
          item.status = item.retryCount >= MAX_RETRIES ? 'failed' : 'pending';
          item.errorCode = errCode || 'unknown_error';
          item.errorMessage = errMsg;
        }
        failed++;
      }

      this.saveQueue(queue);
    }

    // Clean up resolved and failed items from active sync queue
    queue = queue.filter((item) => item.status !== 'resolved' && item.status !== 'failed');
    this.saveQueue(queue);

    this.isProcessing = false;

    // Check if new pending items were queued while processing and drain if online
    if (navigator.onLine) {
      const remainingPending = this.getQueue().filter((item) => item.status === 'pending');
      if (remainingPending.length > 0) {
        setTimeout(() => this.processQueue(), 300);
      }
    }

    return { processed, failed };
  }

  /**
   * Retry a single failed or pending queue item
   */
  public async retryItem(queueId: string): Promise<boolean> {
    const queue = this.getQueue();
    const item = queue.find((i) => i.queueId === queueId);
    if (!item) return false;

    item.retryCount = 0;
    item.status = 'syncing';
    this.saveQueue(queue);

    try {
      const preparedPayload = await this.preparePayloadForSync(item);
      const docRef = doc(db, item.collectionName, item.recordId);

      if (item.operationType === 'create') {
        await setDoc(docRef, { ...preparedPayload, updatedAt: new Date().toISOString() }, { merge: true });
      } else if (item.operationType === 'update') {
        const { timelineEvent, ...otherUpdates } = preparedPayload || {};
        const updatePayload: any = { ...otherUpdates, updatedAt: new Date().toISOString() };
        if (timelineEvent && timelineEvent.eventId) {
          updatePayload.timeline = arrayUnion(timelineEvent);
        }
        await setDoc(docRef, updatePayload, { merge: true });
      } else if (item.operationType === 'delete') {
        await deleteDoc(docRef);
      }

      item.status = 'resolved';
      this.saveQueue(queue.filter((i) => i.queueId !== queueId));
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

      if (isNonRetryable) {
        console.warn(`[SyncQueue] Non-retryable error (${errCode || 'permission-denied'}) retrying item ${queueId}:`, errMsg);
        item.status = 'failed';
        item.errorCode = errCode || 'permission-denied';
        item.errorMessage = errMsg;
        this.saveQueue(queue.filter((i) => i.queueId !== queueId));
      } else {
        item.retryCount += 1;
        item.status = item.retryCount >= MAX_RETRIES ? 'failed' : 'pending';
        item.errorCode = errCode || 'unknown_error';
        item.errorMessage = errMsg;
        this.saveQueue(queue);
      }
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
   * Export the entire offline queue as JSON string
   */
  public exportQueueJSON(): string {
    return JSON.stringify(this.getQueue(), null, 2);
  }

  /**
   * Clear all items in the queue
   */
  public clearQueue(): void {
    this.saveQueue([]);
  }

  /**
   * Remove a single item from the queue
   */
  public removeItem(queueId: string): void {
    const queue = this.getQueue().filter((item) => item.queueId !== queueId);
    this.saveQueue(queue);
  }
}

export const syncService = new SyncService();
