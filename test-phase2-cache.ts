/**
 * Phase 2 — Offline Cache Layer Test Suite
 * Validates all Phase 2 cache persistence, querying, freshness, error handling,
 * and confirms that Phase 1 queue & recovery remain completely intact.
 */

import { offlineStorage } from './src/offline/storage';
import { offlineRecovery } from './src/offline/recovery';
import { offlineBootstrap } from './src/offline/bootstrap';
import { OfflineQueueItem, CachedEntity } from './src/offline/types';

// In-memory IndexedDB mock for Node.js test environment
class MockIDBIndex {
  name: string;
  keyPath: string;
  store: MockIDBObjectStore;

  constructor(name: string, keyPath: string, store: MockIDBObjectStore) {
    this.name = name;
    this.keyPath = keyPath;
    this.store = store;
  }

  getAll(queryVal?: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const records = Array.from(this.store.data.values());
      const filtered = queryVal !== undefined
        ? records.filter((r: any) => r[this.keyPath] === queryVal)
        : records;
      req.result = filtered;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }
}

class MockIDBObjectStore {
  name: string;
  keyPath: string;
  data: Map<string, any> = new Map();
  indexes: Map<string, MockIDBIndex> = new Map();

  constructor(name: string, keyPath: string) {
    this.name = name;
    this.keyPath = keyPath;
  }

  createIndex(name: string, keyPath: string, _options?: any) {
    const idx = new MockIDBIndex(name, keyPath, this);
    this.indexes.set(name, idx);
    return idx;
  }

  index(name: string) {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`Index ${name} not found`);
    return idx;
  }

  put(value: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const key = value[this.keyPath];
      this.data.set(key, JSON.parse(JSON.stringify(value)));
      req.result = key;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }

  get(key: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const val = this.data.get(key);
      req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }

  getAll(): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      req.result = Array.from(this.data.values()).map((v) => JSON.parse(JSON.stringify(v)));
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }

  delete(key: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      this.data.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }

  clear(): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      this.data.clear();
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }
}

class MockIDBTransaction {
  storeNames: string[];
  mode: string;
  db: MockIDBDatabase;
  oncomplete: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onabort: ((ev: any) => void) | null = null;

  constructor(db: MockIDBDatabase, storeNames: string[], mode: string) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete({} as any);
    }, 5);
  }

  objectStore(name: string) {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`Object store ${name} not found`);
    return store;
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, MockIDBObjectStore> = new Map();

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  get objectStoreNames() {
    const keys = Array.from(this.stores.keys());
    return {
      contains: (name: string) => this.stores.has(name),
      item: (index: number) => keys[index],
      length: keys.length,
      [Symbol.iterator]: () => keys[Symbol.iterator](),
    };
  }

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new MockIDBObjectStore(name, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string | string[], mode: string) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new MockIDBTransaction(this, names, mode);
  }
}

class MockIDBRequest {
  result: any;
  error: any = null;
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onupgradeneeded: ((ev: any) => void) | null = null;
  onblocked: ((ev: any) => void) | null = null;
}

function setupMockIndexedDB() {
  const globalMockDb = new MockIDBDatabase('boims-offline', 2);

  (globalThis as any).indexedDB = {
    open: (name: string, version: number) => {
      const req = new MockIDBRequest();
      setTimeout(() => {
        req.result = globalMockDb;
        if (req.onupgradeneeded) {
          req.onupgradeneeded({} as any);
        }
        if (req.onsuccess) {
          req.onsuccess({} as any);
        }
      }, 0);
      return req;
    },
  };
}

