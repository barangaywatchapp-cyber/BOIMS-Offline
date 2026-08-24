/**
 * AuthContext
 * Central Authentication & Role-Based Authorization Provider
 * Production Firebase Authentication and Firestore User Profile Provider
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, DutyStatus, DutyMode, UserPresence } from '../types';
import { auth, db } from '../firebase/config';
import { authService } from '../services/authService';
import { presenceService } from '../services/presenceService';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { isResidentMode } from '../utils/permissions';
import { ensureUserBoimsId, syncBoimsIndexMetadata } from '../utils/boimsIdUtils';
import { syncService } from '../services/SyncService';
import { fcmClientService } from '../services/fcmClientService';
import { certificateService } from '../services/certificateService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthInitialized: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  login: (email: string, password: string) => Promise<{ status: 'active' | 'pending' | 'rejected'; user: User }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateDutyMode: (dutyStatus: DutyStatus, dutyMode: DutyMode) => Promise<void>;
  hasPermission: (module: string, action: string) => boolean;
  hasActiveDispatcher: (excludeUid?: string) => Promise<boolean>;
  canViewResidentQueue: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'boims_active_user';

/**
 * Safely persists a lightweight projection of the authenticated user to localStorage.
 * Filters out large base64 data URLs, images, or non-essential document payloads
 * to prevent QuotaExceededError and keep browser storage lightweight (< 1 KB).
 */
function safeSetUserLocalStorage(user: User | null): void {
  if (!user) {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      console.info('[AuthContext] Cleared localStorage cached user session.');
    } catch (err) {
      console.warn('[AuthContext] Failed to remove localStorage cached user:', err);
    }
    return;
  }

  try {
    // Construct an explicit lightweight projection containing only essential scalar fields required for app bootstrap & role checks
    const cleanUserProjection: User = {
      uid: user.uid,
      boimsId: user.boimsId,
      householdId: user.householdId,
      email: user.email || '',
      firstName: user.firstName || '',
      middleName: user.middleName || '',
      lastName: user.lastName || '',
      suffix: user.suffix || '',
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
      phoneNumber: user.phoneNumber || '',
      address: user.address || '',
      purok: user.purok || '',
      jurisdiction: user.jurisdiction || user.purok || user.barangay || '',
      barangay: user.barangay || '',
      municipality: user.municipality || '',
      province: user.province || '',
      postalCode: user.postalCode || '',
      role: user.role,
      dutyStatus: user.dutyStatus || 'offDuty',
      dutyMode: user.dutyMode || 'offDuty',
      presence: user.presence ? { status: user.presence.status, lastSeen: user.presence.lastSeen } : undefined,
      status: user.status || 'active',
      emailVerified: Boolean(user.emailVerified),
      mustChangePassword: Boolean(user.mustChangePassword),
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.updatedAt || new Date().toISOString(),
      isDeleted: Boolean(user.isDeleted),
      // Strictly omit profilePicture if it's a base64 Data URL or exceeds 500 characters
      ...(user.profilePicture && !user.profilePicture.startsWith('data:') && user.profilePicture.length <= 500
        ? { profilePicture: user.profilePicture }
        : {}),
    };

    const jsonString = JSON.stringify(cleanUserProjection);
    const sizeInBytes = jsonString.length;

    console.info(
      `[AuthContext] Persisting lightweight user projection to localStorage (${sizeInBytes} bytes):`,
      {
        uid: cleanUserProjection.uid,
        email: cleanUserProjection.email,
        role: cleanUserProjection.role,
        status: cleanUserProjection.status,
        sizeInBytes,
      }
    );

    localStorage.setItem(AUTH_STORAGE_KEY, jsonString);
  } catch (err: any) {
    console.warn(
      `[AuthContext] localStorage.setItem failed (QuotaExceededError or Storage restricted). Clearing stale cache entry. Error:`,
      err?.message || err
    );
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {}
  }
}

