/**
 * BOIMS Forensic Test: Inventory Asset Save & True Offline-First Verification
 * Tests Chairman & Secretary asset creation, cold-offline read, and persistence.
 */

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
  indexNames: { contains: (name: string) => boolean };

  constructor(name: string, keyPath: string) {
    this.name = name;
    this.keyPath = keyPath;
    this.indexNames = { contains: (n: string) => this.indexes.has(n) };
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
      const key = value[this.keyPath] || value.id || value.mutationId || value.key;
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
      const reqList = Array.from(this.data.values()).map((v) => JSON.parse(JSON.stringify(v)));
      req.result = reqList;
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
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(storeNames: string | string[], mode: string, db: MockIDBDatabase) {
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
    this.db = db;
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete();
    }, 5);
  }

  objectStore(name: string) {
    let store = this.db.stores.get(name);
    if (!store) {
      store = new MockIDBObjectStore(name, 'id');
      this.db.stores.set(name, store);
    }
    return store;
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, MockIDBObjectStore> = new Map();
  objectStoreNames: { contains: (name: string) => boolean };

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = { contains: (n: string) => this.stores.has(n) };
  }

  createObjectStore(name: string, options?: { keyPath: string }) {
    const store = new MockIDBObjectStore(name, options?.keyPath || 'id');
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string | string[], mode: string) {
    return new MockIDBTransaction(storeNames, mode, this);
  }

  close() {}
}

class MockIDBRequest {
  result: any;
  error: any = null;
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((event: any) => void) | null = null;
}

const mockDatabases: Map<string, MockIDBDatabase> = new Map();

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

const mockLocalStorageStore: Map<string, string> = new Map();
(global as any).localStorage = {
  getItem: (key: string) => mockLocalStorageStore.get(key) ?? null,
  setItem: (key: string, val: string) => mockLocalStorageStore.set(key, String(val)),
  removeItem: (key: string) => mockLocalStorageStore.delete(key),
  clear: () => mockLocalStorageStore.clear(),
};

(global as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: (global as any).localStorage,
  navigator: { onLine: false },
};

