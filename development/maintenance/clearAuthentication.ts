import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initializeApp, getApps, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * BOIMS Development Maintenance Utility: Clear Authentication Users
 * 
 * Purpose:
 * Enumerates and deletes ALL Firebase Authentication users in the BOIMS development project.
 * Uses Firebase Admin SDK to perform delete-only cleanup for development maintenance.
 * 
 * Safety & Constraints:
 * - Delete-only operations (no user creation, no updates, no Firestore/Storage writes).
 * - Idempotent execution (safe to run multiple times or when 0 users exist).
 * - Intended strictly for development environment resets.
 */

function getProjectId(): string {
  const rootDir = process.cwd();
  const configPath = join(rootDir, 'firebase-applet-config.json');

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const json = JSON.parse(raw);
      if (json.projectId) {
        return json.projectId;
      }
    } catch {
      // Fallback below
    }
  }

  return process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'boims-7c40a';
}

async function clearAllAuthUsers() {
  console.log('====================================================');
  console.log('🔐 BOIMS Firebase Auth Maintenance Utility: Clear Users');
  console.log('====================================================\n');

  const projectId = getProjectId();
  console.log(`📌 Target Firebase Project: "${projectId}"`);
  console.log('🚀 Initializing Firebase Admin Auth SDK...\n');

  if (getApps().length === 0) {
    let credentialObj;

    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(process.cwd(), 'service-account.json');
    if (existsSync(serviceAccountPath)) {
      try {
        const saRaw = readFileSync(serviceAccountPath, 'utf-8');
        const saJson = JSON.parse(saRaw);
        credentialObj = cert(saJson);
        console.log(`🔑 Loaded Service Account key file from "${serviceAccountPath}".`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Could not parse service account file at "${serviceAccountPath}":`, msg);
      }
    }

    if (!credentialObj) {
      console.log('🔑 Authenticating Admin SDK via Application Default Credentials.');
      credentialObj = applicationDefault();
    }

    initializeApp({
      credential: credentialObj,
      projectId,
    });
  }

  const auth = getAuth();
  let totalUsersDeleted = 0;
  let pageCount = 0;
  let nextPageToken: string | undefined = undefined;

  console.log('🔍 Enumerating and deleting Authentication users in batches...\n');

  do {
    pageCount++;
    console.log(`📄 Fetching user page #${pageCount}${nextPageToken ? ' (with pageToken)...' : '...'}`);

    try {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      const users = listUsersResult.users;

      if (users.length === 0) {
        console.log('   ℹ️ No Authentication users found on this page.');
        break;
      }

      console.log(`   Found ${users.length} user(s) on page #${pageCount}. Deleting...`);

      const uids = users.map((u) => u.uid);

      if (uids.length > 0) {
        // Attempt batch deletion via deleteUsers
        try {
          const deleteResult = await auth.deleteUsers(uids);
          const successCount = deleteResult.successCount;
          const failureCount = deleteResult.failureCount;

          totalUsersDeleted += successCount;
          console.log(`   ✅ Successfully deleted ${successCount} user(s).` + (failureCount > 0 ? ` (Failed: ${failureCount})` : ''));

          if (failureCount > 0 && deleteResult.errors.length > 0) {
            deleteResult.errors.forEach((err) => {
              console.warn(`      ⚠️ Delete error for index ${err.index}: ${err.error.message}`);
            });
          }
        } catch (batchErr: unknown) {
          // Fallback to individual user deletion if bulk delete encountered an issue
          console.warn('   ⚠️ Bulk delete failed, falling back to individual deletion:', batchErr instanceof Error ? batchErr.message : String(batchErr));
          for (const user of users) {
            try {
              await auth.deleteUser(user.uid);
              totalUsersDeleted++;
              console.log(`      ✅ Deleted user: ${user.email || user.uid}`);
            } catch (singleErr: unknown) {
              console.error(`      ❌ Failed to delete user ${user.uid}:`, singleErr instanceof Error ? singleErr.message : String(singleErr));
            }
          }
        }
      }

      nextPageToken = listUsersResult.pageToken;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error during Auth user enumeration/deletion on page #${pageCount}:`, msg);
      break;
    }
  } while (nextPageToken);

  console.log('\n====================================================');
  console.log('🎉 BOIMS Authentication Cleanup Complete!');
  console.log('====================================================');
  console.log(`- Total pages processed:            ${pageCount}`);
  console.log(`- Total Authentication users deleted: ${totalUsersDeleted}`);
  console.log('====================================================\n');

  process.exit(0);
}

clearAllAuthUsers().catch((err) => {
  console.error('❌ Fatal error in Auth maintenance utility:', err);
  process.exit(1);
});
