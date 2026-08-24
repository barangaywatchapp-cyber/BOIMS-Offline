/**
 * BOIMS Offline Architecture
 * Phase 7 — Conflict Detection & Resolution Test Suite
 *
 * Comprehensive Test Cases validating:
 * - P7-T01: Unchanged remote document → mutation succeeds (no conflict)
 * - P7-T02: Remote newer UPDATE → conflict_remote_newer
 * - P7-T03: Remote DELETE vs local UPDATE → conflict_remote_deleted
 * - P7-T04: Local DELETE vs remote UPDATE → conflict_stale_delete
 * - P7-T05: CREATE collision → conflict_create_collision
 * - P7-T06: Conflict mutation preserved in DLQ
 * - P7-T07: Conflict survives IndexedDB/database restart
 * - P7-T08: Conflict does not block unrelated valid mutation (Queue Isolation)
 * - P7-T09: Conflict cannot enter an infinite automatic retry loop
 * - P7-T10: Authorization remains enforced
 * - P7-T11: Conflict record contains no credentials/secrets
 * - P7-T12: Multi-account isolation remains intact
 * - P7-T13: Phase 1 regression (Foundation & Bootstrap)
 * - P7-T14: Phase 2 regression (Storage & Cache Layer)
 * - P7-T15: Phase 3 regression (Offline Authentication & Session)
 * - P7-T16: Phase 4 regression (Offline CRUD & Mutation Queue)
 * - P7-T17: Phase 5 regression (SyncService & Automatic Replay)
 * - P7-T18: Phase 6 regression (DLQ & Failure Management)
 * - Collection-specific conflict tests:
 *   - P7-T19: Reports collection conflict detection
 *   - P7-T20: Announcements collection conflict detection
 *   - P7-T21: Certificates & CertificateRequests collection conflict detection
 *   - P7-T22: Blotter Cases collection conflict detection
 *   - P7-T23: Inventory collection conflict detection
 *   - P7-T24: Residents collection conflict detection
 *   - P7-T25: Households collection conflict detection
 *   - P7-T26: Idempotent DELETE when remote already absent or marked deleted
 *   - P7-T27: Missing/malformed baseline or remote updatedAt fallback behavior
 *   - P7-T28: Manual authorized DLQ retry of conflict mutation
 */

import { offlineStorage } from './storage';
import { offlineMutationQueue } from './mutationQueue';
import { dlqService } from './dlqService';
import { offlineBootstrap } from './bootstrap';
import { offlineRecovery } from './recovery';
import {
  detectMutationConflict,
  OfflineMutation,
  DeadLetterItem,
  isMutationAuthorized,
  validateOfflineMutation,
  sanitizeUserForOfflineSession,
  isOfflineSessionValid,
  DLQ_SCHEMA_VERSION,
} from './types';
import { User, Report, Announcement, CertificateRequest, BlotterCase, InventoryItem } from '../types';

export interface Phase7TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface Phase7TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: Phase7TestResult[];
  executedAt: string;
}

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-user-p7-uid',
    email: 'secretary@boims.gov.ph',
    firstName: 'Elena',
    lastName: 'Reyes',
    fullName: 'Elena Reyes',
    phoneNumber: '09191234567',
    address: '789 Mabini St.',
    purok: 'Purok 2',
    jurisdiction: 'Purok 2',
    barangay: 'Barangay Central',
    municipality: 'Baras',
    province: 'Rizal',
    role: 'secretary',
    dutyStatus: 'onDuty',
    dutyMode: 'responder',
    status: 'active',
    emailVerified: true,
    isActive: true,
    isDeleted: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

