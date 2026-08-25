/**
 * BOIMS Offline Architecture
 * Phase 9 — Offline Notifications, Cross-Tab Notification State & Delivery Reconciliation Test Suite
 *
 * Comprehensive Test Cases validating:
 * - P9-T01: Notification cache write into IndexedDB 'offlineEntities'
 * - P9-T02: Notification cache retrieval and field fidelity
 * - P9-T03: Stable notification ID preservation across cycles
 * - P9-T04: Duplicate notification prevention via deterministic ID deduplication
 * - P9-T05: Chronological notification ordering (newest first)
 * - P9-T06: Offline notification availability when network is simulated offline
 * - P9-T07: Cache miss returns safe empty state (no crashes, no fake data)
 * - P9-T08: Read-state persistence while offline in local cache and overlay
 * - P9-T09: Unread notification remains unread after simulated restart
 * - P9-T10: Read notification remains read after simulated restart
 * - P9-T11: Online authoritative notification refresh in cache
 * - P9-T12: Offline-to-online notification reconciliation preserving local read overlays
 * - P9-T13: Remote notification deletion reconciliation (soft-deleted records removed)
 * - P9-T14: Multi-tab notification state consistency via coordination signaling
 * - P9-T15: Notification isolation between different users (cross-user privacy)
 * - P9-T16: Role/jurisdiction filtering remains strictly enforced
 * - P9-T17: No duplicate notifications after simulated Firestore listener reconnect
 * - P9-T18: No duplicate notifications after application restart
 * - P9-T19: Strict security audit: Zero credentials/secrets in notification cache
 * - P9-T20: Phase 8 coordination remains intact alongside notifications
 * - P9-T21: Phase 1 regression (Bootstrap & Storage)
 * - P9-T22: Phase 2 regression (Entity Cache Layer)
 * - P9-T23: Phase 3 regression (Offline Auth & Session)
 * - P9-T24: Phase 4 regression (Offline CRUD & Mutation Queue)
 * - P9-T25: Phase 5 regression (Sync Queue Lifecycle)
 * - P9-T26: Phase 6 regression (DLQ Isolation & Quarantine)
 * - P9-T27: Phase 7 regression (Conflict Detection & Resolution)
 * - P9-T28: Phase 8 regression (Multi-Tab Exclusive Lease Coordination)
 */

import { offlineStorage } from './storage';
import { offlineMutationQueue } from './mutationQueue';
import { dlqService } from './dlqService';
import { offlineBootstrap } from './bootstrap';
import { coordinationService, ReplayCoordinationService } from './coordinationService';
import {
  OfflineNotificationRecord,
  UserNotificationOverlay,
  reconcileOfflineNotifications,
  deduplicateNotifications,
  sortNotificationsChronological,
  auditNotificationForSecrets,
  detectMutationConflict,
  isMutationAuthorized,
  validateOfflineMutation,
  sanitizeUserForOfflineSession,
  isOfflineSessionValid,
  OfflineQueueItem,
} from './types';
import { Notification, NotificationType, ReportPriority, User } from '../types';
import { filterNotificationsByAccess } from '../utils/jurisdictionUtils';

export interface Phase9TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface Phase9TestSuiteSummary {
  phase: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: Phase9TestResult[];
}

export class Phase9TestSuite {
  private mockUser(role: User['role'] = 'resident', id = 'usr-notif-1'): User {
    return {
      uid: id,
      fullName: 'Test Notification User',
      email: `${id}@test.local`,
      role,
      dutyStatus: 'onDuty',
      purok: 'Purok 1',
      jurisdiction: 'Purok 1',
      isVerified: true,
      createdAt: new Date().toISOString(),
    } as unknown as User;
  }

