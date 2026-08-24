/**
 * Auth Service (Module 2)
 * Encapsulates identity management, authentication, user profile fetching from Firestore,
 * password resets, and session authorization.
 * Aligned with SRS Volume 3 and MDG Volume 3.
 */

import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile as updateAuthProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import { storageService } from './storageService';
import { User, UserRole } from '../types';
import { syncBoimsIndexMetadata } from '../utils/boimsIdUtils';

export class AuthService {
  /**
   * Fetches user profile document from Firestore 'users' collection
   */
  async getUserProfile(uid: string): Promise<User | null> {
    console.log('[DIAGNOSTIC] [getUserProfile] BEFORE getDoc', {
      uid,
      documentPath: `users/${uid}`,
      authCurrentUserUid: auth.currentUser?.uid ?? null,
      authCurrentUserExists: !!auth.currentUser,
    });

    try {
      const userDocRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userDocRef);

      console.log('[DIAGNOSTIC] [getUserProfile] AFTER getDoc SUCCEEDED', {
        exists: snapshot.exists(),
        id: snapshot.id,
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        data: snapshot.data(),
      });

      if (snapshot.exists()) {
        return { uid: snapshot.id, ...snapshot.data() } as User;
      }

      console.log('[DIAGNOSTIC] [getUserProfile] RETURNING NULL WHY:', 'DOCUMENT_NOT_FOUND');
      return null;
    } catch (error: any) {
      console.error('[DIAGNOSTIC] [getUserProfile] CATCH BLOCK ERROR', {
        code: error?.code,
        name: error?.name,
        message: error?.message,
        error,
      });
      console.log('[DIAGNOSTIC] [getUserProfile] RETURNING NULL WHY:', 'FIRESTORE_READ_ERROR');
      return null;
    }
  }

  /**
   * Authenticates user via Firebase Auth and checks users/{uid} then registrations collection
   */
  async login(email: string, pass: string): Promise<{ status: 'active' | 'pending' | 'rejected'; user: User }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      // Step 1: Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const firebaseUid = userCredential.user.uid;

      console.log('[DIAGNOSTIC] [login] AFTER signInWithEmailAndPassword', {
        firebaseAuthUid: firebaseUid,
        authCurrentUserUid: auth.currentUser?.uid ?? null,
        authCurrentUserEmail: auth.currentUser?.email ?? null,
        authCurrentUserNonNull: !!auth.currentUser,
      });

      // Step 2: Check users/{uid} collection in Firestore
      let profile = await this.getUserProfile(firebaseUid);

      if (profile) {
        if (profile.status === 'suspended') {
          throw new Error('Your account has been deactivated or suspended. Contact administration.');
        }
        return { status: 'active', user: profile };
      }

      console.log('[DIAGNOSTIC] [login] AUTH_PROFILE_FALLBACK_TO_REGISTRATION', {
        uid: firebaseUid,
        reason: 'getUserProfile returned null (see preceding logs for DOCUMENT_NOT_FOUND vs FIRESTORE_READ_ERROR)',
      });

      // Step 3: If users/{uid} does not exist, check registrations document by UID
      let regData: any = null;
      try {
        const regDocRef = doc(db, 'registrations', firebaseUid);
        const regSnap = await getDoc(regDocRef);
        regData = regSnap.exists() ? regSnap.data() : null;
      } catch (regErr) {
        console.warn('[authService] Registration lookup failed or insufficient permissions:', regErr);
      }

      if (regData) {
        const regStatus = regData.status;

        profile = {
          uid: firebaseUid,
          email: regData.email || userCredential.user.email || cleanEmail,
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
          emailVerified: userCredential.user.emailVerified,
          isActive: false,
          createdAt: regData.submittedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };

        if (regStatus === 'rejected') {
          return { status: 'rejected', user: profile };
        } else if (regStatus === 'approved') {
          throw new Error('User profile record missing for approved account. Please contact administration.');
        } else {
          return { status: 'pending', user: profile };
        }
      }

      // Step 4: If neither users/{uid} nor registrations exist, throw error
      throw new Error('User profile or registration record not found. Please contact administration.');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password. Please check your credentials.');
      }
      if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed login attempts. Please try again later.');
      }
      throw new Error(error.message || 'Authentication failed. Please try again.');
    }
  }

  /**
   * Sends password reset email
   */
  async sendPasswordReset(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // Generic message for security (BR-AUTH / OWASP)
        return;
      }
      throw new Error(error.message || 'Failed to send password reset email.');
    }
  }

  /**
   * Changes current authenticated user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('No active authentication session found.');
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        throw new Error('Current password is incorrect.');
      }
      throw new Error(error.message || 'Failed to update password.');
    }
  }

  /**
   * Updates user profile picture in Firestore and Firebase Auth
   */
  async updateProfilePhoto(uid: string, photoUrl: string): Promise<void> {
    try {
      await this.updateProfile(uid, { profilePicture: photoUrl });

      if (auth.currentUser && auth.currentUser.uid === uid) {
        try {
          await updateAuthProfile(auth.currentUser, { photoURL: photoUrl });
        } catch (e) {
          console.warn('[AuthService] Could not update Firebase Auth photoURL:', e);
        }
      }
    } catch (error) {
      console.error('[AuthService] Error updating profile photo:', error);
      throw error;
    }
  }

  /**
   * Removes user profile picture from storage, Firestore, and Firebase Auth
   */
  async removeProfilePhoto(uid: string, currentPhotoUrl?: string): Promise<void> {
    try {
      await storageService.deleteProfilePhoto(uid, currentPhotoUrl);
      await this.updateProfile(uid, { profilePicture: '' });

      if (auth.currentUser && auth.currentUser.uid === uid) {
        try {
          await updateAuthProfile(auth.currentUser, { photoURL: '' });
        } catch (e) {
          console.warn('[AuthService] Could not clear Firebase Auth photoURL:', e);
        }
      }
    } catch (error) {
      console.error('[AuthService] Error removing profile photo:', error);
      throw error;
    }
  }

  /**
   * Updates user profile in Firestore
   */
  async updateProfile(uid: string, updates: Partial<User>): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      syncBoimsIndexMetadata(uid, updates).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  }

  /**
   * Checks if an active Dispatcher exists in Firestore 'users' collection
   * (role == "purokOfficial", dutyStatus == "onDuty", dutyMode == "dispatcher")
   */
  async hasActiveDispatcher(excludeUid?: string): Promise<boolean> {
    if (!auth.currentUser) {
      return false;
    }
    try {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'purokOfficial'),
        where('dutyStatus', '==', 'onDuty'),
        where('dutyMode', '==', 'dispatcher')
      );
      const snap = await getDocs(q);
      const activeDispatchers = snap.docs.filter((d) => !excludeUid || d.id !== excludeUid);
      return activeDispatchers.length > 0;
    } catch (error) {
      if ((error as any)?.code !== 'permission-denied') {
        console.warn('[AuthService] Error checking active dispatcher:', error);
      }
      return false;
    }
  }

  /**
   * Retrieves the current active Dispatcher user document if one exists
   */
  async getActiveDispatcher(): Promise<User | null> {
    try {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'purokOfficial'),
        where('dutyStatus', '==', 'onDuty'),
        where('dutyMode', '==', 'dispatcher')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data() as User;
      }
      return null;
    } catch (error) {
      console.warn('[AuthService] Error fetching active dispatcher:', error);
      return null;
    }
  }

  /**
   * Signs out current session
   */
  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch (e) {
      console.info('[AuthService] Logout completed.');
    }
  }
}

export const authService = new AuthService();
