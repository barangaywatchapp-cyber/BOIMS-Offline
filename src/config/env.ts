/**
 * Environment Configuration Reader
 * Validates required Firebase environment variables and exports strict application config.
 */

function getRequiredEnvVar(key: string): string {
  const value = import.meta.env[key];
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
  appUrl: import.meta.env.VITE_APP_URL || 'http://localhost:3000',
  isDevelopment: Boolean(import.meta.env.DEV),
  useMockAuthFallback: false,
};
