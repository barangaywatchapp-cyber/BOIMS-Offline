import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initializeApp, getApps, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * BOIMS Development Maintenance Utility (Firebase Admin SDK)
 * 
 * Purpose:
 * Clears ALL documents from every BOIMS Firestore collection and subcollection.
 * Uses Firebase Admin SDK to bypass Firestore Security Rules in development.
 * Reusable database reset tool for developer maintenance.
 */

// Known target collections specified in BOIMS system requirements
const KNOWN_COLLECTIONS = [
  'announcements',
  'auditLogs',
  'blotterCases',
  'blotter_cases',
  'blotters',
  'certificateRequests',
  'certificates',
  'households',
  'inventory',
  'inventory_assets',
  'notifications',
  'presence',
  'registrations',
  'reports',
  'residents',
  'settings',
  'system',
  'systemReadiness',
  'systemSettings',
  'users',
];

// Helper to load Firebase configuration safely
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

async function clearAllFirestoreData() {
  console.log('====================================================');
  console.log('🔥 BOIMS Firestore Maintenance Utility: Reset Database');
  console.log('====================================================\n');

  const projectId = getProjectId();
  console.log(`📌 Target Firebase Project: "${projectId}"`);
  console.log('🚀 Initializing Firebase Admin SDK client...\n');

  if (getApps().length === 0) {
    let credentialObj;

    // Check if service account JSON path is specified or present locally
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

  const db = getFirestore();

  // Discover existing collections dynamically using Admin SDK
  let discoveredCollectionIds: string[] = [];
  try {
    const rootCollections = await db.listCollections();
    discoveredCollectionIds = rootCollections.map((col) => col.id);
    console.log(`🔍 Dynamically discovered ${discoveredCollectionIds.length} root collection(s) via Admin SDK.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Dynamic collection listing notice (using known collections list):', msg);
  }

  const allCollectionsSet = new Set([...KNOWN_COLLECTIONS, ...discoveredCollectionIds]);
  const collectionsToProcess = Array.from(allCollectionsSet);

  console.log(`📋 Collections to inspect & clear (${collectionsToProcess.length}):`);
  collectionsToProcess.forEach((c) => console.log(`   - ${c}`));
  console.log('');

  let totalDocsDeleted = 0;
  let totalCollectionsCleared = 0;

  for (const collectionName of collectionsToProcess) {
    console.log(`🧹 Processing collection: "${collectionName}"...`);
    try {
      const colRef = db.collection(collectionName);
      const snapshot = await colRef.get();

      if (snapshot.empty) {
        console.log(`   ℹ️ Collection "${collectionName}" is empty (0 documents).`);
        totalCollectionsCleared++;
        continue;
      }

      const docCount = snapshot.size;
      console.log(`   📄 Found ${docCount} document(s) in "${collectionName}". Recursively deleting...`);

      // Use Admin SDK recursive delete to safely delete docs and all subcollections
      await db.recursiveDelete(colRef);

      console.log(`   ✅ Successfully cleared collection "${collectionName}" (${docCount} documents deleted).\n`);
      totalDocsDeleted += docCount;
      totalCollectionsCleared++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ⚠️ Error clearing collection "${collectionName}":`, msg, '\n');
    }
  }

  console.log('====================================================');
  console.log('🎉 BOIMS Firestore Reset Complete!');
  console.log('====================================================');
  console.log(`- Total collections cleared: ${totalCollectionsCleared}`);
  console.log(`- Total documents deleted:   ${totalDocsDeleted}`);
  console.log('====================================================\n');

  process.exit(0);
}

clearAllFirestoreData().catch((err) => {
  console.error('❌ Fatal error in Firestore maintenance utility:', err);
  process.exit(1);
});
