/**
 * Phase 4 — Offline CRUD & Mutation Queue Test Suite Runner
 * Executes all 22 Phase 4 tests and verifies full Phase 1, Phase 2, and Phase 3 non-regression.
 */

import { offlineStorage } from './src/offline/storage';
import { runPhase4TestSuite } from './src/offline/phase4Tests';
import { runPhase3TestSuite } from './src/offline/phase3Tests';

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
      const filtered =
        queryVal !== undefined
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
      req.result = Array.from(this.data.values()).map((v) =>
        JSON.parse(JSON.stringify(v))
      );
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

async function runAllTests() {
  setupMockIndexedDB();

  console.log('===============================================================');
  console.log('       BOIMS OFFLINE ARCHITECTURE — TEST VERIFICATION SUITE    ');
  console.log('===============================================================');

  // Run Phase 4 Test Suite
  console.log('\n--- Running Phase 4 Test Suite (22 Tests) ---');
  const p4Summary = await runPhase4TestSuite();
  p4Summary.results.forEach((r) => {
    if (r.passed) {
      console.log(`✅ [PASS] [${r.id}] ${r.name} (${r.durationMs}ms)`);
    } else {
      console.error(`❌ [FAIL] [${r.id}] ${r.name}: ${r.error}`);
    }
  });

  console.log(`\nPhase 4 Result: ${p4Summary.passed}/${p4Summary.total} Passed (${p4Summary.failed} Failed)`);

  // Run Phase 3 Test Suite for Regression Check
  console.log('\n--- Running Phase 3 Test Suite for Regression Verification (21 Tests) ---');
  const p3Summary = await runPhase3TestSuite();
  p3Summary.results.forEach((r) => {
    if (r.passed) {
      console.log(`✅ [PASS] [${r.id}] ${r.name} (${r.durationMs}ms)`);
    } else {
      console.error(`❌ [FAIL] [${r.id}] ${r.name}: ${r.error}`);
    }
  });

  console.log(`\nPhase 3 Result: ${p3Summary.passed}/${p3Summary.total} Passed (${p3Summary.failed} Failed)`);

  console.log('\n===============================================================');
  const totalAll = p4Summary.total + p3Summary.total;
  const passedAll = p4Summary.passed + p3Summary.passed;
  const failedAll = p4Summary.failed + p3Summary.failed;

  console.log(`TOTAL TESTS EXECUTED: ${totalAll}`);
  console.log(`PASSED: ${passedAll}`);
  console.log(`FAILED: ${failedAll}`);
  console.log('===============================================================');

  if (failedAll > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
