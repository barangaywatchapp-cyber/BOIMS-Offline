/**
 * BOIMS Offline Architecture
 * Phase 1 — Persistent Offline Storage
 *
 * IndexedDB-backed storage for offline queue data.
 *
 * IMPORTANT:
 * This module is intentionally independent from the existing
 * SyncService. Migration will happen only after the new layer
 * has been verified.
 */

import type { OfflineQueueItem } from './types';

const DB_NAME = 'boims-offline';
const DB_VERSION = 1;

const QUEUE_STORE = 'offlineQueue';

const QUEUE_INDEX_CREATED_AT = 'createdAt';
const QUEUE_INDEX_STATUS = 'status';

class OfflineStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Open or create the BOIMS offline database.
   */
  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, {
            keyPath: 'queueId',
          });

          store.createIndex(
            QUEUE_INDEX_CREATED_AT,
            'createdAt',
            { unique: false }
          );

          store.createIndex(
            QUEUE_INDEX_STATUS,
            'status',
            { unique: false }
          );
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Failed to open offline database.'));
      };

      request.onblocked = () => {
        console.warn(
          '[OfflineStorage] Database upgrade is blocked by another open connection.'
        );
      };
    });

    return this.dbPromise;
  }

  /**
   * Save or replace one queue item.
   */
  async putQueueItem(item: OfflineQueueItem): Promise<void> {
    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);

      store.put(item);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to save offline queue item.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Offline queue transaction was aborted.')
        );
      };
    });
  }

  /**
   * Save multiple queue items in one transaction.
   */
  async putQueueItems(items: OfflineQueueItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);

      for (const item of items) {
        store.put(item);
      }

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to save offline queue items.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Offline queue transaction was aborted.')
        );
      };
    });
  }

  /**
   * Retrieve one queue item.
   */
  async getQueueItem(queueId: string): Promise<OfflineQueueItem | null> {
    const db = await this.openDatabase();

    return new Promise<OfflineQueueItem | null>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);

      const request = store.get(queueId);

      request.onsuccess = () => {
        resolve((request.result as OfflineQueueItem | undefined) ?? null);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read offline queue item.')
        );
      };
    });
  }

  /**
   * Retrieve the complete offline queue.
   */
  async getQueue(): Promise<OfflineQueueItem[]> {
    const db = await this.openDatabase();

    return new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);

      const request = store.getAll();

      request.onsuccess = () => {
        const items = (request.result as OfflineQueueItem[]) || [];

        items.sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        );

        resolve(items);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read offline queue.')
        );
      };
    });
  }

  /**
   * Delete one queue item.
   */
  async deleteQueueItem(queueId: string): Promise<void> {
    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);

      store.delete(queueId);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to delete offline queue item.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Delete transaction was aborted.')
        );
      };
    });
  }

  /**
   * Delete all queue items.
   */
  async clearQueue(): Promise<void> {
    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(QUEUE_STORE, 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);

      store.clear();

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to clear offline queue.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Clear transaction was aborted.')
        );
      };
    });
  }

  /**
   * Check whether the offline database is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.openDatabase();
      return true;
    } catch (error) {
      console.error(
        '[OfflineStorage] IndexedDB unavailable:',
        error
      );
      return false;
    }
  }
}

export const offlineStorage = new OfflineStorage();