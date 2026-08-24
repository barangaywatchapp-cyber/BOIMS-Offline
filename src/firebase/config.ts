/**
 * Firebase App & Firestore Initialization
 * Implements Firestore Offline Persistence and Centralized Error Handling
 */

import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  Firestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getDoc,
  doc,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { env } from '../config/env';

// Suppress verbose benign network reachability warnings in sandbox/offline mode
setLogLevel('error');

export const firebaseConfig = {
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId: env.firebaseAppId,
};

// Initialize Firebase App uniquely
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with Persistent Local Cache (Firestore Offline Persistence)
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  dbInstance = getFirestore(app);
}

export const db: Firestore = dbInstance;
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);

// Firestore Error Handler conforming strictly to Firebase Skill Specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };
  console.error('BOIMS Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates Firestore server connectivity on app boot
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('connection timeout')), 2500)
    );
    await Promise.race([
      getDoc(doc(db, 'system', 'connection_health')),
      timeoutPromise,
    ]);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('BOIMS operating in Offline Mode via Firestore Local Cache.');
    } else {
      console.info('BOIMS running with Firestore connection fallback/cache.');
    }
    return false;
  }
}
