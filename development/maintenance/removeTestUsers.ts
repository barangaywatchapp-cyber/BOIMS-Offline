import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initializeApp, getApps, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * BOIMS Temporary Development Test User Cleanup System
 * 
 * DEVELOPMENT & MAINTENANCE UTILITY ONLY
 * 
 * Purpose:
 * Safely removes ONLY the six temporary development test user accounts
 * created by `seedTestUsers.ts` from Firebase Authentication and Firestore (`/users/{uid}` and `/registrations/{uid}`).
 * 
 * Target Emails ONLY:
 *  - res1@gmail.com
 *  - res2@gmail.com
 *  - res@gmail.com
 *  - spo1@gmail.com
 *  - spo2@gmail.com
 *  - spo3@gmail.com
 * 
 * Safety & Constraints:
 * - Strictly targeted cleanup. DOES NOT delete unrelated users or clear database.
 * - Idempotent execution (safe if accounts are already deleted).
 */

const TEST_EMAILS = [
  'res1@gmail.com',
  'res2@gmail.com',
  'res@gmail.com',
  'spo1@gmail.com',
  'spo2@gmail.com',
  'spo3@gmail.com',
];

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

async function removeTestUsers() {
  console.log('====================================================');
  console.log('🧹 BOIMS Maintenance: Remove Temporary Test Users');
  console.log('====================================================\n');

  const config = getFirebaseConfig();
  console.log(`📌 Target Firebase Project: "${config.projectId}"`);
  console.log('🚀 Authenticating and removing test accounts...\n');

  if (!config.apiKey) {
    throw new Error('Firebase API Key is required for test user removal.');
  }

  let authUsersDeleted = 0;
  let firestoreDocsDeleted = 0;

  for (const email of TEST_EMAILS) {
    console.log(`🔍 Processing test account cleanup: ${email}...`);

    let uid: string | null = null;
    let idToken: string | null = null;

    // 1. Sign in to obtain UID and idToken
    try {
      const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`;
      const signInRes = await fetch(signInUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: '12345678', returnSecureToken: true }),
      });
      const signInData = await signInRes.json();
      if (signInRes.ok && signInData.localId && signInData.idToken) {
        uid = signInData.localId;
        idToken = signInData.idToken;
      }
    } catch {
      // If password sign in failed, skip REST auth session
    }

    if (!uid || !idToken) {
      console.log(`   ℹ️ Test account ${email} is not authenticated or already removed. Skipping.`);
      continue;
    }

    // 2. Delete /users/{uid} document in Firestore
    try {
      const userDocUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${uid}?key=${config.apiKey}`;
      const res = await fetch(userDocUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        firestoreDocsDeleted++;
        console.log(`   ✅ Deleted Firestore document /users/${uid}`);
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Firestore /users/${uid} delete issue:`, err.message || err);
    }

    // 3. Delete /registrations/{uid} document in Firestore
    try {
      const regDocUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/registrations/${uid}?key=${config.apiKey}`;
      const res = await fetch(regDocUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        firestoreDocsDeleted++;
        console.log(`   ✅ Deleted Firestore document /registrations/${uid}`);
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Firestore /registrations/${uid} delete issue:`, err.message || err);
    }

    // 4. Delete Firebase Auth account
    try {
      const deleteUrl = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`;
      const res = await fetch(deleteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        authUsersDeleted++;
        console.log(`   ✅ Deleted Firebase Auth account for ${email} (UID: ${uid})`);
      }
    } catch (err: any) {
      console.error(`   ❌ Failed to delete Auth user ${email}:`, err.message || err);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 Test User Removal Complete!');
  console.log('====================================================');
  console.log(`- Auth accounts deleted:       ${authUsersDeleted}`);
  console.log(`- Firestore documents deleted: ${firestoreDocsDeleted}`);
  console.log(`- Target emails checked:       ${TEST_EMAILS.length}`);
  console.log('====================================================\n');

  process.exit(0);
}

removeTestUsers().catch((err) => {
  console.error('❌ Fatal error removing test users:', err);
  process.exit(1);
});
