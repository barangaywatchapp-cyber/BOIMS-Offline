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

import type {
  OfflineQueueItem,
  OfflineStorageMetadata,
  CachedEntity,
  OfflineSessionRecord,
  DeadLetterItem,
  DLQFailureReason,
  OfflineMutation,
} from './types';
import {
  sanitizeUserForOfflineSession,
  isOfflineSessionValid,
  OFFLINE_SESSION_TTL_MS,
  OFFLINE_SESSION_SCHEMA_VERSION,
  DLQ_SCHEMA_VERSION,
} from './types';

const DB_NAME = 'boims-offline';
const DB_VERSION = 3;

const QUEUE_STORE = 'offlineQueue';
const METADATA_STORE = 'offlineMetadata';
const ENTITY_CACHE_STORE = 'offlineEntities';
const DLQ_STORE = 'offlineDLQ';

const QUEUE_INDEX_CREATED_AT = 'createdAt';
const QUEUE_INDEX_STATUS = 'status';

const ENTITY_INDEX_COLLECTION = 'collectionName';
const ENTITY_INDEX_CACHED_AT = 'cachedAt';

const DLQ_INDEX_ORIGINAL_QUEUE_ID = 'originalQueueId';
const DLQ_INDEX_FAILED_AT = 'failedAt';
const DLQ_INDEX_COLLECTION = 'collectionName';
const DLQ_INDEX_USER_ID = 'originatingUserId';

const METADATA_KEY = 'storage_metadata';
const SESSION_METADATA_KEY = 'active_offline_session';
const DEFAULT_SCHEMA_VERSION = 3;

interface StoredMetadataRecord extends OfflineStorageMetadata {
  key: string;
}

