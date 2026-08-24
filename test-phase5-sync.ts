/**
 * Phase 5 — SyncService Migration & Automatic Offline Queue Replay Test Suite Runner
 * Executes all Phase 5 validation tests and verifies Phase 1, Phase 2, Phase 3, and Phase 4 non-regression.
 */

import { offlineStorage } from './src/offline/storage';
import { runPhase5TestSuite } from './src/offline/phase5Tests';
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
  mode: string;
  db: MockIDBDatabase;
  oncomplete: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(db: MockIDBDatabase, mode: string) {
    this.db = db;
    this.mode = mode;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete({} as any);
    }, 10);
  }

  objectStore(name: string): IDBObjectStore {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`Object store ${name} not found`);
    return store as unknown as IDBObjectStore;
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
    const self = this;
    return {
      contains: (n: string) => self.stores.has(n),
    };
  }

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new MockIDBObjectStore(name, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string | string[], mode: string = 'readonly') {
    return new MockIDBTransaction(this, mode) as unknown as IDBTransaction;
  }

  close() {}
}

class MockIDBRequest {
  result: any = null;
  error: any = null;
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((event: any) => void) | null = null;
}

const mockDatabases: Map<string, MockIDBDatabase> = new Map();

// Mock global indexedDB
(global as any).indexedDB = {
  open: (name: string, version: number) => {
    const req = new MockIDBOpenDBRequest();
    setTimeout(() => {
      let db = mockDatabases.get(name);
      const isNew = !db;
      if (isNew) {
        db = new MockIDBDatabase(name, version);
        mockDatabases.set(name, db);
      }
      req.result = db;
      if (isNew && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req } as any);
      }
      if (req.onsuccess) {
        req.onsuccess({ target: req } as any);
      }
    }, 0);
    return req;
  },
};

// Mock global localStorage
const mockLocalStorageStore: Map<string, string> = new Map();
(global as any).localStorage = {
  getItem: (key: string) => mockLocalStorageStore.get(key) || null,
  setItem: (key: string, value: string) => mockLocalStorageStore.set(key, String(value)),
  removeItem: (key: string) => mockLocalStorageStore.delete(key),
  clear: () => mockLocalStorageStore.clear(),
};

// Mock global navigator
try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
} catch {
  (globalThis as any).navigator = { onLine: true };
}

async function main() {
  console.log('===========================================================');
  console.log('  BOIMS Phase 5 — SyncService & Queue Replay Validation');
  console.log('===========================================================\n');

  // 1. Run Phase 5 Test Suite
  console.log('--- Executing Phase 5 SyncService Suite ---');
  const phase5Summary = await runPhase5TestSuite();

  for (const res of phase5Summary.results) {
    if (res.passed) {
      console.log(`✅ [PASS] ${res.id}: ${res.name} (${res.durationMs}ms)`);
    } else {
      console.log(`❌ [FAIL] ${res.id}: ${res.name} - Error: ${res.error}`);
    }
  }

  console.log('\n--- Executing Phase 4 Regression Suite ---');
  const phase4Summary = await runPhase4TestSuite();
  console.log(`Phase 4 Regression: ${phase4Summary.passed}/${phase4Summary.total} passed`);

  console.log('\n--- Executing Phase 3 Regression Suite ---');
  const phase3Summary = await runPhase3TestSuite();
  console.log(`Phase 3 Regression: ${phase3Summary.passed}/${phase3Summary.total} passed`);

  console.log('\n===========================================================');
  console.log(`Phase 5 Results: ${phase5Summary.passed}/${phase5Summary.total} Passed, ${phase5Summary.failed} Failed`);
  console.log(`Phase 4 Regression: ${phase4Summary.passed}/${phase4Summary.total} Passed`);
  console.log(`Phase 3 Regression: ${phase3Summary.passed}/${phase3Summary.total} Passed`);
  const grandTotal = phase5Summary.total + phase4Summary.total + phase3Summary.total;
  const grandPassed = phase5Summary.passed + phase4Summary.passed + phase3Summary.passed;
  console.log(`Total Validation: ${grandPassed}/${grandTotal} Passed`);
  console.log('===========================================================');

  if (phase5Summary.failed > 0 || phase4Summary.failed > 0 || phase3Summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
