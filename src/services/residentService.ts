/**
 * Service: ResidentService (Module 6)
 * Handles Master Resident Directory, ID Verification, Household Links, and Demographics Engine.
 * Supports Firestore primary persistence with SyncService offline queueing fallback.
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
  onSnapshot,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { syncService } from './SyncService';
import { adminService } from './adminService';
import { notificationService } from './notificationService';
import {
  ResidentProfile,
  Household,
  HouseholdMember,
  PendingHouseholdChangeRequest,
  HouseholdVerificationStatus,
  HouseholdNumberChangeRequest,
  HouseholdNumberChangeRequestStatus,
  DemographicSummary,
  ResidentVerificationStatus,
  VoterStatus,
  ResidentSector,
  ResidencyStatus,
  User,
  UserRole,
} from '../types';
import { APP_METADATA } from '../constants';
import { filterResidentsByAccess, filterHouseholdsByAccess } from '../utils/jurisdictionUtils';
import { isResidentMode } from '../utils/permissions';

const RESIDENTS_COLLECTION = 'residents';
const HOUSEHOLDS_COLLECTION = 'households';
const LOCAL_RESIDENTS_KEY = 'boims_offline_residents_v1';
const LOCAL_HOUSEHOLDS_KEY = 'boims_offline_households_v1';

const SEED_RESIDENTS: ResidentProfile[] = [];
const SEED_HOUSEHOLDS: Household[] = [];

class ResidentService {
  private memoryResidents: ResidentProfile[] = [];
  private memoryHouseholds: Household[] = [];

  // Local storage cache helpers
  private getLocalResidents(): ResidentProfile[] {
    return this.memoryResidents;
  }

  private saveLocalResidents(data: ResidentProfile[]): void {
    this.memoryResidents = data;
  }

  private getLocalHouseholds(): Household[] {
    return this.memoryHouseholds;
  }

  private saveLocalHouseholds(data: Household[]): void {
    this.memoryHouseholds = data;
  }

  /**
   * Fetch master list of residents with multi-criteria filtering
   */
  async getResidents(filters?: {
    purok?: string;
    sector?: ResidentSector | 'all';
    voterStatus?: VoterStatus | 'all';
    verificationStatus?: ResidentVerificationStatus | 'all';
    residencyStatus?: ResidencyStatus | 'all';
    searchQuery?: string;
    currentUser?: User | null;
    limitCount?: number;
    lastDoc?: DocumentSnapshot | null;
  }): Promise<ResidentProfile[]> {
    let residents: ResidentProfile[] = [];

    // Resolve active user context and role before making any Firestore query
    let userObj: User | null = filters?.currentUser || null;
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
      residents = this.getLocalResidents();
      if (userObj) {
        residents = filterResidentsByAccess(residents, userObj);
      }
      return residents.filter((r) => !r.isDeleted).sort((a, b) => a.fullName.localeCompare(b.fullName));
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

    try {
      const colRef = collection(db, RESIDENTS_COLLECTION);

      if (!isConfirmedStaff) {
        // Resident, non-staff, or unresolved role: DIRECTLY execute user-scoped query to prevent permission-denied
        const q = query(
          colRef,
          where('linkedUserId', '==', auth.currentUser.uid),
          where('isDeleted', '==', false)
        );
        try {
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            residents = snapshot.docs.map((doc) => ({
              residentId: doc.id,
              ...doc.data(),
            })) as ResidentProfile[];
          } else {
            residents = this.getLocalResidents();
          }
        } catch (err) {
          console.warn('[ResidentService] Scoped query failed:', err);
          residents = this.getLocalResidents();
        }
      } else {
        // Confirmed staff/admin: execute authorized collection query
        const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];

        if (filters?.purok && filters.purok !== 'all') {
          constraints.push(where('purok', '==', filters.purok));
        }
        if (filters?.voterStatus && filters.voterStatus !== 'all') {
          constraints.push(where('voterStatus', '==', filters.voterStatus));
        }
        if (filters?.verificationStatus && filters.verificationStatus !== 'all') {
          constraints.push(where('verificationStatus', '==', filters.verificationStatus));
        }
        if (filters?.residencyStatus && filters.residencyStatus !== 'all') {
          constraints.push(where('residencyStatus', '==', filters.residencyStatus));
        }
        if (filters?.lastDoc) {
          constraints.push(startAfter(filters.lastDoc));
        }
        if (filters?.limitCount && filters.limitCount > 0) {
          constraints.push(limit(filters.limitCount));
        }

        let snapshot;
        try {
          const q = query(colRef, ...constraints);
          snapshot = await getDocs(q);
        } catch (indexErr) {
          console.warn('[ResidentService] Constrained query failed (missing index or offline), falling back to basic query:', indexErr);
          const fallbackQ = query(colRef, where('isDeleted', '==', false));
          snapshot = await getDocs(fallbackQ);
        }

        if (!snapshot.empty) {
          residents = snapshot.docs.map((doc) => ({
            residentId: doc.id,
            ...doc.data(),
          })) as ResidentProfile[];
          this.saveLocalResidents(residents);
        } else {
          residents = this.getLocalResidents();
        }
      }
    } catch (err) {
      console.warn('[ResidentService] Offline fallback for getResidents:', err);
      residents = this.getLocalResidents();
    }

    // Exclude deleted residents
    residents = residents.filter((r) => !r.isDeleted);

    // Apply jurisdiction & role access filtering if userObj resolved
    if (userObj) {
      residents = filterResidentsByAccess(residents, userObj);
    }

    // Filter by Purok
    if (filters?.purok && filters.purok !== 'all') {
      residents = residents.filter((r) => r.purok === filters.purok);
    }

    // Filter by Sector
    if (filters?.sector && filters.sector !== 'all') {
      residents = residents.filter((r) => r.sectors?.includes(filters.sector as ResidentSector));
    }

    // Filter by Voter Status
    if (filters?.voterStatus && filters.voterStatus !== 'all') {
      residents = residents.filter((r) => r.voterStatus === filters.voterStatus);
    }

    // Filter by Verification Status
    if (filters?.verificationStatus && filters.verificationStatus !== 'all') {
      residents = residents.filter((r) => r.verificationStatus === filters.verificationStatus);
    }

    // Filter by Residency Status
    if (filters?.residencyStatus && filters.residencyStatus !== 'all') {
      residents = residents.filter((r) => r.residencyStatus === filters.residencyStatus);
    }

    // Filter by Search Query
    if (filters?.searchQuery?.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      residents = residents.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.residentId.toLowerCase().includes(q) ||
          r.address.toLowerCase().includes(q) ||
          r.contactNumber.includes(q) ||
          r.idNumber?.toLowerCase().includes(q)
      );
    }

    // Sort by name
    return residents.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * Fetch single resident profile
   */
  async getResidentById(residentId: string): Promise<ResidentProfile | null> {
    try {
      const docRef = doc(db, RESIDENTS_COLLECTION, residentId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        return { residentId: snap.id, ...snap.data() } as ResidentProfile;
      }
    } catch (err) {
      console.warn('[ResidentService] Offline fallback for getResidentById:', err);
    }

    const locals = this.getLocalResidents();
    return locals.find((r) => r.residentId === residentId) || null;
  }

  /**
   * Create new resident profile
   */
  async createResident(
    data: Omit<ResidentProfile, 'residentId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'createdBy'>,
    createdBy: string
  ): Promise<ResidentProfile> {
    const id = `RES-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const newResident: ResidentProfile = {
      ...data,
      residentId: id,
      fullName: `${data.firstName} ${data.middleName ? data.middleName + ' ' : ''}${data.lastName}${
        data.suffix ? ' ' + data.suffix : ''
      }`,
      verificationStatus: data.verificationStatus || 'unverified',
      residencyStatus: data.residencyStatus || 'active',
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy || 'system',
    };

    // Save locally first
    const locals = this.getLocalResidents();
    locals.unshift(newResident);
    this.saveLocalResidents(locals);

    // Save to Firestore with sync fallback
    try {
      const docRef = doc(db, RESIDENTS_COLLECTION, id);
      await setDoc(docRef, newResident);
    } catch (error) {
      console.warn('[ResidentService] Queueing offline create resident:', error);
      syncService.enqueue('create', RESIDENTS_COLLECTION, id, newResident);
    }

    return newResident;
  }

  /**
   * Update resident profile details
   */
  async updateResident(
    residentId: string,
    updates: Partial<ResidentProfile>,
    updatedBy: string
  ): Promise<ResidentProfile> {
    const now = new Date().toISOString();

    const current = await this.getResidentById(residentId);
    if (!current) throw new Error('Resident profile not found.');

    const updatedResident: ResidentProfile = {
      ...current,
      ...updates,
      updatedAt: now,
      updatedBy,
    };

    // Recompute full name if name fields updated
    if (updates.firstName || updates.lastName || updates.middleName || updates.suffix) {
      updatedResident.fullName = `${updatedResident.firstName} ${
        updatedResident.middleName ? updatedResident.middleName + ' ' : ''
      }${updatedResident.lastName}${updatedResident.suffix ? ' ' + updatedResident.suffix : ''}`;
    }

    // Update local cache
    const locals = this.getLocalResidents();
    const index = locals.findIndex((r) => r.residentId === residentId);
    if (index !== -1) {
      locals[index] = updatedResident;
      this.saveLocalResidents(locals);
    }

    // Update Firestore
    try {
      const docRef = doc(db, RESIDENTS_COLLECTION, residentId);
      await updateDoc(docRef, updatedResident as any);
    } catch (error) {
      console.warn('[ResidentService] Queueing offline update resident:', error);
      syncService.enqueue('update', RESIDENTS_COLLECTION, residentId, updatedResident);
    }

    return updatedResident;
  }

  /**
   * Verify or reject resident ID verification status (Staff Action)
   */
  async verifyResidentStatus(
    residentId: string,
    status: 'verified' | 'rejected',
    verifiedBy: string,
    rejectionReason?: string
  ): Promise<ResidentProfile> {
    const now = new Date().toISOString();
    const updateData: Partial<ResidentProfile> = {
      verificationStatus: status,
      verifiedBy,
    };
    if (status === 'verified') {
      updateData.verifiedAt = now;
    } else if (rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    return this.updateResident(
      residentId,
      updateData,
      verifiedBy
    );
  }

  /**
   * Soft delete resident profile
   */
  async deleteResident(residentId: string, deletedBy: string): Promise<void> {
    const now = new Date().toISOString();

    // Local soft delete
    const locals = this.getLocalResidents();
    const updated = locals.map((r) => (r.residentId === residentId ? { ...r, isDeleted: true, updatedAt: now } : r));
    this.saveLocalResidents(updated);

    try {
      const docRef = doc(db, RESIDENTS_COLLECTION, residentId);
      await updateDoc(docRef, { isDeleted: true, updatedAt: now });
    } catch (error) {
      console.warn('[ResidentService] Queueing offline delete resident:', error);
      syncService.enqueue('update', RESIDENTS_COLLECTION, residentId, { isDeleted: true, updatedAt: now });
    }
  }

  // ==========================================
  // HOUSEHOLD DIRECTORY & SELF-SERVICE METHODS
  // ==========================================

  /**
   * Realtime subscription for Households collection
   */
  subscribeToHouseholds(
    currentUser: User | null,
    callback: (households: Household[]) => void,
    filters?: { purok?: string; searchQuery?: string }
  ): () => void {
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
      callback([]);
      return () => {};
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

    const isConfirmedStaff = Boolean(auth.currentUser && activeRole && staffRoles.includes(activeRole) && !isResidentRole);

    // PRIMARY PATH: Direct subscription to specific household document if user has householdId
    if (userObj?.householdId) {
      try {
        const targetHHId = userObj.householdId;
        const docRef = doc(db, HOUSEHOLDS_COLLECTION, targetHHId);
        return onSnapshot(
          docRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const hData = { householdId: docSnap.id, ...docSnap.data() } as Household;
              if (!hData.isDeleted) {
                callback([hData]);
                return;
              }
            }
            callback([]);
          },
          (error) => {
            console.warn('[ResidentService] Realtime single household doc error, fallback to local:', error);
            const locals = this.getLocalHouseholds().filter(
              (h) => !h.isDeleted && h.householdId === targetHHId
            );
            callback(locals);
          }
        );
      } catch (err) {
        console.warn('[ResidentService] Failed setting up listener for single household:', err);
        const targetHHId = userObj?.householdId;
        const locals = this.getLocalHouseholds().filter(
          (h) => !h.isDeleted && h.householdId === targetHHId
        );
        callback(locals);
        return () => {};
      }
    }

    // FALLBACK PATH: User does not have householdId yet or collection listener requested
    try {
      const colRef = collection(db, HOUSEHOLDS_COLLECTION);
      let q;

      if (!isConfirmedStaff) {
        // Resident / Non-Staff / Unresolved role: Member-scoped query strictly
        q = query(
          colRef,
          where('memberResidentIds', 'array-contains', auth.currentUser.uid),
          where('isDeleted', '==', false)
        );
      } else {
        // Official in Duty Mode: Broad query for staff/admin with optional purok filter
        const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];
        if (filters?.purok && filters.purok !== 'all') {
          constraints.push(where('purok', '==', filters.purok));
        }
        q = query(colRef, ...constraints);
      }

      return onSnapshot(
        q,
        (snapshot) => {
          let households = snapshot.docs.map((doc) => ({
            householdId: doc.id,
            ...doc.data(),
          })) as Household[];

          this.saveLocalHouseholds(households);

          households = households.filter((h) => !h.isDeleted);

          if (userObj) {
            households = filterHouseholdsByAccess(households, userObj);
          }

          if (filters?.purok && filters.purok !== 'all') {
            households = households.filter((h) => h.purok === filters.purok);
          }

          if (filters?.searchQuery?.trim()) {
            const searchQ = filters.searchQuery.toLowerCase().trim();
            households = households.filter(
              (h) =>
                h.householdHeadName.toLowerCase().includes(searchQ) ||
                h.householdNumber.toLowerCase().includes(searchQ) ||
                h.address.toLowerCase().includes(searchQ) ||
                h.members?.some((m) => m.fullName.toLowerCase().includes(searchQ))
            );
          }

          households.sort((a, b) => a.householdNumber.localeCompare(b.householdNumber));

          // Auto-link householdId on user profile if found via fallback query for resident
          if (!isConfirmedStaff && households.length > 0 && auth.currentUser?.uid && !userObj?.householdId) {
            const foundHH = households[0];
            if (foundHH && foundHH.householdId) {
              updateDoc(doc(db, 'users', auth.currentUser.uid), {
                householdId: foundHH.householdId,
                householdNumber: foundHH.householdNumber || '',
                updatedAt: new Date().toISOString(),
              }).catch((uErr) => console.warn('[ResidentService] Auto-link householdId to user failed:', uErr));
            }
          }

          callback(households);
        },
        (error) => {
          console.warn('[ResidentService] Realtime household subscription error, using local fallback:', error);
          let locals = this.getLocalHouseholds().filter((h) => !h.isDeleted);
          if (userObj) {
            locals = filterHouseholdsByAccess(locals, userObj);
          }
          callback(locals);
        }
      );
    } catch (err) {
      console.warn('[ResidentService] Failed to set up snapshot listener for households:', err);
      let locals = this.getLocalHouseholds().filter((h) => !h.isDeleted);
      if (userObj) {
        locals = filterHouseholdsByAccess(locals, userObj);
      }
      callback(locals);
      return () => {};
    }
  }

  /**
   * Get Master Household list
   */
  async getHouseholds(filters?: {
    purok?: string;
    searchQuery?: string;
    currentUser?: User | null;
    limitCount?: number;
    lastDoc?: DocumentSnapshot | null;
  }): Promise<Household[]> {
    let households: Household[] = [];

    // Resolve active user context and role before making any Firestore query
    let userObj: User | null = filters?.currentUser || null;
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
      households = this.getLocalHouseholds();
      if (userObj) {
        households = filterHouseholdsByAccess(households, userObj);
      }
      return households
        .filter((h) => !h.isDeleted)
        .sort((a, b) => a.householdNumber.localeCompare(b.householdNumber));
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

    try {
      const colRef = collection(db, HOUSEHOLDS_COLLECTION);

      if (!isConfirmedStaff) {
        // Resident, non-staff, or unresolved role: DIRECTLY execute member-scoped query to prevent permission-denied
        const q = query(
          colRef,
          where('memberResidentIds', 'array-contains', auth.currentUser.uid),
          where('isDeleted', '==', false)
        );
        try {
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            households = snapshot.docs.map((doc) => ({
              householdId: doc.id,
              ...doc.data(),
            })) as Household[];
          } else {
            households = this.getLocalHouseholds();
          }
        } catch (err) {
          console.warn('[ResidentService] Member-scoped household query failed:', err);
          households = this.getLocalHouseholds();
        }
      } else {
        // Confirmed staff/admin: execute authorized collection query
        const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];

        if (filters?.purok && filters.purok !== 'all') {
          constraints.push(where('purok', '==', filters.purok));
        }
        if (filters?.lastDoc) {
          constraints.push(startAfter(filters.lastDoc));
        }
        if (filters?.limitCount && filters.limitCount > 0) {
          constraints.push(limit(filters.limitCount));
        }

        let snapshot;
        try {
          const q = query(colRef, ...constraints);
          snapshot = await getDocs(q);
        } catch (indexErr) {
          console.warn('[ResidentService] Constrained household query failed, falling back to basic query:', indexErr);
          const fallbackQ = query(colRef, where('isDeleted', '==', false));
          snapshot = await getDocs(fallbackQ);
        }

        if (!snapshot.empty) {
          households = snapshot.docs.map((doc) => ({
            householdId: doc.id,
            ...doc.data(),
          })) as Household[];
          this.saveLocalHouseholds(households);
        } else {
          households = this.getLocalHouseholds();
        }
      }
    } catch (err) {
      console.warn('[ResidentService] Offline fallback for getHouseholds:', err);
      households = this.getLocalHouseholds();
    }

    households = households.filter((h) => !h.isDeleted);

    if (userObj) {
      households = filterHouseholdsByAccess(households, userObj);
    }

    if (filters?.purok && filters.purok !== 'all') {
      households = households.filter((h) => h.purok === filters.purok);
    }

    if (filters?.searchQuery?.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      households = households.filter(
        (h) =>
          h.householdHeadName.toLowerCase().includes(q) ||
          h.householdNumber.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q) ||
          h.members?.some((m) => m.fullName.toLowerCase().includes(q))
      );
    }

    return households.sort((a, b) => a.householdNumber.localeCompare(b.householdNumber));
  }

  /**
   * Get household belonging to a specific user (Resident self-service lookup)
   */
  async getHouseholdByUserId(userId: string): Promise<Household | null> {
    let userObj: User | null = null;
    try {
      const cachedUser = localStorage.getItem('boims_active_user');
      if (cachedUser) {
        userObj = JSON.parse(cachedUser);
      }
    } catch (e) {
      // ignore
    }

    if (!auth.currentUser) {
      // Unauthenticated user: do NOT query Firestore. Return from local cache.
      const localHHs = this.getLocalHouseholds();
      return (
        localHHs.find(
          (h) =>
            !h.isDeleted &&
            (h.householdHeadId === userId ||
              h.createdBy === userId ||
              h.members?.some((m) => m.residentId === userId || m.fullName === userId))
        ) || null
      );
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

    const colRef = collection(db, HOUSEHOLDS_COLLECTION);

    if (!isConfirmedStaff) {
      // Resident / non-staff / unresolved role: use memberResidentIds scoped query with auth.currentUser.uid
      const targetUid = auth.currentUser.uid;
      try {
        const q = query(
          colRef,
          where('memberResidentIds', 'array-contains', targetUid),
          where('isDeleted', '==', false),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          return { householdId: snap.docs[0].id, ...snap.docs[0].data() } as Household;
        }
      } catch (err) {
        console.warn('[ResidentService] Scoped getHouseholdByUserId failed:', err);
      }

      // Local fallback for Resident (without calling getHouseholds)
      const localHHs = this.getLocalHouseholds();
      return (
        localHHs.find(
          (h) =>
            !h.isDeleted &&
            (h.householdHeadId === targetUid ||
              h.createdBy === targetUid ||
              h.members?.some((m) => m.residentId === targetUid || m.fullName === targetUid))
        ) || null
      );
    }

    // Confirmed Staff / Admin: query using createdBy or fall back
    try {
      const q = query(colRef, where('createdBy', '==', userId), where('isDeleted', '==', false), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { householdId: snap.docs[0].id, ...snap.docs[0].data() } as Household;
      }
    } catch (err) {
      console.warn('[ResidentService] Direct getHouseholdByUserId failed, falling back to cache:', err);
    }

    const all = await this.getHouseholds();
    return (
      all.find(
        (h) =>
          !h.isDeleted &&
          (h.householdHeadId === userId ||
            h.createdBy === userId ||
            h.members?.some((m) => m.residentId === userId || m.fullName === userId))
      ) || null
    );
  }

  /**
   * Get single household by ID
   */
  async getHouseholdById(householdId: string): Promise<Household | null> {
    try {
      const docRef = doc(db, HOUSEHOLDS_COLLECTION, householdId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { householdId: snap.id, ...snap.data() } as Household;
      }
    } catch (err) {
      console.warn('[ResidentService] Offline fallback for getHouseholdById:', err);
    }

    const locals = this.getLocalHouseholds();
    return locals.find((h) => h.householdId === householdId) || null;
  }

  /**
   * Calculate Household Profile Completion Percentage dynamically
   */
  getHouseholdCompletionPercentage(household: Partial<Household>): number {
    let completedPoints = 0;
    const totalPoints = 10;

    if (household.householdHeadName?.trim()) completedPoints += 1;
    if (household.address?.trim()) completedPoints += 1;
    if (household.purok?.trim()) completedPoints += 1;
    if (household.houseOwnership) completedPoints += 1;
    if (household.buildingType) completedPoints += 1;
    if (household.waterSource) completedPoints += 1;
    if (household.sanitationFacility) completedPoints += 1;
    if (household.electricityAvailability) completedPoints += 1;
    if (household.internetAvailability) completedPoints += 1;
    if (household.monthlyIncomeBracket) completedPoints += 1;

    return Math.round((completedPoints / totalPoints) * 100);
  }

  /**
   * Utility: Compute age from birthdate string YYYY-MM-DD
   */
  computeAgeFromBirthdate(birthdate?: string): number {
    if (!birthdate) return 0;
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  /**
   * Create new Household (Supports Draft and Pending Verification save modes)
   */
  async createHousehold(
    data: Omit<Household, 'householdId' | 'householdNumber' | 'createdAt' | 'updatedAt' | 'createdBy'>,
    createdBy: string,
    isResidentCreator?: boolean,
    isDraft?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household> {
    const currentYear = new Date().getFullYear();
    const id = `HH-${Date.now().toString().slice(-6)}`;
    const hhNum = `HH-${currentYear}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    let verificationStatus: HouseholdVerificationStatus = 'approved';
    let isVerified = true;

    if (isDraft) {
      verificationStatus = 'draft';
      isVerified = false;
    }

    // Ensure memberResidentIds contains createdBy if valid uid
    let memberResidentIds = data.memberResidentIds || [];
    if (createdBy && createdBy !== 'system' && !memberResidentIds.includes(createdBy)) {
      memberResidentIds = [...memberResidentIds, createdBy];
    }

    const newHousehold: Household = {
      ...data,
      householdId: id,
      householdNumber: hhNum,
      memberResidentIds,
      verificationStatus,
      isVerified,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy || 'system',
      isDeleted: false,
      submittedAt: now,
      ...(isVerified ? { verifiedAt: now, verifiedBy: createdBy || 'system' } : {}),
    };

    // Filter out any undefined values so setDoc does not throw
    const firestoreData = Object.fromEntries(
      Object.entries(newHousehold).filter(([_, v]) => v !== undefined)
    );

    const locals = this.getLocalHouseholds();
    locals.unshift(newHousehold);
    this.saveLocalHouseholds(locals);

    try {
      const docRef = doc(db, HOUSEHOLDS_COLLECTION, id);
      await setDoc(docRef, firestoreData);

      // Index household number globally
      this.syncHouseholdNumberIndex(id, hhNum, false).catch(() => {});

      // Link householdId to user's profile document
      if (createdBy && createdBy !== 'system') {
        try {
          const userDocRef = doc(db, 'users', createdBy);
          await updateDoc(userDocRef, {
            householdId: id,
            householdNumber: hhNum,
            updatedAt: now,
          });
        } catch (uErr) {
          console.warn('[ResidentService] Updating user profile with householdId failed (non-fatal):', uErr);
        }
      }
    } catch (error) {
      console.warn('[ResidentService] Queueing offline create household:', error);
      syncService.enqueue('create', HOUSEHOLDS_COLLECTION, id, firestoreData);
    }

    // Audit Log Entry
    adminService.logAuditEvent({
      action: isDraft ? 'Household Draft Saved' : 'Household Created',
      module: 'Household Registry',
      targetId: id,
      targetType: 'Household',
      performedBy: createdBy,
      performerName: performerName || data.householdHeadName,
      performerRole: userRole,
      newValues: {
        householdNumber: hhNum,
        householdHeadName: data.householdHeadName,
        purok: data.purok,
        verificationStatus,
      },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return newHousehold;
  }

  /**
   * Update existing Household
   * If household is already verified and updated by Resident, creates a Pending Household Change Request instead.
   */
  async updateHousehold(
    householdId: string,
    updates: Partial<Household>,
    updatedBy: string,
    isResident?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const existing = await this.getHouseholdById(householdId);
    if (!existing) return null;

    const now = new Date().toISOString();

    // Check if editing a verified household as a Resident
    if (isResident && (existing.isVerified || existing.verificationStatus === 'approved')) {
      const pendingChangeRequest: PendingHouseholdChangeRequest = {
        requestId: `REQ-${Date.now().toString().slice(-6)}`,
        submittedAt: now,
        submittedBy: updatedBy,
        status: 'pending',
        proposedChanges: updates,
      };

      const updatedHousehold: Household = {
        ...existing,
        pendingChangeRequest,
        updatedAt: now,
        updatedBy,
      };

      const locals = this.getLocalHouseholds();
      const idx = locals.findIndex((h) => h.householdId === householdId);
      if (idx !== -1) locals[idx] = updatedHousehold;
      this.saveLocalHouseholds(locals);

      try {
        const docRef = doc(db, HOUSEHOLDS_COLLECTION, householdId);
        await updateDoc(docRef, { pendingChangeRequest, updatedAt: now, updatedBy });
      } catch (error) {
        console.warn('[ResidentService] Queueing offline change request update:', error);
        syncService.enqueue('update', HOUSEHOLDS_COLLECTION, householdId, { pendingChangeRequest, updatedAt: now, updatedBy });
      }

      // Audit Log Entry
      adminService.logAuditEvent({
        action: 'Household Change Requested',
        module: 'Household Registry',
        targetId: householdId,
        targetType: 'Household',
        performedBy: updatedBy,
        performerName,
        performerRole: userRole,
        previousValues: { householdHeadName: existing.householdHeadName, address: existing.address },
        newValues: updates,
      }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

      return updatedHousehold;
    }

    // Direct update for unverified household or Staff edits
    const updated: Household = {
      ...existing,
      ...updates,
      updatedAt: now,
      updatedBy,
    };

    const locals = this.getLocalHouseholds();
    const idx = locals.findIndex((h) => h.householdId === householdId);
    if (idx !== -1) {
      locals[idx] = updated;
    } else {
      locals.unshift(updated);
    }
    this.saveLocalHouseholds(locals);

    try {
      const docRef = doc(db, HOUSEHOLDS_COLLECTION, householdId);
      await updateDoc(docRef, { ...updates, updatedAt: now, updatedBy });

      if (updates.householdNumber) {
        this.syncHouseholdNumberIndex(householdId, updates.householdNumber, false).catch(() => {});
      }
    } catch (error) {
      console.warn('[ResidentService] Queueing offline update household:', error);
      syncService.enqueue('update', HOUSEHOLDS_COLLECTION, householdId, { ...updates, updatedAt: now, updatedBy });
    }

    // Audit Log Entry
    adminService.logAuditEvent({
      action: 'Household Updated',
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: updatedBy,
      performerName,
      performerRole: userRole,
      previousValues: { householdHeadName: existing.householdHeadName, address: existing.address },
      newValues: updates,
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updated;
  }

  /**
   * Submit household for verification by Resident
   */
  async submitHouseholdForVerification(
    householdId: string,
    updatedBy: string,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const now = new Date().toISOString();
    const updated = await this.updateHousehold(
      householdId,
      {
        verificationStatus: 'approved',
        isVerified: true,
        submittedAt: now,
        verifiedAt: now,
        verifiedBy: updatedBy || 'system',
      },
      updatedBy,
      false,
      userRole,
      performerName
    );

    if (updated) {
      adminService.logAuditEvent({
        action: 'Household Registered',
        module: 'Household Registry',
        targetId: householdId,
        targetType: 'Household',
        performedBy: updatedBy,
        performerName,
        performerRole: userRole,
        newValues: { status: 'approved', isVerified: true },
      }).catch((err) => console.warn('[ResidentService] Audit log error:', err));
    }

    return updated;
  }

  /**
   * Helper: Normalize Household Number (uppercase, trimmed)
   */
  normalizeHouseholdNumber(num: string): string {
    return (num || '').trim().toUpperCase();
  }

  /**
   * Helper: Sync household number index document in Firestore
   */
  async syncHouseholdNumberIndex(householdId: string, householdNumber: string, isDeleted: boolean = false): Promise<void> {
    const norm = this.normalizeHouseholdNumber(householdNumber);
    if (!norm || norm === 'HH-PENDING') return;
    try {
      const indexRef = doc(db, 'householdNumbers', norm);
      if (isDeleted) {
        await updateDoc(indexRef, { isDeleted: true, updatedAt: new Date().toISOString() });
      } else {
        await setDoc(indexRef, {
          householdId,
          householdNumber,
          normalizedHouseholdNumber: norm,
          isDeleted: false,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err) {
      console.warn('[ResidentService] Index sync warning:', err);
    }
  }

  /**
   * Check if a household number is available globally (not owned by another active household)
   */
  async checkHouseholdNumberAvailability(
    requestedNumber: string,
    currentHouseholdId?: string
  ): Promise<{ available: boolean; conflictingHousehold?: Household; conflictingHouseholdId?: string; error?: string }> {
    const norm = this.normalizeHouseholdNumber(requestedNumber);
    if (!norm) return { available: false, error: 'Invalid household number.' };

    try {
      const indexRef = doc(db, 'householdNumbers', norm);
      const indexSnap = await getDoc(indexRef);

      if (indexSnap.exists()) {
        const indexData = indexSnap.data();
        if (indexData && !indexData.isDeleted) {
          // If the entry belongs to the current household, it is available (retaining or re-entering own assigned number)
          if (indexData.householdId === currentHouseholdId) {
            return { available: true };
          }

          let conflictingHH: Household | undefined = undefined;
          try {
            const hhSnap = await getDoc(doc(db, HOUSEHOLDS_COLLECTION, indexData.householdId));
            if (hhSnap.exists()) {
              conflictingHH = hhSnap.data() as Household;
            }
          } catch (_) {
            // Privacy boundary: Resident callers cannot read full profile of another household
          }

          return {
            available: false,
            conflictingHouseholdId: indexData.householdId,
            conflictingHousehold: conflictingHH || ({
              householdId: indexData.householdId,
              householdNumber: indexData.householdNumber || norm,
              householdHeadName: 'Existing Registered Household',
            } as Household),
          };
        }
      } else {
        // Index entry does not exist in householdNumbers collection yet.
        // For staff users (or when households are accessible), perform secondary check on households collection
        // to handle legacy documents created before index sync was introduced.
        let userObj: User | null = null;
        try {
          const cachedUser = localStorage.getItem('boims_active_user');
          if (cachedUser) userObj = JSON.parse(cachedUser);
        } catch (e) {}

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
        const isConfirmedStaff = Boolean(auth.currentUser && activeRole && staffRoles.includes(activeRole) && !isResidentRole);

        let households: Household[] = [];
        if (isConfirmedStaff) {
          try {
            const snap = await getDocs(query(collection(db, HOUSEHOLDS_COLLECTION)));
            if (!snap.empty) {
              households = snap.docs.map((d) => d.data() as Household);
            }
          } catch (_) {
            // Silent permission restriction for non-staff callers
          }
        } else {
          households = this.getLocalHouseholds();
        }

        const match = households.find(
          (h) =>
            !h.isDeleted &&
            h.householdId !== currentHouseholdId &&
            this.normalizeHouseholdNumber(h.householdNumber) === norm
        );

        if (match) {
          // Auto-sync missing index entry for future fast lookups
          this.syncHouseholdNumberIndex(match.householdId, match.householdNumber, false).catch(() => {});
          return {
            available: false,
            conflictingHouseholdId: match.householdId,
            conflictingHousehold: match,
          };
        }
      }

      // Authoritative lookup succeeded and confirmed number is unassigned
      return { available: true };
    } catch (err: any) {
      console.error('[ResidentService] Authoritative availability check error:', err);
      // FAIL CLOSED: Do NOT default or fall back to "available: true" when an authoritative lookup fails
      return {
        available: false,
        error: 'Unable to verify household number availability. Please check your connection and try again.',
      };
    }
  }

  /**
   * Get pending change request for a household if any
   */
  async getPendingHouseholdNumberChangeRequest(
    householdId: string
  ): Promise<HouseholdNumberChangeRequest | null> {
    try {
      const q = query(
        collection(db, 'householdNumberChangeRequests'),
        where('householdId', '==', householdId),
        where('status', '==', 'pending_review')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data() as HouseholdNumberChangeRequest;
      }
    } catch (err) {
      console.warn('[ResidentService] Error fetching pending number change request:', err);
    }
    return null;
  }

  /**
   * Create a Household Number Change Request when a conflict exists
   */
  async createHouseholdNumberChangeRequest(params: {
    householdId: string;
    requesterUid: string;
    requestedByName: string;
    currentHouseholdNumber: string;
    requestedHouseholdNumber: string;
    conflictingHouseholdId: string;
    conflictingHouseholdNumber: string;
    reason: string;
    evidencePath?: string;
    evidenceUrl?: string;
    evidenceFileName?: string;
  }): Promise<HouseholdNumberChangeRequest> {
    const normReq = this.normalizeHouseholdNumber(params.requestedHouseholdNumber);
    const now = new Date().toISOString();

    // Idempotency check: check if pending request already exists for this household and requested number
    const existingReq = await this.getPendingHouseholdNumberChangeRequest(params.householdId);
    if (existingReq && this.normalizeHouseholdNumber(existingReq.requestedHouseholdNumber) === normReq) {
      return existingReq;
    }

    const requestId = `HNR-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const requestData: HouseholdNumberChangeRequest = {
      requestId,
      householdId: params.householdId,
      requesterUid: params.requesterUid,
      requestedByName: params.requestedByName,
      currentHouseholdNumber: params.currentHouseholdNumber,
      requestedHouseholdNumber: normReq,
      conflictingHouseholdId: params.conflictingHouseholdId,
      conflictingHouseholdNumber: params.conflictingHouseholdNumber,
      reason: params.reason || '',
      evidencePath: params.evidencePath,
      evidenceUrl: params.evidenceUrl,
      evidenceFileName: params.evidenceFileName,
      status: 'pending_review',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = doc(db, 'householdNumberChangeRequests', requestId);
    await setDoc(docRef, requestData);

    // Notify Secretary / Staff pool
    try {
      await notificationService.createNotification({
        userId: 'all_staff',
        title: 'Household Number Conflict Review',
        message: `Household ${params.currentHouseholdNumber} requested ${normReq} which is currently assigned to another household. Evidence submitted for review.`,
        type: 'household_number_conflict',
        priority: 'high',
        link: '/households?tab=number_requests',
        createdBy: params.requesterUid,
        metadata: {
          requestId,
          householdId: params.householdId,
          requestedHouseholdNumber: normReq,
        },
      });
    } catch (nErr) {
      console.warn('[ResidentService] Failed to send notification for number change request:', nErr);
    }

    // Log audit event
    adminService.logAuditEvent({
      action: 'Household Number Conflict Requested',
      module: 'Household Registry',
      targetId: requestId,
      targetType: 'HouseholdNumberChangeRequest',
      performedBy: params.requesterUid,
      performerName: params.requestedByName,
      performerRole: 'resident',
      newValues: {
        householdId: params.householdId,
        requestedHouseholdNumber: normReq,
        conflictingHouseholdId: params.conflictingHouseholdId,
      },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return requestData;
  }

  /**
   * Fetch all Household Number Change Requests
   */
  async getHouseholdNumberChangeRequests(
    status?: HouseholdNumberChangeRequestStatus
  ): Promise<HouseholdNumberChangeRequest[]> {
    try {
      const colRef = collection(db, 'householdNumberChangeRequests');
      let q = query(colRef);
      if (status) {
        q = query(colRef, where('status', '==', status));
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => d.data() as HouseholdNumberChangeRequest);
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('[ResidentService] Error fetching household number change requests:', err);
      return [];
    }
  }

  /**
   * Realtime subscription for Household Number Change Requests
   */
  subscribeToHouseholdNumberChangeRequests(
    callback: (requests: HouseholdNumberChangeRequest[]) => void,
    status?: HouseholdNumberChangeRequestStatus
  ): () => void {
    try {
      const colRef = collection(db, 'householdNumberChangeRequests');
      let q = query(colRef);
      if (status) {
        q = query(colRef, where('status', '==', status));
      }

      return onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((doc) => doc.data() as HouseholdNumberChangeRequest);
          const sorted = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(sorted);
        },
        (err) => {
          console.warn('[ResidentService] Realtime household number change requests listener error, falling back to fetch:', err);
          this.getHouseholdNumberChangeRequests(status).then(callback).catch(() => callback([]));
        }
      );
    } catch (err) {
      console.warn('[ResidentService] Error establishing number change requests listener:', err);
      this.getHouseholdNumberChangeRequests(status).then(callback).catch(() => callback([]));
      return () => {};
    }
  }

  /**
   * Fetch Household Number Change Requests for a specific Household
   */
  async getHouseholdNumberChangeRequestsForHousehold(
    householdId: string
  ): Promise<HouseholdNumberChangeRequest[]> {
    try {
      const colRef = collection(db, 'householdNumberChangeRequests');
      const q = query(colRef, where('householdId', '==', householdId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => d.data() as HouseholdNumberChangeRequest);
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('[ResidentService] Error fetching requests for household:', err);
      return [];
    }
  }

  /**
   * Helper: Ensure systemCounters/householdNumber exists.
   * If not, scan existing households to find max number sequence and create counter doc.
   */
  async getOrInitHouseholdNumberCounter(): Promise<{ currentYear: number; lastSequence: number }> {
    const counterRef = doc(db, 'systemCounters', 'householdNumber');
    try {
      const snap = await getDoc(counterRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          currentYear: data.currentYear || new Date().getFullYear(),
          lastSequence: data.lastSequence || 100,
        };
      }
    } catch (err) {
      console.warn('[ResidentService] Error reading counter doc:', err);
    }

    let maxNum = 100;
    const currentYear = new Date().getFullYear();

    let userObj: User | null = null;
    try {
      const cachedUser = localStorage.getItem('boims_active_user');
      if (cachedUser) userObj = JSON.parse(cachedUser);
    } catch (e) {}

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
    const isConfirmedStaff = Boolean(auth.currentUser && activeRole && staffRoles.includes(activeRole) && !isResidentRole);

    if (isConfirmedStaff) {
      try {
        const householdsSnap = await getDocs(query(collection(db, HOUSEHOLDS_COLLECTION)));
        householdsSnap.docs.forEach((d) => {
          const h = d.data() as Household;
          if (h.householdNumber) {
            const match = h.householdNumber.match(/\d+/g);
            if (match) {
              const lastNum = parseInt(match[match.length - 1], 10);
              if (!isNaN(lastNum) && lastNum > maxNum && lastNum < 999999) {
                maxNum = lastNum;
              }
            }
          }
        });
      } catch (err) {
        console.warn('[ResidentService] Error scanning households for counter init:', err);
      }
    } else {
      const localHHs = this.getLocalHouseholds();
      localHHs.forEach((h) => {
        if (h.householdNumber) {
          const match = h.householdNumber.match(/\d+/g);
          if (match) {
            const lastNum = parseInt(match[match.length - 1], 10);
            if (!isNaN(lastNum) && lastNum > maxNum && lastNum < 999999) {
              maxNum = lastNum;
            }
          }
        }
      });
    }

    const initialData = {
      currentYear,
      lastSequence: maxNum,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system_init',
    };

    try {
      await setDoc(counterRef, initialData, { merge: true });
    } catch (err) {
      console.warn('[ResidentService] Could not write counter init doc:', err);
    }

    return { currentYear, lastSequence: maxNum };
  }

  /**
   * Dynamically calculate the next available household number
   */
  findNextAvailableHouseholdNumber(allHouseholds: Household[]): string {
    let maxNum = 100;
    allHouseholds.forEach((h) => {
      if (h.householdNumber) {
        const match = h.householdNumber.match(/\d+/g);
        if (match) {
          const lastNum = parseInt(match[match.length - 1], 10);
          if (!isNaN(lastNum) && lastNum > maxNum && lastNum < 999999) {
            maxNum = lastNum;
          }
        }
      }
    });

    const currentYear = new Date().getFullYear();
    let candidate = maxNum + 1;
    let candidateStr = `HH-${currentYear}-${candidate}`;

    const existingSet = new Set(
      allHouseholds.filter((h) => !h.isDeleted).map((h) => this.normalizeHouseholdNumber(h.householdNumber))
    );
    while (existingSet.has(this.normalizeHouseholdNumber(candidateStr))) {
      candidate++;
      candidateStr = `HH-${currentYear}-${candidate}`;
    }

    return candidateStr;
  }

  /**
   * APPROVE Household Number Change Request inside an ATOMIC Firestore Transaction
   * Uses systemCounters/householdNumber counter document for concurrency-safe allocation.
   */
  async approveHouseholdNumberChangeRequest(
    requestId: string,
    reviewerId: string,
    reviewerRole: string,
    reviewerName: string,
    reviewNotes?: string
  ): Promise<{ success: boolean; displacedNewNumber: string }> {
    const now = new Date().toISOString();
    let displacedNewNumber = '';
    let requestingHouseholdId = '';
    let conflictingHouseholdId = '';
    let requestedHouseholdNumber = '';
    let requesterUid = '';

    // Step 0: Ensure counter document exists before entering transaction
    await this.getOrInitHouseholdNumberCounter();

    await runTransaction(db, async (transaction) => {
      // 1. Read Change Request
      const reqRef = doc(db, 'householdNumberChangeRequests', requestId);
      const reqSnap = await transaction.get(reqRef);

      if (!reqSnap.exists()) {
        throw new Error('Change request does not exist.');
      }

      const reqData = reqSnap.data() as HouseholdNumberChangeRequest;
      if (reqData.status !== 'pending_review') {
        throw new Error(`Request cannot be approved because status is '${reqData.status}'.`);
      }

      requestingHouseholdId = reqData.householdId;
      conflictingHouseholdId = reqData.conflictingHouseholdId;
      requestedHouseholdNumber = reqData.requestedHouseholdNumber;
      requesterUid = reqData.requesterUid;

      // 2. Read Requesting Household
      const requestingHHRef = doc(db, HOUSEHOLDS_COLLECTION, requestingHouseholdId);
      const requestingHHSnap = await transaction.get(requestingHHRef);

      if (!requestingHHSnap.exists()) {
        throw new Error('Requesting household does not exist.');
      }

      // 3. Read Conflicting Household
      const conflictingHHRef = doc(db, HOUSEHOLDS_COLLECTION, conflictingHouseholdId);
      const conflictingHHSnap = await transaction.get(conflictingHHRef);

      if (!conflictingHHSnap.exists()) {
        throw new Error('Conflicting household does not exist.');
      }

      const conflictingHHData = conflictingHHSnap.data() as Household;
      if (this.normalizeHouseholdNumber(conflictingHHData.householdNumber) !== this.normalizeHouseholdNumber(requestedHouseholdNumber)) {
        throw new Error('Conflicting household no longer owns the requested household number.');
      }

      // 4. Read & Increment systemCounters/householdNumber atomically inside transaction
      const counterRef = doc(db, 'systemCounters', 'householdNumber');
      const counterSnap = await transaction.get(counterRef);

      let currentYear = new Date().getFullYear();
      let lastSeq = 100;

      if (counterSnap.exists()) {
        const cData = counterSnap.data();
        const cYear = cData.currentYear || currentYear;
        if (cYear === currentYear) {
          lastSeq = cData.lastSequence || 100;
        } else {
          currentYear = cYear;
          lastSeq = 100;
        }
      }

      lastSeq += 1;
      displacedNewNumber = `HH-${currentYear}-${lastSeq}`;

      // 5. Update Requesting Household
      transaction.update(requestingHHRef, {
        householdNumber: requestedHouseholdNumber,
        updatedAt: now,
        updatedBy: reviewerId,
      });

      // 6. Update Conflicting Household with newly allocated displaced number
      transaction.update(conflictingHHRef, {
        householdNumber: displacedNewNumber,
        updatedAt: now,
        updatedBy: reviewerId,
      });

      // 7. Update System Counter Document
      transaction.set(
        counterRef,
        {
          currentYear,
          lastSequence: lastSeq,
          updatedAt: now,
          updatedBy: reviewerId,
        },
        { merge: true }
      );

      // 8. Update Household Numbers Index Atomically inside Transaction
      const reqNorm = this.normalizeHouseholdNumber(requestedHouseholdNumber);
      const dispNorm = this.normalizeHouseholdNumber(displacedNewNumber);
      if (reqNorm) {
        transaction.set(doc(db, 'householdNumbers', reqNorm), {
          householdId: requestingHouseholdId,
          householdNumber: requestedHouseholdNumber,
          normalizedHouseholdNumber: reqNorm,
          isDeleted: false,
          updatedAt: now,
        }, { merge: true });
      }
      if (dispNorm) {
        transaction.set(doc(db, 'householdNumbers', dispNorm), {
          householdId: conflictingHouseholdId,
          householdNumber: displacedNewNumber,
          normalizedHouseholdNumber: dispNorm,
          isDeleted: false,
          updatedAt: now,
        }, { merge: true });
      }

      // 9. Update Change Request document
      transaction.update(reqRef, {
        status: 'approved',
        reviewedBy: reviewerId,
        reviewerName: reviewerName || 'Secretary',
        reviewedAt: now,
        reviewNotes: reviewNotes || '',
        updatedAt: now,
      });
    });

    // Post-transaction synchronization & notifications
    const locals = this.getLocalHouseholds();
    const reqHH = locals.find((h) => h.householdId === requestingHouseholdId);
    if (reqHH) reqHH.householdNumber = requestedHouseholdNumber;
    const confHH = locals.find((h) => h.householdId === conflictingHouseholdId);
    if (confHH) confHH.householdNumber = displacedNewNumber;
    this.saveLocalHouseholds(locals);

    // Synchronize users/{uid} documents for both households
    try {
      let activeUser: User | null = null;
      try {
        const cachedUser = localStorage.getItem('boims_active_user');
        if (cachedUser) {
          activeUser = JSON.parse(cachedUser);
        }
      } catch (e) {
        // ignore
      }

      const activeRole = (activeUser?.role || reviewerRole || null) as UserRole | null;
      const isResidentRole = isResidentMode(activeUser, activeRole);
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
      const isConfirmedStaff = Boolean(
        auth.currentUser &&
        activeRole &&
        staffRoles.includes(activeRole) &&
        !isResidentRole &&
        !(activeRole === 'purokOfficial' && activeUser?.dutyStatus === 'offDuty') &&
        !['resident', 'applicant', 'verifier'].includes(activeRole)
      );

      const targetHouseholdIds = Array.from(
        new Set([requestingHouseholdId, conflictingHouseholdId].filter(Boolean))
      );

      if (isConfirmedStaff && targetHouseholdIds.length > 0) {
        const usersQ = query(
          collection(db, 'users'),
          where('householdId', 'in', targetHouseholdIds)
        );
        const usersSnap = await getDocs(usersQ);
        usersSnap.docs.forEach((uDoc) => {
          const uData = uDoc.data();
          if (uData.householdId === requestingHouseholdId) {
            updateDoc(doc(db, 'users', uDoc.id), {
              householdNumber: requestedHouseholdNumber,
              updatedAt: now,
            }).catch(() => {});
          } else if (uData.householdId === conflictingHouseholdId) {
            updateDoc(doc(db, 'users', uDoc.id), {
              householdNumber: displacedNewNumber,
              updatedAt: now,
            }).catch(() => {});
          }
        });
      }
    } catch (uErr) {
      console.warn('[ResidentService] Post-approval user profile sync warning:', uErr);
    }

    // Send notifications
    try {
      if (requesterUid) {
        await notificationService.createNotification({
          userId: requesterUid,
          title: 'Household Number Updated',
          message: `Your requested Household Number ${requestedHouseholdNumber} has been approved and assigned.`,
          type: 'system',
          priority: 'high',
          createdBy: reviewerId,
        });
      }

      if (conflictingHouseholdId) {
        await notificationService.createNotification({
          userId: conflictingHouseholdId,
          title: 'Household Number Reassigned',
          message: `Notice: Your official Barangay Household Number has been updated to ${displacedNewNumber} following census record verification.`,
          type: 'system',
          priority: 'high',
          createdBy: reviewerId,
        });
      }
    } catch (nErr) {
      console.warn('[ResidentService] Notification creation error:', nErr);
    }

    // Log Audit Event
    adminService.logAuditEvent({
      action: 'Household Number Change Approved',
      module: 'Household Registry',
      targetId: requestId,
      targetType: 'HouseholdNumberChangeRequest',
      performedBy: reviewerId,
      performerName: reviewerName,
      performerRole: (reviewerRole as any) || 'secretary',
      newValues: {
        requestingHouseholdId,
        requestedHouseholdNumber,
        conflictingHouseholdId,
        displacedNewNumber,
      },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return { success: true, displacedNewNumber };
  }

  /**
   * REJECT Household Number Change Request
   */
  async rejectHouseholdNumberChangeRequest(
    requestId: string,
    reviewerId: string,
    reviewerRole: string,
    reviewerName: string,
    reviewNotes: string
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const reqRef = doc(db, 'householdNumberChangeRequests', requestId);
    const reqSnap = await getDoc(reqRef);

    if (!reqSnap.exists()) return false;
    const reqData = reqSnap.data() as HouseholdNumberChangeRequest;

    if (reqData.status !== 'pending_review') {
      throw new Error(`Request cannot be rejected because status is '${reqData.status}'.`);
    }

    await updateDoc(reqRef, {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewerName: reviewerName || 'Secretary',
      reviewedAt: now,
      reviewNotes: reviewNotes || 'Requirements not satisfied.',
      updatedAt: now,
    });

    try {
      await notificationService.createNotification({
        userId: reqData.requesterUid,
        title: 'Household Number Request Rejected',
        message: `Your request for Household Number ${reqData.requestedHouseholdNumber} was not approved. Remarks: ${reviewNotes}`,
        type: 'system',
        priority: 'medium',
        createdBy: reviewerId,
      });
    } catch (nErr) {
      console.warn('[ResidentService] Notification creation error:', nErr);
    }

    adminService.logAuditEvent({
      action: 'Household Number Change Rejected',
      module: 'Household Registry',
      targetId: requestId,
      targetType: 'HouseholdNumberChangeRequest',
      performedBy: reviewerId,
      performerName: reviewerName,
      performerRole: (reviewerRole as any) || 'secretary',
      newValues: {
        requestId,
        reviewNotes,
      },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return true;
  }
  async verifyHousehold(
    householdId: string,
    status: 'approved' | 'changes_requested' | 'rejected',
    reviewerId: string,
    reviewNotes?: string,
    reviewerRole: any = 'secretary',
    reviewerName?: string
  ): Promise<Household | null> {
    const existing = await this.getHouseholdById(householdId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const isApproved = status === 'approved';

    let updates: Partial<Household> = {};

    if (isApproved) {
      // If there is a pending change request, apply proposed changes to main record
      const proposed = existing.pendingChangeRequest?.proposedChanges || {};
      updates = {
        ...proposed,
        verificationStatus: 'approved',
        isVerified: true,
        verifiedAt: now,
        verifiedBy: reviewerId,
        reviewNotes: reviewNotes || '',
        pendingChangeRequest: null,
      };
    } else {
      // If rejected or changes requested, keep existing verified state if previously verified or set status
      updates = {
        verificationStatus: status,
        reviewNotes: reviewNotes || '',
      };
      if (existing.pendingChangeRequest) {
        updates.pendingChangeRequest = {
          ...existing.pendingChangeRequest,
          status: 'rejected',
          reviewNotes: reviewNotes || '',
        };
      }
    }

    const updated = await this.updateHousehold(householdId, updates, reviewerId, false, reviewerRole, reviewerName);

    // Audit Log Entry
    const actionName = isApproved
      ? 'Household Approved'
      : status === 'changes_requested'
      ? 'Household Change Requested'
      : 'Household Rejected';

    adminService.logAuditEvent({
      action: actionName,
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: reviewerId,
      performerName: reviewerName,
      performerRole: reviewerRole,
      newValues: { status, reviewNotes },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updated;
  }

  // ==========================================
  // HOUSEHOLD MEMBERS MANAGEMENT & VALIDATION
  // ==========================================

  /**
   * Validate Household Member Data
   */
  validateHouseholdMember(
    existingMembers: HouseholdMember[],
    member: Partial<HouseholdMember>,
    memberIdToIgnore?: string
  ): string | null {
    if (!member.fullName || !member.fullName.trim()) {
      return 'Member full name is required.';
    }

    if (!member.birthdate || !member.birthdate.trim()) {
      return 'Birthdate is required.';
    }

    const birth = new Date(member.birthdate);
    if (isNaN(birth.getTime()) || birth > new Date()) {
      return 'Please enter a valid birthdate in the past.';
    }

    if (!member.relationshipToHead || !member.relationshipToHead.trim()) {
      return 'Relationship to Household Head is required.';
    }

    // Check duplicate full names in household
    const dupName = existingMembers.find(
      (m) =>
        m.id !== memberIdToIgnore &&
        m.fullName.trim().toLowerCase() === member.fullName?.trim().toLowerCase()
    );
    if (dupName) {
      return `A member named "${member.fullName}" already exists in this household.`;
    }

    // Check duplicate heads
    if (member.isHouseholdHead) {
      const dupHead = existingMembers.find(
        (m) => m.id !== memberIdToIgnore && m.isHouseholdHead
      );
      if (dupHead) {
        return `A household head (${dupHead.fullName}) is already assigned. Designate new head explicitly if changing head.`;
      }
    }

    return null;
  }

  /**
   * Add a new member to household with validation and audit log
   */
  async addHouseholdMember(
    householdId: string,
    memberData: Omit<HouseholdMember, 'id' | 'age'> & { birthdate: string },
    updatedBy: string,
    isResident?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const household = await this.getHouseholdById(householdId);
    if (!household) throw new Error('Household record not found.');

    const existingMembers = household.members || [];

    // Validate
    const errorMsg = this.validateHouseholdMember(existingMembers, memberData);
    if (errorMsg) throw new Error(errorMsg);

    const computedAge = this.computeAgeFromBirthdate(memberData.birthdate);
    const memberId = `MEM-${Date.now().toString().slice(-6)}`;

    const newMember: HouseholdMember = {
      ...memberData,
      id: memberId,
      age: computedAge,
      isSenior: memberData.isSenior ?? computedAge >= 60,
      isYouth: memberData.isYouth ?? (computedAge >= 13 && computedAge <= 24),
    };

    let updatedMembers = [...existingMembers, newMember];

    // If member is designated as head, clear head flag from others
    if (newMember.isHouseholdHead) {
      updatedMembers = updatedMembers.map((m) =>
        m.id === memberId ? { ...m, isHouseholdHead: true } : { ...m, isHouseholdHead: false }
      );
    }

    const updates: Partial<Household> = {
      members: updatedMembers,
      membersCount: updatedMembers.length,
    };

    if (newMember.isHouseholdHead) {
      updates.householdHeadName = newMember.fullName;
    }

    const updatedHH = await this.updateHousehold(householdId, updates, updatedBy, isResident, userRole, performerName);

    // Audit log
    adminService.logAuditEvent({
      action: 'Household Member Added',
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: updatedBy,
      performerName,
      performerRole: userRole,
      newValues: { memberName: newMember.fullName, relationship: newMember.relationshipToHead },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updatedHH;
  }

  /**
   * Edit existing household member with validation and audit log
   */
  async updateHouseholdMember(
    householdId: string,
    memberId: string,
    memberUpdates: Partial<HouseholdMember>,
    updatedBy: string,
    isResident?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const household = await this.getHouseholdById(householdId);
    if (!household) throw new Error('Household record not found.');

    const existingMembers = household.members || [];
    const memberIndex = existingMembers.findIndex((m) => m.id === memberId);
    if (memberIndex === -1) throw new Error('Household member not found.');

    const currentMember = existingMembers[memberIndex];
    const mergedMember = { ...currentMember, ...memberUpdates };

    if (memberUpdates.birthdate) {
      mergedMember.age = this.computeAgeFromBirthdate(memberUpdates.birthdate);
      if (mergedMember.isSenior === undefined) mergedMember.isSenior = mergedMember.age >= 60;
      if (mergedMember.isYouth === undefined) mergedMember.isYouth = mergedMember.age >= 13 && mergedMember.age <= 24;
    }

    // Validate
    const errorMsg = this.validateHouseholdMember(existingMembers, mergedMember, memberId);
    if (errorMsg) throw new Error(errorMsg);

    let updatedMembers = [...existingMembers];
    updatedMembers[memberIndex] = mergedMember;

    if (mergedMember.isHouseholdHead) {
      updatedMembers = updatedMembers.map((m) =>
        m.id === memberId ? { ...m, isHouseholdHead: true } : { ...m, isHouseholdHead: false }
      );
    }

    const updates: Partial<Household> = {
      members: updatedMembers,
    };

    if (mergedMember.isHouseholdHead) {
      updates.householdHeadName = mergedMember.fullName;
    }

    const updatedHH = await this.updateHousehold(householdId, updates, updatedBy, isResident, userRole, performerName);

    // Audit log
    adminService.logAuditEvent({
      action: 'Household Member Updated',
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: updatedBy,
      performerName,
      performerRole: userRole,
      newValues: { memberId, memberName: mergedMember.fullName },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updatedHH;
  }

  /**
   * Remove a member from household
   */
  async removeHouseholdMember(
    householdId: string,
    memberId: string,
    updatedBy: string,
    isResident?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const household = await this.getHouseholdById(householdId);
    if (!household) throw new Error('Household record not found.');

    const existingMembers = household.members || [];
    const targetMember = existingMembers.find((m) => m.id === memberId);
    if (!targetMember) throw new Error('Household member not found.');

    const updatedMembers = existingMembers.filter((m) => m.id !== memberId);

    const updates: Partial<Household> = {
      members: updatedMembers,
      membersCount: updatedMembers.length,
    };

    // If removed member was head, clear head or assign first remaining member
    if (targetMember.isHouseholdHead && updatedMembers.length > 0) {
      updatedMembers[0].isHouseholdHead = true;
      updates.householdHeadName = updatedMembers[0].fullName;
    }

    const updatedHH = await this.updateHousehold(householdId, updates, updatedBy, isResident, userRole, performerName);

    // Audit log
    adminService.logAuditEvent({
      action: 'Household Member Removed',
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: updatedBy,
      performerName,
      performerRole: userRole,
      previousValues: { memberName: targetMember.fullName },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updatedHH;
  }

  /**
   * Change Household Head designation
   */
  async changeHouseholdHead(
    householdId: string,
    newHeadMemberId: string,
    updatedBy: string,
    isResident?: boolean,
    userRole: any = 'resident',
    performerName?: string
  ): Promise<Household | null> {
    const household = await this.getHouseholdById(householdId);
    if (!household) throw new Error('Household record not found.');

    const existingMembers = household.members || [];
    const newHead = existingMembers.find((m) => m.id === newHeadMemberId);
    if (!newHead) throw new Error('Selected member not found in household.');

    const updatedMembers = existingMembers.map((m) =>
      m.id === newHeadMemberId
        ? { ...m, isHouseholdHead: true, relationshipToHead: 'Head of Household' }
        : { ...m, isHouseholdHead: false }
    );

    const updates: Partial<Household> = {
      householdHeadName: newHead.fullName,
      householdHeadId: newHead.residentId || household.householdHeadId,
      members: updatedMembers,
    };

    const updatedHH = await this.updateHousehold(householdId, updates, updatedBy, isResident, userRole, performerName);

    // Audit log
    adminService.logAuditEvent({
      action: 'Household Head Changed',
      module: 'Household Registry',
      targetId: householdId,
      targetType: 'Household',
      performedBy: updatedBy,
      performerName,
      performerRole: userRole,
      newValues: { newHeadName: newHead.fullName, memberId: newHeadMemberId },
    }).catch((err) => console.warn('[ResidentService] Audit log error:', err));

    return updatedHH;
  }

  // ==========================================
  // DEMOGRAPHICS & SECTORAL ANALYTICS ENGINE
  // ==========================================

  /**
   * Compute comprehensive Demographic Summary metrics with jurisdiction access control using verified data
   */
  async getDemographicAnalytics(currentUser?: User | null): Promise<DemographicSummary> {
    const allResidents = await this.getResidents({ residencyStatus: 'active', currentUser });
    const allHouseholds = await this.getHouseholds({ currentUser });

    // Filter to verified records for official demographic analytics
    const verifiedHouseholds = allHouseholds.filter(
      (h) => h.isVerified || h.verificationStatus === 'approved' || h.verificationStatus === undefined
    );
    const verifiedResidents = allResidents.filter(
      (r) => r.verificationStatus === 'verified' || r.verificationStatus === undefined
    );

    const summary: DemographicSummary = {
      totalPopulation: 0,
      totalHouseholds: verifiedHouseholds.length,
      verifiedResidents: verifiedResidents.length,
      unverifiedResidents: allResidents.length - verifiedResidents.length,
      registeredVoters: 0,
      byGender: { male: 0, female: 0, other: 0 },
      byAgeGroup: { infants: 0, children: 0, youth: 0, adults: 0, seniors: 0 },
      bySector: {
        senior: 0,
        pwd: 0,
        soloParent: 0,
        fourPs: 0,
        youth: 0,
        voter: 0,
        ofw: 0,
        indigenous: 0,
      },
      byPurok: {},
      byHouseholdType: {},
      byIncomeBracket: {},
      byBuildingClassification: {},
    };

    // Calculate Demographic Metrics from verified residents
    const processedPersonIds = new Set<string>();

    verifiedResidents.forEach((r) => {
      processedPersonIds.add(r.fullName.trim().toLowerCase());

      // Gender Breakdown
      if (r.gender === 'male') summary.byGender.male++;
      else if (r.gender === 'female') summary.byGender.female++;
      else summary.byGender.other++;

      // Age Group Breakdown
      const age = r.age || 0;
      if (age <= 2) summary.byAgeGroup.infants++;
      else if (age <= 12) summary.byAgeGroup.children++;
      else if (age <= 24) summary.byAgeGroup.youth++;
      else if (age <= 59) summary.byAgeGroup.adults++;
      else summary.byAgeGroup.seniors++;

      // Sector Breakdown
      r.sectors?.forEach((sector) => {
        if (summary.bySector[sector] !== undefined) {
          summary.bySector[sector]++;
        }
      });

      if (r.voterStatus === 'registered') {
        summary.registeredVoters++;
        summary.bySector.voter++;
      }

      // Purok Distribution
      const p = r.purok || 'Unassigned';
      summary.byPurok[p] = (summary.byPurok[p] || 0) + 1;
    });

    // Aggregate members inside verified households
    verifiedHouseholds.forEach((h) => {
      const bType = h.buildingType || 'unspecified';
      summary.byHouseholdType[bType] = (summary.byHouseholdType[bType] || 0) + 1;
      summary.byBuildingClassification![bType] = (summary.byBuildingClassification![bType] || 0) + 1;

      const inc = h.monthlyIncomeBracket || 'unspecified';
      summary.byIncomeBracket![inc] = (summary.byIncomeBracket![inc] || 0) + 1;

      // Process household members not already counted via residents collection
      h.members?.forEach((m) => {
        const nameKey = m.fullName.trim().toLowerCase();
        if (processedPersonIds.has(nameKey)) return;
        processedPersonIds.add(nameKey);

        if (m.gender === 'male') summary.byGender.male++;
        else if (m.gender === 'female') summary.byGender.female++;
        else summary.byGender.other++;

        const age = m.age || this.computeAgeFromBirthdate(m.birthdate);
        if (age <= 2) summary.byAgeGroup.infants++;
        else if (age <= 12) summary.byAgeGroup.children++;
        else if (age <= 24) summary.byAgeGroup.youth++;
        else if (age <= 59) summary.byAgeGroup.adults++;
        else summary.byAgeGroup.seniors++;

        if (m.isSenior || age >= 60) summary.bySector.senior++;
        if (m.isPwd) summary.bySector.pwd++;
        if (m.isSoloParent) summary.bySector.soloParent++;
        if (m.is4Ps) summary.bySector.fourPs++;
        if (m.isYouth || (age >= 13 && age <= 24)) summary.bySector.youth++;
        if (m.isVoter) {
          summary.registeredVoters++;
          summary.bySector.voter++;
        }

        const p = h.purok || 'Unassigned';
        summary.byPurok[p] = (summary.byPurok[p] || 0) + 1;
      });
    });

    summary.totalPopulation = processedPersonIds.size;

    return summary;
  }
}

export const residentService = new ResidentService();
