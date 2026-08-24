import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initializeApp, getApps, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { User, UserRole } from '../../src/types';

/**
 * BOIMS Temporary Development Test User Seed System
 * 
 * DEVELOPMENT & MAINTENANCE UTILITY ONLY
 * 
 * Purpose:
 * Creates temporary Firebase Authentication accounts and their corresponding
 * BOIMS `/users/{uid}` and `/registrations/{uid}` Firestore documents for development testing.
 * 
 * Accounts Created:
 * Residents:
 *  1. res1@gmail.com (Resident 1)
 *  2. res2@gmail.com (Resident 2)
 *  3. res@gmail.com (Resident 3)
 * Sitio/Purok Officials:
 *  1. spo1@gmail.com (Purok Official 1)
 *  2. spo2@gmail.com (Purok Official 2)
 *  3. spo3@gmail.com (Purok Official 3)
 * 
 * All accounts use password: "12345678"
 * Location: Purok 1, Barangay Central, Baras, Rizal
 * 
 * Safety & Constraints:
 * - Strictly development/maintenance tool. Never executed in production.
 * - Idempotent: Safe to run multiple times without creating duplicate Auth users.
 */

interface TestAccountConfig {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  phoneNumber: string;
}

const TEST_ACCOUNTS: TestAccountConfig[] = [
  // Residents
  {
    email: 'res1@gmail.com',
    firstName: 'Resident One',
    lastName: 'Test',
    fullName: 'Resident One Test',
    role: 'resident',
    phoneNumber: '09170000001',
  },
  {
    email: 'res2@gmail.com',
    firstName: 'Resident Two',
    lastName: 'Test',
    fullName: 'Resident Two Test',
    role: 'resident',
    phoneNumber: '09170000002',
  },
  {
    email: 'res@gmail.com',
    firstName: 'Resident Three',
    lastName: 'Test',
    fullName: 'Resident Three Test',
    role: 'resident',
    phoneNumber: '09170000003',
  },
  // Sitio/Purok Officials
  {
    email: 'spo1@gmail.com',
    firstName: 'Purok Official One',
    lastName: 'Test',
    fullName: 'Purok Official One Test',
    role: 'purokOfficial',
    phoneNumber: '09180000001',
  },
  {
    email: 'spo2@gmail.com',
    firstName: 'Purok Official Two',
    lastName: 'Test',
    fullName: 'Purok Official Two Test',
    role: 'purokOfficial',
    phoneNumber: '09180000002',
  },
  {
    email: 'spo3@gmail.com',
    firstName: 'Purok Official Three',
    lastName: 'Test',
    fullName: 'Purok Official Three Test',
    role: 'purokOfficial',
    phoneNumber: '09180000003',
  },
];

const DEFAULT_PASSWORD = '12345678';

function getFirebaseConfig(): { projectId: string; apiKey?: string } {
  const rootDir = process.cwd();
  const configPath = join(rootDir, 'firebase-applet-config.json');

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const json = JSON.parse(raw);
      return {
        projectId: json.projectId || 'boims-7c40a',
        apiKey: json.apiKey,
      };
    } catch {
      // Fallback below
    }
  }

  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'boims-7c40a',
    apiKey: process.env.VITE_FIREBASE_API_KEY,
  };
}

async function getOrCreateAuthUser(
  email: string,
  password: string,
  displayName: string,
  apiKey?: string
): Promise<{ uid: string; idToken: string; created: boolean }> {
  if (!apiKey) {
    throw new Error('Firebase API Key is missing for client Auth setup.');
  }

  // Try sign in first (if account already exists)
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  const signInRes = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const signInData = await signInRes.json();

  if (signInRes.ok && signInData.localId && signInData.idToken) {
    return { uid: signInData.localId, idToken: signInData.idToken, created: false };
  }

  // Account does not exist or password differs - try sign up
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
  const signUpRes = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const signUpData = await signUpRes.json();

  if (signUpRes.ok && signUpData.localId && signUpData.idToken) {
    if (displayName) {
      const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`;
      await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: signUpData.idToken, displayName, returnSecureToken: true }),
      });
    }
    return { uid: signUpData.localId, idToken: signUpData.idToken, created: true };
  }

  throw new Error(`Failed to create or authenticate test user ${email}: ${JSON.stringify(signUpData.error || signInData.error)}`);
}

async function writeFirestoreUserDoc(
  projectId: string,
  apiKey: string,
  uid: string,
  idToken: string,
  acc: TestAccountConfig,
  timestamp: string
): Promise<void> {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`;
  
  // Rule constraint: user doc self-creation role must be 'resident', status 'pending'
  const fields: Record<string, any> = {
    uid: { stringValue: uid },
    email: { stringValue: acc.email.toLowerCase() },
    firstName: { stringValue: acc.firstName },
    lastName: { stringValue: acc.lastName },
    fullName: { stringValue: acc.fullName },
    phoneNumber: { stringValue: acc.phoneNumber },
    address: { stringValue: 'Purok 1, Barangay Central, Baras, Rizal' },
    purok: { stringValue: 'Purok 1' },
    jurisdiction: { stringValue: 'Purok 1' },
    barangay: { stringValue: 'Barangay Central' },
    municipality: { stringValue: 'Baras' },
    province: { stringValue: 'Rizal' },
    postalCode: { stringValue: '1970' },
    role: { stringValue: acc.role === 'purokOfficial' ? 'purokOfficial' : 'resident' },
    status: { stringValue: 'pending' },
    emailVerified: { booleanValue: true },
    mustChangePassword: { booleanValue: false },
    isActive: { booleanValue: true },
    createdAt: { stringValue: timestamp },
    updatedAt: { stringValue: timestamp },
    isDeleted: { booleanValue: false },
  };

  const res = await fetch(docUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // If role 'purokOfficial' blocked on /users/{uid}, retry with 'resident' for /users/{uid}
    if (acc.role === 'purokOfficial' && errText.includes('PERMISSION_DENIED')) {
      fields.role = { stringValue: 'resident' };
      const retryRes = await fetch(docUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fields }),
      });
      if (!retryRes.ok) {
        throw new Error(`User doc write error: ${await retryRes.text()}`);
      }
      return;
    }
    throw new Error(`User doc write error: ${errText}`);
  }
}