async function runPhase2Tests() {
  console.log('--- Starting Phase 2 Offline Cache Validation Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  setupMockIndexedDB();

  // Test 1: Cache a single entity
  try {
    const sample = { title: 'Typhoon Alert', priority: 'high', active: true };
    const cached = await offlineStorage.putCachedEntity('announcements', 'ann-001', sample, {
      updatedAt: '2026-08-24T08:00:00.000Z',
    });
    assert(
      cached.id === 'announcements:ann-001' &&
      cached.collectionName === 'announcements' &&
      cached.recordId === 'ann-001' &&
      cached.data.title === 'Typhoon Alert' &&
      !!cached.cachedAt,
      'Test 1: Cache a single entity'
    );
  } catch (err) {
    assert(false, `Test 1: Cache a single entity (${err})`);
  }

  // Test 2: Retrieve a cached entity
  try {
    const result = await offlineStorage.getCachedEntity<any>('announcements', 'ann-001');
    assert(
      result !== null &&
      result.data.title === 'Typhoon Alert' &&
      result.updatedAt === '2026-08-24T08:00:00.000Z',
      'Test 2: Retrieve a cached entity'
    );
  } catch (err) {
    assert(false, `Test 2: Retrieve a cached entity (${err})`);
  }

  // Test 3: Cache multiple entities (Bulk Put)
  try {
    const bulk = [
      { recordId: 'rpt-101', data: { title: 'Flooding in Sitio Uno', status: 'pending' }, updatedAt: '2026-08-24T08:10:00.000Z' },
      { recordId: 'rpt-102', data: { title: 'Street Light Outage', status: 'inProgress' }, updatedAt: '2026-08-24T08:15:00.000Z' },
      { recordId: 'rpt-103', data: { title: 'Fallen Tree Branch', status: 'resolved' }, updatedAt: '2026-08-24T08:20:00.000Z' },
    ];
    const cachedList = await offlineStorage.putCachedEntities('reports', bulk);
    assert(
      cachedList.length === 3 &&
      cachedList[0].id === 'reports:rpt-101' &&
      cachedList[1].id === 'reports:rpt-102' &&
      cachedList[2].id === 'reports:rpt-103',
      'Test 3: Cache multiple entities'
    );
  } catch (err) {
    assert(false, `Test 3: Cache multiple entities (${err})`);
  }

  // Test 4: Retrieve entities by collection/type
  try {
    const reports = await offlineStorage.getCachedEntities<any>('reports');
    assert(
      reports.length === 3 &&
      reports.some((r) => r.recordId === 'rpt-101') &&
      reports.some((r) => r.recordId === 'rpt-102') &&
      reports.some((r) => r.recordId === 'rpt-103'),
      'Test 4: Retrieve entities by collection/type'
    );
  } catch (err) {
    assert(false, `Test 4: Retrieve entities by collection/type (${err})`);
  }

  // Test 5: Update an existing cached entity
  try {
    await offlineStorage.putCachedEntity('reports', 'rpt-101', {
      title: 'Flooding in Sitio Uno — Resolved',
      status: 'resolved',
    });
    const updated = await offlineStorage.getCachedEntity<any>('reports', 'rpt-101');
    assert(
      updated !== null &&
      updated.data.status === 'resolved' &&
      updated.data.title === 'Flooding in Sitio Uno — Resolved',
      'Test 5: Update an existing cached entity'
    );
  } catch (err) {
    assert(false, `Test 5: Update an existing cached entity (${err})`);
  }

  // Test 6: Delete a cached entity
  try {
    await offlineStorage.deleteCachedEntity('reports', 'rpt-103');
    const checkDeleted = await offlineStorage.getCachedEntity('reports', 'rpt-103');
    assert(checkDeleted === null, 'Test 6: Delete a cached entity');
  } catch (err) {
    assert(false, `Test 6: Delete a cached entity (${err})`);
  }

  // Test 7: Clear a collection cache
  try {
    await offlineStorage.putCachedEntity('certs', 'c-1', { type: 'Barangay Clearance' });
    await offlineStorage.putCachedEntity('certs', 'c-2', { type: 'Certificate of Indigency' });
    await offlineStorage.clearCachedCollection('certs');
    const remainingCerts = await offlineStorage.getCachedEntities('certs');
    const remainingReports = await offlineStorage.getCachedEntities('reports');
    assert(
      remainingCerts.length === 0 && remainingReports.length > 0,
      'Test 7: Clear a collection cache without affecting other collections'
    );
  } catch (err) {
    assert(false, `Test 7: Clear a collection cache (${err})`);
  }

  // Test 8: Cache metadata and freshness information
  try {
    const metaBefore = await offlineStorage.getMetadata();
    const updatedMeta = await offlineStorage.putMetadata({
      schemaVersion: 2,
      lastUpdatedAt: '2026-08-24T08:30:00.000Z',
      deviceId: 'boims-device-test-001',
    });
    const metaAfter = await offlineStorage.getMetadata();
    assert(
      metaAfter !== null &&
      metaAfter.schemaVersion === 2 &&
      metaAfter.deviceId === 'boims-device-test-001',
      'Test 8: Cache metadata & freshness information'
    );
  } catch (err) {
    assert(false, `Test 8: Cache metadata & freshness information (${err})`);
  }

  // Test 9: Handle cache miss safely
  try {
    const miss = await offlineStorage.getCachedEntity('nonExistentCollection', 'missing-id-999');
    const emptyCollection = await offlineStorage.getCachedEntities('completelyEmptyCollection');
    assert(
      miss === null && Array.isArray(emptyCollection) && emptyCollection.length === 0,
      'Test 9: Handle cache miss safely (returns null / empty array)'
    );
  } catch (err) {
    assert(false, `Test 9: Handle cache miss safely (${err})`);
  }

  // Test 10: Handle IndexedDB unavailable/error conditions
  try {
    const isAvail = await offlineStorage.isAvailable();
    assert(isAvail === true, 'Test 10: Handle IndexedDB availability probe');
  } catch (err) {
    assert(false, `Test 10: Handle IndexedDB availability probe (${err})`);
  }

  // Test 11: Verify Phase 1 offlineQueue storage remains intact
  try {
    const queueItem: OfflineQueueItem = {
      queueId: 'q-test-001',
      operation: 'create',
      collectionName: 'reports',
      recordId: 'rpt-q1',
      payload: { title: 'Queued Incident' },
      createdAt: '2026-08-24T08:00:00.000Z',
      updatedAt: '2026-08-24T08:00:00.000Z',
      retryCount: 0,
      status: 'pending',
    };
    await offlineStorage.putQueueItem(queueItem);
    const queueList = await offlineStorage.getQueue();
    assert(
      queueList.length > 0 && queueList.some((q) => q.queueId === 'q-test-001'),
      'Test 11: Verify Phase 1 offlineQueue persistence remains intact'
    );
  } catch (err) {
    assert(false, `Test 11: Verify Phase 1 offlineQueue persistence remains intact (${err})`);
  }

  // Test 12: Verify Phase 1 recovery still normalizes 'syncing' -> 'pending'
  try {
    const syncingItem: OfflineQueueItem = {
      queueId: 'q-test-syncing-002',
      operation: 'update',
      collectionName: 'reports',
      recordId: 'rpt-q2',
      payload: { status: 'inProgress' },
      createdAt: '2026-08-24T08:00:00.000Z',
      updatedAt: '2026-08-24T08:00:00.000Z',
      retryCount: 1,
      status: 'syncing',
    };
    await offlineStorage.putQueueItem(syncingItem);
    const recoveryResult = await offlineRecovery.recover();
    const recovered = recoveryResult.recovered.find((r) => r.queueId === 'q-test-syncing-002');
    assert(
      recovered !== undefined && recovered.status === 'pending',
      "Test 12: Verify Phase 1 recovery normalizes 'syncing' -> 'pending'"
    );
  } catch (err) {
    assert(false, `Test 12: Verify Phase 1 recovery (${err})`);
  }

  // Test 13: Verify Bootstrap executes cleanly with Phase 2 schema
  try {
    const bootstrapRes = await offlineBootstrap.initialize();
    assert(
      bootstrapRes.available === true &&
      bootstrapRes.failedCount === 0 &&
      bootstrapRes.recoveredCount >= 1,
      'Test 13: Verify Phase 1 Bootstrap completes with Phase 2 schema'
    );
  } catch (err) {
    assert(false, `Test 13: Verify Phase 1 Bootstrap (${err})`);
  }

  console.log('-------------------------------------------------------');
  console.log(`Phase 2 Test Summary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
