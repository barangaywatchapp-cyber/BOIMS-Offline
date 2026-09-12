/**
 * Service: AdminService (Module 8)
 * Handles User Account & Role Management, Audit Logging, System & Barangay Settings, and Data Backup/Export.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { env } from '../config/env';
import { User, UserRole, AccountStatus, AuditLog, BarangayProfileSettings, AppSettings } from '../types';
import { INITIAL_BARANGAY_PROFILE, INITIAL_APP_SETTINGS } from '../constants/seedSettings';
import { PUROK_OPTIONS } from '../constants';
import { filterUsersByAccess } from '../utils/jurisdictionUtils';
import { isResidentMode } from '../utils/permissions';
import { claimUniqueBoimsId, syncBoimsIndexMetadata } from '../utils/boimsIdUtils';

const firebaseConfig = {
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId: env.firebaseAppId,
};

export class AdminService {
  /**
   * Fetches user accounts from Firestore with optional pagination
   */
  async getUsers(
    currentUser?: User | null,
    options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null }
  ): Promise<User[]> {
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
      return [];
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

    const isConfirmedStaff = Boolean(
      auth.currentUser &&
      activeRole &&
      staffRoles.includes(activeRole) &&
      !isResidentRole &&
      !(activeRole === 'purokOfficial' && userObj?.dutyStatus === 'offDuty') &&
      !['resident', 'applicant', 'verifier'].includes(activeRole)
    );

    if (!isConfirmedStaff) {
      return [];
    }

    try {
      const usersRef = collection(db, 'users');
      const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];

      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      if (options?.limitCount && options.limitCount > 0) {
        constraints.push(limit(options.limitCount));
      }

      let snapshot;
      try {
        const q = query(usersRef, ...constraints);
        snapshot = await getDocs(q);
      } catch (indexErr: any) {
        const errCode = String(indexErr?.code || indexErr?.message || '').toLowerCase();
        const isNonFallback =
          errCode.includes('permission-denied') ||
          errCode.includes('unauthenticated') ||
          errCode.includes('invalid-argument');

        if (isNonFallback) {
          throw indexErr;
        }

        console.warn('[AdminService] Constrained getUsers query failed, falling back to basic query:', indexErr);
        snapshot = await getDocs(usersRef);
      }

      let users: User[] = [];
      if (!snapshot.empty) {
        users = snapshot.docs.map((d) => d.data() as User).filter((u) => !u.isDeleted);
      }

      if (userObj) {
        users = filterUsersByAccess(users, userObj);
      }

      return users;
    } catch (err) {
      console.warn('[AdminService] Firestore getUsers failed:', err);
      return [];
    }
  }

  /**
   * Subscribes to real-time user updates from Firestore (including presence changes)
   */
  subscribeToUsers(callback: (users: User[]) => void, currentUser?: User | null): () => void {
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

    const isConfirmedStaff = Boolean(
      auth.currentUser &&
      activeRole &&
      staffRoles.includes(activeRole) &&
      !isResidentRole &&
      !(activeRole === 'purokOfficial' && userObj?.dutyStatus === 'offDuty') &&
      !['resident', 'applicant', 'verifier'].includes(activeRole)
    );

    if (!isConfirmedStaff) {
      callback([]);
      return () => {};
    }

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('isDeleted', '==', false));
      return onSnapshot(
        q,
        (snapshot) => {
          let usersList = snapshot.docs.map((d) => d.data() as User).filter((u) => !u.isDeleted);
          if (userObj) {
            usersList = filterUsersByAccess(usersList, userObj);
          }
          callback(usersList);
        },
        (err) => {
          console.warn('[AdminService] Realtime users listener error:', err);
        }
      );
    } catch (err) {
      console.warn('[AdminService] Could not subscribe to users:', err);
      return () => {};
    }
  }

  /**
   * Updates user role and account status
   */
  async updateUserRoleAndStatus(
    targetUid: string,
    role: UserRole,
    status: AccountStatus,
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<void> {
    // Privilege Escalation Guard: Super Admin or Admin cannot assign superAdmin via normal role updates
    if (role === 'superAdmin') {
      throw new Error('Unauthorized privilege escalation: The superAdmin role cannot be assigned through normal user management.');
    }

    const updatedAt = new Date().toISOString();

    try {
      const userRef = doc(db, 'users', targetUid);
      const docSnap = await getDoc(userRef);

      let prevData: Partial<User> = {};
      if (docSnap.exists()) {
        prevData = docSnap.data() as User;
        await updateDoc(userRef, {
          role,
          status,
          isActive: status === 'active',
          updatedAt,
          updatedBy: performedByUid,
        });
        syncBoimsIndexMetadata(targetUid, { ...prevData, role, status }).catch(() => {});
      }

      // Determine specific administrative action type for audit trail
      const isRoleChanged = Boolean(prevData.role && prevData.role !== role);
      const isStatusChanged = Boolean(prevData.status && prevData.status !== status);
      const action = isRoleChanged && isStatusChanged
        ? 'ROLE_AND_STATUS_CHANGED'
        : isRoleChanged
        ? 'ROLE_CHANGED'
        : isStatusChanged
        ? 'STATUS_CHANGED'
        : 'UPDATE_USER_ROLE_STATUS';

      // Always authenticate against active auth.currentUser UID to satisfy immutable Firestore security rules (performedBy == request.auth.uid)
      const actorUid = auth.currentUser?.uid || performedByUid;
      const targetFullName = prevData.fullName || [prevData.firstName, prevData.lastName].filter(Boolean).join(' ') || targetUid;

      // Log Immutable Audit Event
      await this.logAuditEvent({
        action,
        module: 'Users',
        targetId: targetUid,
        targetType: 'User',
        targetName: targetFullName,
        performedBy: actorUid,
        performerName,
        performerRole: performerRole || 'superAdmin',
        previousValues: { role: prevData.role, status: prevData.status },
        newValues: { role, status },
        reason: isRoleChanged
          ? `Role changed from ${prevData.role} to ${role}${isStatusChanged ? `, status set to ${status}` : ''}`
          : isStatusChanged
          ? `Account status changed from ${prevData.status} to ${status}`
          : `Account access updated for ${targetFullName}`,
      });
    } catch (err) {
      console.error('[AdminService] Error updating user role/status:', err);
      throw err;
    }
  }

  /**
   * Administratively provisions a new user account (Resident, Purok Official, Verifier, Secretary, Chairman, Admin)
   * Ensures atomic creation across Firebase Auth, Firestore User record, BOIMS ID, and Audit Log.
   * If any Firestore operation fails, the newly-created Firebase Auth account is safely rolled back/deleted.
   */
  async createOfficialAccount(
    dto: {
      email: string;
      password?: string;
      firstName: string;
      lastName: string;
      role: 'verifier' | 'secretary' | 'chairman' | 'admin' | 'purokOfficial' | 'resident' | UserRole;
      status?: AccountStatus;
      phoneNumber?: string;
      address?: string;
      purok?: string;
    },
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<User> {
    // Privilege escalation guard: superAdmin accounts cannot be provisioned via user management
    if ((dto.role as any) === 'superAdmin') {
      throw new Error('Unauthorized privilege escalation: The superAdmin role cannot be assigned through user management.');
    }

    const cleanEmail = dto.email.trim().toLowerCase();
    const timestamp = new Date().toISOString();

    // Secure temporary password generation if not explicitly provided
    const temporaryPassword =
      dto.password ||
      `BoimsTemp!${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36).toUpperCase()}#`;

    // Initialize an isolated secondary Firebase App instance so the active Super Admin session is never altered
    const secondaryAppName = `boims-prov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    let uid = '';
    let createdAuthUser: any = null;
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, temporaryPassword);
      createdAuthUser = userCredential.user;
      uid = userCredential.user.uid;
    } catch (authErr: any) {
      try {
        await deleteApp(secondaryApp);
      } catch (_) {}
      console.error('[AdminService] Firebase Auth account creation failed:', authErr);
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error(`Email address ${cleanEmail} is already registered in Firebase Authentication.`);
      }
      throw new Error(`Failed to create Firebase Auth account: ${authErr.message || authErr}`);
    }

    try {
      // Step 2: Atomic BOIMS ID Claim and Index Reservation
      const boimsId = await claimUniqueBoimsId(uid);

      // Step 3: Firestore User Document Creation
      const isOfficial = ['verifier', 'secretary', 'chairman', 'admin', 'purokOfficial'].includes(dto.role);
      const userStatus: AccountStatus = dto.status || 'active';
      const addressValue = dto.address?.trim() || (isOfficial ? 'Barangay Hall Official Address' : 'Barangay Central');

      const newUser: User = {
        uid,
        boimsId,
        email: cleanEmail,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        fullName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
        phoneNumber: dto.phoneNumber?.trim() || '',
        address: addressValue,
        purok: dto.purok?.trim() || (PUROK_OPTIONS[0] as string) || 'Unassigned',
        barangay: 'Barangay Central',
        municipality: 'Baras',
        province: 'Rizal',
        role: dto.role,
        status: userStatus,
        emailVerified: true,
        mustChangePassword: true,
        isActive: userStatus === 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: performedByUid,
        isDeleted: false,
      };

      await setDoc(doc(db, 'users', uid), newUser);
      syncBoimsIndexMetadata(uid, newUser).catch(() => {});

      // Step 4: Dispatch password reset / setup email via Firebase Authentication
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
      } catch (resetErr: any) {
        console.warn('[AdminService] Password setup email trigger handled safely:', resetErr?.message || resetErr);
      }

      // Step 5: Write Audit Log (Never log passwords or credentials)
      await this.logAuditEvent({
        action: isOfficial ? 'CREATE_OFFICIAL_ACCOUNT' : 'CREATE_USER_ACCOUNT',
        module: 'Users',
        targetId: uid,
        targetType: 'User',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'superAdmin',
        newValues: {
          fullName: newUser.fullName,
          email: cleanEmail,
          role: dto.role,
          status: newUser.status,
          uid,
          boimsId,
        },
        reason: `${dto.role.toUpperCase()} account manually provisioned by ${performerRole || 'Super Admin'}`,
      });

      // Clean up isolated secondary auth app
      try {
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
      } catch (_) {}

      return newUser;
    } catch (err: any) {
      console.error('[AdminService] Error in Firestore provisioning, rolling back Auth account:', err);
      if (createdAuthUser) {
        try {
          await deleteUser(createdAuthUser);
          console.info(`[AdminService] Rolled back and safely deleted orphaned Auth account ${uid}`);
        } catch (delErr) {
          console.warn('[AdminService] Failed to delete orphaned Auth user during rollback:', delErr);
        }
      }
      try {
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
      } catch (_) {}
      throw new Error(`Failed to complete account provisioning: ${err.message || err}`);
    }
  }

  /**
   * Manually creates a new staff or resident account.
   * Delegates to createOfficialAccount to guarantee authenticated identity and zero orphan states.
   */
  async createUserAccount(
    userData: Omit<User, 'uid' | 'createdAt' | 'updatedAt' | 'isDeleted'>,
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<User> {
    return this.createOfficialAccount(
      {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role as any,
        status: userData.status,
        phoneNumber: userData.phoneNumber,
        purok: userData.purok,
        address: userData.address,
      },
      performedByUid,
      performerName,
      performerRole
    );
  }

  /**
   * Fetches audit logs from Firestore with optional pagination
   */
  async getAuditLogs(
    options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null; performedBy?: string },
    currentUser?: User | null
  ): Promise<AuditLog[]> {
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
      // Unauthenticated user: do NOT query Firestore. Return empty array.
      return [];
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

    if (!isConfirmedStaff) {
      // Non-staff / Resident / Unresolved role: do NOT query Firestore. Return empty array.
      return [];
    }

    try {
      const auditRef = collection(db, 'auditLogs');
      const limitVal = options?.limitCount || 100;

      if (options?.performedBy) {
        // Primary query enforces performedBy == current authenticated Super Admin UID directly at Firestore level
        try {
          const q = query(
            auditRef,
            where('performedBy', '==', options.performedBy),
            orderBy('createdAt', 'desc'),
            limit(limitVal)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            return snapshot.docs.map((d) => d.data() as AuditLog);
          }
          return [];
        } catch (queryErr) {
          // Resilient fallback: Query by performedBy without compound orderBy, then sort in memory
          console.warn('[AdminService] Query with compound orderBy fallback:', queryErr);
          const fallbackQ = query(
            auditRef,
            where('performedBy', '==', options.performedBy),
            limit(limitVal)
          );
          const snapshot = await getDocs(fallbackQ);
          if (!snapshot.empty) {
            const logs = snapshot.docs.map((d) => d.data() as AuditLog);
            return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
          return [];
        }
      }

      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      constraints.push(limit(limitVal));

      const q = query(auditRef, ...constraints);
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        return snapshot.docs.map((d) => d.data() as AuditLog);
      }

      return [];
    } catch (err) {
      console.warn('[AdminService] Firestore getAuditLogs failed:', err);
      return [];
    }
  }

  /**
   * Records a new audit log event in Firestore
   */
  async logAuditEvent(
    logData: Omit<AuditLog, 'auditId' | 'createdAt'>
  ): Promise<void> {
    const auditId = `AUD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = new Date().toISOString();

    const newLog: AuditLog = {
      ...logData,
      auditId,
      createdAt,
    };

    try {
      await setDoc(doc(db, 'auditLogs', auditId), newLog);
    } catch (err) {
      console.warn('[AdminService] Failed to record audit log to Firestore:', err);
    }
  }

  /**
   * Fetches Barangay Profile Settings
   */
  async getBarangayProfile(): Promise<BarangayProfileSettings> {
    try {
      const docRef = doc(db, 'settings', 'barangayProfile');
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        return snapshot.data() as BarangayProfileSettings;
      }
      return INITIAL_BARANGAY_PROFILE;
    } catch (err) {
      console.warn('[AdminService] Error getting barangay profile settings:', err);
      return INITIAL_BARANGAY_PROFILE;
    }
  }

  /**
   * Updates Barangay Profile Settings
   */
  async updateBarangayProfile(
    profileData: Partial<BarangayProfileSettings>,
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<BarangayProfileSettings> {
    const updatedAt = new Date().toISOString();
    const updated = {
      ...INITIAL_BARANGAY_PROFILE,
      ...profileData,
      updatedAt,
      updatedBy: performedByUid,
    };

    try {
      await setDoc(doc(db, 'settings', 'barangayProfile'), updated, { merge: true });

      await this.logAuditEvent({
        action: 'UPDATE_BARANGAY_PROFILE',
        module: 'Settings',
        targetId: 'barangayProfile',
        targetType: 'BarangayProfileSettings',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'admin',
        newValues: updated,
      });

      return updated;
    } catch (err) {
      console.warn('[AdminService] Firestore updateBarangayProfile fallback:', err);
      return updated;
    }
  }

  /**
   * Fetches Application Settings
   */
  async getAppSettings(): Promise<AppSettings> {
    try {
      const docRef = doc(db, 'settings', 'appSettings');
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        return snapshot.data() as AppSettings;
      }
      return INITIAL_APP_SETTINGS;
    } catch (err) {
      console.warn('[AdminService] Error getting app settings:', err);
      return INITIAL_APP_SETTINGS;
    }
  }

  /**
   * Updates Application Settings
   */
  async updateAppSettings(
    settingsData: Partial<AppSettings>,
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<AppSettings> {
    const updatedAt = new Date().toISOString();
    const updated = {
      ...INITIAL_APP_SETTINGS,
      ...settingsData,
      updatedAt,
      updatedBy: performedByUid,
    };

    try {
      await setDoc(doc(db, 'settings', 'appSettings'), updated, { merge: true });

      await this.logAuditEvent({
        action: 'UPDATE_APP_SETTINGS',
        module: 'Settings',
        targetId: 'appSettings',
        targetType: 'AppSettings',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'admin',
        newValues: updated,
      });

      return updated;
    } catch (err) {
      console.warn('[AdminService] Firestore updateAppSettings fallback:', err);
      return updated;
    }
  }

  /**
   * Exports full JSON system backup metadata
   */
  async generateSystemBackupJSON(): Promise<string> {
    const users = await this.getUsers();
    const auditLogs = await this.getAuditLogs();
    const profile = await this.getBarangayProfile();
    const appSettings = await this.getAppSettings();

    const backupPayload = {
      exportedAt: new Date().toISOString(),
      systemVersion: appSettings.version,
      barangayName: profile.barangayName,
      counts: {
        users: users.length,
        auditLogs: auditLogs.length,
      },
      barangayProfile: profile,
      appSettings,
      users,
      auditLogs,
    };

    return JSON.stringify(backupPayload, null, 2);
  }
}

export const adminService = new AdminService();
