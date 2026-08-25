/**
 * Phase 11 — Offline Data Integrity, Recovery & Corruption Resilience Test Runner
 * Executes all Phase 11 validation tests and verifies Phase 10, 9, 8, 7, 6, 5, 4, and 3 non-regression.
 */

import { runPhase11TestSuite } from './src/offline/phase11Tests';
import { runPhase10TestSuite } from './src/offline/phase10Tests';
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

  delete(key: any): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      this.data.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({} as any);
    }, 0);
    return req as unknown as IDBRequest;
  }

  getAll(): IDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const records = Array.from(this.data.values()).map((v) =>
        JSON.parse(JSON.stringify(v))
      );
      req.result = records;
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
  oncomplete: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onabort: ((ev: any) => void) | null = null;
  error: any = null;

  constructor(db: MockIDBDatabase, mode: string) {
    this.db = db;
    this.mode = mode;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete({} as any);
    }, 1);
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

  transaction(storeNames: string | string[], mode: string): IDBTransaction {
    return new MockIDBTransaction(this, mode) as unknown as IDBTransaction;
  }

  close() {}
}

class MockIDBRequest {
  result: any = null;
  error: any = null;
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onupgradeneeded: ((ev: any) => void) | null = null;
  onblocked: ((ev: any) => void) | null = null;
}

class MockIDBFactory {
  databases: Map<string, MockIDBDatabase> = new Map();

  open(name: string, version: number): IDBOpenDBRequest {
    const req = new MockIDBRequest();
    setTimeout(() => {
      let db = this.databases.get(name);
      const isNew = !db;
      if (!db) {
        db = new MockIDBDatabase(name, version);
        this.databases.set(name, db);
      }
      req.result = db;

      if (isNew && req.onupgradeneeded) {
        req.onupgradeneeded({} as any);
      }

      if (req.onsuccess) {
        req.onsuccess({} as any);
      }
    }, 0);
    return req as unknown as IDBOpenDBRequest;
  }
}

// In-memory BroadcastChannel mock
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private static channels: Map<string, Set<MockBroadcastChannel>> = new Map();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(message: any) {
    const channelSet = MockBroadcastChannel.channels.get(this.name);
    if (!channelSet) return;
    for (const ch of channelSet) {
      if (ch !== this && ch.onmessage) {
        ch.onmessage(new MessageEvent('message', { data: message }));
      }
    }
  }

  close() {
    const channelSet = MockBroadcastChannel.channels.get(this.name);
    if (channelSet) {
      channelSet.delete(this);
    }
  }
}

// Install mocks into global scope
(global as any).indexedDB = new MockIDBFactory();
(global as any).BroadcastChannel = MockBroadcastChannel;

const localStorageStore = new Map<string, string>();
(global as any).localStorage = {
  getItem: (k: string) => localStorageStore.get(k) || null,
  setItem: (k: string, v: string) => localStorageStore.set(k, String(v)),
  removeItem: (k: string) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
};

async function main() {
  console.log('===========================================================');
  console.log('  BOIMS Phase 11 — Offline Data Integrity & Corruption Resilience');
  console.log('===========================================================');

  console.log('\n--- Executing Phase 11 Data Integrity & Recovery Suite ---');
  const phase11Summary = await runPhase11TestSuite();

  for (const r of phase11Summary.results) {
    const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} ${r.id}: ${r.name} (${r.durationMs}ms)`);
    if (!r.passed && r.error) {
      console.log(`    Error: ${r.error}`);
    }
  }

  console.log('\n--- Executing Phase 10 Regression Suite ---');
  const phase10Summary = await runPhase10TestSuite();
  console.log(`Phase 10 Regression: ${phase10Summary.passed}/${phase10Summary.total} passed`);

  console.log('\n--- Executing Phase 9 Regression Suite ---');
  const phase9Summary = await runPhase9TestSuite();
  console.log(`Phase 9 Regression: ${phase9Summary.passed}/${phase9Summary.total} passed`);

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
  console.log(`Phase 11 Results: ${phase11Summary.passed}/${phase11Summary.total} Passed, ${phase11Summary.failed} Failed`);
  console.log(`Phase 10 Regression: ${phase10Summary.passed}/${phase10Summary.total} Passed`);
  console.log(`Phase 9 Regression: ${phase9Summary.passed}/${phase9Summary.total} Passed`);
  console.log(`Phase 8 Regression: ${phase8Summary.passed}/${phase8Summary.total} Passed`);
  console.log(`Phase 7 Regression: ${phase7Summary.passed}/${phase7Summary.total} Passed`);
  console.log(`Phase 6 Regression: ${phase6Summary.passed}/${phase6Summary.total} Passed`);
  console.log(`Phase 5 Regression: ${phase5Summary.passed}/${phase5Summary.total} Passed`);
  console.log(`Phase 4 Regression: ${phase4Summary.passed}/${phase4Summary.total} Passed`);
  console.log(`Phase 3 Regression: ${phase3Summary.passed}/${phase3Summary.total} Passed`);
  const grandTotal =
    phase11Summary.total +
    phase10Summary.total +
    phase9Summary.total +
    phase8Summary.total +
    phase7Summary.total +
    phase6Summary.total +
    phase5Summary.total +
    phase4Summary.total +
    phase3Summary.total;
  const grandPassed =
    phase11Summary.passed +
    phase10Summary.passed +
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
    phase11Summary.failed > 0 ||
    phase10Summary.failed > 0 ||
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