function areUsersEquivalent(prev: User | null, next: User | null): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;

  if (
    prev.uid !== next.uid ||
    prev.boimsId !== next.boimsId ||
    prev.householdId !== next.householdId ||
    prev.email !== next.email ||
    prev.role !== next.role ||
    prev.status !== next.status ||
    prev.firstName !== next.firstName ||
    prev.lastName !== next.lastName ||
    prev.fullName !== next.fullName ||
    prev.phoneNumber !== next.phoneNumber ||
    prev.address !== next.address ||
    prev.purok !== next.purok ||
    prev.jurisdiction !== next.jurisdiction ||
    prev.barangay !== next.barangay ||
    prev.municipality !== next.municipality ||
    prev.province !== next.province ||
    prev.dutyStatus !== next.dutyStatus ||
    prev.dutyMode !== next.dutyMode ||
    prev.isActive !== next.isActive ||
    prev.isDeleted !== next.isDeleted ||
    prev.emailVerified !== next.emailVerified ||
    prev.presence?.status !== next.presence?.status
  ) {
    return false;
  }

  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!cached) return null;

      // Defensive check: Purge stale or oversized cache entries (>10KB or containing base64 data URLs)
      if (cached.length > 10000 || cached.includes('data:image')) {
        console.warn(
          '[AuthContext] Found oversized/stale cached user in localStorage (>10KB or base64 data URL). Purging stale cache entry.'
        );
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }

      const parsed = JSON.parse(cached);
      if (parsed && parsed.uid && parsed.role) {
        return parsed as User;
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    } catch (err) {
      console.warn('[AuthContext] Failed to parse cached user from localStorage. Removing stale entry:', err);
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (_) {}
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [isAuthInitialized, setIsAuthInitialized] = useState<boolean>(false);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    // Listen to Firebase Auth state
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          unsubUserDoc = onSnapshot(userDocRef, async (snap) => {
            if (snap.exists()) {
              const userData = { uid: snap.id, ...snap.data() } as User;
              if (!userData.boimsId) {
                const assignedBoimsId = await ensureUserBoimsId(userData);
                if (assignedBoimsId) {
                  userData.boimsId = assignedBoimsId;
                }
              } else {
                syncBoimsIndexMetadata(userData.uid, userData).catch(() => {});
              }
              safeSetUserLocalStorage(userData);
              setUser((prev) => {
                if (areUsersEquivalent(prev, userData)) {
                  return prev;
                }
                return userData;
              });
            } else {
              // Ignore cache-only non-existence snapshots to prevent premature registration fallback
              if ((snap as any).metadata?.fromCache) {
                return;
              }

              // Check registration document directly by ID if users/{uid} does not exist on server
              let regData: any = null;
              try {
                const regDocRef = doc(db, 'registrations', firebaseUser.uid);
                const regSnap = await getDoc(regDocRef);
                regData = regSnap.exists() ? regSnap.data() : null;
              } catch (regErr) {
                console.warn('[AuthContext] Registration lookup failed or insufficient permissions:', regErr);
              }

              if (regData && (regData.status === 'pending' || regData.status === 'rejected' || regData.status === 'under_review' || regData.status === 'needs_additional_docs')) {
                const regStatus = regData.status;
                const tempUser: User = {
                  uid: firebaseUser.uid,
                  email: regData.email || firebaseUser.email || '',
                  firstName: regData.firstName || 'Applicant',
                  lastName: regData.lastName || '',
                  fullName: regData.fullName || `${regData.firstName || ''} ${regData.lastName || ''}`.trim() || 'Applicant',
                  phoneNumber: regData.phoneNumber || '',
                  address: regData.address || '',
                  purok: regData.purok || 'Purok 1',
                  barangay: regData.barangay || 'Barangay Central',
                  municipality: regData.municipality || 'Baras',
                  province: regData.province || 'Rizal',
                  role: regData.appliedRole || 'resident',
                  status: regStatus === 'rejected' ? 'suspended' : 'pending',
                  emailVerified: firebaseUser.emailVerified,
                  isActive: false,
                  createdAt: regData.submittedAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  isDeleted: false,
                };

                safeSetUserLocalStorage(tempUser);
                setUser(tempUser);
              } else {
                safeSetUserLocalStorage(null);
                setUser(null);
              }
            }
            setIsAuthInitialized(true);
          }, (err) => {
            console.warn('Error listening to user profile doc:', err);
            setIsAuthInitialized(true);
          });
        } catch (err) {
          console.warn('Could not fetch Firestore user or registration profile:', err);
          setIsAuthInitialized(true);
        }
      } else {
        safeSetUserLocalStorage(null);
        setUser(null);
        setIsAuthInitialized(true);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (user && presenceService.isOfficial(user.role)) {
      const handlePresenceChange = (updatedPresence: UserPresence) => {
        setUser((prev) => {
          if (!prev) return null;
          if (prev.presence?.status === updatedPresence.status) {
            return prev;
          }
          const updated = { ...prev, presence: updatedPresence };
          safeSetUserLocalStorage(updated);
          return updated;
        });
      };

      const cleanup = presenceService.setupLifecycleListeners(
        user.uid,
        user.role,
        handlePresenceChange
      );

      presenceService.startHeartbeat(
        user.uid,
        user.role,
        handlePresenceChange
      );

      return () => {
        cleanup();
        presenceService.stopHeartbeat();
      };
    } else {
      presenceService.stopHeartbeat();
    }
  }, [user?.uid, user?.role]);

  const login = async (email: string, password: string): Promise<{ status: 'active' | 'pending' | 'rejected'; user: User }> => {
    setLoading(true);
    try {
      const result = await authService.login(email, password);
      if (result.status === 'active' && presenceService.isOfficial(result.user.role)) {
        const updatedPresence = await presenceService.setOnline(result.user.uid, result.user.role);
        if (updatedPresence) {
          result.user = {
            ...result.user,
            presence: updatedPresence,
          };
        }
      }
      safeSetUserLocalStorage(result.user);
      setUser(result.user);
      fcmClientService.initializeForUser(result.user).catch((e) => {
        console.info('[AuthContext] FCM registration notice:', e?.message || e);
      });
      return result;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const userData = { uid: snap.id, ...snap.data() } as User;
          safeSetUserLocalStorage(userData);
          setUser(userData);
        }
      } catch (err) {
        console.warn('Failed to refresh user profile:', err);
      }
    }
  };

  const updateDutyMode = async (dutyStatus: DutyStatus, dutyMode: DutyMode) => {
    if (!user) return;

    // RULE 4: Validate single active Dispatcher constraint
    if (dutyStatus === 'onDuty' && dutyMode === 'dispatcher') {
      const activeExists = await authService.hasActiveDispatcher(user.uid);
      if (activeExists) {
        throw new Error(
          'An active Dispatcher is already on duty. Please ask the current Dispatcher to go Off Duty before switching.'
        );
      }
    }

    try {
      await authService.updateProfile(user.uid, { dutyStatus, dutyMode });
      const updatedUser: User = {
        ...user,
        dutyStatus,
        dutyMode,
        updatedAt: new Date().toISOString(),
      };
      safeSetUserLocalStorage(updatedUser);
      setUser(updatedUser);
    } catch (err) {
      console.error('Failed to update duty mode:', err);
      throw err;
    }
  };

  /**
   * Checks if an active Dispatcher exists in the system (RULE 1)
   */
  const hasActiveDispatcher = async (excludeUid?: string): Promise<boolean> => {
    if (!user || isResidentMode(user, user.role) || ['resident', 'applicant', 'verifier'].includes(user.role)) {
      return false;
    }
    return authService.hasActiveDispatcher(excludeUid);
  };

  /**
   * Determines if the current user may view the Resident Work Queue (RULES 2 & 3 & 5)
   */
  const canViewResidentQueue = async (): Promise<boolean> => {
    if (!user) return false;

    // Residents, applicants, verifiers, or resident-mode users cannot view Official Work Queue
    if (isResidentMode(user, user.role) || ['resident', 'applicant', 'verifier'].includes(user.role)) {
      return false;
    }

    // Non-Purok Official roles (Admin, Chairman, SuperAdmin, Secretary, Developer, Treasurer) can view
    if (user.role !== 'purokOfficial') return true;

    // Off Duty Purok Officials cannot view
    if (user.dutyStatus === 'offDuty' || user.dutyMode === 'offDuty') return false;

    // RULE 3: Active Dispatcher may view
    if (user.dutyStatus === 'onDuty' && user.dutyMode === 'dispatcher') {
      return true;
    }

    // RULE 2 & 3 & 5: On Duty Field Responder
    if (user.dutyStatus === 'onDuty' && user.dutyMode === 'responder') {
      const activeExists = await authService.hasActiveDispatcher(user.uid);
      // If NO active Dispatcher exists, On Duty Field Responders may view (RULE 2 & 5)
      // If active Dispatcher exists, queue is Dispatcher-exclusive (RULE 3)
      return !activeExists;
    }

    return false;
  };

  const logout = async () => {
    setLoading(true);
    presenceService.stopHeartbeat();
    try {
      if (user && presenceService.isOfficial(user.role)) {
        await presenceService.setOffline(user.uid, user.role);
      }
    } catch (err) {
      console.warn('Failed to set offline presence on logout:', err);
    }
    try {
      await fcmClientService.unregisterCurrentToken(user?.uid);
    } catch (err) {
      console.warn('[AuthContext] FCM token cleanup on logout notice:', err);
    }
    try {
      await signOut(auth);
    } catch (e) {
      console.info('Signed out locally.');
    } finally {
      safeSetUserLocalStorage(null);
      certificateService.clearLocalCache();
      setUser(null);
      setLoading(false);
    }
  };

  /**
   * Helper to verify role permission against Role Permission Matrix
   */
  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    const { role } = user;

    // SuperAdmin, Chairman & Admin have full oversight over operational modules
    if (role === 'superAdmin' || role === 'chairman' || role === 'admin') return true;

    // Verifier role is strictly limited to Identity Verification module
    if (role === 'verifier') {
      if (module === 'registrations' || module === 'notifications' || module === 'profile') return true;
      return false; // Verifier CANNOT access users, settings, inventory, certificates, etc.
    }

    if (module === 'reports' || module === 'dispatch') {
      if (action === 'create') return role === 'resident';
      if (action === 'view') return true;
      if (action === 'assign' || action === 'reassign' || action === 'dispatch') {
        if (role === 'admin' || role === 'chairman' || role === 'superAdmin') return true;
        if (role === 'purokOfficial') {
          return user.dutyStatus === 'onDuty' && user.dutyMode === 'dispatcher';
        }
        return false;
      }
      if (action === 'statusUpdate') return true;
    }

    if (module === 'certificates') {
      if (action === 'request') return role === 'resident';
      if (action === 'process' || action === 'verify') return role === 'secretary' || role === 'admin';
      if (action === 'approve') return role === 'secretary' || role === 'admin' || role === 'chairman';
    }

    if (module === 'inventory') {
      if (action === 'manage') return role === 'admin' || role === 'chairman' || role === 'purokOfficial';
    }

    if (module === 'users') {
      return role === 'superAdmin' || role === 'admin' || role === 'chairman';
    }

    return true; // Default fallback for basic modules
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthInitialized,
        isAuthenticated: !!user,
        role: user?.role || null,
        login,
        logout,
        refreshUser,
        updateDutyMode,
        hasPermission,
        hasActiveDispatcher,
        canViewResidentQueue,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
