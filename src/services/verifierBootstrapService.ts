/**
 * DEV/TEST ONLY: Temporary one-time bootstrap mechanism for creating the first internal Verifier account.
 * 
 * Creates a Verifier account directly in Firebase Authentication and stores the corresponding profile in
 * the `users/{uid}` collection in Firestore, bypassing the public registration application workflow.
 * 
 * Removal Before Production:
 * - Delete this file (`src/services/verifierBootstrapService.ts`).
 * - Remove any test triggers calling `bootstrapVerifierAccount()`.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase/config';
import { User } from '../types';
import { claimUniqueBoimsId, syncBoimsIndexMetadata } from '../utils/boimsIdUtils';

export interface VerifierBootstrapResult {
  uid: string;
  email: string;
  password: string;
  userProfile: User;
}

/**
 * Creates the initial Verifier account directly in Firebase Auth and Firestore `users/{uid}`.
 */
export async function bootstrapVerifierAccount(
  customEmail?: string,
  customPassword?: string
): Promise<VerifierBootstrapResult> {
  const verifierEmail = (customEmail || 'verifier.official@boims.gov.ph').trim().toLowerCase();
  const temporaryPassword = customPassword || 'VerifierPass2026!';
  const timestamp = new Date().toISOString();

  // Initialize an isolated secondary Firebase App instance so the active user session isn't modified
  const appName = `verifier-bootstrap-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);

  let uid = '';

  try {
    // 1. Create account directly in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, verifierEmail, temporaryPassword);
    uid = userCredential.user.uid;

    // Sign out from the secondary auth instance immediately
    await signOut(secondaryAuth);
  } catch (authErr: any) {
    if (authErr?.code === 'auth/email-already-in-use') {
      console.warn(`[VerifierBootstrap] Email ${verifierEmail} already exists in Firebase Auth.`);
      throw new Error(`Verifier account (${verifierEmail}) is already registered in Firebase Authentication.`);
    }
    throw new Error(`Failed to create Verifier account in Firebase Auth: ${authErr?.message || authErr}`);
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) {
      // Ignore secondary app teardown warnings
    }
  }

  const boimsId = await claimUniqueBoimsId(uid);

  // 2. Construct the complete User document
  const verifierUserProfile: User = {
    uid,
    boimsId,
    email: verifierEmail,
    firstName: 'Official',
    middleName: 'Barangay',
    lastName: 'Verifier',
    suffix: '',
    fullName: 'Official Barangay Verifier',
    phoneNumber: '09170008888',
    address: 'Barangay Hall, Baras',
    purok: 'Purok 1',
    barangay: 'Barangay Central',
    municipality: 'Baras',
    province: 'Rizal',
    role: 'verifier',
    status: 'active',
    emailVerified: true,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: 'system-bootstrap',
    isDeleted: false,
  };

  // 3. Store directly in Firestore collection path: users/{uid}
  const userDocRef = doc(db, 'users', uid);
  await setDoc(userDocRef, verifierUserProfile);
  await syncBoimsIndexMetadata(uid, verifierUserProfile);

  console.log('[VerifierBootstrap] Successfully bootstrapped Verifier account:', {
    path: `users/${uid}`,
    uid,
    email: verifierEmail,
    role: verifierUserProfile.role,
    status: verifierUserProfile.status,
  });

  return {
    uid,
    email: verifierEmail,
    password: temporaryPassword,
    userProfile: verifierUserProfile,
  };
}
