/**
 * BOIMS Offline Architecture
 * Phase 4 — Offline CRUD & Mutation Queue Test Suite
 *
 * 22 Comprehensive Test Cases validating:
 * - OfflineMutation contract & validation rules
 * - IndexedDB offlineQueue persistence
 * - Strict FIFO queue ordering
 * - Local optimistic state application in offlineEntities cache (create, update, delete)
 * - Role-Based Authorization enforcement across BOIMS entities (Reports, Announcements, Certificates, Blotters)
 * - Multi-entity queue isolation and collection filtering
 * - Queue deletion, clearing, and reactive subscription listeners
 * - Non-regression of Phase 1 (Recovery & Bootstrap), Phase 2 (Entity Cache), and Phase 3 (Session Persistence)
 * - Strict boundary enforcement (Zero unsolicited network replay or sync)
 */

import { offlineStorage } from './storage';
import { offlineRecovery } from './recovery';
import { offlineBootstrap } from './bootstrap';
import { offlineMutationQueue } from './mutationQueue';
import {
  OfflineMutation,
  validateOfflineMutation,
  isMutationAuthorized,
  sanitizeUserForOfflineSession,
  isOfflineSessionValid,
} from './types';
import { User, Report, Announcement, CertificateRequest, BlotterCase } from '../types';

export interface Phase4TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface Phase4TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: Phase4TestResult[];
  executedAt: string;
}

/**
 * Creates a mock User object for testing
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-user-uid-p4',
    email: 'user@boims.gov.ph',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    fullName: 'Juan Dela Cruz',
    phoneNumber: '09171234567',
    address: '123 Barangay St.',
    purok: 'Purok 1',
    jurisdiction: 'Purok 1',
    barangay: 'Barangay Central',
    municipality: 'Baras',
    province: 'Rizal',
    role: 'resident',
    dutyStatus: 'onDuty',
    dutyMode: 'responder',
    status: 'active',
    emailVerified: true,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    isDeleted: false,
    ...overrides,
  };
}

/**
 * Executes all 22 Phase 4 Test Cases
 */