interface StoredSessionRecord {
  key: string;
  session: OfflineSessionRecord;
}

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

        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, {
            keyPath: 'key',
          });
        }

        if (!db.objectStoreNames.contains(ENTITY_CACHE_STORE)) {
          const entityStore = db.createObjectStore(ENTITY_CACHE_STORE, {
            keyPath: 'id',
          });

          entityStore.createIndex(
            ENTITY_INDEX_COLLECTION,
            'collectionName',
            { unique: false }
          );

          entityStore.createIndex(
            ENTITY_INDEX_CACHED_AT,
            'cachedAt',
            { unique: false }
          );
        }

        if (!db.objectStoreNames.contains(DLQ_STORE)) {
          const dlqStore = db.createObjectStore(DLQ_STORE, {
            keyPath: 'dlqId',
          });

          dlqStore.createIndex(
            DLQ_INDEX_ORIGINAL_QUEUE_ID,
            'originalQueueId',
            { unique: false }
          );

          dlqStore.createIndex(
            DLQ_INDEX_FAILED_AT,
            'failedAt',
            { unique: false }
          );

          dlqStore.createIndex(
            DLQ_INDEX_COLLECTION,
            'collectionName',
            { unique: false }
          );

          dlqStore.createIndex(
            DLQ_INDEX_USER_ID,
            'originatingUserId',
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
   * Retrieve the persisted offline storage metadata.
   */
  async getMetadata(): Promise<OfflineStorageMetadata | null> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(METADATA_STORE)) {
      return null;
    }

    return new Promise<OfflineStorageMetadata | null>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);

      const request = store.get(METADATA_KEY);

      request.onsuccess = () => {
        const record = request.result as StoredMetadataRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        resolve({
          schemaVersion: record.schemaVersion,
          lastUpdatedAt: record.lastUpdatedAt,
          deviceId: record.deviceId,
        });
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read offline storage metadata.')
        );
      };
    });
  }

  /**
   * Persist or update offline storage metadata.
   */
  async putMetadata(
    metadata: Partial<OfflineStorageMetadata>
  ): Promise<OfflineStorageMetadata> {
    const db = await this.openDatabase();
    const existing = await this.getMetadata();

    const updatedMetadata: OfflineStorageMetadata = {
      schemaVersion:
        metadata.schemaVersion ??
        existing?.schemaVersion ??
        DEFAULT_SCHEMA_VERSION,
      lastUpdatedAt: metadata.lastUpdatedAt ?? new Date().toISOString(),
      deviceId: metadata.deviceId ?? existing?.deviceId,
    };

    const record: StoredMetadataRecord = {
      key: METADATA_KEY,
      ...updatedMetadata,
    };

    return new Promise<OfflineStorageMetadata>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      store.put(record);

      transaction.oncomplete = () => resolve(updatedMetadata);

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to save offline storage metadata.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Metadata transaction was aborted.')
        );
      };
    });
  }

  // =========================================================================
  // Phase 2 — Local Entity Cache Layer Methods
  // =========================================================================

  /**
   * Generates a deterministic compound key for a cached entity: `${collectionName}:${recordId}`
   */
  private getEntityKey(collectionName: string, recordId: string): string {
    return `${collectionName}:${recordId}`;
  }

  /**
   * Persists or updates a single cached entity.
   */
  async putCachedEntity<T = unknown>(
    collectionName: string,
    recordId: string,
    data: T,
    options?: { updatedAt?: string; version?: number | string }
  ): Promise<CachedEntity<T>> {
    const db = await this.openDatabase();
    const id = this.getEntityKey(collectionName, recordId);
    const cachedEntity: CachedEntity<T> = {
      id,
      collectionName,
      recordId,
      data,
      cachedAt: new Date().toISOString(),
      updatedAt: options?.updatedAt,
      version: options?.version,
    };

    return new Promise<CachedEntity<T>>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      store.put(cachedEntity);

      transaction.oncomplete = () => resolve(cachedEntity);

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error(`Failed to cache entity ${id}.`)
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error(`Caching entity ${id} was aborted.`)
        );
      };
    });
  }

  /**
   * Atomically persists or updates multiple cached entities for a collection.
   */
  async putCachedEntities<T = unknown>(
    collectionName: string,
    records: Array<{ recordId: string; data: T; updatedAt?: string; version?: number | string }>
  ): Promise<Array<CachedEntity<T>>> {
    if (records.length === 0) {
      return [];
    }

    const db = await this.openDatabase();
    const now = new Date().toISOString();
    const cachedEntities: Array<CachedEntity<T>> = records.map((r) => ({
      id: this.getEntityKey(collectionName, r.recordId),
      collectionName,
      recordId: r.recordId,
      data: r.data,
      cachedAt: now,
      updatedAt: r.updatedAt,
      version: r.version,
    }));

    return new Promise<Array<CachedEntity<T>>>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      for (const entity of cachedEntities) {
        store.put(entity);
      }

      transaction.oncomplete = () => resolve(cachedEntities);

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error(`Failed to bulk cache entities for ${collectionName}.`)
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error(`Bulk caching for ${collectionName} was aborted.`)
        );
      };
    });
  }

  /**
   * Retrieves a single cached entity by collection and record ID.
   */
  async getCachedEntity<T = unknown>(
    collectionName: string,
    recordId: string
  ): Promise<CachedEntity<T> | null> {
    const db = await this.openDatabase();
    const id = this.getEntityKey(collectionName, recordId);

    return new Promise<CachedEntity<T> | null>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readonly');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      const request = store.get(id);

      request.onsuccess = () => {
        const result = (request.result as CachedEntity<T>) ?? null;
        resolve(result);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error(`Failed to retrieve cached entity ${id}.`)
        );
      };
    });
  }

  /**
   * Retrieves all cached entities for a specified collection.
   */
  async getCachedEntities<T = unknown>(
    collectionName: string
  ): Promise<Array<CachedEntity<T>>> {
    const db = await this.openDatabase();

    return new Promise<Array<CachedEntity<T>>>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readonly');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);
      const index = store.index(ENTITY_INDEX_COLLECTION);

      const request = index.getAll(collectionName);

      request.onsuccess = () => {
        const results = (request.result as Array<CachedEntity<T>>) ?? [];
        resolve(results);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error(`Failed to retrieve cached entities for ${collectionName}.`)
        );
      };
    });
  }

  /**
   * Deletes a single cached entity.
   */
  async deleteCachedEntity(
    collectionName: string,
    recordId: string
  ): Promise<void> {
    const db = await this.openDatabase();
    const id = this.getEntityKey(collectionName, recordId);

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      store.delete(id);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error(`Failed to delete cached entity ${id}.`)
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error(`Deleting cached entity ${id} was aborted.`)
        );
      };
    });
  }

  /**
   * Clears all cached records for a specific collection.
   */
  async clearCachedCollection(collectionName: string): Promise<void> {
    const db = await this.openDatabase();
    const entities = await this.getCachedEntities(collectionName);

    if (entities.length === 0) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      for (const entity of entities) {
        store.delete(entity.id);
      }

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error(`Failed to clear cached collection ${collectionName}.`)
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error(`Clearing cached collection ${collectionName} was aborted.`)
        );
      };
    });
  }

  /**
   * Clears all cached entities across all collections.
   */
  async clearAllCachedEntities(): Promise<void> {
    const db = await this.openDatabase();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTITY_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(ENTITY_CACHE_STORE);

      store.clear();

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to clear all cached entities.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Clearing all cached entities was aborted.')
        );
      };
    });
  }

  // =========================================================================
  // Phase 3 — Offline Session Persistence Methods
  // =========================================================================

  /**
   * Persists or updates the active offline session record.
   * Enforces sanitization, multi-account isolation, and TTL window.
   */
  async saveSession(session: OfflineSessionRecord): Promise<void> {
    if (!session.uid || !session.user || !session.user.role) {
      throw new Error('Cannot save invalid offline session.');
    }

    const db = await this.openDatabase();
    const sanitizedUser = sanitizeUserForOfflineSession(session.user);
    const now = new Date();
    const nowIso = now.toISOString();

    const expiresAt =
      session.expiresAt && !isNaN(new Date(session.expiresAt).getTime())
        ? session.expiresAt
        : new Date(now.getTime() + OFFLINE_SESSION_TTL_MS).toISOString();

    const sanitizedSession: OfflineSessionRecord = {
      uid: session.uid,
      user: sanitizedUser,
      sessionState: session.sessionState || 'online_authenticated',
      authenticatedAt: session.authenticatedAt || nowIso,
      lastActiveAt: session.lastActiveAt || nowIso,
      expiresAt,
      schemaVersion: session.schemaVersion || OFFLINE_SESSION_SCHEMA_VERSION,
    };

    const record: StoredSessionRecord = {
      key: SESSION_METADATA_KEY,
      session: sanitizedSession,
    };

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      store.put(record);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to persist offline session record.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Session persistence transaction was aborted.')
        );
      };
    });
  }

  /**
   * Retrieves and validates the persisted offline session record.
   * Returns null if no session exists or if the session has expired or is invalid.
   */
  async getSession(): Promise<OfflineSessionRecord | null> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(METADATA_STORE)) {
      return null;
    }

    return new Promise<OfflineSessionRecord | null>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);

      const request = store.get(SESSION_METADATA_KEY);

      request.onsuccess = () => {
        const record = request.result as StoredSessionRecord | undefined;
        if (!record || !record.session) {
          resolve(null);
          return;
        }

        if (!isOfflineSessionValid(record.session)) {
          resolve(null);
          return;
        }

        resolve(record.session);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read offline session record.')
        );
      };
    });
  }

  /**
   * Clears the persisted offline session record (e.g., on explicit logout).
   */
  async clearSession(): Promise<void> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(METADATA_STORE)) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      store.delete(SESSION_METADATA_KEY);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to clear offline session record.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Clear session transaction was aborted.')
        );
      };
    });
  }

  // =========================================================================
  // Phase 6 — Dead Letter Queue (DLQ) Persistence Methods
  // =========================================================================

  /**
   * Save or replace one Dead Letter Queue item.
   */
  async putDLQItem(item: DeadLetterItem): Promise<void> {
    const db = await this.openDatabase();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readwrite');
      const store = transaction.objectStore(DLQ_STORE);

      store.put(item);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to save dead letter queue item.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('DLQ transaction was aborted.')
        );
      };
    });
  }

  /**
   * Retrieve one Dead Letter Queue item by DLQ ID.
   */
  async getDLQItem(dlqId: string): Promise<DeadLetterItem | null> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(DLQ_STORE)) {
      return null;
    }

    return new Promise<DeadLetterItem | null>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readonly');
      const store = transaction.objectStore(DLQ_STORE);

      const request = store.get(dlqId);

      request.onsuccess = () => {
        resolve((request.result as DeadLetterItem | undefined) ?? null);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read dead letter queue item.')
        );
      };
    });
  }

  /**
   * Retrieve one Dead Letter Queue item by original queue ID.
   */
  async getDLQItemByOriginalQueueId(originalQueueId: string): Promise<DeadLetterItem | null> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(DLQ_STORE)) {
      return null;
    }

    return new Promise<DeadLetterItem | null>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readonly');
      const store = transaction.objectStore(DLQ_STORE);

      let hasIndex = false;
      try {
        if (store.indexNames && typeof store.indexNames.contains === 'function') {
          hasIndex = store.indexNames.contains(DLQ_INDEX_ORIGINAL_QUEUE_ID);
        } else if (typeof store.index === 'function') {
          store.index(DLQ_INDEX_ORIGINAL_QUEUE_ID);
          hasIndex = true;
        }
      } catch {
        hasIndex = false;
      }

      if (hasIndex) {
        const index = store.index(DLQ_INDEX_ORIGINAL_QUEUE_ID);
        const request = index.get(originalQueueId);

        request.onsuccess = () => {
          resolve((request.result as DeadLetterItem | undefined) ?? null);
        };

        request.onerror = () => {
          reject(
            request.error ??
              new Error('Failed to find DLQ item by original queue ID.')
          );
        };
      } else {
        const request = store.getAll();
        request.onsuccess = () => {
          const items = (request.result as DeadLetterItem[]) || [];
          const found = items.find((i) => i.originalQueueId === originalQueueId) || null;
          resolve(found);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('Failed to read DLQ.'));
        };
      }
    });
  }

  /**
   * Retrieve all Dead Letter Queue items, sorted chronologically by failure time.
   */
  async getDLQ(): Promise<DeadLetterItem[]> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(DLQ_STORE)) {
      return [];
    }

    return new Promise<DeadLetterItem[]>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readonly');
      const store = transaction.objectStore(DLQ_STORE);

      const request = store.getAll();

      request.onsuccess = () => {
        const items = (request.result as DeadLetterItem[]) || [];
        items.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
        resolve(items);
      };

      request.onerror = () => {
        reject(
          request.error ??
            new Error('Failed to read dead letter queue.')
        );
      };
    });
  }

  /**
   * Delete one item from the Dead Letter Queue.
   */
  async deleteDLQItem(dlqId: string): Promise<void> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(DLQ_STORE)) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readwrite');
      const store = transaction.objectStore(DLQ_STORE);

      store.delete(dlqId);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to delete dead letter queue item.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Delete DLQ transaction was aborted.')
        );
      };
    });
  }

  /**
   * Clears all items in the Dead Letter Queue.
   */
  async clearDLQ(): Promise<void> {
    const db = await this.openDatabase();

    if (!db.objectStoreNames.contains(DLQ_STORE)) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DLQ_STORE, 'readwrite');
      const store = transaction.objectStore(DLQ_STORE);

      store.clear();

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(
          transaction.error ??
            new Error('Failed to clear dead letter queue.')
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ??
            new Error('Clear DLQ transaction was aborted.')
        );
      };
    });
  }

  /**
   * Returns total count of Dead Letter Queue items, optionally filtered by collection.
   */
  async getDLQCount(collectionName?: string): Promise<number> {
    const dlq = await this.getDLQ();
    if (collectionName) {
      return dlq.filter((item) => item.collectionName === collectionName).length;
    }
    return dlq.length;
  }

  /**
   * Crash-safe transition of a failed mutation into the Dead Letter Queue.
   *
   * 1. Constructs complete DeadLetterItem with failure metadata and zero secrets.
   * 2. Persists DeadLetterItem to 'offlineDLQ' store FIRST.
   * 3. ONLY after DLQ write succeeds, deletes the original item from 'offlineQueue'.
   * 4. If DLQ persistence throws or aborts, the original queue item is NOT deleted.
   */
  async moveToDLQ(
    queueItem: OfflineQueueItem | OfflineMutation,
    failureReason: DLQFailureReason,
    error?: any
  ): Promise<DeadLetterItem> {
    const now = new Date().toISOString();
    const dlqId = `DLQ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const errCode = error?.code || queueItem.lastErrorCode || '';
    const errMsg = error?.message || queueItem.lastError || String(error || '');

    const dlqItem: DeadLetterItem = {
      dlqId,
      originalQueueId: queueItem.queueId,
      operation: queueItem.operation,
      collectionName: queueItem.collectionName,
      recordId: queueItem.recordId,
      payload: queueItem.payload,
      originalCreatedAt: queueItem.createdAt,
      failedAt: now,
      retryCount: queueItem.retryCount,
      lastError: errMsg || undefined,
      lastErrorCode: errCode || undefined,
      failureReason,
      originatingUserId: 'userId' in queueItem ? (queueItem as OfflineMutation).userId : undefined,
      originatingUserRole: 'userRole' in queueItem ? (queueItem as OfflineMutation).userRole : undefined,
      schemaVersion: DLQ_SCHEMA_VERSION,
    };

    // Step 1: Persist into DLQ store first
    await this.putDLQItem(dlqItem);

    // Step 2: Only after DLQ persistence succeeds, remove from active offline queue
    await this.deleteQueueItem(queueItem.queueId);

    console.warn(
      `[OfflineStorage] Moved mutation ${queueItem.queueId} to DLQ (${dlqId}) due to '${failureReason}':`,
      errMsg
    );

    return dlqItem;
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