async function writeFirestoreRegistrationDoc(
  projectId: string,
  apiKey: string,
  uid: string,
  idToken: string,
  acc: TestAccountConfig,
  timestamp: string
): Promise<void> {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/registrations/${uid}?key=${apiKey}`;
  
  const fields = {
    registrationId: { stringValue: uid },
    uid: { stringValue: uid },
    registrationType: { stringValue: acc.role === 'purokOfficial' ? 'purokOfficial' : 'resident' },
    requestedRole: { stringValue: acc.role },
    appliedRole: { stringValue: acc.role },
    firstName: { stringValue: acc.firstName },
    lastName: { stringValue: acc.lastName },
    fullName: { stringValue: acc.fullName },
    email: { stringValue: acc.email.toLowerCase() },
    phoneNumber: { stringValue: acc.phoneNumber },
    address: { stringValue: 'Purok 1, Barangay Central, Baras, Rizal' },
    purok: { stringValue: 'Purok 1' },
    barangay: { stringValue: 'Barangay Central' },
    municipality: { stringValue: 'Baras' },
    province: { stringValue: 'Rizal' },
    postalCode: { stringValue: '1970' },
    status: { stringValue: 'pending' },
    submittedAt: { stringValue: timestamp },
    updatedAt: { stringValue: timestamp },
  };

  const res = await fetch(docUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    throw new Error(`Registration doc write error: ${await res.text()}`);
  }
}

async function seedTestUsers() {
  console.log('====================================================');
  console.log('🌱 BOIMS Maintenance: Seed Temporary Test Users');
  console.log('====================================================\n');

  const config = getFirebaseConfig();
  console.log(`📌 Target Firebase Project: "${config.projectId}"`);
  console.log('🚀 Authenticating test accounts...\n');

  let createdCount = 0;
  let reusedCount = 0;
  const timestamp = new Date().toISOString();

  for (const acc of TEST_ACCOUNTS) {
    console.log(`👤 Processing account: ${acc.email} [Role: ${acc.role}]...`);

    try {
      const { uid, idToken, created } = await getOrCreateAuthUser(
        acc.email,
        DEFAULT_PASSWORD,
        acc.fullName,
        config.apiKey
      );

      if (created) {
        createdCount++;
        console.log(`   ✅ Created new Firebase Auth account (UID: ${uid})`);
      } else {
        reusedCount++;
        console.log(`   ℹ️ Reused existing Firebase Auth account (UID: ${uid})`);
      }

      // Write /users/{uid} document
      await writeFirestoreUserDoc(config.projectId, config.apiKey!, uid, idToken, acc, timestamp);
      console.log(`   ✅ Synced Firestore document /users/${uid}`);

      // Write /registrations/{uid} document
      await writeFirestoreRegistrationDoc(config.projectId, config.apiKey!, uid, idToken, acc, timestamp);
      console.log(`   ✅ Synced Firestore document /registrations/${uid}`);

    } catch (err: any) {
      console.error(`   ❌ Error processing account ${acc.email}:`, err.message || err);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 Seed Process Complete!');
  console.log('====================================================');
  console.log(`- New Auth accounts created: ${createdCount}`);
  console.log(`- Existing Auth accounts reused: ${reusedCount}`);
  console.log(`- Total test accounts processed: ${TEST_ACCOUNTS.length}`);
  console.log(`- Common password: ${DEFAULT_PASSWORD}`);
  console.log(`- Location: Purok 1, Barangay Central, Baras, Rizal`);
  console.log('====================================================\n');

  process.exit(0);
}

seedTestUsers().catch((err) => {
  console.error('❌ Fatal error seeding test users:', err);
  process.exit(1);
});
