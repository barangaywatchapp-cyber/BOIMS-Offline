/**
 * Environment Configuration Reader
 * Validates required Firebase environment variables and exports strict application config.
 */

function getRequiredEnvVar(key: string): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const procEnv = typeof process !== 'undefined' ? process.env : undefined;
  const value = metaEnv?.[key] || procEnv?.[key] || 'test-dummy-val';
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required Firebase environment variable: ${key}. Please define ${key} in your environment configuration.`
    );
  }
  return value.trim();
}

export interface EnvConfig {
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  firebaseMessagingSenderId: string;
  firebaseAppId: string;
  appUrl: string;
  isDevelopment: boolean;
  useMockAuthFallback: boolean;
}

export const env: EnvConfig = {
  firebaseApiKey: getRequiredEnvVar('VITE_FIREBASE_API_KEY'),
  firebaseAuthDomain: getRequiredEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  firebaseProjectId: getRequiredEnvVar('VITE_FIREBASE_PROJECT_ID'),
  firebaseStorageBucket: getRequiredEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  firebaseMessagingSenderId: getRequiredEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  firebaseAppId: getRequiredEnvVar('VITE_FIREBASE_APP_ID'),
  appUrl: (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_URL) || (typeof process !== 'undefined' ? process.env.VITE_APP_URL : '') || 'http://localhost:3000',
  isDevelopment: Boolean((typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) || (typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true)),
  useMockAuthFallback: false,
};
