/**
 * Service: BlotterService (Module 7)
 * Handles Barangay Peace & Order System, Blotter Cases, Mediation/Conciliation Hearings (Katarungang Pambarangay),
 * Certificate to File Action (CFA) issuing, and Audit logging.
 * Supports Firestore primary storage with SyncService offline queueing fallback.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { syncService } from './SyncService';
import { BlotterCase, BlotterStatus, HearingRecord, User } from '../types';
import { filterBlottersByAccess } from '../utils/jurisdictionUtils';
import { isResidentMode } from '../utils/permissions';
import { adminService } from './adminService';

const BLOTTER_COLLECTION = 'blotterCases';
const LOCAL_STORAGE_KEY = 'boims_offline_blotters_v1';

/**
 * Safely extract timestamp for sorting blotter cases in descending order (latest first, oldest last)
 */
function getBlotterTimestamp(b: BlotterCase): number {
  if (b.createdAt) {
    const t = new Date(b.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (b.incidentDate) {
    const t = new Date(b.incidentDate).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

/**
 * Sorts an array of BlotterCase records in DESCENDING order (latest first, oldest last)
 */
export function sortBlottersDescending(cases: BlotterCase[]): BlotterCase[] {
  return [...cases].sort((a, b) => {
    const timeA = getBlotterTimestamp(a);
    const timeB = getBlotterTimestamp(b);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (b.caseNumber || b.caseId || '').localeCompare(a.caseNumber || a.caseId || '');
  });
}

class BlotterService {
  private memoryCache: BlotterCase[] = [];

  private getLocalCache(): BlotterCase[] {
    return this.memoryCache;
  }

  private setLocalCache(data: BlotterCase[]): void {
    this.memoryCache = sortBlottersDescending(data);
  }

  /**
   * Fetch non-deleted blotter cases with jurisdiction authorization and optional pagination (latest first)
   */
  async getBlotters(
    currentUser?: User | null,
    options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null }
  ): Promise<BlotterCase[]> {
    let cases: BlotterCase[] = [];

    // Resolve active user context and role before making any Firestore query
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

    if (!auth.currentUser) {
      // Unauthenticated user: do NOT query Firestore. Return local cache.
      cases = sortBlottersDescending(this.getLocalCache().filter((item) => !item.isDeleted));
      if (userObj) {
        cases = filterBlottersByAccess(cases, userObj);
      }
      return cases;
    }

    const activeRole = userObj?.role || null;
    const isAuthorized = activeRole === 'secretary' || activeRole === 'chairman';

    if (!isAuthorized) {
      return [];
    }

    if (isAuthorized) {
      try {
        const constraints: QueryConstraint[] = [
          where('isDeleted', '==', false),
          orderBy('createdAt', 'desc'),
        ];

        if (options?.lastDoc) {
          constraints.push(startAfter(options.lastDoc));
        }
        if (options?.limitCount && options.limitCount > 0) {
          constraints.push(limit(options.limitCount));
        }

        let snapshot;
        try {
          const q = query(collection(db, BLOTTER_COLLECTION), ...constraints);
          snapshot = await getDocs(q);
        } catch (indexErr) {
          console.warn('[BlotterService] Constrained query failed, using basic fallback:', indexErr);
          const fallbackQ = query(collection(db, BLOTTER_COLLECTION), where('isDeleted', '==', false));
          snapshot = await getDocs(fallbackQ);
        }

        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as BlotterCase;
            if (!data.isDeleted) {
              cases.push(data);
            }
          });

          cases = sortBlottersDescending(cases);

          if (cases.length > 0) {
            this.setLocalCache(cases);
          }
        }
      } catch (error) {
        console.warn('[BlotterService] Firestore fetch failed or offline, using cache fallback:', error);
      }
    }

    if (cases.length === 0) {
      cases = sortBlottersDescending(this.getLocalCache().filter((item) => !item.isDeleted));
    } else {
      cases = sortBlottersDescending(cases);
    }

    if (userObj) {
      cases = filterBlottersByAccess(cases, userObj);
    }

    return cases;
  }

  /**
   * Fetch a single blotter case by caseId
   */
  async getBlotterById(caseId: string): Promise<BlotterCase | null> {
    try {
      const docRef = doc(db, BLOTTER_COLLECTION, caseId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as BlotterCase;
        if (!data.isDeleted) {
          return data;
        }
      }
    } catch (error) {
      console.warn('[BlotterService] getBlotterById offline fallback:', error);
    }

    const cached = this.getLocalCache();
    return cached.find((item) => item.caseId === caseId && !item.isDeleted) || null;
  }

  /**
   * Create a new Blotter Case
   */
  async createBlotter(
    data: Omit<BlotterCase, 'caseId' | 'caseNumber' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'createdBy'>,
    createdBy: string
  ): Promise<BlotterCase> {
    const existing = await this.getBlotters();
    const year = new Date().getFullYear();
    const prefix = `BLT-${year}-`;
    
    let maxSeq = 0;
    existing.forEach((item) => {
      if (item.caseNumber && item.caseNumber.startsWith(prefix)) {
        const seqNum = parseInt(item.caseNumber.replace(prefix, ''), 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });

    const nextSeqStr = (maxSeq + 1).toString().padStart(4, '0');
    const caseId = `${prefix}${nextSeqStr}`;
    const caseNumber = caseId;
    const now = new Date().toISOString();

    const newCase: BlotterCase = {
      ...data,
      caseId,
      caseNumber,
      status: data.status || 'open',
      hearings: [],
      createdAt: now,
      updatedAt: now,
      createdBy,
      isDeleted: false,
    };

    // Update local cache immediately
    const cache = this.getLocalCache();
    cache.unshift(newCase);
    this.setLocalCache(cache);

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'BLOTTER_CASE_CREATED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: createdBy,
        performerRole: 'secretary',
        newValues: { incidentType: newCase.incidentType, status: newCase.status, incidentLocation: newCase.incidentLocation },
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    // Attempt Firestore operation
    try {
      const docRef = doc(db, BLOTTER_COLLECTION, caseId);
      await setDoc(docRef, newCase);
    } catch (error) {
      console.warn('[BlotterService] Firestore setDoc failed, queuing for offline sync:', error);
      syncService.enqueue('create', BLOTTER_COLLECTION, caseId, newCase);
    }

    return newCase;
  }

  /**
   * Update Blotter Case
   */
  async updateBlotter(
    caseId: string,
    updates: Partial<BlotterCase>,
    updatedBy: string
  ): Promise<BlotterCase> {
    const now = new Date().toISOString();
    const cache = this.getLocalCache();
    const index = cache.findIndex((item) => item.caseId === caseId);

    if (index === -1) {
      throw new Error(`Blotter case ${caseId} not found.`);
    }

    const updatedCase: BlotterCase = {
      ...cache[index],
      ...updates,
      updatedAt: now,
      updatedBy,
    };

    cache[index] = updatedCase;
    this.setLocalCache(cache);

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'BLOTTER_CASE_UPDATED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: updatedBy,
        performerRole: 'secretary',
        newValues: updates,
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    try {
      const docRef = doc(db, BLOTTER_COLLECTION, caseId);
      await updateDoc(docRef, { ...updates, updatedAt: now, updatedBy });
    } catch (error) {
      console.warn('[BlotterService] Firestore updateDoc failed, queuing for offline sync:', error);
      syncService.enqueue('update', BLOTTER_COLLECTION, caseId, { ...updates, updatedAt: now, updatedBy });
    }

    return updatedCase;
  }

  /**
   * Schedule or add a Conciliation Hearing to a Blotter Case
   */
  async scheduleHearing(
    caseId: string,
    hearing: Omit<HearingRecord, 'hearingId' | 'createdAt' | 'createdBy'>,
    createdBy: string
  ): Promise<BlotterCase> {
    const current = await this.getBlotterById(caseId);
    if (!current) {
      throw new Error(`Blotter case ${caseId} not found.`);
    }

    const existingHearings = current.hearings || [];
    const hearingId = `HRG-${caseId.slice(-4)}-${(existingHearings.length + 1).toString().padStart(2, '0')}`;
    const newHearing: HearingRecord = {
      ...hearing,
      hearingId,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    const updatedHearings = [...existingHearings, newHearing];
    const hearingSchedule = `${hearing.scheduledDate}T${hearing.scheduledTime}:00Z`;

    adminService
      .logAuditEvent({
        action: 'BLOTTER_SCHEDULE_ADDED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: createdBy,
        performerRole: 'secretary',
        newValues: { hearingId, scheduledDate: hearing.scheduledDate, scheduledTime: hearing.scheduledTime },
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    return this.updateBlotter(
      caseId,
      {
        hearings: updatedHearings,
        status: 'scheduled',
        hearingSchedule,
      },
      createdBy
    );
  }

  /**
   * Issue Certificate to File Action (CFA - KP Form 20)
   */
  async issueCFA(caseId: string, issuedBy: string): Promise<BlotterCase> {
    const current = await this.getBlotterById(caseId);
    if (!current) {
      throw new Error(`Blotter case ${caseId} not found.`);
    }

    const year = new Date().getFullYear();
    const cfaControlNumber = `CFA-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    adminService
      .logAuditEvent({
        action: 'BLOTTER_CFA_ISSUED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: issuedBy,
        performerRole: 'secretary',
        newValues: { cfaControlNumber },
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    return this.updateBlotter(
      caseId,
      {
        cfaIssued: true,
        cfaIssuedAt: now,
        cfaControlNumber,
        status: 'closed',
        resolutionSummary: `Certificate to File Action (CFA - KP Form 20) issued on ${new Date().toLocaleDateString()} with Control No. ${cfaControlNumber}.`,
      },
      issuedBy
    );
  }

  /**
   * Resolve Blotter Case
   */
  async resolveCase(
    caseId: string,
    resolutionSummary: string,
    resolvedBy: string
  ): Promise<BlotterCase> {
    adminService
      .logAuditEvent({
        action: 'BLOTTER_RESOLUTION_ADDED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: resolvedBy,
        performerRole: 'secretary',
        newValues: { status: 'resolved', resolutionSummary },
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    return this.updateBlotter(
      caseId,
      {
        status: 'resolved',
        resolutionSummary,
      },
      resolvedBy
    );
  }

  /**
   * Soft Delete Blotter Case
   */
  async deleteBlotter(caseId: string, deletedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const cache = this.getLocalCache();
    const index = cache.findIndex((item) => item.caseId === caseId);

    if (index !== -1) {
      cache[index].isDeleted = true;
      cache[index].deletedAt = now;
      cache[index].deletedBy = deletedBy;
      this.setLocalCache(cache);
    }

    adminService
      .logAuditEvent({
        action: 'BLOTTER_CASE_DELETED',
        module: 'Blotter',
        targetId: caseId,
        targetType: 'BlotterCase',
        performedBy: deletedBy,
        performerRole: 'admin',
      })
      .catch((err) => console.warn('[BlotterService] Audit log error:', err));

    try {
      const docRef = doc(db, BLOTTER_COLLECTION, caseId);
      await updateDoc(docRef, { isDeleted: true, deletedAt: now, deletedBy });
    } catch (error) {
      console.warn('[BlotterService] Firestore delete failed, queuing for offline sync:', error);
      syncService.enqueue('delete', BLOTTER_COLLECTION, caseId, { isDeleted: true, deletedAt: now, deletedBy });
    }
  }
}

export const blotterService = new BlotterService();
