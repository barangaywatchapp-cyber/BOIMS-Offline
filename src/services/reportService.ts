/**
 * Report Service (Module 3)
 * Manages incident and public safety report creation, updates, responder dispatching,
 * timeline logging, and offline queue synchronization.
 * Aligned with SRS Volume 4 and MDG Volume 4.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase/config';
import { Report, ReportStatus, ReportPriority, IncidentCategory, ReportTimelineEvent, UserRole, DutyStatus, DutyMode, User } from '../types';
import { offlineStorage } from '../offline/storage';
import { syncService } from './SyncService';
import { isResidentMode } from '../utils/permissions';
import { storageService } from './storageService';
import {
  filterReportsByAccess,
  extractPurokFromAddress,
  isReportOwner,
  isReportAssignedTo,
  getUserJurisdiction,
  getReportJurisdiction,
  isSameJurisdiction,
} from '../utils/jurisdictionUtils';
import { adminService } from './adminService';
import { blotterService } from './blotterService';
import { notificationService } from './notificationService';

const LOCAL_REPORTS_KEY = 'boims_local_reports_v1';
const HAS_SYNCED_KEY = 'boims_has_synced_v1';

let inMemoryReports: Report[] = [];

/**
 * Hydrates and applies pending offline report mutations from the single-source-of-truth SyncService queue.
 * Combines existing reports (from Firestore or memory) with queued creates, updates, and deletes.
 */