export async function runPhase4TestSuite(): Promise<Phase4TestSuiteSummary> {
  const results: Phase4TestResult[] = [];

  const runTest = async (
    id: string,
    name: string,
    description: string,
    fn: () => Promise<void>
  ) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        id,
        name,
        description,
        passed: true,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        description,
        passed: false,
        error: err?.message || String(err),
        durationMs: Math.round(performance.now() - start),
      });
    }
  };

  // Helper assertion
  const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
  };

  // Setup / reset before test execution
  await offlineStorage.clearQueue();
  await offlineStorage.clearAllCachedEntities();
  await offlineStorage.clearSession();

  // Test 1: Mutation contract validation - validates well-formed creation mutation
  await runTest(
    'T1',
    'Mutation Contract Validation (Valid)',
    'Validates that a complete and correctly formatted mutation passes validation',
    async () => {
      const mutation: OfflineMutation = {
        queueId: 'MUT-001',
        operation: 'create',
        collectionName: 'reports',
        recordId: 'rpt-101',
        payload: { title: 'Broken Streetlight', category: 'infrastructure' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
      };
      const val = validateOfflineMutation(mutation);
      assert(val.valid === true, `Validation should pass but got: ${val.error}`);
    }
  );

  // Test 2: Mutation contract validation - rejects mutation with invalid operation
  await runTest(
    'T2',
    'Mutation Contract Validation (Invalid Operation)',
    'Validates that an invalid operation type is rejected by validator',
    async () => {
      const invalidMutation = {
        queueId: 'MUT-002',
        operation: 'unsupported_op' as any,
        collectionName: 'reports',
        recordId: 'rpt-102',
        payload: {},
        createdAt: new Date().toISOString(),
      };
      const val = validateOfflineMutation(invalidMutation);
      assert(val.valid === false, 'Invalid operation should fail validation');
      assert(val.error?.includes('Invalid mutation operation') === true, 'Error should describe invalid operation');
    }
  );

  // Test 3: Mutation contract validation - rejects mutation with missing recordId
  await runTest(
    'T3',
    'Mutation Contract Validation (Missing recordId)',
    'Validates that mutations without valid recordId are rejected',
    async () => {
      const invalidMutation = {
        queueId: 'MUT-003',
        operation: 'create' as const,
        collectionName: 'reports',
        recordId: '',
        payload: { title: 'Test' },
        createdAt: new Date().toISOString(),
      };
      const val = validateOfflineMutation(invalidMutation);
      assert(val.valid === false, 'Empty recordId should fail validation');
    }
  );

  // Test 4: Mutation contract validation - rejects create/update with missing payload
  await runTest(
    'T4',
    'Mutation Contract Validation (Missing Payload)',
    'Validates that create and update operations require non-null payload',
    async () => {
      const invalidMutation = {
        queueId: 'MUT-004',
        operation: 'create' as const,
        collectionName: 'reports',
        recordId: 'rpt-104',
        payload: null,
        createdAt: new Date().toISOString(),
      };
      const val = validateOfflineMutation(invalidMutation);
      assert(val.valid === false, 'Null payload should fail validation for create');
    }
  );

  // Test 5: Persistence - Enqueued mutation persists directly to IndexedDB offlineQueue store
  await runTest(
    'T5',
    'Mutation Persistence to offlineQueue',
    'Enqueuing an offline mutation writes it to IndexedDB offlineQueue store',
    async () => {
      await offlineStorage.clearQueue();
      const resident = createMockUser({ role: 'resident' });
      const reportPayload = {
        title: 'Flooding on 5th Ave',
        category: 'calamity',
        status: 'pending',
      };

      const mutation = await offlineMutationQueue.enqueue(
        {
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rpt-flood-01',
          payload: reportPayload,
          applyOptimistic: false, // test persistence independently first
        },
        resident
      );

      assert(mutation.queueId.startsWith('MUT-'), 'Queue ID must have MUT prefix');
      assert(mutation.status === 'pending', 'Initial status must be pending');

      const persistedItem = await offlineStorage.getQueueItem(mutation.queueId);
      assert(persistedItem !== null, 'Item must exist in IndexedDB offlineQueue');
      assert(persistedItem?.recordId === 'rpt-flood-01', 'Stored recordId must match');
      assert((persistedItem?.payload as any)?.title === 'Flooding on 5th Ave', 'Payload must match');
    }
  );

  // Test 6: Persistence - Multiple mutations persist and maintain strict FIFO ordering
  await runTest(
    'T6',
    'FIFO Ordering of Mutations',
    'Mutations enqueued in chronological sequence maintain FIFO retrieval order',
    async () => {
      await offlineStorage.clearQueue();
      const resident = createMockUser();

      await offlineMutationQueue.enqueue(
        {
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rpt-seq-1',
          payload: { title: 'First Issue' },
        },
        resident
      );

      await offlineMutationQueue.enqueue(
        {
          operation: 'update',
          collectionName: 'reports',
          recordId: 'rpt-seq-1',
          payload: { status: 'inProgress' },
        },
        resident
      );

      await offlineMutationQueue.enqueue(
        {
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rpt-seq-2',
          payload: { title: 'Second Issue' },
        },
        resident
      );

      const pending = await offlineMutationQueue.getPendingMutations();
      assert(pending.length === 3, 'Must return all 3 pending mutations');
      assert(pending[0].recordId === 'rpt-seq-1' && pending[0].operation === 'create', 'First item must be create seq-1');
      assert(pending[1].recordId === 'rpt-seq-1' && pending[1].operation === 'update', 'Second item must be update seq-1');
      assert(pending[2].recordId === 'rpt-seq-2' && pending[2].operation === 'create', 'Third item must be create seq-2');
    }
  );

  // Test 7: Local Optimistic State - Create operation writes immediately to offlineEntities cache
  await runTest(
    'T7',
    'Optimistic State (Create)',
    'Enqueuing create mutation immediately writes data to local entity cache',
    async () => {
      await offlineStorage.clearCachedCollection('reports');
      const resident = createMockUser();
      const reportData: Partial<Report> = {
        reportId: 'rpt-opt-create-1',
        title: 'Downed Electric Pole',
        category: 'flood',
        status: 'pending',
        purok: 'Purok 1',
      };

      await offlineMutationQueue.enqueue(
        {
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rpt-opt-create-1',
          payload: reportData,
          applyOptimistic: true,
        },
        resident
      );

      const cached = await offlineStorage.getCachedEntity<Report>('reports', 'rpt-opt-create-1');
      assert(cached !== null, 'Entity must be optimistically stored in cache');
      assert(cached?.data.title === 'Downed Electric Pole', 'Cached data title must match');
      assert(cached?.data.category === 'flood', 'Cached data category must match');
    }
  );

  // Test 8: Local Optimistic State - Update operation merges partial payload in offlineEntities cache
  await runTest(
    'T8',
    'Optimistic State (Update with Merge)',
    'Enqueuing update mutation merges new fields into existing cached entity',
    async () => {
      // Seed existing entity
      await offlineStorage.putCachedEntity<Partial<Report>>('reports', 'rpt-opt-update-1', {
        reportId: 'rpt-opt-update-1',
        title: 'Original Title',
        category: 'noise',
        status: 'pending',
        purok: 'Purok 2',
      });

      const resident = createMockUser();
      await offlineMutationQueue.enqueue(
        {
          operation: 'update',
          collectionName: 'reports',
          recordId: 'rpt-opt-update-1',
          payload: {
            status: 'investigating',
            remarks: 'Official dispatched',
          },
          applyOptimistic: true,
        },
        resident
      );

      const cached = await offlineStorage.getCachedEntity<any>('reports', 'rpt-opt-update-1');
      assert(cached !== null, 'Updated entity must remain in cache');
      assert(cached?.data.title === 'Original Title', 'Original unmodified title must be preserved');
      assert(cached?.data.status === 'investigating', 'Updated status must be applied');
      assert(cached?.data.remarks === 'Official dispatched', 'New remarks field must be added');
    }
  );

  // Test 9: Local Optimistic State - Delete operation marks soft delete in offlineEntities cache
  await runTest(
    'T9',
    'Optimistic State (Delete)',
    'Enqueuing delete mutation flags cached record as isDeleted',
    async () => {
      // Seed existing announcement
      await offlineStorage.putCachedEntity<Announcement>('announcements', 'ann-opt-del-1', {
        announcementId: 'ann-opt-del-1',
        title: 'Community Assembly Notice',
        content: 'Meeting on Sunday',
        isDeleted: false,
      } as Announcement);

      const secretary = createMockUser({ role: 'secretary' });
      await offlineMutationQueue.enqueue(
        {
          operation: 'delete',
          collectionName: 'announcements',
          recordId: 'ann-opt-del-1',
          payload: { isDeleted: true },
          applyOptimistic: true,
        },
        secretary
      );

      const cached = await offlineStorage.getCachedEntity<Announcement>('announcements', 'ann-opt-del-1');
      assert(cached !== null, 'Cached record should exist with deleted flag');
      assert(cached?.data.isDeleted === true, 'Cached record must have isDeleted = true');
    }
  );

  // Test 10: Authorization - Resident permitted to enqueue incident report creation
  await runTest(
    'T10',
    'Authorization (Resident -> Report Create)',
    'Enforces that authenticated resident role is authorized to create reports offline',
    async () => {
      const resident = createMockUser({ role: 'resident' });
      const mutationParams = {
        operation: 'create' as const,
        collectionName: 'reports' as const,
        recordId: 'rpt-auth-01',
        payload: { title: 'Resident Incident' },
      };

      const isAuth = isMutationAuthorized(mutationParams, resident);
      assert(isAuth === true, 'Resident must be authorized to create reports');

      const item = await offlineMutationQueue.enqueue(mutationParams, resident);
      assert(item !== null && item.queueId !== undefined, 'Enqueue must succeed');
    }
  );

  // Test 11: Authorization - Resident rejected when attempting to enqueue announcement creation
  await runTest(
    'T11',
    'Authorization (Resident -> Announcement Create Rejection)',
    'Enforces that standard resident role is rejected when attempting announcement creation',
    async () => {
      const resident = createMockUser({ role: 'resident' });
      const mutationParams = {
        operation: 'create' as const,
        collectionName: 'announcements' as const,
        recordId: 'ann-unauth-01',
        payload: { title: 'Unauthorized Broadcast' },
      };

      const isAuth = isMutationAuthorized(mutationParams, resident);
      assert(isAuth === false, 'Resident must NOT be authorized to create announcements');

      let rejected = false;
      try {
        await offlineMutationQueue.enqueue(mutationParams, resident);
      } catch (err: any) {
        rejected = true;
        assert(err.message.includes('Unauthorized offline mutation'), 'Must throw authorization error');
      }
      assert(rejected === true, 'Enqueue must throw for unauthorized role');
    }
  );

  // Test 12: Authorization - Secretary permitted to enqueue announcement creation
  await runTest(
    'T12',
    'Authorization (Secretary -> Announcement Create)',
    'Enforces that barangay secretary is authorized to create announcements offline',
    async () => {
      const secretary = createMockUser({ role: 'secretary' });
      const mutationParams = {
        operation: 'create' as const,
        collectionName: 'announcements' as const,
        recordId: 'ann-sec-01',
        payload: { title: 'Clean Up Drive Advisory', category: 'community' },
      };

      const isAuth = isMutationAuthorized(mutationParams, secretary);
      assert(isAuth === true, 'Secretary must be authorized to create announcements');

      const item = await offlineMutationQueue.enqueue(mutationParams, secretary);
      assert(item.queueId !== undefined, 'Enqueue must succeed for secretary');
    }
  );

  // Test 13: Authorization - Resident permitted to enqueue certificate request creation
  await runTest(
    'T13',
    'Authorization (Resident -> Certificate Request)',
    'Enforces that resident can create certificate requests offline',
    async () => {
      const resident = createMockUser({ role: 'resident' });
      const certParams = {
        operation: 'create' as const,
        collectionName: 'certificates' as const,
        recordId: 'cert-req-001',
        payload: { certificateType: 'barangay_clearance', purpose: 'Employment' },
      };

      const isAuth = isMutationAuthorized(certParams, resident);
      assert(isAuth === true, 'Resident must be authorized to request certificates');

      const item = await offlineMutationQueue.enqueue(certParams, resident);
      assert(item.queueId !== undefined, 'Enqueue must succeed for certificate request');
    }
  );

  // Test 14: Authorization - Purok official permitted to enqueue blotter case creation
  await runTest(
    'T14',
    'Authorization (Purok Official -> Blotter Case)',
    'Enforces that purok official is authorized to log blotter case offline',
    async () => {
      const official = createMockUser({ role: 'purokOfficial' });
      const blotterParams = {
        operation: 'create' as const,
        collectionName: 'blotterCases' as const,
        recordId: 'blotter-001',
        payload: { incidentType: 'boundary_dispute', narrative: 'Mediation requested' },
      };

      const isAuth = isMutationAuthorized(blotterParams, official);
      assert(isAuth === true, 'Purok official must be authorized for blotter cases');

      const item = await offlineMutationQueue.enqueue(blotterParams, official);
      assert(item.queueId !== undefined, 'Enqueue must succeed for blotter');
    }
  );

  // Test 15: Authorization - Regular resident rejected when attempting blotter case creation
  await runTest(
    'T15',
    'Authorization (Resident -> Blotter Case Rejection)',
    'Enforces that unprivileged resident cannot directly create blotter records',
    async () => {
      const resident = createMockUser({ role: 'resident' });
      const blotterParams = {
        operation: 'create' as const,
        collectionName: 'blotterCases' as const,
        recordId: 'blotter-unauth-002',
        payload: { incidentType: 'dispute' },
      };

      const isAuth = isMutationAuthorized(blotterParams, resident);
      assert(isAuth === false, 'Resident must not be authorized to create blotter cases');

      let rejected = false;
      try {
        await offlineMutationQueue.enqueue(blotterParams, resident);
      } catch {
        rejected = true;
      }
      assert(rejected === true, 'Blotter creation by resident must be rejected');
    }
  );

  // Test 16: Multi-Entity Queue Isolation - Filters pending mutations by collection name correctly
  await runTest(
    'T16',
    'Multi-Entity Queue Filtering',
    'Filters pending mutations accurately by collectionName',
    async () => {
      await offlineStorage.clearQueue();
      const admin = createMockUser({ role: 'admin' });

      await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-filter-1', payload: {} },
        admin
      );
      await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'announcements', recordId: 'ann-filter-1', payload: {} },
        admin
      );
      await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-filter-2', payload: {} },
        admin
      );

      const reportMutations = await offlineMutationQueue.getPendingMutations('reports');
      const announcementMutations = await offlineMutationQueue.getPendingMutations('announcements');

      assert(reportMutations.length === 2, 'Must return exactly 2 report mutations');
      assert(announcementMutations.length === 1, 'Must return exactly 1 announcement mutation');
    }
  );

  // Test 17: Mutation Removal - Deletes single mutation item without corrupting remaining queue
  await runTest(
    'T17',
    'Mutation Item Removal',
    'Removes a specific mutation item from queue cleanly without side effects',
    async () => {
      await offlineStorage.clearQueue();
      const resident = createMockUser();

      const m1 = await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-del-1', payload: {} },
        resident
      );
      const m2 = await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-del-2', payload: {} },
        resident
      );

      await offlineMutationQueue.removeMutation(m1.queueId);

      const remaining = await offlineMutationQueue.getPendingMutations();
      assert(remaining.length === 1, 'Queue must have exactly 1 item remaining');
      assert(remaining[0].queueId === m2.queueId, 'Remaining item must be m2');
    }
  );

  // Test 18: Queue Clearing - Clears all queue items completely
  await runTest(
    'T18',
    'Mutation Queue Clear',
    'Clears the entire mutation queue',
    async () => {
      const resident = createMockUser();
      await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-clr-1', payload: {} },
        resident
      );

      await offlineMutationQueue.clearQueue();
      const count = await offlineMutationQueue.getPendingCount();
      assert(count === 0, 'Pending count must be 0 after clearQueue');
    }
  );

  // Test 19: Subscription Notification - Reactive listeners receive updated queue on mutation enqueue
  await runTest(
    'T19',
    'Subscription Listener Notification',
    'Registered listeners are notified when mutations are enqueued',
    async () => {
      let notifiedCount = 0;
      let lastReceivedLength = -1;

      const unsub = offlineMutationQueue.subscribe((mutations) => {
        notifiedCount++;
        lastReceivedLength = mutations.length;
      });

      const resident = createMockUser();
      await offlineMutationQueue.enqueue(
        { operation: 'create', collectionName: 'reports', recordId: 'rpt-sub-1', payload: {} },
        resident
      );

      // Allow async notification tick
      await new Promise((r) => setTimeout(r, 50));

      unsub();
      assert(notifiedCount > 0, 'Listener should have received notifications');
      assert(lastReceivedLength > 0, 'Queue length in notification should be > 0');
    }
  );

  // Test 20: Phase 1 & 2 Non-Regression - Offline recovery, bootstrap, and entity cache remain 100% operational
  await runTest(
    'T20',
    'Phase 1 & Phase 2 Non-Regression',
    'Confirms Phase 1 recovery/bootstrap and Phase 2 cache mechanisms continue working alongside Phase 4 mutations',
    async () => {
      // Put a syncing item
      await offlineStorage.putQueueItem({
        queueId: 'q-regression-1',
        operation: 'create',
        collectionName: 'reports',
        recordId: 'rpt-reg-1',
        payload: { title: 'Recovery Check' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        status: 'syncing',
      });

      // Execute Phase 1 recovery
      const recResult = await offlineRecovery.recover();
      assert(recResult.recoveredCount >= 1, 'Phase 1 recovery must succeed');
      const recoveredItem = recResult.recovered.find((r) => r.queueId === 'q-regression-1');
      assert(recoveredItem?.status === 'pending', 'Syncing item must be recovered as pending');

      // Execute Phase 1 bootstrap
      const bootResult = await offlineBootstrap.initialize();
      assert(bootResult.available === true, 'Phase 1 bootstrap must be available');

      // Test Phase 2 cache retrieval
      await offlineStorage.putCachedEntity('reports', 'rpt-reg-1', { title: 'Cached Report' });
      const cached = await offlineStorage.getCachedEntity('reports', 'rpt-reg-1');
      assert(cached !== null && (cached.data as any).title === 'Cached Report', 'Phase 2 cache must remain intact');
    }
  );

  // Test 21: Phase 3 Non-Regression - Offline session persistence and validation remain 100% operational
  await runTest(
    'T21',
    'Phase 3 Non-Regression',
    'Confirms Phase 3 offline session persistence and validation remain unaffected',
    async () => {
      const user = createMockUser({ uid: 'session-reg-user' });
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'offline_available',
        authenticatedAt: now,
        lastActiveAt: now,
        expiresAt,
        schemaVersion: 1,
      });

      const restoredSession = await offlineStorage.getSession();
      assert(restoredSession !== null, 'Phase 3 session must be restored from storage');
      assert(restoredSession?.uid === 'session-reg-user', 'Restored UID must match');
      assert(isOfflineSessionValid(restoredSession), 'Restored session must be valid');

      await offlineStorage.clearSession();
      const clearedSession = await offlineStorage.getSession();
      assert(clearedSession === null, 'Session must be cleared on logout');
    }
  );

  // Test 22: Phase 5 Boundary Enforcement - No network sync/replay is executed during queueing
  await runTest(
    'T22',
    'Phase 5 Boundary Enforcement',
    'Verifies that mutation enqueueing holds pending state and does NOT attempt network sync or replay',
    async () => {
      const resident = createMockUser();
      const mutation = await offlineMutationQueue.enqueue(
        {
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rpt-boundary-check',
          payload: { title: 'No Replay in Phase 4' },
        },
        resident
      );

      // In Phase 4, status must strictly remain 'pending'
      const checkItem = await offlineStorage.getQueueItem(mutation.queueId);
      assert(checkItem?.status === 'pending', 'Mutation status must remain pending in Phase 4');
    }
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
    executedAt: new Date().toISOString(),
  };
}
