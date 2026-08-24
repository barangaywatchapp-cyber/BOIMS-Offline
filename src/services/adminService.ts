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
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { env } from '../config/env';
import { User, UserRole, AccountStatus, AuditLog, BarangayProfileSettings, AppSettings } from '../types';
import { INITIAL_BARANGAY_PROFILE, INITIAL_APP_SETTINGS } from '../constants/seedSettings';
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

      // Log Audit Event
      await this.logAuditEvent({
        action: 'UPDATE_USER_ROLE_STATUS',
        module: 'Users',
        targetId: targetUid,
        targetType: 'User',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'admin',
        previousValues: { role: prevData.role, status: prevData.status },
        newValues: { role, status },
        reason: `Role updated to ${role}, status set to ${status}`,
      });
    } catch (err) {
      console.error('[AdminService] Error updating user role/status:', err);
      throw err;
    }
  }

  /**
   * Manually creates an official account (Verifier, Secretary, Chairman, Admin) by Super Admin
   */
  async createOfficialAccount(
    dto: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: 'verifier' | 'secretary' | 'chairman' | 'admin';
      purok?: string;
    },
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<User> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const timestamp = new Date().toISOString();

    const secondaryAppName = 'SecondaryAuthAppOfficial';
    const secondaryApp = getApps().find(a => a.name === secondaryAppName) || initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    let uid = '';
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, dto.password);
      uid = userCredential.user.uid;
      await signOut(secondaryAuth);
    } catch (authErr: any) {
      console.error('[AdminService] Firebase Auth creation failed for official account:', authErr);
      throw new Error(`Failed to create Firebase Auth account: ${authErr.message || authErr}`);
    }

    const boimsId = await claimUniqueBoimsId(uid);

    const officialUser: User = {
      uid,
      boimsId,
      email: cleanEmail,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      fullName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
      phoneNumber: '',
      address: 'Barangay Hall Official Address',
      purok: dto.purok || 'Central',
      barangay: 'Barangay Central',
      municipality: 'Baras',
      province: 'Rizal',
      role: dto.role,
      status: 'active',
      emailVerified: true,
      mustChangePassword: true,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: performedByUid,
      isDeleted: false,
    };

    try {
      await setDoc(doc(db, 'users', uid), officialUser);
      syncBoimsIndexMetadata(uid, officialUser).catch(() => {});

      await this.logAuditEvent({
        action: 'CREATE_OFFICIAL_ACCOUNT',
        module: 'Users',
        targetId: uid,
        targetType: 'User',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'superAdmin',
        newValues: { fullName: officialUser.fullName, email: cleanEmail, role: dto.role, uid },
        reason: `Official ${dto.role.toUpperCase()} account manually created by Super Admin with real Firebase Auth credentials`,
      });

      return officialUser;
    } catch (err: any) {
      console.error('[AdminService] Error creating official account doc:', err);
      throw new Error(`Failed to create official account document: ${err.message}`);
    }
  }

  /**
   * Manually creates a new staff or resident account
   */
  async createUserAccount(
    userData: Omit<User, 'uid' | 'createdAt' | 'updatedAt' | 'isDeleted'>,
    performedByUid: string,
    performerName?: string,
    performerRole?: UserRole
  ): Promise<User> {
    const uid = `usr-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const boimsId = userData.boimsId || (await claimUniqueBoimsId(uid));

    const newUser: User = {
      ...userData,
      uid,
      boimsId,
      emailVerified: true,
      isActive: userData.status === 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: performedByUid,
      isDeleted: false,
    };

    try {
      await setDoc(doc(db, 'users', uid), newUser);
      syncBoimsIndexMetadata(uid, newUser).catch(() => {});

      await this.logAuditEvent({
        action: 'CREATE_USER_ACCOUNT',
        module: 'Users',
        targetId: uid,
        targetType: 'User',
        performedBy: performedByUid,
        performerName,
        performerRole: performerRole || 'admin',
        newValues: { fullName: newUser.fullName, email: newUser.email, role: newUser.role },
      });

      return newUser;
    } catch (err) {
      console.warn('[AdminService] Firestore createUserAccount fallback:', err);
      return newUser;
    }
  }

  /**
   * Fetches audit logs from Firestore with optional pagination
   */
  async getAuditLogs(
    options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null },
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
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      constraints.push(limit(options?.limitCount || 100));

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