function applyQueuedReportMutations(baseReports: Report[]): Report[] {
  let queue: any[] = [];
  try {
    queue = syncService.getQueue().filter((item) => item.collectionName === 'reports');
  } catch (e) {
    queue = [];
  }

  const reportsMap = new Map<string, Report>();

  // 1. Index base reports by reportId and reportNumber
  baseReports.forEach((r) => {
    if (!r || r.isDeleted) return;
    const key = r.reportId || r.reportNumber;
    if (key) {
      reportsMap.set(key, { ...r });
    }
  });

  // 2. Process queued items in FIFO chronological order
  queue.forEach((item) => {
    if (item.status === 'failed') return;

    if (item.operationType === 'create') {
      const createdReport = item.payload as Report;
      if (createdReport && (createdReport.reportId || createdReport.reportNumber) && !createdReport.isDeleted) {
        const key = createdReport.reportId || createdReport.reportNumber;
        const existing =
          reportsMap.get(key) ||
          (createdReport.reportId ? reportsMap.get(createdReport.reportId) : undefined) ||
          (createdReport.reportNumber ? reportsMap.get(createdReport.reportNumber) : undefined);
        if (!existing) {
          reportsMap.set(key, { ...createdReport });
        } else {
          reportsMap.set(key, { ...existing, ...createdReport });
        }
      }
    } else if (item.operationType === 'update') {
      const targetId = item.recordId;
      let matchedKey: string | null = null;
      let existingReport: Report | null = null;

      for (const [k, r] of reportsMap.entries()) {
        if (r.reportId === targetId || r.reportNumber === targetId || k === targetId) {
          matchedKey = k;
          existingReport = r;
          break;
        }
      }

      if (existingReport && matchedKey) {
        const { timelineEvent, ...otherUpdates } = item.payload || {};
        const updatedTimeline = [...(existingReport.timeline || [])];
        if (timelineEvent && timelineEvent.eventId) {
          const exists = updatedTimeline.some((e) => e.eventId === timelineEvent.eventId);
          if (!exists) {
            updatedTimeline.push(timelineEvent);
          }
        }

        reportsMap.set(matchedKey, {
          ...existingReport,
          ...otherUpdates,
          timeline: updatedTimeline,
          updatedAt: otherUpdates.updatedAt || existingReport.updatedAt,
        });
      }
    } else if (item.operationType === 'delete') {
      const targetId = item.recordId;
      for (const [k, r] of reportsMap.entries()) {
        if (r.reportId === targetId || r.reportNumber === targetId || k === targetId) {
          reportsMap.delete(k);
          break;
        }
      }
    }
  });

  return Array.from(reportsMap.values())
    .filter((r) => !r.isDeleted)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function getInitialLocalReports(): Report[] {
  return applyQueuedReportMutations(inMemoryReports);
}

function saveLocalReports(reports: Report[]): void {
  inMemoryReports = reports;
  offlineStorage
    .putCachedEntities(
      'reports',
      reports.map((r) => ({
        recordId: r.reportId || r.reportNumber,
        data: r,
        updatedAt: r.updatedAt || r.createdAt,
      }))
    )
    .catch((err) => {
      console.warn('[ReportService] Failed to update offline entity cache:', err);
    });
}

/**
  * Merges local cached reports and live Firestore reports.
  * When connected to Firestore (isOnlineSource = true), Firestore is authoritative:
  * stale cached/seed reports not present in Firestore and not pending in offline sync queue are pruned.
  */
function mergeAndDeduplicateReports(
  localStore: Report[],
  firestoreReports: Report[],
  isOnlineSource: boolean = false
): Report[] {
  const map = new Map<string, Report>();

  if (isOnlineSource) {
    // 1. Authoritative Firestore reports
    firestoreReports.forEach((fr) => {
      if (!fr || fr.isDeleted) return;
      const key = fr.reportId || fr.reportNumber;
      if (key) map.set(key, fr);
    });

    // Mark that client has successfully synced with Firestore
    try {
      localStorage.setItem(HAS_SYNCED_KEY, 'true');
    } catch (e) {
      // ignore
    }
  } else {
    // Offline mode fallback: union localStore and cached firestoreReports
    localStore.forEach((r) => {
      if (!r || r.isDeleted) return;
      const key = r.reportId || r.reportNumber;
      if (key) map.set(key, r);
    });

    firestoreReports.forEach((fr) => {
      if (!fr || fr.isDeleted) return;
      const keysToDelete: string[] = [];
      for (const [k, existing] of map.entries()) {
        const matchId = Boolean(existing.reportId && fr.reportId && existing.reportId === fr.reportId);
        const matchNum = Boolean(existing.reportNumber && fr.reportNumber && existing.reportNumber === fr.reportNumber);
        if (matchId || matchNum) {
          keysToDelete.push(k);
        }
      }
      keysToDelete.forEach((k) => map.delete(k));

      const primaryKey = fr.reportId || fr.reportNumber;
      if (primaryKey) map.set(primaryKey, fr);
    });
  }

  // 3. Apply all queued mutations from SyncService (both online and offline)
  const mergedBase = Array.from(map.values());
  return applyQueuedReportMutations(mergedBase);
}

// In-memory cache for development seed fallback and instant offline updates
let localReportsStore: Report[] = getInitialLocalReports();

export class ReportService {
  /**
   * Generates a unique sequential report number: e.g. RPT-2026-98421
   */
  private generateReportNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    return `RPT-${year}-${random}`;
  }

  /**
   * Fetches all reports with optional filtering (category, status, priority, userId, search query, currentUser)
   */
  async getReports(filters?: {
    userId?: string;
    category?: IncidentCategory;
    priority?: ReportPriority;
    status?: ReportStatus;
    search?: string;
    assignedTo?: string;
    currentUser?: User | null;
    limitCount?: number;
    lastDoc?: DocumentSnapshot | null;
  }): Promise<Report[]> {
    try {
      if (!auth.currentUser) {
        let firestoreReports: Report[] = [];
        let reports = mergeAndDeduplicateReports(localReportsStore, firestoreReports, false);
        return reports;
      }

      const reportsRef = collection(db, 'reports');

      // Resolve active user context to accurately determine role before executing query
      let userObj: User | null = filters?.currentUser || null;
      if (!userObj) {
        try {
          const cachedUser = localStorage.getItem('boims_active_user');
          if (cachedUser) {
            userObj = JSON.parse(cachedUser);
          }
        } catch (e) {
          // Ignore
        }
      }

      const activeRole = userObj?.role || null;
      const isResidentRole = isResidentMode(userObj, activeRole);

      const staffRoles = [
        'secretary',
        'treasurer',
        'executiveOfficer',
        'admin',
        'chairman',
        'developer',
        'verificationOfficer',
        'purokLeader',
        'purokOfficial',
        'verifier',
        'superAdmin',
      ];

      const isStaffUser = Boolean(activeRole && staffRoles.includes(activeRole) && !isResidentRole);

      let snapshot;
      if (!isStaffUser) {
        // Resident/non-staff user: execute user-scoped query DIRECTLY to prevent unauthorized unscoped queries
        snapshot = await getDocs(query(reportsRef, where('userId', '==', filters?.userId || auth.currentUser.uid)));
      } else {
        const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];
        if (filters?.status) {
          constraints.push(where('status', '==', filters.status));
        }
        if (filters?.lastDoc) {
          constraints.push(startAfter(filters.lastDoc));
        }
        if (filters?.limitCount && filters.limitCount > 0) {
          constraints.push(limit(filters.limitCount));
        }
        try {
          snapshot = await getDocs(query(reportsRef, ...constraints));
        } catch (indexErr) {
          console.warn('[ReportService] Constrained query failed, falling back to basic query:', indexErr);
          snapshot = await getDocs(query(reportsRef, where('isDeleted', '==', false)));
        }
      }

      let firestoreReports: Report[] = [];
      if (!snapshot.empty) {
        firestoreReports = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as Report;
          return {
            ...raw,
            reportId: raw.reportId || docSnap.id,
            reportNumber: raw.reportNumber || docSnap.id,
          };
        });
      }

      let reports = mergeAndDeduplicateReports(localReportsStore, firestoreReports, true);
      localReportsStore = reports;
      saveLocalReports(localReportsStore);

      // Apply jurisdiction & role authorization filter first if currentUser provided
      if (filters?.currentUser) {
        reports = filterReportsByAccess(reports, filters.currentUser);
      }

      // Apply in-memory filters
      if (filters) {
        if (filters.userId) {
          reports = reports.filter(
            (r) =>
              r.userId === filters.userId ||
              (r as any).createdBy === filters.userId ||
              (filters.currentUser ? isReportOwner(r, filters.currentUser) : false)
          );
        }
        if (filters.category) {
          reports = reports.filter((r) => r.category === filters.category);
        }
        if (filters.priority) {
          reports = reports.filter((r) => r.priority === filters.priority);
        }
        if (filters.status) {
          reports = reports.filter((r) => r.status === filters.status);
        }
        if (filters.assignedTo) {
          reports = reports.filter((r) => r.assignedTo === filters.assignedTo);
        }
        if (filters.search && filters.search.trim()) {
          const q = filters.search.toLowerCase();
          reports = reports.filter(
            (r) =>
              (r.title || '').toLowerCase().includes(q) ||
              (r.reportNumber || '').toLowerCase().includes(q) ||
              (r.description || '').toLowerCase().includes(q) ||
              (r.location?.address || '').toLowerCase().includes(q) ||
              (r.userName && r.userName.toLowerCase().includes(q))
          );
        }
      }

      return reports;
    } catch (error) {
      console.warn('[ReportService] Firestore fetch failed. Falling back to local store:', error);
      let reports = mergeAndDeduplicateReports(localReportsStore, []).filter((r) => !r.isDeleted);

      if (filters?.currentUser) {
        reports = filterReportsByAccess(reports, filters.currentUser);
      }

      if (filters) {
        if (filters.userId) {
          reports = reports.filter(
            (r) =>
              r.userId === filters.userId ||
              (r as any).createdBy === filters.userId ||
              (filters.currentUser ? isReportOwner(r, filters.currentUser) : false)
          );
        }
        if (filters.category) reports = reports.filter((r) => r.category === filters.category);
        if (filters.priority) reports = reports.filter((r) => r.priority === filters.priority);
        if (filters.status) reports = reports.filter((r) => r.status === filters.status);
        if (filters.assignedTo) reports = reports.filter((r) => r.assignedTo === filters.assignedTo);
        if (filters.search && filters.search.trim()) {
          const q = filters.search.toLowerCase();
          reports = reports.filter(
            (r) =>
              (r.title || '').toLowerCase().includes(q) ||
              (r.reportNumber || '').toLowerCase().includes(q) ||
              (r.description || '').toLowerCase().includes(q) ||
              (r.location?.address || '').toLowerCase().includes(q)
          );
        }
      }
      return reports;
    }
  }

  /**
   * Subscribes to real-time report updates from Firestore with optional user jurisdiction filtering
   */
  subscribeToReports(callback: (reports: Report[]) => void, currentUser?: User | null): () => void {
    const logDiagnostic = (msg: string, extra?: any) => {
      console.info(`[Reports Diagnostic] ${msg}`, {
        authUid: auth.currentUser?.uid || null,
        userUid: currentUser?.uid || null,
        role: currentUser?.role || null,
        dutyMode: currentUser?.dutyMode || null,
        status: currentUser?.status || null,
        barangay: currentUser?.barangay || null,
        sitio: (currentUser as any)?.sitio || null,
        purok: currentUser?.purok || null,
        jurisdiction: currentUser?.jurisdiction || null,
        ...extra,
      });
    };

    logDiagnostic('subscribeToReports requested');

    let activeUnsubscribe: (() => void) | null = null;
    let isCancelled = false;

    // Resolve user object from parameter or localStorage cache
    let userObj: User | null = currentUser || null;
    if (!userObj) {
      try {
        const cachedUser = localStorage.getItem('boims_active_user');
        if (cachedUser) {
          userObj = JSON.parse(cachedUser);
        }
      } catch (e) {
        // ignore
      }
    }

    const activeRole = userObj?.role || null;
    const isResidentRole = isResidentMode(userObj, activeRole);

    const staffRoles = [
      'secretary',
      'treasurer',
      'executiveOfficer',
      'admin',
      'chairman',
      'developer',
      'verificationOfficer',
      'purokLeader',
      'purokOfficial',
      'verifier',
      'superAdmin',
    ];

    const isConfirmedStaff = Boolean(activeRole && staffRoles.includes(activeRole) && !isResidentRole);

    let lastRawReports: Report[] = [];
    let lastIsOnline: boolean = false;

    const handleSnapshot = (rawReports: Report[], isOnline: boolean = true) => {
      if (isCancelled) return;
      lastRawReports = rawReports;
      lastIsOnline = isOnline;
      const active = mergeAndDeduplicateReports(localReportsStore, rawReports, isOnline);

      localReportsStore = active;
      saveLocalReports(localReportsStore);
      const effectiveUser = currentUser || userObj;
      const filtered = effectiveUser ? filterReportsByAccess(active, effectiveUser) : active;

      logDiagnostic(`handleSnapshot executed. Raw: ${rawReports.length}, Active: ${active.length}, Filtered: ${filtered.length}`);
      callback(filtered);
    };

    // Live subscription to SyncService queue changes to reactively reconstruct reports on offline actions and sync events
    const unsubSyncQueue = syncService.subscribe(() => {
      if (isCancelled) return;
      handleSnapshot(lastRawReports, lastIsOnline);
    });

    const startListener = () => {
      if (isCancelled) return;
      if (!auth.currentUser) {
        logDiagnostic('startListener invoked without auth.currentUser');
        handleSnapshot([], false);
        return;
      }

      try {
        const reportsRef = collection(db, 'reports');

        const buildQuery = (forUserOnly: boolean) => {
          if (forUserOnly && auth.currentUser) {
            return query(reportsRef, where('userId', '==', auth.currentUser.uid));
          }
          return query(reportsRef, orderBy('createdAt', 'desc'));
        };

        const setupListener = (forUserOnly: boolean): (() => void) => {
          const q = buildQuery(forUserOnly);
          logDiagnostic(`Establishing Firestore onSnapshot listener. forUserOnly: ${forUserOnly}`);

          return onSnapshot(
            q,
            (snapshot) => {
              if (isCancelled) return;
              logDiagnostic('Firestore onSnapshot emitted', {
                docsCount: snapshot.docs.length,
                empty: snapshot.empty,
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites,
              });

              if (!snapshot.empty) {
                const reports = snapshot.docs.map((docSnap) => {
                  const raw = docSnap.data() as Report;
                  return {
                    ...raw,
                    reportId: raw.reportId || docSnap.id,
                    reportNumber: raw.reportNumber || docSnap.id,
                  };
                });
                handleSnapshot(reports, true);
              } else {
                handleSnapshot([], true);
              }
            },
            (err) => {
              if (isCancelled) return;
              if ((err as any)?.code === 'permission-denied' && auth.currentUser && !forUserOnly) {
                logDiagnostic('Permission denied on full reports listener; falling back to user-filtered query.');
                if (activeUnsubscribe) activeUnsubscribe();
                activeUnsubscribe = setupListener(true);
                return;
              }
              console.warn('[Reports Diagnostic] Realtime reports listener error:', err);
              handleSnapshot([], false);
            }
          );
        };

        // Only use full unscoped query (forUserOnly = false) if user is EXPLICITLY confirmed as authorized staff/admin
        const forUserOnly = !isConfirmedStaff;
        activeUnsubscribe = setupListener(forUserOnly);
      } catch (err) {
        console.warn('[Reports Diagnostic] Could not subscribe to reports:', err);
        handleSnapshot([], false);
      }
    };

    if (auth.currentUser) {
      startListener();
    } else {
      logDiagnostic('subscribeToReports invoked without auth.currentUser. No listener established.');
      handleSnapshot([], false);
    }

    return () => {
      isCancelled = true;
      logDiagnostic('Unsubscribing reports listener');
      if (unsubSyncQueue) {
        unsubSyncQueue();
      }
      if (activeUnsubscribe) {
        activeUnsubscribe();
        activeUnsubscribe = null;
      }
    };
  }

  /**
   * Fetches single report by ID with access check
   */
  async getReportById(reportId: string, currentUser?: User | null): Promise<Report | null> {
    // Ensure local store has latest queued mutations hydrated
    localReportsStore = applyQueuedReportMutations(localReportsStore);

    if (!auth.currentUser) {
      const found = localReportsStore.find(
        (r) => (r.reportId === reportId || r.reportNumber === reportId) && !r.isDeleted
      );
      if (found && currentUser) {
        const allowed = filterReportsByAccess([found], currentUser);
        return allowed.length > 0 ? allowed[0] : null;
      }
      return found || null;
    }

    let report: Report | null = null;
    const targetInStore = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const docIdToFetch = targetInStore?.reportId || reportId;

    try {
      const docRef = doc(db, 'reports', docIdToFetch);
      let snapshot = await getDoc(docRef);

      if (!snapshot.exists() && docIdToFetch !== reportId) {
        const altDocRef = doc(db, 'reports', reportId);
        snapshot = await getDoc(altDocRef);
      }

      if (snapshot.exists()) {
        const raw = snapshot.data() as Report;
        const data: Report = {
          ...raw,
          reportId: raw.reportId || snapshot.id,
          reportNumber: raw.reportNumber || snapshot.id,
        };
        report = data.isDeleted ? null : data;
        if (report) {
          const idx = localReportsStore.findIndex(
            (r) =>
              r.reportId === reportId ||
              r.reportNumber === reportId ||
              (report!.reportId && r.reportId === report!.reportId) ||
              (report!.reportNumber && r.reportNumber === report!.reportNumber)
          );
          if (idx >= 0) {
            localReportsStore[idx] = report;
          } else {
            localReportsStore.push(report);
          }
          saveLocalReports(localReportsStore);
        }
      } else {
        try {
          const q = query(collection(db, 'reports'), where('reportNumber', '==', reportId));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const raw = qSnap.docs[0].data() as Report;
            report = raw.isDeleted ? null : raw;
          }
        } catch (qErr) {
          // ignore query error
        }

        if (!report) {
          console.warn(
            `[ReportService] getReportById: Firestore document '${docIdToFetch}' (input parameter: '${reportId}') does not exist in Firestore.`
          );
          const found = localReportsStore.find(
            (r) => (r.reportId === reportId || r.reportNumber === reportId) && !r.isDeleted
          );
          report = found || null;
        }
      }
    } catch (error) {
      console.warn(`[ReportService] getReportById error for doc ID '${docIdToFetch}':`, error);
      const found = localReportsStore.find(
        (r) => (r.reportId === reportId || r.reportNumber === reportId) && !r.isDeleted
      );
      report = found || null;
    }

    if (report && currentUser) {
      const allowed = filterReportsByAccess([report], currentUser);
      if (allowed.length === 0) {
        return null; // Access denied due to jurisdiction / ownership restriction
      }
    }

    return report;
  }

  /**
   * Submits new incident report
   */
  async createReport(
    reportData: Omit<
      Report,
      | 'reportId'
      | 'reportNumber'
      | 'createdAt'
      | 'updatedAt'
      | 'isDeleted'
      | 'timeline'
    >,
    isOnline: boolean = true
  ): Promise<Report> {
    const reportId = `rpt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const reportNumber = this.generateReportNumber();
    const now = new Date().toISOString();

    const initialTimelineEvent: ReportTimelineEvent = {
      eventId: `evt-${Date.now()}`,
      action: reportData.isAnonymous ? 'Report Submitted (Anonymous)' : 'Report Submitted',
      performedBy: reportData.userId,
      performedByName: reportData.isAnonymous ? 'Anonymous Resident' : reportData.userName || 'Resident',
      performedByRole: 'resident',
      remarks: 'Incident report submitted.',
      createdAt: now,
    };

    const reportPurok = reportData.purok || extractPurokFromAddress(reportData.location?.address) || 'Purok 1';
    const reportJurisdiction = reportData.jurisdiction || reportData.purok || reportPurok;
    const effectivePriority = reportData.category === 'neighborhood_dispute' ? 'critical' : (reportData.priority || 'medium');

    const newReport: Report = {
      ...reportData,
      priority: effectivePriority,
      reportId,
      reportNumber,
      reportedBy: reportData.userId,
      createdBy: reportData.userId,
      purok: reportPurok,
      jurisdiction: reportJurisdiction,
      status: reportData.status || 'pending',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      timeline: [initialTimelineEvent],
    };

    // Store in local state immediately & persist to localStorage
    localReportsStore = [newReport, ...localReportsStore];
    saveLocalReports(localReportsStore);

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'REPORT_CREATED',
        module: 'Reports',
        targetId: newReport.reportId,
        targetType: 'Report',
        performedBy: reportData.userId,
        performerName: reportData.isAnonymous ? 'Anonymous Resident' : reportData.userName || 'Resident',
        performerRole: 'resident',
        newValues: { title: newReport.title, category: newReport.category, status: newReport.status },
      })
      .catch((err) => console.warn('[ReportService] Audit log error:', err));

    if (!isOnline) {
      // Enqueue in offline sync queue
      syncService.enqueue('create', 'reports', newReport.reportId, newReport);
      return newReport;
    }

    try {
      await setDoc(doc(db, 'reports', newReport.reportId), newReport);
      return newReport;
    } catch (error) {
      console.warn('[ReportService] Online save failed. Enqueuing for offline sync.', error);
      syncService.enqueue('create', 'reports', newReport.reportId, newReport);
      return newReport;
    }
  }

  /**
   * Updates report status with timeline log entry
   */
  async updateReportStatus(
    reportId: string,
    newStatus: ReportStatus,
    remarks: string,
    performer: { uid: string; fullName: string; role: UserRole; dutyStatus?: DutyStatus; dutyMode?: DutyMode; jurisdiction?: string; purok?: string },
    isOnline: boolean = true
  ): Promise<void> {
    const target = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const resolvedDocId = target?.reportId || reportId;
    let currentStatus = target?.status;

    if (!currentStatus && isOnline) {
      try {
        const docRef = doc(db, 'reports', resolvedDocId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          currentStatus = (snapshot.data() as Report).status;
        } else {
          console.warn(
            `[ReportService] updateReportStatus: Firestore doc '${resolvedDocId}' (input parameter: '${reportId}') does not exist when checking current status.`
          );
        }
      } catch (e) {
        // Fallback to local store status
      }
    }

    if (currentStatus === 'resolved') {
      throw new Error('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.');
    }

    if (currentStatus === 'escalated') {
      const allowedRoles: UserRole[] = ['secretary', 'chairman'];
      if (!allowedRoles.includes(performer.role)) {
        throw new Error('Unauthorized: This report is escalated to the Secretary. Only the Secretary or Chairman can update its status.');
      }
    }

    if (performer.role === 'resident' || (performer.role === 'purokOfficial' && performer.dutyStatus !== 'onDuty')) {
      throw new Error('Unauthorized: Residents and off-duty officials cannot update incident status.');
    }

    if (performer.role === 'purokOfficial' && performer.dutyMode === 'responder') {
      if (target && !isReportAssignedTo(target, performer.uid)) {
        throw new Error('Unauthorized: Field Responders can only update status on reports assigned to them.');
      }
    }

    if (performer.role === 'purokOfficial' && performer.dutyMode === 'dispatcher') {
      if (target) {
        const userJur = getUserJurisdiction(performer as any);
        const reportJur = getReportJurisdiction(target);
        const isOwner = isReportOwner(target, performer as any);
        const isAssigned = isReportAssignedTo(target, performer.uid);
        if (userJur && reportJur && !isSameJurisdiction(userJur, reportJur) && !isOwner && !isAssigned) {
          throw new Error('Unauthorized: Dispatchers can only update reports within their jurisdiction.');
        }
      }
    }

    const now = new Date().toISOString();
    const event: ReportTimelineEvent = {
      eventId: `evt-${Date.now()}`,
      action: `Status Updated to ${newStatus}`,
      performedBy: performer.uid,
      performedByName: performer.fullName,
      performedByRole: performer.role,
      remarks: remarks || `Status changed to ${newStatus}`,
      createdAt: now,
    };

    // Update in-memory local cache
    if (target) {
      target.status = newStatus;
      target.updatedAt = now;
      target.timeline = [...(target.timeline || []), event];

      if (newStatus === 'resolved') {
        target.resolvedBy = performer.uid;
        target.resolvedAt = now;
        target.resolutionRemarks = remarks;
      }
      saveLocalReports(localReportsStore);
    }

    const updates: Partial<Report> = {
      status: newStatus,
      updatedAt: now,
      ...(newStatus === 'resolved'
        ? { resolvedBy: performer.uid, resolvedAt: now, resolutionRemarks: remarks }
        : {}),
    };

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'REPORT_STATUS_UPDATED',
        module: 'Reports',
        targetId: resolvedDocId,
        targetType: 'Report',
        performedBy: performer.uid,
        performerName: performer.fullName,
        performerRole: performer.role,
        reason: remarks,
        previousValues: currentStatus ? { status: currentStatus } : undefined,
        newValues: { status: newStatus },
      })
      .catch((err) => console.warn('[ReportService] Audit log error:', err));

    if (!isOnline) {
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      return;
    }

    try {
      const reportRef = doc(db, 'reports', resolvedDocId);
      const snapshot = await getDoc(reportRef);
      if (snapshot.exists()) {
        const existingData = snapshot.data() as Report;
        if (existingData.status === 'resolved') {
          throw new Error('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.');
        }
        const updatedTimeline = [...(existingData.timeline || []), event];
        await updateDoc(reportRef, {
          ...updates,
          timeline: updatedTimeline,
        });
      } else {
        console.warn(
          `[ReportService] updateReportStatus: Firestore document '${resolvedDocId}' (input parameter: '${reportId}') does not exist during updateDoc. Enqueuing for offline sync.`
        );
        syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      }
    } catch (error) {
      if ((error as Error)?.message?.includes('Unauthorized: Resolved reports')) {
        throw error;
      }
      console.warn('[ReportService] Update failed online. Enqueuing offline item.', error);
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
    }
  }

  /**
   * Assigns incident report to a field responder (Tanod / Officer)
   */
  async assignReport(
    reportId: string,
    responderUid: string,
    responderName: string,
    assigner: { uid: string; fullName: string; role: UserRole; dutyStatus?: DutyStatus; dutyMode?: DutyMode; jurisdiction?: string; purok?: string },
    isOnline: boolean = true
  ): Promise<void> {
    if (!responderUid || !responderUid.trim() || !responderName || !responderName.trim()) {
      throw new Error('Please select a responder before assigning this report.');
    }

    if (assigner.role === 'resident') {
      throw new Error('Unauthorized: Residents cannot assign responders.');
    }

    if (assigner.role === 'purokOfficial') {
      if (assigner.dutyStatus !== 'onDuty' || assigner.dutyMode !== 'dispatcher') {
        throw new Error('Unauthorized: Dispatch actions are restricted to active Dispatchers (On Duty).');
      }
    }

    const target = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const resolvedDocId = target?.reportId || reportId;
    let currentStatus = target?.status;

    if (!currentStatus && isOnline) {
      try {
        const docRef = doc(db, 'reports', resolvedDocId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          currentStatus = (snapshot.data() as Report).status;
        } else {
          console.warn(
            `[ReportService] assignReport: Firestore doc '${resolvedDocId}' (input parameter: '${reportId}') does not exist when checking current status.`
          );
        }
      } catch (e) {
        // Fallback
      }
    }

    if (currentStatus === 'resolved') {
      throw new Error('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.');
    }

    if (currentStatus === 'escalated') {
      const allowedRoles: UserRole[] = ['secretary', 'chairman'];
      if (!allowedRoles.includes(assigner.role)) {
        throw new Error('Unauthorized: This report is escalated to the Secretary. Responder assignments are locked.');
      }
    }

    if (assigner.role === 'purokOfficial') {
      if (target) {
        const userJur = getUserJurisdiction(assigner as any);
        const reportJur = getReportJurisdiction(target);
        const isOwner = isReportOwner(target, assigner as any);
        const isAssigned = isReportAssignedTo(target, assigner.uid);
        if (userJur && reportJur && !isSameJurisdiction(userJur, reportJur) && !isOwner && !isAssigned) {
          throw new Error('Unauthorized: Dispatchers can only assign reports within their jurisdiction.');
        }
      }
    }

    const now = new Date().toISOString();
    const event: ReportTimelineEvent = {
      eventId: `evt-${Date.now()}`,
      action: 'Responder Assigned',
      performedBy: assigner.uid,
      performedByName: assigner.fullName,
      performedByRole: assigner.role,
      remarks: `Assigned to ${responderName}`,
      createdAt: now,
    };

    const updates: Partial<Report> = {
      assignedTo: responderUid,
      assignedToName: responderName,
      assignedBy: assigner.uid,
      assignedAt: now,
      status: 'assigned',
      updatedAt: now,
    };

    // Update in-memory store
    if (target) {
      target.assignedTo = responderUid;
      target.assignedToName = responderName;
      target.assignedBy = assigner.uid;
      target.assignedAt = now;
      target.status = 'assigned';
      target.updatedAt = now;
      target.timeline = [...(target.timeline || []), event];
      saveLocalReports(localReportsStore);
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'REPORT_ASSIGNED',
        module: 'Reports',
        targetId: resolvedDocId,
        targetType: 'Report',
        performedBy: assigner.uid,
        performerName: assigner.fullName,
        performerRole: assigner.role,
        newValues: { assignedTo: responderUid, assignedToName: responderName, status: 'assigned' },
      })
      .catch((err) => console.warn('[ReportService] Audit log error:', err));

    if (!isOnline) {
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      return;
    }

    try {
      const reportRef = doc(db, 'reports', resolvedDocId);
      const snapshot = await getDoc(reportRef);
      if (snapshot.exists()) {
        const existing = snapshot.data() as Report;
        if (existing.status === 'resolved') {
          throw new Error('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.');
        }
        await updateDoc(reportRef, {
          ...updates,
          timeline: [...(existing.timeline || []), event],
        });
      } else {
        console.warn(
          `[ReportService] assignReport: Firestore document '${resolvedDocId}' (input parameter: '${reportId}') does not exist during updateDoc. Enqueuing for offline sync.`
        );
        syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      }
    } catch (error) {
      if ((error as Error)?.message?.includes('Unauthorized: Resolved reports')) {
        throw error;
      }
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
    }
  }

  /**
   * Adds timeline remark/progress update to report
   */
  async addTimelineEvent(
    reportId: string,
    eventData: Omit<ReportTimelineEvent, 'eventId' | 'createdAt'> & { dutyStatus?: DutyStatus; dutyMode?: DutyMode; jurisdiction?: string; purok?: string },
    isOnline: boolean = true
  ): Promise<void> {
    const target = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const resolvedDocId = target?.reportId || reportId;
    let currentStatus = target?.status;

    if (!currentStatus && isOnline) {
      try {
        const docRef = doc(db, 'reports', resolvedDocId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          currentStatus = (snapshot.data() as Report).status;
        }
      } catch (e) {
        // Fallback
      }
    }

    if (currentStatus === 'resolved') {
      throw new Error('Unauthorized: Resolved reports are immutable and cannot be updated.');
    }

    if (currentStatus === 'escalated') {
      const allowedRoles: UserRole[] = ['secretary', 'chairman'];
      if (!allowedRoles.includes(eventData.performedByRole)) {
        throw new Error('Unauthorized: This report is escalated to the Secretary. Only the Secretary or Chairman can modify its timeline.');
      }
    }

    if (eventData.performedByRole === 'resident' || (eventData.performedByRole === 'purokOfficial' && eventData.dutyStatus !== 'onDuty')) {
      throw new Error('Unauthorized: Residents and off-duty officials cannot log notes.');
    }

    if (eventData.performedByRole === 'purokOfficial' && eventData.dutyMode === 'responder') {
      if (target && !isReportAssignedTo(target, eventData.performedBy)) {
        throw new Error('Unauthorized: Field Responders can only add remarks to reports assigned to them.');
      }
    }

    if (eventData.performedByRole === 'purokOfficial' && eventData.dutyMode === 'dispatcher') {
      if (target) {
        const userJur = getUserJurisdiction(eventData as any);
        const reportJur = getReportJurisdiction(target);
        const isOwner = isReportOwner(target, eventData as any);
        const isAssigned = isReportAssignedTo(target, eventData.performedBy);
        if (userJur && reportJur && !isSameJurisdiction(userJur, reportJur) && !isOwner && !isAssigned) {
          throw new Error('Unauthorized: Dispatchers can only log remarks on reports within their jurisdiction.');
        }
      }
    }

    const now = new Date().toISOString();
    const event: ReportTimelineEvent = {
      action: eventData.action,
      performedBy: eventData.performedBy,
      performedByName: eventData.performedByName,
      performedByRole: eventData.performedByRole,
      remarks: eventData.remarks,
      eventId: `evt-${Date.now()}`,
      createdAt: now,
    };

    if (target) {
      target.updatedAt = now;
      target.timeline = [...(target.timeline || []), event];
      saveLocalReports(localReportsStore);
    }

    if (!isOnline) {
      syncService.enqueue('update', 'reports', resolvedDocId, { timelineEvent: event });
      return;
    }

    try {
      const reportRef = doc(db, 'reports', resolvedDocId);
      const snapshot = await getDoc(reportRef);
      if (snapshot.exists()) {
        const existing = snapshot.data() as Report;
        await updateDoc(reportRef, {
          updatedAt: now,
          timeline: [...(existing.timeline || []), event],
        });
      } else {
        console.warn(
          `[ReportService] addTimelineEvent: Firestore document '${resolvedDocId}' (input parameter: '${reportId}') does not exist during updateDoc. Enqueuing for offline sync.`
        );
        syncService.enqueue('update', 'reports', resolvedDocId, { timelineEvent: event });
      }
    } catch (error) {
      syncService.enqueue('update', 'reports', resolvedDocId, { timelineEvent: event });
    }
  }

  /**
   * Soft deletes a report and removes orphaned attachments from Storage
   */
  async deleteReport(reportId: string, deletedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const target = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const resolvedDocId = target?.reportId || reportId;

    if (target) {
      target.isDeleted = true;
      target.deletedAt = now;
      target.deletedBy = deletedBy;
      if (target.imageUrls && target.imageUrls.length > 0) {
        storageService.deleteReportImages(target.imageUrls).catch((err) => {
          console.warn('[ReportService] Failed to clean storage images for deleted report:', err);
        });
      }
      saveLocalReports(localReportsStore);
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'REPORT_DELETED',
        module: 'Reports',
        targetId: resolvedDocId,
        targetType: 'Report',
        performedBy: deletedBy,
        performerRole: 'admin',
      })
      .catch((err) => console.warn('[ReportService] Audit log error:', err));

    try {
      const docRef = doc(db, 'reports', resolvedDocId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        await updateDoc(docRef, {
          isDeleted: true,
          deletedAt: now,
          deletedBy: deletedBy,
        });
      } else {
        console.warn(
          `[ReportService] deleteReport: Firestore document '${resolvedDocId}' (input parameter: '${reportId}') does not exist in database.`
        );
      }
    } catch (e) {
      console.warn('[ReportService] deleteReport online failed:', e);
    }
  }

  /**
   * Escalates an incident report to the Barangay Secretary
   */
  async escalateReport(
    reportId: string,
    remarks: string,
    performer: { uid: string; fullName: string; role: UserRole; dutyStatus?: DutyStatus; dutyMode?: DutyMode; jurisdiction?: string; purok?: string },
    isOnline: boolean = true
  ): Promise<Report> {
    const isDispatcher =
      performer.role === 'admin' ||
      performer.role === 'chairman' ||
      performer.role === 'secretary' ||
      (performer.role === 'purokOfficial' && performer.dutyStatus === 'onDuty' && performer.dutyMode === 'dispatcher');

    if (!isDispatcher) {
      throw new Error('Unauthorized: Only an active Dispatcher can escalate reports to the Secretary.');
    }

    const target = localReportsStore.find(
      (r) => r.reportId === reportId || (r.reportNumber && r.reportNumber === reportId)
    );
    const resolvedDocId = target?.reportId || reportId;

    let currentReport: Report | null = target || null;
    if (!currentReport && isOnline) {
      try {
        const docRef = doc(db, 'reports', resolvedDocId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          currentReport = snapshot.data() as Report;
        }
      } catch (e) {
        // fallback
      }
    }

    if (currentReport) {
      if (currentReport.status === 'resolved') {
        throw new Error('Unauthorized: Resolved reports cannot be escalated.');
      }
      if (currentReport.status === 'escalated') {
        throw new Error('This report has already been escalated to the Secretary.');
      }
    }

    if (performer.role === 'purokOfficial') {
      if (target) {
        const userJur = getUserJurisdiction(performer as any);
        const reportJur = getReportJurisdiction(target);
        const isOwner = isReportOwner(target, performer as any);
        const isAssigned = isReportAssignedTo(target, performer.uid);
        if (userJur && reportJur && !isSameJurisdiction(userJur, reportJur) && !isOwner && !isAssigned) {
          throw new Error('Unauthorized: Dispatchers can only escalate reports within their jurisdiction.');
        }
      }
    }

    const now = new Date().toISOString();
    const event: ReportTimelineEvent = {
      eventId: `evt-${Date.now()}`,
      action: 'Escalated to Secretary',
      performedBy: performer.uid,
      performedByName: performer.fullName,
      performedByRole: performer.role,
      remarks: remarks || 'Report escalated to Barangay Secretary for administrative review.',
      createdAt: now,
    };

    let createdBlotterId: string | undefined;

    // If neighborhood dispute and online, create or link a Blotter Case automatically.
    // Offline escalation preserves report escalation; Blotter synchronization is reconciled upon reconnect.
    if (isOnline && currentReport?.category === 'neighborhood_dispute') {
      try {
        const blotterCase = await blotterService.createBlotter(
          {
            complainantName: currentReport.isAnonymous ? 'Anonymous Resident' : currentReport.userName || 'Community Resident',
            complainantContact: '',
            complainantAddress: currentReport.location?.address || currentReport.purok || 'Barangay Central',
            respondentName: 'To be determined (Mediation)',
            respondentContact: '',
            respondentAddress: currentReport.location?.address || currentReport.purok || 'Barangay Central',
            incidentType: 'Neighborhood Dispute (Escalated)',
            incidentDate: currentReport.createdAt || now,
            incidentLocation: currentReport.location?.address || currentReport.purok || 'Barangay Central',
            purok: currentReport.purok || 'Purok 1',
            narrative: `[Escalated from Report #${currentReport.reportNumber} - ${currentReport.title}]\n\n${currentReport.description}\n\nEscalation Remarks: ${remarks}`,
            assignedOfficerName: performer.fullName || 'Barangay Secretary',
            status: 'open',
          },
          performer.uid
        );
        createdBlotterId = blotterCase.caseId;
      } catch (blotterErr) {
        console.warn('[ReportService] Auto-creation of blotter case on escalation failed:', blotterErr);
      }
    }

    const updates: Partial<Report> = {
      status: 'escalated',
      escalatedAt: now,
      escalatedBy: performer.uid,
      escalatedByName: performer.fullName,
      escalationRemarks: remarks,
      ...(createdBlotterId ? { blotterCaseId: createdBlotterId } : {}),
      updatedAt: now,
    };

    // Update in-memory cache
    if (target) {
      target.status = 'escalated';
      target.escalatedAt = now;
      target.escalatedBy = performer.uid;
      target.escalatedByName = performer.fullName;
      target.escalationRemarks = remarks;
      if (createdBlotterId) target.blotterCaseId = createdBlotterId;
      target.updatedAt = now;
      target.timeline = [...(target.timeline || []), event];
      saveLocalReports(localReportsStore);
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'REPORT_ESCALATED_TO_SECRETARY',
        module: 'Reports',
        targetId: resolvedDocId,
        targetType: 'Report',
        performedBy: performer.uid,
        performerName: performer.fullName,
        performerRole: performer.role,
        reason: remarks,
        previousValues: currentReport ? { status: currentReport.status } : undefined,
        newValues: {
          status: 'escalated',
          escalatedAt: now,
          escalatedBy: performer.uid,
          ...(createdBlotterId ? { blotterCaseId: createdBlotterId } : {}),
        },
      })
      .catch((err) => console.warn('[ReportService] Audit log error:', err));

    // Send notification to Secretary
    notificationService
      .createNotification({
        userId: 'staff_secretary',
        title: `Report Escalated: ${currentReport?.title || resolvedDocId}`,
        message: `Report #${currentReport?.reportNumber || resolvedDocId} (${currentReport?.category || 'Incident'}) was escalated to the Secretary by ${performer.fullName}. Reason: ${remarks}`,
        type: 'reportEscalated',
        priority: 'critical',
        reportId: resolvedDocId,
        createdBy: performer.uid,
      })
      .catch((err) => console.warn('[ReportService] Notification error:', err));

    if (!isOnline) {
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      return target || (currentReport ? { ...currentReport, ...updates } : ({} as Report));
    }

    try {
      const reportRef = doc(db, 'reports', resolvedDocId);
      const snapshot = await getDoc(reportRef);
      if (snapshot.exists()) {
        const existingData = snapshot.data() as Report;
        const updatedTimeline = [...(existingData.timeline || []), event];
        await updateDoc(reportRef, {
          ...updates,
          timeline: updatedTimeline,
        });
      } else {
        syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
      }
    } catch (error) {
      syncService.enqueue('update', 'reports', resolvedDocId, { ...updates, timelineEvent: event });
    }

    return target || (currentReport ? { ...currentReport, ...updates } : ({} as Report));
  }
}

export const reportService = new ReportService();