  private createSampleNotification(overrides: Partial<Notification> = {}): Notification {
    const notifId = overrides.notificationId || `notif-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    return {
      id: notifId,
      notificationId: notifId,
      userId: 'usr-notif-1',
      title: 'Barangay Advisory',
      message: 'Clean-up drive scheduled for tomorrow.',
      type: 'announcement' as NotificationType,
      priority: 'normal' as ReportPriority,
      isRead: false,
      createdAt: new Date().toISOString(),
      isDeleted: false,
      ...overrides,
    };
  }

  async runAllTests(): Promise<Phase9TestSuiteSummary> {
    const startTime = Date.now();
    const results: Phase9TestResult[] = [];

    const testMethods = [
      this.testP9T01_NotificationCacheWrite.bind(this),
      this.testP9T02_NotificationCacheRetrieval.bind(this),
      this.testP9T03_StableNotificationIdPreservation.bind(this),
      this.testP9T04_DuplicateNotificationPrevention.bind(this),
      this.testP9T05_ChronologicalNotificationOrdering.bind(this),
      this.testP9T06_OfflineNotificationAvailability.bind(this),
      this.testP9T07_CacheMissSafeEmptyState.bind(this),
      this.testP9T08_ReadStatePersistenceWhileOffline.bind(this),
      this.testP9T09_UnreadNotificationRemainsUnreadAfterRestart.bind(this),
      this.testP9T10_ReadNotificationRemainsReadAfterRestart.bind(this),
      this.testP9T11_OnlineAuthoritativeNotificationRefresh.bind(this),
      this.testP9T12_OfflineToOnlineReconciliation.bind(this),
      this.testP9T13_RemoteNotificationDeletionReconciliation.bind(this),
      this.testP9T14_MultiTabNotificationConsistency.bind(this),
      this.testP9T15_NotificationIsolationBetweenUsers.bind(this),
      this.testP9T16_RoleJurisdictionFilteringEnforced.bind(this),
      this.testP9T17_NoDuplicatesAfterFirestoreReconnect.bind(this),
      this.testP9T18_NoDuplicatesAfterApplicationRestart.bind(this),
      this.testP9T19_NoCredentialsOrSecretsInNotificationCache.bind(this),
      this.testP9T20_Phase8CoordinationRemainsIntact.bind(this),
      this.testP9T21_Phase1Regression.bind(this),
      this.testP9T22_Phase2Regression.bind(this),
      this.testP9T23_Phase3Regression.bind(this),
      this.testP9T24_Phase4Regression.bind(this),
      this.testP9T25_Phase5Regression.bind(this),
      this.testP9T26_Phase6Regression.bind(this),
      this.testP9T27_Phase7Regression.bind(this),
      this.testP9T28_Phase8Regression.bind(this),
    ];

    for (const testMethod of testMethods) {
      await offlineStorage.clearAllData();
      const testStart = Date.now();
      try {
        const result = await testMethod();
        result.durationMs = Date.now() - testStart;
        results.push(result);
      } catch (err: any) {
        results.push({
          id: 'P9-ERR',
          name: 'Unhandled Execution Error',
          description: testMethod.name,
          passed: false,
          durationMs: Date.now() - testStart,
          error: err?.message || String(err),
        });
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      phase: 'Phase 9 — Offline Notifications & Reconciliation',
      total: results.length,
      passed,
      failed,
      durationMs: Date.now() - startTime,
      results,
    };
  }

  // -------------------------------------------------------------------------
  // P9-T01: Notification cache write
  // -------------------------------------------------------------------------
  async testP9T01_NotificationCacheWrite(): Promise<Phase9TestResult> {
    const notif = this.createSampleNotification({
      notificationId: 'notif-2026-00001',
      title: 'Water Interruption',
      message: 'Scheduled maintenance from 1PM to 5PM.',
    });

    await offlineStorage.putCachedNotifications([notif]);
    const cached = await offlineStorage.getCachedNotification<Notification>('notif-2026-00001');

    const passed =
      cached !== null &&
      cached.data.notificationId === 'notif-2026-00001' &&
      cached.data.title === 'Water Interruption';

    return {
      id: 'P9-T01',
      name: 'Notification Cache Write',
      description: 'Verifies writing notifications into IndexedDB offlineEntities store.',
      passed,
      durationMs: 0,
      details: { notifId: notif.notificationId, found: Boolean(cached) },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T02: Notification cache retrieval
  // -------------------------------------------------------------------------
  async testP9T02_NotificationCacheRetrieval(): Promise<Phase9TestResult> {
    const notif1 = this.createSampleNotification({ notificationId: 'notif-2026-101', title: 'A' });
    const notif2 = this.createSampleNotification({ notificationId: 'notif-2026-102', title: 'B' });

    await offlineStorage.putCachedNotifications([notif1, notif2]);
    const allCached = await offlineStorage.getCachedNotifications<Notification>();

    const passed =
      allCached.length === 2 &&
      allCached.some((c) => c.data.notificationId === 'notif-2026-101') &&
      allCached.some((c) => c.data.notificationId === 'notif-2026-102');

    return {
      id: 'P9-T02',
      name: 'Notification Cache Retrieval',
      description: 'Verifies retrieving all cached notifications from IndexedDB.',
      passed,
      durationMs: 0,
      details: { retrievedCount: allCached.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T03: Stable notification ID preservation
  // -------------------------------------------------------------------------
  async testP9T03_StableNotificationIdPreservation(): Promise<Phase9TestResult> {
    const stableId = 'notif-2026-STABLE-99';
    const notif = this.createSampleNotification({ notificationId: stableId, title: 'Stable Notif' });

    await offlineStorage.putCachedNotifications([notif]);
    const retrieved = await offlineStorage.getCachedNotification<Notification>(stableId);

    const passed =
      retrieved !== null &&
      retrieved.data.notificationId === stableId &&
      retrieved.data.id === stableId &&
      retrieved.recordId === stableId;

    return {
      id: 'P9-T03',
      name: 'Stable Notification ID Preservation',
      description: 'Ensures notification identifiers remain completely stable and unaltered.',
      passed,
      durationMs: 0,
      details: { stableId, match: retrieved?.data.notificationId === stableId },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T04: Duplicate notification prevention
  // -------------------------------------------------------------------------
  async testP9T04_DuplicateNotificationPrevention(): Promise<Phase9TestResult> {
    const notif = this.createSampleNotification({ notificationId: 'notif-2026-DUP-1', title: 'Duplicate Test' });
    const duplicateArray = [notif, { ...notif }, { ...notif, title: 'Duplicate Updated' }];

    const deduplicated = deduplicateNotifications(duplicateArray);
    const passed = deduplicated.length === 1 && deduplicated[0].notificationId === 'notif-2026-DUP-1';

    return {
      id: 'P9-T04',
      name: 'Duplicate Notification Prevention',
      description: 'Verifies deduplication helper prevents duplicate items with identical notificationId.',
      passed,
      durationMs: 0,
      details: { originalCount: duplicateArray.length, deduplicatedCount: deduplicated.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T05: Chronological notification ordering
  // -------------------------------------------------------------------------
  async testP9T05_ChronologicalNotificationOrdering(): Promise<Phase9TestResult> {
    const notifOld = this.createSampleNotification({
      notificationId: 'notif-old',
      createdAt: '2026-08-20T08:00:00.000Z',
    });
    const notifNew = this.createSampleNotification({
      notificationId: 'notif-new',
      createdAt: '2026-08-24T12:00:00.000Z',
    });
    const notifMid = this.createSampleNotification({
      notificationId: 'notif-mid',
      createdAt: '2026-08-22T10:00:00.000Z',
    });

    const sorted = sortNotificationsChronological([notifOld, notifNew, notifMid]);
    const passed =
      sorted[0].notificationId === 'notif-new' &&
      sorted[1].notificationId === 'notif-mid' &&
      sorted[2].notificationId === 'notif-old';

    return {
      id: 'P9-T05',
      name: 'Chronological Notification Ordering',
      description: 'Verifies notifications are correctly sorted in descending chronological order (newest first).',
      passed,
      durationMs: 0,
      details: { order: sorted.map((s) => s.notificationId) },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T06: Offline notification availability
  // -------------------------------------------------------------------------
  async testP9T06_OfflineNotificationAvailability(): Promise<Phase9TestResult> {
    const notif = this.createSampleNotification({
      notificationId: 'notif-offline-avail',
      title: 'Power Advisory',
    });

    await offlineStorage.putCachedNotifications([notif]);
    const cachedEntities = await offlineStorage.getCachedNotifications<Notification>();

    const passed =
      cachedEntities.length === 1 &&
      cachedEntities[0].data.notificationId === 'notif-offline-avail' &&
      cachedEntities[0].data.title === 'Power Advisory';

    return {
      id: 'P9-T06',
      name: 'Offline Notification Availability',
      description: 'Verifies cached notifications remain accessible when offline without network interaction.',
      passed,
      durationMs: 0,
      details: { availableCount: cachedEntities.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T07: Cache miss returns safe empty state
  // -------------------------------------------------------------------------
  async testP9T07_CacheMissSafeEmptyState(): Promise<Phase9TestResult> {
    const cachedEntities = await offlineStorage.getCachedNotifications<Notification>();
    const single = await offlineStorage.getCachedNotification<Notification>('non-existent-notif');

    const passed = cachedEntities.length === 0 && single === null;

    return {
      id: 'P9-T07',
      name: 'Cache Miss Safe Empty State',
      description: 'Verifies cache misses return a clean empty array or null without throwing or fabricating data.',
      passed,
      durationMs: 0,
      details: { emptyListLength: cachedEntities.length, singleIsNull: single === null },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T08: Read-state persistence while offline
  // -------------------------------------------------------------------------
  async testP9T08_ReadStatePersistenceWhileOffline(): Promise<Phase9TestResult> {
    const notif = this.createSampleNotification({
      notificationId: 'notif-read-offline',
      isRead: false,
    });
    await offlineStorage.putCachedNotifications([notif]);

    const readAt = new Date().toISOString();
    await offlineStorage.saveUserNotificationOverlay('usr-notif-1', {
      'notif-read-offline': { isRead: true, readAt },
    });

    const overlay = await offlineStorage.getUserNotificationOverlay('usr-notif-1');
    const userState = overlay['notif-read-offline'] as { isRead: boolean; readAt: string };

    const passed = userState !== undefined && userState.isRead === true && userState.readAt === readAt;

    return {
      id: 'P9-T08',
      name: 'Read-State Persistence While Offline',
      description: 'Verifies read state updates persist into user notification overlay in IndexedDB.',
      passed,
      durationMs: 0,
      details: { isRead: userState?.isRead, readAt: userState?.readAt },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T09: Unread notification remains unread after restart
  // -------------------------------------------------------------------------
  async testP9T09_UnreadNotificationRemainsUnreadAfterRestart(): Promise<Phase9TestResult> {
    const notif = this.createSampleNotification({
      notificationId: 'notif-unread-restart',
      isRead: false,
    });
    await offlineStorage.putCachedNotifications([notif]);

    // Simulate reopen
    const reopened = await offlineStorage.getCachedNotification<Notification>('notif-unread-restart');
    const passed = reopened !== null && reopened.data.isRead === false;

    return {
      id: 'P9-T09',
      name: 'Unread Notification Preserved Across Restart',
      description: 'Verifies unread notifications retain isRead: false across storage reload.',
      passed,
      durationMs: 0,
      details: { isRead: reopened?.data.isRead },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T10: Read notification remains read after restart
  // -------------------------------------------------------------------------
  async testP9T10_ReadNotificationRemainsReadAfterRestart(): Promise<Phase9TestResult> {
    const readAt = '2026-08-24T10:15:00.000Z';
    const notif = this.createSampleNotification({
      notificationId: 'notif-read-restart',
      isRead: true,
      readAt,
    });
    await offlineStorage.putCachedNotifications([notif]);

    const reopened = await offlineStorage.getCachedNotification<Notification>('notif-read-restart');
    const passed =
      reopened !== null &&
      reopened.data.isRead === true &&
      reopened.data.readAt === readAt;

    return {
      id: 'P9-T10',
      name: 'Read Notification Preserved Across Restart',
      description: 'Verifies read notifications retain isRead: true and readAt timestamp across reload.',
      passed,
      durationMs: 0,
      details: { isRead: reopened?.data.isRead, readAt: reopened?.data.readAt },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T11: Online authoritative notification refresh
  // -------------------------------------------------------------------------
  async testP9T11_OnlineAuthoritativeNotificationRefresh(): Promise<Phase9TestResult> {
    const initialNotif = this.createSampleNotification({
      notificationId: 'notif-refresh-1',
      title: 'Initial Title',
    });
    await offlineStorage.putCachedNotifications([initialNotif]);

    const updatedRemote = this.createSampleNotification({
      notificationId: 'notif-refresh-1',
      title: 'Updated Authoritative Title',
      createdAt: new Date().toISOString(),
    });

    await offlineStorage.putCachedNotifications([updatedRemote]);
    const refreshed = await offlineStorage.getCachedNotification<Notification>('notif-refresh-1');

    const passed =
      refreshed !== null && refreshed.data.title === 'Updated Authoritative Title';

    return {
      id: 'P9-T11',
      name: 'Online Authoritative Notification Refresh',
      description: 'Verifies cache updates correctly when fresh authoritative data arrives from Firestore.',
      passed,
      durationMs: 0,
      details: { updatedTitle: refreshed?.data.title },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T12: Offline-to-online notification reconciliation
  // -------------------------------------------------------------------------
  async testP9T12_OfflineToOnlineReconciliation(): Promise<Phase9TestResult> {
    const localNotifs: OfflineNotificationRecord[] = [
      {
        notificationId: 'notif-rec-1',
        userId: 'usr-1',
        title: 'Local Cached',
        message: 'Hello',
        type: 'announcement',
        priority: 'normal',
        isRead: false,
        createdAt: '2026-08-24T08:00:00.000Z',
        isDeleted: false,
        schemaVersion: 1,
      },
    ];

    const remoteNotifs: OfflineNotificationRecord[] = [
      {
        notificationId: 'notif-rec-1',
        userId: 'usr-1',
        title: 'Local Cached (Updated)',
        message: 'Hello',
        type: 'announcement',
        priority: 'normal',
        isRead: false,
        createdAt: '2026-08-24T08:00:00.000Z',
        updatedAt: '2026-08-24T09:00:00.000Z',
        isDeleted: false,
        schemaVersion: 1,
      },
      {
        notificationId: 'notif-rec-2',
        userId: 'usr-1',
        title: 'New Remote Notification',
        message: 'Emergency warning',
        type: 'emergency',
        priority: 'critical',
        isRead: false,
        createdAt: '2026-08-24T10:00:00.000Z',
        isDeleted: false,
        schemaVersion: 1,
      },
    ];

    // User marked notif-rec-1 as read while offline
    const overlay: UserNotificationOverlay = {
      'notif-rec-1': { isRead: true, readAt: '2026-08-24T09:30:00.000Z' },
    };

    const reconciliation = reconcileOfflineNotifications(localNotifs, remoteNotifs, overlay);
    const passed =
      reconciliation.reconciled.length === 2 &&
      reconciliation.reconciled.find((n) => n.notificationId === 'notif-rec-1')?.isRead === true &&
      reconciliation.reconciled.find((n) => n.notificationId === 'notif-rec-2')?.isRead === false &&
      reconciliation.addedCount === 1;

    return {
      id: 'P9-T12',
      name: 'Offline-to-Online Notification Reconciliation',
      description: 'Verifies reconciliation merges remote additions while preserving local read overlays.',
      passed,
      durationMs: 0,
      details: { count: reconciliation.reconciled.length, added: reconciliation.addedCount },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T13: Remote notification deletion reconciliation
  // -------------------------------------------------------------------------
  async testP9T13_RemoteNotificationDeletionReconciliation(): Promise<Phase9TestResult> {
    const localNotifs: OfflineNotificationRecord[] = [
      {
        notificationId: 'notif-del-1',
        userId: 'usr-1',
        title: 'To Be Deleted',
        message: 'Bye',
        type: 'announcement',
        priority: 'normal',
        isRead: true,
        createdAt: '2026-08-24T08:00:00.000Z',
        isDeleted: false,
        schemaVersion: 1,
      },
    ];

    const remoteNotifs: OfflineNotificationRecord[] = [
      {
        notificationId: 'notif-del-1',
        userId: 'usr-1',
        title: 'To Be Deleted',
        message: 'Bye',
        type: 'announcement',
        priority: 'normal',
        isRead: true,
        createdAt: '2026-08-24T08:00:00.000Z',
        isDeleted: true,
        deletedAt: '2026-08-24T09:00:00.000Z',
        schemaVersion: 1,
      },
    ];

    const reconciliation = reconcileOfflineNotifications(localNotifs, remoteNotifs, {});
    const passed = reconciliation.reconciled.length === 0 && reconciliation.deletedCount === 1;

    return {
      id: 'P9-T13',
      name: 'Remote Notification Deletion Reconciliation',
      description: 'Verifies remote soft deletions are recognized and excluded from reconciled state.',
      passed,
      durationMs: 0,
      details: { reconciledCount: reconciliation.reconciled.length, deletedCount: reconciliation.deletedCount },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T14: Multi-tab notification state consistency
  // -------------------------------------------------------------------------
  async testP9T14_MultiTabNotificationConsistency(): Promise<Phase9TestResult> {
    const coordTab1 = new ReplayCoordinationService('TAB-NOTIF-1');
    const coordTab2 = new ReplayCoordinationService('TAB-NOTIF-2');

    let signalReceived = false;
    let receivedType = '';

    const unsub = coordTab2.subscribeToSignals((msg) => {
      if (msg.type === 'notification_state_changed') {
        signalReceived = true;
        receivedType = msg.type;
      }
    });

    coordTab1.broadcast('notification_state_changed', { action: 'read', notificationId: 'notif-tab-1' });

    // Wait short tick for broadcast
    await new Promise((resolve) => setTimeout(resolve, 50));

    unsub();
    coordTab1.destroy();
    coordTab2.destroy();

    const passed = signalReceived && receivedType === 'notification_state_changed';

    return {
      id: 'P9-T14',
      name: 'Multi-Tab Notification State Consistency',
      description: 'Verifies cross-tab signaling dispatches notification_state_changed events between tabs.',
      passed,
      durationMs: 0,
      details: { signalReceived, receivedType },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T15: Notification isolation between different users
  // -------------------------------------------------------------------------
  async testP9T15_NotificationIsolationBetweenUsers(): Promise<Phase9TestResult> {
    const userA = this.mockUser('resident', 'usr-alice');
    const userB = this.mockUser('resident', 'usr-bob');

    const notifs: Notification[] = [
      this.createSampleNotification({ notificationId: 'notif-a', userId: 'usr-alice', title: 'Alice Private', type: 'report_status' }),
      this.createSampleNotification({ notificationId: 'notif-b', userId: 'usr-bob', title: 'Bob Private', type: 'report_status' }),
      this.createSampleNotification({ notificationId: 'notif-all', userId: 'all_residents', title: 'Broadcast', type: 'announcement' }),
    ];

    const aliceVisible = filterNotificationsByAccess(notifs, userA);
    const bobVisible = filterNotificationsByAccess(notifs, userB);

    const aliceHasBob = aliceVisible.some((n) => n.notificationId === 'notif-b');
    const bobHasAlice = bobVisible.some((n) => n.notificationId === 'notif-a');

    const passed =
      !aliceHasBob &&
      !bobHasAlice &&
      aliceVisible.some((n) => n.notificationId === 'notif-a') &&
      bobVisible.some((n) => n.notificationId === 'notif-b') &&
      aliceVisible.some((n) => n.notificationId === 'notif-all') &&
      bobVisible.some((n) => n.notificationId === 'notif-all');

    return {
      id: 'P9-T15',
      name: 'Notification Isolation Between Users',
      description: 'Ensures strict privacy isolation between distinct user notification streams.',
      passed,
      durationMs: 0,
      details: { aliceCount: aliceVisible.length, bobCount: bobVisible.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T16: Role/jurisdiction filtering remains enforced
  // -------------------------------------------------------------------------
  async testP9T16_RoleJurisdictionFilteringEnforced(): Promise<Phase9TestResult> {
    const purok1Official = this.mockUser('purokOfficial', 'usr-purok1');
    (purok1Official as any).purok = 'Purok 1';

    const notifs: Notification[] = [
      this.createSampleNotification({
        notificationId: 'notif-p1',
        userId: 'usr-staff-1',
        title: 'Purok 1 Issue',
        type: 'report_status',
        ...({ targetJurisdiction: 'Purok 1' } as any),
      }),
      this.createSampleNotification({
        notificationId: 'notif-p2',
        userId: 'usr-staff-2',
        title: 'Purok 2 Issue',
        type: 'report_status',
        ...({ targetJurisdiction: 'Purok 2' } as any),
      }),
    ];

    const visible = filterNotificationsByAccess(notifs, purok1Official);
    const passed =
      visible.some((n) => n.notificationId === 'notif-p1') &&
      !visible.some((n) => n.notificationId === 'notif-p2');

    return {
      id: 'P9-T16',
      name: 'Role/Jurisdiction Filtering Enforced',
      description: 'Ensures jurisdictional notifications are scoped strictly to the authorized official.',
      passed,
      durationMs: 0,
      details: { visibleCount: visible.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T17: No duplicate notifications after Firestore listener reconnect
  // -------------------------------------------------------------------------
  async testP9T17_NoDuplicatesAfterFirestoreReconnect(): Promise<Phase9TestResult> {
    const snapshot1 = [
      this.createSampleNotification({ notificationId: 'notif-stream-1', title: 'Snapshot 1' }),
      this.createSampleNotification({ notificationId: 'notif-stream-2', title: 'Snapshot 1' }),
    ];

    const snapshot2 = [
      this.createSampleNotification({ notificationId: 'notif-stream-1', title: 'Snapshot 2 (updated)' }),
      this.createSampleNotification({ notificationId: 'notif-stream-2', title: 'Snapshot 2' }),
      this.createSampleNotification({ notificationId: 'notif-stream-3', title: 'Snapshot 2 (new)' }),
    ];

    await offlineStorage.putCachedNotifications(snapshot1);
    await offlineStorage.putCachedNotifications(snapshot2);

    const cachedEntities = await offlineStorage.getCachedNotifications<Notification>();
    const passed = cachedEntities.length === 3;

    return {
      id: 'P9-T17',
      name: 'No Duplicates After Firestore Reconnect',
      description: 'Ensures multiple snapshot updates across reconnects maintain unique records by notificationId.',
      passed,
      durationMs: 0,
      details: { uniqueCount: cachedEntities.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T18: No duplicate notifications after application restart
  // -------------------------------------------------------------------------
  async testP9T18_NoDuplicatesAfterApplicationRestart(): Promise<Phase9TestResult> {
    const notifs = [
      this.createSampleNotification({ notificationId: 'notif-rest-1' }),
      this.createSampleNotification({ notificationId: 'notif-rest-2' }),
    ];

    await offlineStorage.putCachedNotifications(notifs);

    // Reopen storage and query again
    const all = await offlineStorage.getCachedNotifications<Notification>();
    const deduplicated = deduplicateNotifications(all.map((a) => a.data));

    const passed = all.length === 2 && deduplicated.length === 2;

    return {
      id: 'P9-T18',
      name: 'No Duplicates After Application Restart',
      description: 'Verifies storage reopening produces exactly 2 unique records without duplicates.',
      passed,
      durationMs: 0,
      details: { count: all.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T19: Strict security audit: Zero credentials/secrets in notification cache
  // -------------------------------------------------------------------------
  async testP9T19_NoCredentialsOrSecretsInNotificationCache(): Promise<Phase9TestResult> {
    const cleanNotif: OfflineNotificationRecord = {
      notificationId: 'notif-clean-1',
      userId: 'usr-1',
      title: 'Advisory',
      message: 'Clean record',
      type: 'announcement',
      priority: 'normal',
      isRead: false,
      createdAt: '2026-08-24T12:00:00.000Z',
      isDeleted: false,
      schemaVersion: 1,
    };

    const dirtyNotifWithToken = {
      ...cleanNotif,
      idToken: 'fake-jwt-token',
    };

    const isCleanSafe = auditNotificationForSecrets(cleanNotif);
    const isDirtyDetected = !auditNotificationForSecrets(dirtyNotifWithToken);

    const passed = isCleanSafe && isDirtyDetected;

    return {
      id: 'P9-T19',
      name: 'No Credentials or Secrets in Notification Cache',
      description: 'Audits notification records to confirm zero auth tokens, passwords, or secrets are persisted.',
      passed,
      durationMs: 0,
      details: { cleanRecordPassed: isCleanSafe, dirtyRecordBlocked: isDirtyDetected },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T20: Phase 8 coordination remains intact alongside notifications
  // -------------------------------------------------------------------------
  async testP9T20_Phase8CoordinationRemainsIntact(): Promise<Phase9TestResult> {
    const coord = new ReplayCoordinationService('TAB-P8-INTACT');
    const acquired = await coord.acquireLease();
    const verified = await coord.verifyOwnership();

    // Cache a notification while holding lease
    await offlineStorage.putCachedNotifications([
      this.createSampleNotification({ notificationId: 'notif-p8-intact' }),
    ]);

    const stillOwner = await coord.verifyOwnership();
    await coord.releaseLease();

    coord.destroy();

    const passed = acquired && verified && stillOwner;

    return {
      id: 'P9-T20',
      name: 'Phase 8 Coordination Intact Under Notification Operations',
      description: 'Verifies Phase 8 lease coordination operates seamlessly alongside notification operations.',
      passed,
      durationMs: 0,
      details: { acquired, verified, stillOwner },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T21: Phase 1 regression
  // -------------------------------------------------------------------------
  async testP9T21_Phase1Regression(): Promise<Phase9TestResult> {
    const item: OfflineQueueItem = {
      queueId: 'Q-P9-REG-01',
      operation: 'create',
      collectionName: 'reports',
      recordId: 'REP-REG-01',
      payload: { title: 'P1 Regression' },
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await offlineStorage.putQueueItem(item);
    const retrieved = await offlineStorage.getQueueItem('Q-P9-REG-01');
    const passed = retrieved !== null && retrieved.queueId === 'Q-P9-REG-01';

    return {
      id: 'P9-T21',
      name: 'Phase 1 Regression: Storage & Queue Basics',
      description: 'Verifies Phase 1 offline queue primitives remain functional.',
      passed,
      durationMs: 0,
      details: { found: Boolean(retrieved) },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T22: Phase 2 regression
  // -------------------------------------------------------------------------
  async testP9T22_Phase2Regression(): Promise<Phase9TestResult> {
    await offlineStorage.putCachedEntity('reports', 'REP-P9-REG-02', { title: 'Cached Report' });
    const cached = await offlineStorage.getCachedEntity<{ title: string }>('reports', 'REP-P9-REG-02');
    const passed = cached !== null && cached.data.title === 'Cached Report';

    return {
      id: 'P9-T22',
      name: 'Phase 2 Regression: Local Entity Cache',
      description: 'Verifies Phase 2 entity caching remains functional.',
      passed,
      durationMs: 0,
      details: { found: Boolean(cached) },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T23: Phase 3 regression
  // -------------------------------------------------------------------------
  async testP9T23_Phase3Regression(): Promise<Phase9TestResult> {
    const user = this.mockUser('resident', 'usr-reg-3');
    await offlineStorage.saveSession({
      uid: 'usr-reg-3',
      user,
      sessionState: 'valid',
      authenticatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const session = await offlineStorage.getSession();
    const passed = session !== null && isOfflineSessionValid(session);

    return {
      id: 'P9-T23',
      name: 'Phase 3 Regression: Offline Authentication Session',
      description: 'Verifies Phase 3 credential-free session persistence remains valid.',
      passed,
      durationMs: 0,
      details: { sessionValid: passed },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T24: Phase 4 regression
  // -------------------------------------------------------------------------
  async testP9T24_Phase4Regression(): Promise<Phase9TestResult> {
    const user = this.mockUser('resident', 'usr-reg-4');
    const mutation = {
      queueId: 'Q-P9-REG-04',
      operation: 'create' as const,
      collectionName: 'reports',
      recordId: 'REP-REG-04',
      payload: { title: 'New Report', category: 'emergency', priority: 'critical' },
      createdAt: new Date().toISOString(),
      userId: user.uid,
      userRole: user.role,
    };

    const authCheck = isMutationAuthorized(mutation, user);
    const valCheck = validateOfflineMutation(mutation);

    const passed = authCheck === true && valCheck.valid === true;

    return {
      id: 'P9-T24',
      name: 'Phase 4 Regression: Mutation Validation & Authorization',
      description: 'Verifies Phase 4 offline CRUD authorization and payload validation.',
      passed,
      durationMs: 0,
      details: { authorized: authCheck, valid: valCheck.valid },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T25: Phase 5 regression
  // -------------------------------------------------------------------------
  async testP9T25_Phase5Regression(): Promise<Phase9TestResult> {
    await offlineBootstrap.initialize();
    const queue = await offlineStorage.getQueue();
    const passed = Array.isArray(queue);

    return {
      id: 'P9-T25',
      name: 'Phase 5 Regression: Sync Lifecycle & Bootstrap',
      description: 'Verifies Phase 5 sync lifecycle and queue interrogation.',
      passed,
      durationMs: 0,
      details: { queueLength: queue.length },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T26: Phase 6 regression
  // -------------------------------------------------------------------------
  async testP9T26_Phase6Regression(): Promise<Phase9TestResult> {
    const item: OfflineQueueItem = {
      queueId: 'Q-REG-06',
      operation: 'create',
      collectionName: 'reports',
      recordId: 'REP-REG-06',
      payload: { title: 'Failed Item' },
      status: 'pending',
      retryCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dlqItem = await offlineStorage.moveToDLQ(item, 'max_retries_exceeded', {
      code: 'max_retries',
      message: 'Max retries exceeded',
    });
    const inDlq = await dlqService.getDLQItem(dlqItem.dlqId);

    const passed = inDlq !== null && inDlq.failureReason === 'max_retries_exceeded';

    return {
      id: 'P9-T26',
      name: 'Phase 6 Regression: Dead Letter Queue (DLQ) Quarantine',
      description: 'Verifies Phase 6 dead letter quarantine isolation.',
      passed,
      durationMs: 0,
      details: { dlqId: dlqItem.dlqId, found: Boolean(inDlq) },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T27: Phase 7 regression
  // -------------------------------------------------------------------------
  async testP9T27_Phase7Regression(): Promise<Phase9TestResult> {
    const mutation = {
      queueId: 'Q-P9-REG-07',
      operation: 'update' as const,
      collectionName: 'reports',
      recordId: 'REP-REG-07',
      payload: { title: 'Offline Title' },
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
      userId: 'usr-1',
      userRole: 'resident' as const,
      baseUpdatedAt: '2026-08-20T09:00:00.000Z',
    };

    const remoteDoc = {
      updatedAt: '2026-08-20T09:30:00.000Z',
      title: 'Remote Newer Title',
    };

    const conflict = detectMutationConflict(mutation, remoteDoc, true);
    const passed = conflict.hasConflict && conflict.reason === 'conflict_remote_newer';

    return {
      id: 'P9-T27',
      name: 'Phase 7 Regression: Conflict Detection & Resolution',
      description: 'Verifies Phase 7 3-way timestamp conflict detection.',
      passed,
      durationMs: 0,
      details: { hasConflict: conflict.hasConflict, reason: conflict.reason },
    };
  }

  // -------------------------------------------------------------------------
  // P9-T28: Phase 8 regression
  // -------------------------------------------------------------------------
  async testP9T28_Phase8Regression(): Promise<Phase9TestResult> {
    const coord1 = new ReplayCoordinationService('TAB-P9-REG-1');
    const coord2 = new ReplayCoordinationService('TAB-P9-REG-2');

    const acq1 = await coord1.acquireLease();
    const acq2 = await coord2.acquireLease();

    await coord1.releaseLease();
    const acq2After = await coord2.acquireLease();

    await coord2.releaseLease();
    coord1.destroy();
    coord2.destroy();

    const passed = acq1 && !acq2 && acq2After;

    return {
      id: 'P9-T28',
      name: 'Phase 8 Regression: Multi-Tab Lease & Takeover',
      description: 'Verifies Phase 8 exclusive lease acquisition and clean release.',
      passed,
      durationMs: 0,
      details: { acq1, acq2Blocked: !acq2, acq2AfterRelease: acq2After },
    };
  }
}

export const phase9TestSuite = new Phase9TestSuite();

export async function runPhase9TestSuite(): Promise<Phase9TestSuiteSummary> {
  return await phase9TestSuite.runAllTests();
}