async function runForensicTests() {
  // Dynamically import services after setting up global environment
  const { inventoryService } = await import('./src/services/inventoryService');
  const { syncService } = await import('./src/services/SyncService');
  const { offlineStorage } = await import('./src/offline/storage');

  console.log('\n======================================================');
  console.log('BOIMS INVENTORY FORENSIC & OFFLINE VERIFICATION SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const chairmanUser: any = {
    uid: 'chair_001',
    role: 'chairman',
    fullName: 'Hon. Chairman Dela Cruz',
    email: 'chairman@barangay.gov.ph',
    purok: 'Purok 1',
    isApproved: true,
  };

  const secretaryUser: any = {
    uid: 'sec_002',
    role: 'secretary',
    fullName: 'Maria Santos, Barangay Secretary',
    email: 'secretary@barangay.gov.ph',
    purok: 'Purok 2',
    isApproved: true,
  };

  // Test 1: Cold-Offline Initial Read (Cache Empty, Network Offline)
  console.log('--- TEST 1: Cold-Offline Read (No Firestore, Local Cache Empty) ---');
  const initialItems = await inventoryService.getInventoryItems();
  assert(
    Array.isArray(initialItems),
    'T01: Cold-offline getInventoryItems returns array immediately without error'
  );

  // Test 2: Chairman creates Asset Item while OFFLINE
  console.log('\n--- TEST 2: Chairman Creates Asset (Offline) ---');
  const chairStartTime = Date.now();
  const createdByChairman = await inventoryService.createInventoryItem(
    {
      assetName: 'Emergency Generator 5kVA',
      category: 'emergencyEquipment',
      quantity: 2,
      unit: 'units',
      location: 'Evacuation Center Generator Bay',
      brand: 'Honda',
      model: 'EU5000is',
      serialNumber: 'HG-5000-9921',
      acquisitionDate: '2026-01-15',
      acquisitionCost: 85000,
      condition: 'good',
      status: 'available',
      remarks: 'Standard barangay emergency reserve',
      supplier: 'PowerEquip Philippines',
      fundingSource: 'Barangay Calamity Fund',
    },
    chairmanUser.uid,
    chairmanUser
  );
  const chairDuration = Date.now() - chairStartTime;

  assert(
    chairDuration < 500,
    'T02-A: Chairman asset creation completes immediately without network delay',
    `Duration: ${chairDuration}ms`
  );
  assert(
    createdByChairman.assetId.startsWith('AST-') && createdByChairman.assetCode.startsWith('AST-'),
    'T02-B: Chairman asset assigned valid collision-safe ID and code',
    `Asset ID: ${createdByChairman.assetId}`
  );
  assert(
    createdByChairman.assetName === 'Emergency Generator 5kVA' && createdByChairman.quantity === 2,
    'T02-C: Chairman asset payload matches form values',
    `Name: ${createdByChairman.assetName}, Quantity: ${createdByChairman.quantity}`
  );

  // Verify memory & localStorage persistence
  const cachedAfterChair = (inventoryService as any).getLocalCache();
  assert(
    cachedAfterChair.some((i: any) => i.assetId === createdByChairman.assetId),
    'T02-D: Chairman asset persisted immediately in memory cache'
  );

  const storedInLocalStorage = localStorage.getItem('boims_offline_inventory_v1');
  assert(
    storedInLocalStorage !== null && storedInLocalStorage.includes(createdByChairman.assetId),
    'T02-E: Chairman asset persisted immediately in localStorage'
  );

  // Wait for queue persistence microtask
  await new Promise((r) => setTimeout(r, 60));

  // Verify SyncService / offlineStorage Queueing
  const queuedMutations = await offlineStorage.getQueue();
  const chairQueueEntry = queuedMutations.find((m: any) => m.recordId === createdByChairman.assetId);
  assert(
    chairQueueEntry !== undefined && chairQueueEntry.operation === 'create',
    'T02-F: Chairman asset enqueued into SyncService for offline replay',
    `Found queue item: ${chairQueueEntry?.id || chairQueueEntry?.recordId}`
  );
  assert(
    chairQueueEntry?.userRole === 'chairman' && chairQueueEntry?.userId === chairmanUser.uid,
    'T02-G: Chairman queue entry userRole and userId accurately recorded',
    `Role: ${chairQueueEntry?.userRole}, UID: ${chairQueueEntry?.userId}`
  );

  // Test 3: Secretary creates Asset Item while OFFLINE
  console.log('\n--- TEST 3: Secretary Creates Asset (Offline) ---');
  const secStartTime = Date.now();
  const createdBySecretary = await inventoryService.createInventoryItem(
    {
      assetName: 'Foldable Training Tables (White)',
      category: 'furniture',
      quantity: 10,
      unit: 'pcs',
      location: 'Session Hall Storage',
      brand: 'Lifetime',
      model: 'FT-600',
      acquisitionDate: '2026-02-10',
      acquisitionCost: 3500,
      condition: 'good',
      status: 'available',
      remarks: 'Donated by Provincial Council',
      supplier: 'Metro Furnishings',
      fundingSource: 'Donation',
    },
    secretaryUser.uid,
    secretaryUser
  );
  const secDuration = Date.now() - secStartTime;

  assert(
    secDuration < 500,
    'T03-A: Secretary asset creation completes immediately without network delay',
    `Duration: ${secDuration}ms`
  );
  assert(
    createdBySecretary.assetId.startsWith('AST-') &&
      createdBySecretary.assetId !== createdByChairman.assetId,
    'T03-B: Secretary asset assigned sequential unique ID distinct from Chairman',
    `Secretary Asset ID: ${createdBySecretary.assetId}`
  );

  // Wait for queue persistence microtask
  await new Promise((r) => setTimeout(r, 60));

  const queuedMutationsAfterSec = await offlineStorage.getQueue();
  const secQueueEntry = queuedMutationsAfterSec.find((m: any) => m.recordId === createdBySecretary.assetId);
  assert(
    secQueueEntry !== undefined && secQueueEntry.userRole === 'secretary',
    'T03-C: Secretary asset mutation enqueued with role secretary',
    `Queue entry: ${secQueueEntry?.id || secQueueEntry?.recordId}`
  );

  // Test 4: Cold-Offline Hydration (Simulate Refresh / Restart)
  console.log('\n--- TEST 4: Cold-Offline Hydration & Read (Process Restart Simulation) ---');
  // Clear memory cache to simulate page refresh / restart
  (inventoryService as any).memoryCache = [];
  const reloadedItems = await inventoryService.getInventoryItems();

  assert(
    reloadedItems.length >= 2,
    'T04-A: Cold reload retrieves persisted items from local cache',
    `Retrieved count: ${reloadedItems.length}`
  );
  assert(
    reloadedItems.some((i) => i.assetId === createdByChairman.assetId),
    'T04-B: Chairman created asset retrieved after restart'
  );
  assert(
    reloadedItems.some((i) => i.assetId === createdBySecretary.assetId),
    'T04-C: Secretary created asset retrieved after restart'
  );

  // Test 5: Secretary Updates Asset Condition Offline
  console.log('\n--- TEST 5: Secretary Updates Asset Maintenance & Condition Offline ---');
  const updatedItem = await inventoryService.updateInventoryItem(
    createdBySecretary.assetId,
    { condition: 'fair', remarks: 'One foot screw slightly loose, scheduled for repair' },
    secretaryUser.uid,
    secretaryUser
  );
  assert(
    updatedItem.condition === 'fair',
    'T05-A: Asset update reflects immediately in returned item'
  );
  const reloadedUpdated = await inventoryService.getInventoryItems();
  const foundUpdated = reloadedUpdated.find((i) => i.assetId === createdBySecretary.assetId);
  assert(
    foundUpdated?.condition === 'fair',
    'T05-B: Updated condition persisted in local cache'
  );

  // Test 6: Form Validation & Guard Tests
  console.log('\n--- TEST 6: Validation Error Handling ---');
  let thrownError = false;
  try {
    await inventoryService.createInventoryItem(
      {
        assetName: '', // empty name
        category: 'furniture',
        quantity: 0,
        unit: '',
        location: '',
        condition: 'good',
        status: 'available',
      } as any,
      secretaryUser.uid,
      secretaryUser
    );
  } catch (err: any) {
    thrownError = true;
    assert(
      err.message.includes('Asset Name is required'),
      'T06-A: Rejects asset with empty name',
      err.message
    );
  }
  assert(thrownError, 'T06-B: Validation halts execution cleanly on invalid inputs');

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runForensicTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
