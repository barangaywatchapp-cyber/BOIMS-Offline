/**
 * Phase 9 — Offline Notifications, Cross-Tab Notification State & Delivery Reconciliation Test Runner
 * Executes all Phase 9 notification validation tests and verifies Phase 8, 7, 6, 5, 4, and 3 non-regression.
 */

import { runPhase9TestSuite } from './src/offline/phase9Tests';
import { runPhase8TestSuite } from './src/offline/phase8Tests';
import { runPhase7TestSuite } from './src/offline/phase7Tests';
import { runPhase6TestSuite } from './src/offline/phase6Tests';
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

  get(queryVal: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const records = Array.from(this.store.data.values());
      const found = records.find((r: any) => r[this.keyPath] === queryVal);
      req.result = found ? JSON.parse(JSON.stringify(found)) : undefined;
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
  indexNames: {
    contains: (name: string) => boolean;
  };

  constructor(name: string, keyPath: string) {
    this.name = name;
    this.keyPath = keyPath;
    this.indexNames = {
      contains: (n: string) => this.indexes.has(n),
    };
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
  mode: string;
  db: MockIDBDatabase;
  oncomplete: any = null;
  onerror: any = null;

  constructor(db: MockIDBDatabase, mode: string) {
    this.db = db;
    this.mode = mode;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete({} as any);
    }, 0);
  }

  objectStore(name: string) {
    return this.db.getOrCreateStore(name);
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, MockIDBObjectStore> = new Map();
  objectStoreNames: {
    contains: (name: string) => boolean;
  };

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = {
      contains: (n: string) => this.stores.has(n),
    };
  }

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new MockIDBObjectStore(name, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  getOrCreateStore(name: string) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new MockIDBObjectStore(name, 'id'));
    }
    return this.stores.get(name)!;
  }

  transaction(storeNames: string | string[], mode: string = 'readonly') {
    return new MockIDBTransaction(this, mode);
  }

  close() {}
}

class MockIDBRequest {
  result: any;
  error: any = null;
  onsuccess: any = null;
  onerror: any = null;
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: any = null;
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

// Mock BroadcastChannel
const mockChannelListeners = new Map<string, Set<(data: any) => void>>();
(globalThis as any).BroadcastChannel = class MockBroadcastChannel {
  name: string;
  onmessage: ((ev: { data: any }) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    if (!mockChannelListeners.has(name)) {
      mockChannelListeners.set(name, new Set());
    }
    mockChannelListeners.get(name)!.add((data: any) => {
      if (this.onmessage) {
        this.onmessage({ data });
      }
    });
  }

  postMessage(data: any) {
    const listeners = mockChannelListeners.get(this.name);
    if (listeners) {
      listeners.forEach((listener) => {
        setTimeout(() => listener(data), 0);
      });
    }
  }

  close() {
    mockChannelListeners.delete(this.name);
  }
};

async function main() {
  console.log('===========================================================');
  console.log('  BOIMS Phase 9 — Offline Notifications & Reconciliation');
  console.log('===========================================================\n');

  // 1. Run Phase 9 Test Suite
  console.log('--- Executing Phase 9 Offline Notification Test Suite ---');
  const phase9Summary = await runPhase9TestSuite();

  for (const res of phase9Summary.results) {
    if (res.passed) {
      console.log(`✅ [PASS] ${res.id}: ${res.name} (${res.durationMs}ms)`);
    } else {
      console.log(`❌ [FAIL] ${res.id}: ${res.name} - Error: ${res.error}`);
    }
  }

  console.log('\n--- Executing Phase 8 Regression Suite ---');
  const phase8Summary = await runPhase8TestSuite();
  console.log(`Phase 8 Regression: ${phase8Summary.passed}/${phase8Summary.total} passed`);

  console.log('\n--- Executing Phase 7 Regression Suite ---');
  const phase7Summary = await runPhase7TestSuite();
  console.log(`Phase 7 Regression: ${phase7Summary.passed}/${phase7Summary.total} passed`);

  console.log('\n--- Executing Phase 6 Regression Suite ---');
  const phase6Summary = await runPhase6TestSuite();
  console.log(`Phase 6 Regression: ${phase6Summary.passed}/${phase6Summary.total} passed`);

  console.log('\n--- Executing Phase 5 Regression Suite ---');
  const phase5Summary = await runPhase5TestSuite();
  console.log(`Phase 5 Regression: ${phase5Summary.passed}/${phase5Summary.total} passed`);

  console.log('\n--- Executing Phase 4 Regression Suite ---');
  const phase4Summary = await runPhase4TestSuite();
  console.log(`Phase 4 Regression: ${phase4Summary.passed}/${phase4Summary.total} passed`);

  console.log('\n--- Executing Phase 3 Regression Suite ---');
  const phase3Summary = await runPhase3TestSuite();
  console.log(`Phase 3 Regression: ${phase3Summary.passed}/${phase3Summary.total} passed`);

  console.log('\n===========================================================');
  console.log(`Phase 9 Results: ${phase9Summary.passed}/${phase9Summary.total} Passed, ${phase9Summary.failed} Failed`);
  console.log(`Phase 8 Regression: ${phase8Summary.passed}/${phase8Summary.total} Passed`);
  console.log(`Phase 7 Regression: ${phase7Summary.passed}/${phase7Summary.total} Passed`);
  console.log(`Phase 6 Regression: ${phase6Summary.passed}/${phase6Summary.total} Passed`);
  console.log(`Phase 5 Regression: ${phase5Summary.passed}/${phase5Summary.total} Passed`);
  console.log(`Phase 4 Regression: ${phase4Summary.passed}/${phase4Summary.total} Passed`);
  console.log(`Phase 3 Regression: ${phase3Summary.passed}/${phase3Summary.total} Passed`);
  const grandTotal =
    phase9Summary.total +
    phase8Summary.total +
    phase7Summary.total +
    phase6Summary.total +
    phase5Summary.total +
    phase4Summary.total +
    phase3Summary.total;
  const grandPassed =
    phase9Summary.passed +
    phase8Summary.passed +
    phase7Summary.passed +
    phase6Summary.passed +
    phase5Summary.passed +
    phase4Summary.passed +
    phase3Summary.passed;
  console.log(`Total Validation: ${grandPassed}/${grandTotal} Passed`);
  console.log('===========================================================');

  if (
    phase9Summary.failed > 0 ||
    phase8Summary.failed > 0 ||
    phase7Summary.failed > 0 ||
    phase6Summary.failed > 0 ||
    phase5Summary.failed > 0 ||
    phase4Summary.failed > 0 ||
    phase3Summary.failed > 0
  ) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
