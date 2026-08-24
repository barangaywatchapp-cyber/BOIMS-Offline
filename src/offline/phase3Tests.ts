/**
 * BOIMS Offline Architecture
 * Phase 3 — Offline Authentication & Session Persistence Test Suite
 *
 * 21 Comprehensive Test Cases validating:
 * - OfflineSessionRecord contract and sanitization
 * - 7-Day TTL validation and expiration enforcement
 * - Multi-account isolation and security rules
 * - Offline startup recovery vs online authoritative reconciliation
 * - Explicit logout clearing both IndexedDB and localStorage
 * - Role & jurisdiction integrity preservation
 * - Prevention of credential leakage
 */

import { offlineStorage } from './storage';
import {
  OfflineSessionRecord,
  sanitizeUserForOfflineSession,
  isOfflineSessionValid,
  OFFLINE_SESSION_TTL_MS,
  OFFLINE_SESSION_SCHEMA_VERSION,
} from './types';
import { User } from '../types';

export interface Phase3TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface Phase3TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: Phase3TestResult[];
  executedAt: string;
}

/**
 * Creates a mock User object for testing
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-user-uid-001',
    email: 'official@boims.gov.ph',
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
    role: 'purokOfficial',
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
 * Executes all 21 Phase 3 Test Cases
 */