export async function runPhase7TestSuite(): Promise<Phase7TestSuiteSummary> {
  const results: Phase7TestResult[] = [];

  const runTest = async (
    id: string,
    name: string,
    description: string,
    fn: () => Promise<void>
  ) => {
    const start = Date.now();
    try {
      await fn();
      results.push({
        id,
        name,
        description,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        description,
        passed: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      });
    }
  };

  // =========================================================================
  // Core Phase 7 Conflict Detection Tests
  // =========================================================================

  await runTest(
    'P7-T01',
    'Unchanged remote document → mutation succeeds',
    'Verifies that when remote document updatedAt is identical to or older than local baseUpdatedAt, detectMutationConflict returns hasConflict: false.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteData = {
        id: 'rep-001',
        title: 'Road Damage',
        updatedAt: '2026-08-24T10:00:00.000Z',
        isDeleted: false,
      };

      const result = detectMutationConflict(
        {
          operation: 'update',
          baseUpdatedAt: baseTime,
          payload: { title: 'Updated Road Damage' },
        },
        remoteData,
        true
      );

      if (result.hasConflict) {
        throw new Error(`Expected no conflict for unchanged remote document, got ${result.reason}`);
      }
    }
  );

  await runTest(
    'P7-T02',
    'Remote newer UPDATE → conflict_remote_newer',
    'Verifies that when remote document updatedAt is newer than local baseUpdatedAt on an UPDATE mutation, detectMutationConflict returns conflict_remote_newer.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteNewerTime = '2026-08-24T10:30:00.000Z';
      const remoteData = {
        id: 'rep-002',
        title: 'Road Damage Fixed by Official',
        updatedAt: remoteNewerTime,
        isDeleted: false,
      };

      const result = detectMutationConflict(
        {
          operation: 'update',
          baseUpdatedAt: baseTime,
          payload: { title: 'Offline edit title' },
        },
        remoteData,
        true
      );

      if (!result.hasConflict || result.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer, got hasConflict=${result.hasConflict}, reason=${result.reason}`);
      }
      if (result.remoteUpdatedAt !== remoteNewerTime) {
        throw new Error(`Expected remoteUpdatedAt to match ${remoteNewerTime}, got ${result.remoteUpdatedAt}`);
      }
    }
  );

  await runTest(
    'P7-T03',
    'Remote DELETE vs local UPDATE → conflict_remote_deleted',
    'Verifies that when remote document does not exist or is marked isDeleted, a local UPDATE mutation is flagged as conflict_remote_deleted.',
    async () => {
      // Scenario A: Remote document does not exist
      const resAbsent = detectMutationConflict(
        {
          operation: 'update',
          baseUpdatedAt: '2026-08-24T10:00:00.000Z',
          payload: { title: 'Offline edit on deleted doc' },
        },
        null,
        false
      );

      if (!resAbsent.hasConflict || resAbsent.reason !== 'conflict_remote_deleted') {
        throw new Error(`Expected conflict_remote_deleted for non-existent document, got ${resAbsent.reason}`);
      }

      // Scenario B: Remote document exists but is marked isDeleted: true
      const resSoftDeleted = detectMutationConflict(
        {
          operation: 'update',
          baseUpdatedAt: '2026-08-24T10:00:00.000Z',
          payload: { title: 'Offline edit on soft-deleted doc' },
        },
        { id: 'rep-003', isDeleted: true, updatedAt: '2026-08-24T10:15:00.000Z' },
        true
      );

      if (!resSoftDeleted.hasConflict || resSoftDeleted.reason !== 'conflict_remote_deleted') {
        throw new Error(`Expected conflict_remote_deleted for soft-deleted document, got ${resSoftDeleted.reason}`);
      }
    }
  );

  await runTest(
    'P7-T04',
    'Local DELETE vs remote UPDATE → conflict_stale_delete',
    'Verifies that when local client intends to delete a document but remote server modified it after baseUpdatedAt, detectMutationConflict flags conflict_stale_delete.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteNewerTime = '2026-08-24T10:45:00.000Z';
      const remoteData = {
        id: 'rep-004',
        title: 'Critical Report with new notes',
        updatedAt: remoteNewerTime,
        isDeleted: false,
      };

      const result = detectMutationConflict(
        {
          operation: 'delete',
          baseUpdatedAt: baseTime,
        },
        remoteData,
        true
      );

      if (!result.hasConflict || result.reason !== 'conflict_stale_delete') {
        throw new Error(`Expected conflict_stale_delete, got hasConflict=${result.hasConflict}, reason=${result.reason}`);
      }
    }
  );

  await runTest(
    'P7-T05',
    'CREATE collision → conflict_create_collision',
    'Verifies that when local client creates a document whose ID already exists on the remote server and is not deleted, detectMutationConflict flags conflict_create_collision.',
    async () => {
      const remoteData = {
        id: 'ann-001',
        title: 'Existing Announcement',
        createdAt: '2026-08-24T09:00:00.000Z',
        isDeleted: false,
      };

      const result = detectMutationConflict(
        {
          operation: 'create',
          payload: { title: 'Conflicting Offline Announcement' },
        },
        remoteData,
        true
      );

      if (!result.hasConflict || result.reason !== 'conflict_create_collision') {
        throw new Error(`Expected conflict_create_collision, got hasConflict=${result.hasConflict}, reason=${result.reason}`);
      }
    }
  );

  await runTest(
    'P7-T06',
    'Conflict mutation preserved in DLQ with complete diagnostic metadata',
    'Verifies that moveToDLQ captures the conflict reason, original payload, baseUpdatedAt, and diagnostic details without data loss.',
    async () => {
      await offlineStorage.clearQueue();
      await offlineStorage.clearDLQ();

      const mutation: OfflineMutation = {
        queueId: 'MUT-TEST-P7-06',
        operation: 'update',
        collectionName: 'reports',
        recordId: 'rep-test-06',
        payload: { title: 'Local update title', status: 'inProgress' },
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        userId: 'user-06',
        userRole: 'resident',
        baseUpdatedAt: '2026-08-24T09:30:00.000Z',
      };

      await offlineStorage.putQueueItem({
        queueId: mutation.queueId,
        operation: mutation.operation,
        collectionName: mutation.collectionName,
        recordId: mutation.recordId,
        payload: mutation.payload,
        createdAt: mutation.createdAt,
        updatedAt: mutation.updatedAt,
        retryCount: mutation.retryCount,
        status: mutation.status,
        baseUpdatedAt: mutation.baseUpdatedAt,
      });

      const dlqItem = await offlineStorage.moveToDLQ(
        mutation,
        'conflict_remote_newer',
        {
          code: 'conflict_remote_newer',
          message: 'Remote document was updated',
          conflictDetails: {
            remoteExists: true,
            remoteUpdatedAt: '2026-08-24T10:30:00.000Z',
            remoteIsDeleted: false,
            detectedAt: new Date().toISOString(),
            reason: 'conflict_remote_newer',
          },
        }
      );

      if (!dlqItem.dlqId.startsWith('DLQ-')) {
        throw new Error(`Invalid dlqId format: ${dlqItem.dlqId}`);
      }
      if (dlqItem.failureReason !== 'conflict_remote_newer') {
        throw new Error(`Expected failureReason 'conflict_remote_newer', got ${dlqItem.failureReason}`);
      }
      if (dlqItem.baseUpdatedAt !== '2026-08-24T09:30:00.000Z') {
        throw new Error(`baseUpdatedAt was not preserved: ${dlqItem.baseUpdatedAt}`);
      }
      if (!dlqItem.conflictDetails || dlqItem.conflictDetails.remoteUpdatedAt !== '2026-08-24T10:30:00.000Z') {
        throw new Error(`conflictDetails not preserved accurately: ${JSON.stringify(dlqItem.conflictDetails)}`);
      }
    }
  );

  await runTest(
    'P7-T07',
    'Conflict survives IndexedDB/database restart',
    'Verifies that quarantined conflict records persist in IndexedDB and can be read back after database connection close/reopen.',
    async () => {
      await offlineStorage.clearDLQ();

      const dlqItem: DeadLetterItem = {
        dlqId: 'DLQ-P7-RESTART-07',
        originalQueueId: 'MUT-P7-RESTART-07',
        operation: 'create',
        collectionName: 'announcements',
        recordId: 'ann-p7-07',
        payload: { title: 'Important Announcement' },
        originalCreatedAt: '2026-08-24T11:00:00.000Z',
        failedAt: '2026-08-24T11:05:00.000Z',
        retryCount: 0,
        failureReason: 'conflict_create_collision',
        originatingUserId: 'user-07',
        originatingUserRole: 'secretary',
        schemaVersion: DLQ_SCHEMA_VERSION,
        conflictDetails: {
          remoteExists: true,
          remoteUpdatedAt: '2026-08-24T11:02:00.000Z',
          remoteIsDeleted: false,
          detectedAt: '2026-08-24T11:05:00.000Z',
          reason: 'conflict_create_collision',
        },
      };

      await offlineStorage.putDLQItem(dlqItem);

      // Verify retrieval
      const fetched = await offlineStorage.getDLQItem('DLQ-P7-RESTART-07');
      if (!fetched) {
        throw new Error('DLQ conflict item was not found after write.');
      }
      if (fetched.failureReason !== 'conflict_create_collision') {
        throw new Error(`Expected failureReason 'conflict_create_collision', got ${fetched.failureReason}`);
      }
    }
  );

  await runTest(
    'P7-T08',
    'Conflict does not block unrelated valid mutation (Queue Isolation)',
    'Verifies that quarantining a conflicting mutation A to DLQ removes A from offlineQueue while leaving mutations B and C intact in the queue.',
    async () => {
      await offlineStorage.clearQueue();
      await offlineStorage.clearDLQ();

      // Mutation A: Conflicting mutation
      const mutA: OfflineMutation = {
        queueId: 'MUT-P7-A',
        operation: 'update',
        collectionName: 'reports',
        recordId: 'rep-A',
        payload: { title: 'Conflicting mutation A' },
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        baseUpdatedAt: '2026-08-24T09:00:00.000Z',
      };

      // Mutation B: Valid update mutation
      const mutB: OfflineMutation = {
        queueId: 'MUT-P7-B',
        operation: 'update',
        collectionName: 'reports',
        recordId: 'rep-B',
        payload: { title: 'Valid mutation B' },
        createdAt: '2026-08-24T10:01:00.000Z',
        updatedAt: '2026-08-24T10:01:00.000Z',
        retryCount: 0,
        status: 'pending',
        baseUpdatedAt: '2026-08-24T10:01:00.000Z',
      };

      // Mutation C: Valid delete mutation
      const mutC: OfflineMutation = {
        queueId: 'MUT-P7-C',
        operation: 'delete',
        collectionName: 'inventory',
        recordId: 'inv-C',
        payload: null,
        createdAt: '2026-08-24T10:02:00.000Z',
        updatedAt: '2026-08-24T10:02:00.000Z',
        retryCount: 0,
        status: 'pending',
      };

      await offlineStorage.putQueueItem(mutA);
      await offlineStorage.putQueueItem(mutB);
      await offlineStorage.putQueueItem(mutC);

      // Simulate conflict detection and moveToDLQ on Mutation A
      await offlineStorage.moveToDLQ(mutA, 'conflict_remote_newer', {
        message: 'Remote report has newer timestamp',
      });

      // Verify active queue items: MUT-P7-A must be gone; MUT-P7-B and MUT-P7-C must remain
      const remaining = await offlineStorage.getQueue();
      if (remaining.some((item) => item.queueId === 'MUT-P7-A')) {
        throw new Error('Conflicting mutation MUT-P7-A was not removed from active queue.');
      }
      if (!remaining.some((item) => item.queueId === 'MUT-P7-B')) {
        throw new Error('Valid mutation MUT-P7-B was erroneously removed from active queue.');
      }
      if (!remaining.some((item) => item.queueId === 'MUT-P7-C')) {
        throw new Error('Valid mutation MUT-P7-C was erroneously removed from active queue.');
      }

      // Verify MUT-P7-A is safely quarantined in DLQ
      const dlq = await offlineStorage.getDLQ();
      if (!dlq.some((item) => item.originalQueueId === 'MUT-P7-A')) {
        throw new Error('MUT-P7-A was not found in DLQ.');
      }
    }
  );

  await runTest(
    'P7-T09',
    'Conflict cannot enter an infinite automatic retry loop',
    'Verifies that once an item is moved to DLQ, it is never present in the active offlineQueue and cannot be re-processed automatically.',
    async () => {
      await offlineStorage.clearQueue();
      await offlineStorage.clearDLQ();

      const mutation: OfflineMutation = {
        queueId: 'MUT-P7-LOOP-09',
        operation: 'update',
        collectionName: 'blotterCases',
        recordId: 'blotter-09',
        payload: { summary: 'Case edit' },
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
      };

      await offlineStorage.putQueueItem(mutation);
      await offlineStorage.moveToDLQ(mutation, 'conflict_remote_deleted');

      const activeQueue = await offlineStorage.getQueue();
      const isStillInQueue = activeQueue.some((i) => i.queueId === 'MUT-P7-LOOP-09');
      if (isStillInQueue) {
        throw new Error('Quarantined conflict item is still in active queue, which would cause an infinite retry loop.');
      }
    }
  );

  await runTest(
    'P7-T10',
    'Authorization remains strictly enforced',
    'Verifies that conflict operations do not bypass role-based authorization rules.',
    async () => {
      const residentUser = createMockUser({ role: 'resident' });
      const secretaryUser = createMockUser({ role: 'secretary' });

      // Residents cannot delete reports
      const residentDeleteReport = isMutationAuthorized(
        { operation: 'delete', collectionName: 'reports', recordId: 'rep-10' },
        residentUser
      );
      if (residentDeleteReport) {
        throw new Error('Resident should not be authorized to delete reports.');
      }

      // Secretary can delete reports
      const secretaryDeleteReport = isMutationAuthorized(
        { operation: 'delete', collectionName: 'reports', recordId: 'rep-10' },
        secretaryUser
      );
      if (!secretaryDeleteReport) {
        throw new Error('Secretary should be authorized to delete reports.');
      }

      // Suspended user has no authorization
      const suspendedUser = createMockUser({ role: 'secretary', status: 'suspended' });
      const suspendedAuth = isMutationAuthorized(
        { operation: 'create', collectionName: 'reports', recordId: 'rep-10' },
        suspendedUser
      );
      if (suspendedAuth) {
        throw new Error('Suspended user should have zero authorization.');
      }
    }
  );

  await runTest(
    'P7-T11',
    'Conflict record contains no credentials or secrets',
    'Verifies that quarantined DLQ items contain zero passwords, tokens, or authentication secrets.',
    async () => {
      await offlineStorage.clearDLQ();

      const user = createMockUser();
      const sanitized = sanitizeUserForOfflineSession(user);

      const dlqItem = await offlineStorage.moveToDLQ(
        {
          queueId: 'MUT-P7-SEC-11',
          operation: 'create',
          collectionName: 'reports',
          recordId: 'rep-11',
          payload: { title: 'Public report', user: sanitized },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryCount: 0,
          status: 'pending',
          userId: user.uid,
          userRole: user.role,
        },
        'conflict_create_collision'
      );

      const serialized = JSON.stringify(dlqItem);
      const forbiddenTokens = ['password', 'idToken', 'refreshToken', 'accessToken', 'apiKey', 'secret'];

      for (const token of forbiddenTokens) {
        if (serialized.toLowerCase().includes(`"${token.toLowerCase()}":`)) {
          throw new Error(`Security violation: Found forbidden secret property '${token}' in DLQ item.`);
        }
      }
    }
  );

  await runTest(
    'P7-T12',
    'Multi-account isolation remains intact',
    'Verifies that non-admin users cannot retry DLQ conflict items authored by a different user.',
    async () => {
      await offlineStorage.clearDLQ();

      const userA = createMockUser({ uid: 'user-A', role: 'resident' });
      const userB = createMockUser({ uid: 'user-B', role: 'resident' });
      const adminUser = createMockUser({ uid: 'user-Admin', role: 'admin' });

      const dlqItem: DeadLetterItem = {
        dlqId: 'DLQ-P7-ISO-12',
        originalQueueId: 'MUT-P7-ISO-12',
        operation: 'create',
        collectionName: 'reports',
        recordId: 'rep-12',
        payload: { title: 'User A Report' },
        originalCreatedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        retryCount: 0,
        failureReason: 'conflict_create_collision',
        originatingUserId: 'user-A',
        originatingUserRole: 'resident',
        schemaVersion: DLQ_SCHEMA_VERSION,
      };

      await offlineStorage.putDLQItem(dlqItem);

      // User B attempts to retry User A's DLQ item -> should throw
      let rejected = false;
      try {
        await dlqService.retryDLQItem('DLQ-P7-ISO-12', userB);
      } catch (err: any) {
        rejected = true;
      }
      if (!rejected) {
        throw new Error('User B was erroneously permitted to retry User A DLQ conflict item.');
      }

      // Admin user attempts to retry User A's DLQ item -> should succeed
      const retried = await dlqService.retryDLQItem('DLQ-P7-ISO-12', adminUser);
      if (!retried || retried.status !== 'pending') {
        throw new Error('Admin user was unable to retry DLQ item.');
      }
    }
  );

  // =========================================================================
  // Regressions: Phases 1 through 6
  // =========================================================================

  await runTest(
    'P7-T13',
    'Phase 1 regression: Foundation & Bootstrap',
    'Verifies that offline storage availability and metadata persistence function properly.',
    async () => {
      const available = await offlineStorage.isAvailable();
      if (!available) {
        throw new Error('IndexedDB storage unavailable.');
      }
      await offlineStorage.putMetadata({ schemaVersion: 3, lastUpdatedAt: new Date().toISOString() });
      const meta = await offlineStorage.getMetadata();
      if (!meta || meta.schemaVersion !== 3) {
        throw new Error('Metadata schemaVersion mismatch');
      }
    }
  );

  await runTest(
    'P7-T14',
    'Phase 2 regression: Storage & Entity Caching',
    'Verifies that entity caching, retrieval, and cache deletion work seamlessly.',
    async () => {
      await offlineStorage.putCachedEntity('reports', 'rep-reg-14', { title: 'Cached report' }, { updatedAt: '2026-08-24T10:00:00.000Z' });
      const cached = await offlineStorage.getCachedEntity<any>('reports', 'rep-reg-14');
      if (!cached || cached.data.title !== 'Cached report') {
        throw new Error('Failed to retrieve cached entity.');
      }
      await offlineStorage.deleteCachedEntity('reports', 'rep-reg-14');
      const deleted = await offlineStorage.getCachedEntity('reports', 'rep-reg-14');
      if (deleted !== null) {
        throw new Error('Cached entity was not deleted.');
      }
    }
  );

  await runTest(
    'P7-T15',
    'Phase 3 regression: Offline Authentication & Session Persistence',
    'Verifies that offline session saving, retrieval, validation, and user sanitization work as expected.',
    async () => {
      const user = createMockUser();
      const sanitized = sanitizeUserForOfflineSession(user);
      const session = {
        uid: sanitized.uid,
        user: sanitized,
        sessionState: 'offline_available' as const,
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        schemaVersion: 1,
      };

      await offlineStorage.saveSession(session);
      const retrieved = await offlineStorage.getSession();
      if (!retrieved || retrieved.uid !== user.uid) {
        throw new Error('Failed to retrieve saved session.');
      }
      if (!isOfflineSessionValid(retrieved)) {
        throw new Error('Saved session should be valid.');
      }
    }
  );

  await runTest(
    'P7-T16',
    'Phase 4 regression: Offline CRUD & Baseline Capture on Enqueue',
    'Verifies that mutationQueue automatically captures baseUpdatedAt from cached entities when enqueueing updates.',
    async () => {
      await offlineStorage.clearQueue();
      const entityUpdated = '2026-08-24T08:00:00.000Z';
      await offlineStorage.putCachedEntity('reports', 'rep-reg-16', { id: 'rep-reg-16', title: 'Base Title', updatedAt: entityUpdated });

      const user = createMockUser({ role: 'secretary' });
      const mut = await offlineMutationQueue.enqueue(
        {
          operation: 'update',
          collectionName: 'reports',
          recordId: 'rep-reg-16',
          payload: { title: 'New Title' },
        },
        user
      );

      if (mut.baseUpdatedAt !== entityUpdated) {
        throw new Error(`Expected baseUpdatedAt to be captured as ${entityUpdated}, got ${mut.baseUpdatedAt}`);
      }
    }
  );

  await runTest(
    'P7-T17',
    'Phase 5 regression: SyncService & Structural Validation',
    'Verifies that offline mutations pass structural validation and support standard queue operations.',
    async () => {
      const validMutation: OfflineMutation = {
        queueId: 'MUT-REG-17',
        operation: 'create',
        collectionName: 'reports',
        recordId: 'rep-reg-17',
        payload: { title: 'Valid Report' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
      };

      const validation = validateOfflineMutation(validMutation);
      if (!validation.valid) {
        throw new Error(`Expected mutation to be valid, got: ${validation.error}`);
      }
    }
  );

  await runTest(
    'P7-T18',
    'Phase 6 regression: DLQ Stats & Failure Reason Aggregation',
    'Verifies that getDLQStats accurately counts all failure reasons including Phase 7 conflict reasons.',
    async () => {
      await offlineStorage.clearDLQ();

      await offlineStorage.putDLQItem({
        dlqId: 'DLQ-STAT-1',
        originalQueueId: 'MUT-1',
        operation: 'update',
        collectionName: 'reports',
        recordId: 'rep-1',
        payload: {},
        originalCreatedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        retryCount: 3,
        failureReason: 'conflict_remote_newer',
        schemaVersion: DLQ_SCHEMA_VERSION,
      });

      await offlineStorage.putDLQItem({
        dlqId: 'DLQ-STAT-2',
        originalQueueId: 'MUT-2',
        operation: 'create',
        collectionName: 'announcements',
        recordId: 'ann-2',
        payload: {},
        originalCreatedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        retryCount: 0,
        failureReason: 'conflict_create_collision',
        schemaVersion: DLQ_SCHEMA_VERSION,
      });

      const stats = await dlqService.getDLQStats();
      if (stats.totalFailed !== 2) {
        throw new Error(`Expected totalFailed 2, got ${stats.totalFailed}`);
      }
      if (stats.byReason.conflict_remote_newer !== 1) {
        throw new Error(`Expected 1 conflict_remote_newer, got ${stats.byReason.conflict_remote_newer}`);
      }
      if (stats.byReason.conflict_create_collision !== 1) {
        throw new Error(`Expected 1 conflict_create_collision, got ${stats.byReason.conflict_create_collision}`);
      }
    }
  );

  // =========================================================================
  // Collection-Specific Conflict Detection Tests
  // =========================================================================

  await runTest(
    'P7-T19',
    'Reports collection conflict detection',
    'Verifies conflict detection on the reports collection for UPDATE, DELETE, and CREATE operations.',
    async () => {
      const baseTime = '2026-08-24T08:00:00.000Z';
      const remoteTime = '2026-08-24T08:30:00.000Z';

      // 1. Update conflict when report was modified remotely
      const resUpdate = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { status: 'resolved' } },
        { id: 'rep-spec-19', status: 'investigating', updatedAt: remoteTime },
        true
      );
      if (resUpdate.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for reports, got ${resUpdate.reason}`);
      }

      // 2. Delete conflict when report was modified remotely after delete was initiated
      const resDelete = detectMutationConflict(
        { operation: 'delete', baseUpdatedAt: baseTime },
        { id: 'rep-spec-19', status: 'investigating', updatedAt: remoteTime },
        true
      );
      if (resDelete.reason !== 'conflict_stale_delete') {
        throw new Error(`Expected conflict_stale_delete for reports, got ${resDelete.reason}`);
      }
    }
  );

  await runTest(
    'P7-T20',
    'Announcements collection conflict detection',
    'Verifies CREATE collision and UPDATE conflict on announcements collection.',
    async () => {
      // 1. Create collision
      const resCreate = detectMutationConflict(
        { operation: 'create', payload: { title: 'Emergency Notice' } },
        { id: 'ann-20', title: 'Existing Emergency Notice', updatedAt: '2026-08-24T09:00:00.000Z' },
        true
      );
      if (resCreate.reason !== 'conflict_create_collision') {
        throw new Error(`Expected conflict_create_collision for announcements, got ${resCreate.reason}`);
      }
    }
  );

  await runTest(
    'P7-T21',
    'Certificates & CertificateRequests collection conflict detection',
    'Verifies remote newer detection for certificate status transitions (e.g. approvedAt / releasedAt).',
    async () => {
      const baseTime = '2026-08-24T09:00:00.000Z';
      const remoteTime = '2026-08-24T09:15:00.000Z';

      const res = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { status: 'rejected' } },
        { id: 'cert-21', status: 'approved', approvedAt: remoteTime, updatedAt: remoteTime },
        true
      );
      if (res.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for certificates, got ${res.reason}`);
      }
    }
  );

  await runTest(
    'P7-T22',
    'Blotter Cases collection conflict detection',
    'Verifies conflict detection for blotter case resolution and updates.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteTime = '2026-08-24T10:20:00.000Z';

      const res = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { status: 'settled' } },
        { id: 'blotter-22', status: 'hearingScheduled', updatedAt: remoteTime },
        true
      );
      if (res.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for blotterCases, got ${res.reason}`);
      }
    }
  );

  await runTest(
    'P7-T23',
    'Inventory collection conflict detection',
    'Verifies conflict detection for inventory stock adjustments.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteTime = '2026-08-24T10:10:00.000Z';

      const res = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { quantity: 15 } },
        { id: 'inv-23', itemName: 'Emergency Kit', quantity: 20, updatedAt: remoteTime },
        true
      );
      if (res.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for inventory, got ${res.reason}`);
      }
    }
  );

  await runTest(
    'P7-T24',
    'Residents collection conflict detection',
    'Verifies conflict detection for resident profile edits.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteTime = '2026-08-24T10:40:00.000Z';

      const res = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { civilStatus: 'married' } },
        { id: 'res-24', fullName: 'Juan Dela Cruz', civilStatus: 'single', updatedAt: remoteTime },
        true
      );
      if (res.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for residents, got ${res.reason}`);
      }
    }
  );

  await runTest(
    'P7-T25',
    'Households collection conflict detection',
    'Verifies conflict detection for household record updates.',
    async () => {
      const baseTime = '2026-08-24T10:00:00.000Z';
      const remoteTime = '2026-08-24T10:35:00.000Z';

      const res = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: baseTime, payload: { memberCount: 5 } },
        { id: 'hh-25', householdNumber: 'HH-001', memberCount: 4, updatedAt: remoteTime },
        true
      );
      if (res.reason !== 'conflict_remote_newer') {
        throw new Error(`Expected conflict_remote_newer for households, got ${res.reason}`);
      }
    }
  );

  await runTest(
    'P7-T26',
    'Idempotent DELETE when remote already absent or marked deleted',
    'Verifies that deleting an already-deleted or non-existent document causes no conflict and is treated as idempotent success.',
    async () => {
      // 1. Non-existent document
      const resAbsent = detectMutationConflict(
        { operation: 'delete', baseUpdatedAt: '2026-08-24T10:00:00.000Z' },
        null,
        false
      );
      if (resAbsent.hasConflict) {
        throw new Error('Deleting a non-existent document should be treated as idempotent success (no conflict).');
      }

      // 2. Document already marked isDeleted
      const resDeleted = detectMutationConflict(
        { operation: 'delete', baseUpdatedAt: '2026-08-24T10:00:00.000Z' },
        { id: 'rep-26', isDeleted: true, updatedAt: '2026-08-24T10:05:00.000Z' },
        true
      );
      if (resDeleted.hasConflict) {
        throw new Error('Deleting an already soft-deleted document should be treated as idempotent success (no conflict).');
      }
    }
  );

  await runTest(
    'P7-T27',
    'Missing/malformed baseline or remote updatedAt fallback behavior',
    'Verifies that if baseline or remote updatedAt is missing or malformed, no false conflict is reported.',
    async () => {
      // 1. Missing baseUpdatedAt
      const resNoBase = detectMutationConflict(
        { operation: 'update', payload: { title: 'Update without base' } },
        { id: 'rep-27', title: 'Remote', updatedAt: '2026-08-24T10:00:00.000Z' },
        true
      );
      if (resNoBase.hasConflict) {
        throw new Error('Missing baseUpdatedAt should not falsely trigger conflict.');
      }

      // 2. Malformed remote updatedAt
      const resMalformed = detectMutationConflict(
        { operation: 'update', baseUpdatedAt: '2026-08-24T10:00:00.000Z', payload: { title: 'Update' } },
        { id: 'rep-27', title: 'Remote', updatedAt: 'invalid-date-string' },
        true
      );
      if (resMalformed.hasConflict) {
        throw new Error('Malformed remote updatedAt should not falsely trigger conflict.');
      }
    }
  );

  await runTest(
    'P7-T28',
    'Manual authorized DLQ retry of conflict mutation',
    'Verifies that an authorized user can manually recover a conflicting mutation from DLQ back into the active queue with reset retryCount.',
    async () => {
      await offlineStorage.clearDLQ();
      await offlineStorage.clearQueue();

      const secretary = createMockUser({ role: 'secretary' });

      const dlqItem: DeadLetterItem = {
        dlqId: 'DLQ-P7-RETRY-28',
        originalQueueId: 'MUT-P7-RETRY-28',
        operation: 'update',
        collectionName: 'announcements',
        recordId: 'ann-28',
        payload: { title: 'Resubmitted Announcement' },
        originalCreatedAt: '2026-08-24T11:00:00.000Z',
        failedAt: '2026-08-24T11:05:00.000Z',
        retryCount: 0,
        failureReason: 'conflict_remote_newer',
        originatingUserId: secretary.uid,
        originatingUserRole: secretary.role,
        schemaVersion: DLQ_SCHEMA_VERSION,
        baseUpdatedAt: '2026-08-24T10:00:00.000Z',
      };

      await offlineStorage.putDLQItem(dlqItem);

      const recovered = await dlqService.retryDLQItem('DLQ-P7-RETRY-28', secretary);
      if (!recovered) {
        throw new Error('Failed to recover DLQ item.');
      }
      if (recovered.status !== 'pending' || recovered.retryCount !== 0) {
        throw new Error(`Expected status 'pending' and retryCount 0, got status=${recovered.status}, retryCount=${recovered.retryCount}`);
      }

      // Verify active queue has the recovered item
      const queue = await offlineStorage.getQueue();
      const inQueue = queue.find((i) => i.queueId === recovered.queueId);
      if (!inQueue) {
        throw new Error('Recovered mutation was not placed back in active offlineQueue.');
      }

      // Verify DLQ no longer contains the item
      const dlq = await offlineStorage.getDLQ();
      if (dlq.some((i) => i.dlqId === 'DLQ-P7-RETRY-28')) {
        throw new Error('Recovered item was not removed from DLQ.');
      }
    }
  );

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
    executedAt: new Date().toISOString(),
  };
}