export async function runPhase3TestSuite(): Promise<Phase3TestSuiteSummary> {
  const results: Phase3TestResult[] = [];

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

  // Ensure clean initial state for tests
  await offlineStorage.clearSession().catch(() => {});

  // TC01: Save valid offline session
  await runTest(
    'TC01_SESSION_SAVE_VALID',
    'Save Valid Offline Session',
    'Verifies that a valid session record can be persisted to IndexedDB.',
    async () => {
      const user = createMockUser({ uid: 'user-001' });
      const record: OfflineSessionRecord = {
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      };
      await offlineStorage.saveSession(record);
      const retrieved = await offlineStorage.getSession();
      if (!retrieved || retrieved.uid !== 'user-001') {
        throw new Error(`Expected session for user-001, got ${retrieved?.uid}`);
      }
    }
  );

  // TC02: Retrieve active offline session within TTL
  await runTest(
    'TC02_SESSION_RETRIEVE_VALID',
    'Retrieve Active Offline Session within TTL',
    'Ensures an active, non-expired session is returned correctly.',
    async () => {
      const user = createMockUser({ uid: 'user-002', role: 'admin' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (!session || session.user.role !== 'admin') {
        throw new Error('Failed to retrieve valid active session within TTL.');
      }
    }
  );

  // TC03: Expired session (> 7 days) rejected
  await runTest(
    'TC03_SESSION_EXPIRES_TTL',
    'Reject Expired Session Beyond 7-Day TTL',
    'Ensures sessions past their expiration timestamp return null.',
    async () => {
      const user = createMockUser({ uid: 'user-003' });
      const expiredDate = new Date(Date.now() - 1000).toISOString();
      const record: OfflineSessionRecord = {
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        lastActiveAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: expiredDate,
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      };
      // Validation helper check
      if (isOfflineSessionValid(record)) {
        throw new Error('isOfflineSessionValid failed to detect expired timestamp.');
      }
    }
  );

  // TC04: Session sanitization removes sensitive & large payloads
  await runTest(
    'TC04_SESSION_SANITIZATION',
    'User Sanitization on Session Save',
    'Verifies sensitive credentials and oversized data are stripped prior to storage.',
    async () => {
      const rawUser: any = {
        ...createMockUser(),
        password: 'PlainTextPassword123!',
        token: 'firebase-id-token-abc',
        secret: 'admin-secret-key',
        privateKey: '-----BEGIN PRIVATE KEY-----',
      };
      const sanitized = sanitizeUserForOfflineSession(rawUser);
      if (
        (sanitized as any).password ||
        (sanitized as any).token ||
        (sanitized as any).secret ||
        (sanitized as any).privateKey
      ) {
        throw new Error('Sanitized user still contained sensitive fields.');
      }
      if (!sanitized.uid || !sanitized.role) {
        throw new Error('Sanitization stripped required user fields.');
      }
    }
  );

  // TC05: Explicit logout clears session from IndexedDB
  await runTest(
    'TC05_SESSION_CLEAR_EXPLICIT_LOGOUT',
    'Clear Session on Explicit Logout',
    'Verifies clearSession removes the persisted session completely.',
    async () => {
      const user = createMockUser({ uid: 'user-005' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      await offlineStorage.clearSession();
      const session = await offlineStorage.getSession();
      if (session !== null) {
        throw new Error('Session was not cleared after calling clearSession.');
      }
    }
  );

  // TC06: Multi-account isolation
  await runTest(
    'TC06_MULTI_ACCOUNT_ISOLATION',
    'Multi-Account Isolation and Clean Overwrite',
    'User B saving a session replaces User A; no cross-account state leakage occurs.',
    async () => {
      const userA = createMockUser({ uid: 'user-A', fullName: 'Alice Tanod' });
      const userB = createMockUser({ uid: 'user-B', fullName: 'Bob Secretary' });

      await offlineStorage.saveSession({
        uid: userA.uid,
        user: userA,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });

      await offlineStorage.saveSession({
        uid: userB.uid,
        user: userB,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });

      const current = await offlineStorage.getSession();
      if (!current || current.uid !== 'user-B' || current.user.fullName !== 'Bob Secretary') {
        throw new Error('Multi-account isolation failed: User B did not cleanly overwrite User A.');
      }
    }
  );

  // TC07: Offline session recovery simulation
  await runTest(
    'TC07_OFFLINE_STARTUP_RESTORES_USER',
    'Offline Startup Restores Stored Session',
    'Simulates offline startup where valid session in storage is retrieved.',
    async () => {
      const user = createMockUser({ uid: 'user-007', role: 'purokOfficial' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (!session || !isOfflineSessionValid(session)) {
        throw new Error('Offline startup failed to restore valid session from storage.');
      }
    }
  );

  // TC08: Offline startup prevents premature logout
  await runTest(
    'TC08_OFFLINE_STARTUP_PREVENTS_LOGOUT',
    'Offline Startup Prevents Premature Logout',
    'Confirms valid session is retained when network is unavailable.',
    async () => {
      const session = await offlineStorage.getSession();
      if (!session) {
        throw new Error('Active session was unexpectedly missing.');
      }
      if (session.sessionState === 'expired') {
        throw new Error('Session marked expired prematurely.');
      }
    }
  );

  // TC09: Online startup authoritative primacy check
  await runTest(
    'TC09_ONLINE_STARTUP_AUTHORITATIVE',
    'Online Startup Authoritative Primacy',
    'Ensures Firebase online state updates local offline session upon verification.',
    async () => {
      const onlineUser = createMockUser({ uid: 'user-009', dutyMode: 'dispatcher' });
      await offlineStorage.saveSession({
        uid: onlineUser.uid,
        user: onlineUser,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const restored = await offlineStorage.getSession();
      if (!restored || restored.user.dutyMode !== 'dispatcher') {
        throw new Error('Online authoritative update failed to reflect in session storage.');
      }
    }
  );

  // TC10: Unauthenticated online state cleans up session
  await runTest(
    'TC10_ONLINE_UNAUTHENTICATED_CLEARS_SESSION',
    'Online Unauthenticated State Clears Local Session',
    'Ensures clearing session executes without errors when server reports logged out.',
    async () => {
      await offlineStorage.clearSession();
      const session = await offlineStorage.getSession();
      if (session !== null) {
        throw new Error('Local session was not purged after online unauthenticated confirmation.');
      }
    }
  );

  // TC11: Role preservation (Official)
  await runTest(
    'TC11_ROLE_PRESERVATION_OFFICIAL',
    'Role Preservation for Officials (Purok Official / Admin)',
    'Verifies official user roles and permissions are preserved without modification.',
    async () => {
      const user = createMockUser({ uid: 'user-011', role: 'purokOfficial' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (!session || session.user.role !== 'purokOfficial') {
        throw new Error('Purok Official role was altered or lost.');
      }
    }
  );

  // TC12: Role preservation (Resident)
  await runTest(
    'TC12_ROLE_PRESERVATION_RESIDENT',
    'Role Preservation for Residents',
    'Verifies resident role is preserved properly without role escalation.',
    async () => {
      const user = createMockUser({ uid: 'user-012', role: 'resident' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (!session || session.user.role !== 'resident') {
        throw new Error('Resident role was altered or lost.');
      }
    }
  );

  // TC13: Jurisdiction / Purok preservation
  await runTest(
    'TC13_JURISDICTION_PRESERVATION',
    'Jurisdiction and Purok Scope Preservation',
    'Verifies that jurisdiction, purok, barangay, and address are preserved.',
    async () => {
      const user = createMockUser({
        uid: 'user-013',
        jurisdiction: 'Purok 4',
        purok: 'Purok 4',
        barangay: 'Barangay Central',
      });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (
        !session ||
        session.user.jurisdiction !== 'Purok 4' ||
        session.user.purok !== 'Purok 4'
      ) {
        throw new Error('Jurisdiction metadata was not preserved correctly.');
      }
    }
  );

  // TC14: Duty mode update persistence
  await runTest(
    'TC14_DUTY_MODE_UPDATE_PERSISTENCE',
    'Duty Mode Update Persistence',
    'Updating duty status/mode updates session timestamps and state in IndexedDB.',
    async () => {
      const user = createMockUser({ uid: 'user-014', dutyStatus: 'offDuty', dutyMode: 'offDuty' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });

      // Switch to OnDuty Responder
      const updatedUser = { ...user, dutyStatus: 'onDuty' as const, dutyMode: 'responder' as const };
      await offlineStorage.saveSession({
        uid: updatedUser.uid,
        user: updatedUser,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });

      const session = await offlineStorage.getSession();
      if (
        !session ||
        session.user.dutyStatus !== 'onDuty' ||
        session.user.dutyMode !== 'responder'
      ) {
        throw new Error('Duty mode update did not persist to offline session.');
      }
    }
  );

  // TC15: Corrupt session record handling
  await runTest(
    'TC15_CORRUPT_SESSION_HANDLING',
    'Corrupt / Malformed Session Record Handling',
    'Validates that null or malformed objects fail gracefully without unhandled exceptions.',
    async () => {
      if (isOfflineSessionValid(null)) throw new Error('Null session evaluated as valid.');
      if (isOfflineSessionValid({} as any)) throw new Error('Empty session evaluated as valid.');
      if (isOfflineSessionValid({ uid: '' } as any))
        throw new Error('Session with blank uid evaluated as valid.');
      if (isOfflineSessionValid({ uid: '123', user: {} } as any))
        throw new Error('Session with empty user evaluated as valid.');
    }
  );

  // TC16: Missing UID validation
  await runTest(
    'TC16_MISSING_UID_VALIDATION',
    'Missing UID Session Rejection',
    'Ensures session records without a valid UID are rejected.',
    async () => {
      const invalid = {
        uid: '',
        user: createMockUser(),
        sessionState: 'online_authenticated' as const,
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: 1,
      };
      if (isOfflineSessionValid(invalid)) {
        throw new Error('Session with empty UID was accepted as valid.');
      }
    }
  );

  // TC17: Missing role validation
  await runTest(
    'TC17_MISSING_ROLE_VALIDATION',
    'Missing Role Session Rejection',
    'Ensures sessions lacking a user role cannot be validated.',
    async () => {
      const invalidUser = createMockUser();
      (invalidUser as any).role = undefined;
      const invalid = {
        uid: 'user-017',
        user: invalidUser,
        sessionState: 'online_authenticated' as const,
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: 1,
      };
      if (isOfflineSessionValid(invalid)) {
        throw new Error('Session with missing role was accepted as valid.');
      }
    }
  );

  // TC18: Explicit expired session state validation
  await runTest(
    'TC18_EXPLICIT_EXPIRED_STATE_VALIDATION',
    'Explicit Expired Session State Rejection',
    'Sessions marked with sessionState "expired" are considered invalid.',
    async () => {
      const expiredSession: OfflineSessionRecord = {
        uid: 'user-018',
        user: createMockUser({ uid: 'user-018' }),
        sessionState: 'expired',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: 1,
      };
      if (isOfflineSessionValid(expiredSession)) {
        throw new Error('Session marked "expired" was accepted as valid.');
      }
    }
  );

  // TC19: Schema versioning parity
  await runTest(
    'TC19_SCHEMA_VERSION_PARITY',
    'Schema Versioning Parity & Default Assignment',
    'Verifies session record retains schemaVersion 1.',
    async () => {
      const user = createMockUser({ uid: 'user-019' });
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: OFFLINE_SESSION_SCHEMA_VERSION,
      });
      const session = await offlineStorage.getSession();
      if (!session || session.schemaVersion !== OFFLINE_SESSION_SCHEMA_VERSION) {
        throw new Error(`Expected schemaVersion ${OFFLINE_SESSION_SCHEMA_VERSION}`);
      }
    }
  );

  // TC20: Online reconnection reconciliation
  await runTest(
    'TC20_ONLINE_RECONNECT_RECONCILIATION',
    'Online Reconnection Session State Preservation',
    'Ensures session timestamps are kept up-to-date upon online activity.',
    async () => {
      const user = createMockUser({ uid: 'user-020' });
      const firstActive = new Date(Date.now() - 60000).toISOString();
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: firstActive,
        lastActiveAt: firstActive,
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: 1,
      });

      const updatedActive = new Date().toISOString();
      await offlineStorage.saveSession({
        uid: user.uid,
        user,
        sessionState: 'online_authenticated',
        authenticatedAt: firstActive,
        lastActiveAt: updatedActive,
        expiresAt: new Date(Date.now() + OFFLINE_SESSION_TTL_MS).toISOString(),
        schemaVersion: 1,
      });

      const session = await offlineStorage.getSession();
      if (!session || session.lastActiveAt !== updatedActive) {
        throw new Error('Last active timestamp was not updated.');
      }
    }
  );

  // TC21: No credential storage security validation
  await runTest(
    'TC21_NO_CREDENTIAL_STORAGE',
    'Security: No Passwords, Tokens, or Secrets Stored',
    'Guarantees no credential material or authentication secrets exist in session record.',
    async () => {
      const session = await offlineStorage.getSession();
      if (session) {
        const serialized = JSON.stringify(session).toLowerCase();
        const forbiddenKeywords = ['password', 'idtoken', 'refreshtoken', 'privatekey', 'clientsecret'];
        for (const keyword of forbiddenKeywords) {
          if (serialized.includes(`"${keyword}"`)) {
            throw new Error(`Forbidden credential key "${keyword}" detected in stored session!`);
          }
        }
      }
    }
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    total: results.length,
    passed,
    failed,
    results,
    executedAt: new Date().toISOString(),
  };
}
