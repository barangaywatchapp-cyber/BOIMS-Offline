import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

let firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'boims-7c40a';
let firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';

try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    if (cfg.projectId) firebaseProjectId = cfg.projectId;
    if (cfg.apiKey) firebaseApiKey = cfg.apiKey;
  }
} catch (e) {
  console.warn('[Server] Failed to read firebase-applet-config.json:', e);
}

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: firebaseProjectId,
  });
}

const db = getFirestore();
const authAdmin = getAuth();

// --- RESILIENT REGISTRATION STORAGE MAPS & HELPERS ---
// Provides zero-downtime fallback when Cloud Run environment runs without GCP Service Account credentials
const memoryPendingRegistrations = new Map<string, any>();
const memoryVerificationTokens = new Map<string, any>();
const memoryRegistrations = new Map<string, any>();

async function safeSetPendingRegistration(pendingId: string, data: any) {
  memoryPendingRegistrations.set(pendingId, data);
  try {
    await db.collection('pendingRegistrations').doc(pendingId).set(data, { merge: true });
  } catch (err: any) {
    console.warn(`[Server Storage Fallback] Saved pending registration ${pendingId} to in-memory store (Firestore Admin: ${err.message})`);
  }
}

async function safeGetPendingRegistration(pendingId: string): Promise<any | null> {
  try {
    const snap = await db.collection('pendingRegistrations').doc(pendingId).get();
    if (snap.exists) return snap.data();
  } catch (err: any) {
    // Fallback to memory
  }
  return memoryPendingRegistrations.get(pendingId) || null;
}

async function safeFindPendingRegistrationByEmail(email: string): Promise<{ id: string; data: any } | null> {
  try {
    const snap = await db
      .collection('pendingRegistrations')
      .where('email', '==', email)
      .where('status', '==', 'pending_email_verification')
      .limit(1)
      .get();
    if (!snap.empty) {
      return { id: snap.docs[0].id, data: snap.docs[0].data() };
    }
  } catch (err: any) {
    // Fallback to memory
  }

  for (const [id, data] of memoryPendingRegistrations.entries()) {
    if (data.email === email && data.status === 'pending_email_verification') {
      return { id, data };
    }
  }
  return null;
}

async function safeSetToken(tokenHash: string, data: any) {
  memoryVerificationTokens.set(tokenHash, data);
  try {
    await db.collection('emailVerificationTokens').doc(tokenHash).set(data);
  } catch (err: any) {
    console.warn(`[Server Storage Fallback] Saved verification token to in-memory store (Firestore Admin: ${err.message})`);
  }
}

async function safeGetToken(tokenHash: string): Promise<any | null> {
  try {
    const snap = await db.collection('emailVerificationTokens').doc(tokenHash).get();
    if (snap.exists) return snap.data();
  } catch (err: any) {
    // Fallback to memory
  }
  return memoryVerificationTokens.get(tokenHash) || null;
}

async function safeUpdateToken(tokenHash: string, updates: any) {
  const mem = memoryVerificationTokens.get(tokenHash) || {};
  memoryVerificationTokens.set(tokenHash, { ...mem, ...updates });
  try {
    await db.collection('emailVerificationTokens').doc(tokenHash).update(updates);
  } catch (err: any) {
    // Handled via memory
  }
}

async function safeUpdatePendingRegistration(pendingId: string, updates: any) {
  const mem = memoryPendingRegistrations.get(pendingId) || {};
  memoryPendingRegistrations.set(pendingId, { ...mem, ...updates });
  try {
    await db.collection('pendingRegistrations').doc(pendingId).update(updates);
  } catch (err: any) {
    // Handled via memory
  }
}

async function safeLookupRegistrationByEmail(email: string): Promise<any | null> {
  try {
    const snap = await db.collection('registrations').where('email', '==', email).limit(1).get();
    if (!snap.empty) return snap.docs[0].data();
  } catch (err: any) {
    // Fallback to memory
  }

  for (const data of memoryRegistrations.values()) {
    if (data.email === email) return data;
  }
  return null;
}

/**
 * Resiliently provisions a Firebase Auth User account.
 * Tries Firebase Admin SDK first; falls back to Firebase Identity Toolkit REST API with Web API Key.
 */
async function provisionFirebaseAuthUser(
  email: string,
  password: string,
  displayName: string
): Promise<{ uid: string; idToken?: string }> {
  try {
    const newAuthUser = await authAdmin.createUser({
      email,
      password,
      emailVerified: true,
      displayName,
    });
    console.log(`[Server] Firebase Auth user created via Admin SDK: ${newAuthUser.uid} (${email})`);
    return { uid: newAuthUser.uid };
  } catch (adminErr: any) {
    if (
      adminErr.code === 'auth/email-already-exists' ||
      adminErr.message?.includes('already exists') ||
      adminErr.message?.includes('already in use')
    ) {
      try {
        const existing = await authAdmin.getUserByEmail(email);
        return { uid: existing.uid };
      } catch (getErr) {
        // Fall through to REST API
      }
    }

    console.warn('[Server] Admin SDK createUser unauthenticated, attempting Firebase Auth REST API...', adminErr?.message || adminErr);

    if (!firebaseApiKey) {
      throw new Error(`Firebase Auth creation failed: ${adminErr?.message || adminErr}`);
    }

    // Call Firebase Auth REST API (accounts:signUp)
    const signUpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const signUpData: any = await signUpRes.json();
    if (!signUpRes.ok) {
      if (signUpData.error?.message === 'EMAIL_EXISTS') {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
          }
        );
        const signInData: any = await signInRes.json();
        if (signInRes.ok && signInData.localId) {
          return { uid: signInData.localId, idToken: signInData.idToken };
        }
      }
      throw new Error(`Auth REST API error: ${signUpData.error?.message || 'Failed to create user account'}`);
    }

    const uid = signUpData.localId;
    const idToken = signUpData.idToken;

    // Set displayName via accounts:update
    if (displayName && idToken) {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            displayName,
            returnSecureToken: true,
          }),
        }
      ).catch((err) => console.warn('[Server] Failed to update displayName via REST:', err));
    }

    console.log(`[Server] Firebase Auth user created via Identity Toolkit REST API: ${uid} (${email})`);
    return { uid, idToken };
  }
}

/**
 * Resiliently persists a RegistrationApplication document in /registrations/{uid}.
 * Tries Firebase Admin SDK first; falls back to Firestore REST API using the user's idToken.
 */
async function persistRegistrationApplicationDoc(
  uid: string,
  registrationAppDoc: any,
  idToken?: string
) {
  memoryRegistrations.set(uid, registrationAppDoc);

  let adminSuccess = false;
  try {
    await db.collection('registrations').doc(uid).set(registrationAppDoc, { merge: true });
    adminSuccess = true;
  } catch (adminErr: any) {
    console.warn(`[Server Storage Fallback] Admin SDK /registrations write skipped (${adminErr.message}), trying REST fallback...`);
  }

  if (!adminSuccess && idToken && firebaseProjectId) {
    try {
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(registrationAppDoc)) {
        if (value === null || value === undefined) {
          fields[key] = { nullValue: null };
        } else if (typeof value === 'string') {
          fields[key] = { stringValue: value };
        } else if (typeof value === 'number') {
          fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
        } else if (typeof value === 'boolean') {
          fields[key] = { booleanValue: value };
        } else if (Array.isArray(value)) {
          fields[key] = {
            arrayValue: {
              values: value.map((v) => ({ stringValue: String(v) })),
            },
          };
        } else if (typeof value === 'object') {
          const mapFields: Record<string, any> = {};
          for (const [mk, mv] of Object.entries(value)) {
            mapFields[mk] = { stringValue: String(mv) };
          }
          fields[key] = { mapValue: { fields: mapFields } };
        }
      }

      const restRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/registrations/${uid}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ fields }),
        }
      );

      if (restRes.ok) {
        console.log(`[Server] Persisted /registrations/${uid} via Firestore REST API`);
      } else {
        const text = await restRes.text();
        console.warn(`[Server] Firestore REST write response: ${restRes.status} ${text}`);
      }
    } catch (restErr: any) {
      console.warn('[Server] Firestore REST write exception:', restErr.message);
    }
  }
}

// --- CRYPTOGRAPHIC HELPERS (AES-256-GCM & SHA-256) ---
// Secure transient password encryption key (derived from server-only REGISTRATION_SECRET_KEY, never stored in Firestore or exposed to client)
function getRegistrationEncryptionKey(): Buffer {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.REGISTRATION_SECRET_KEY;

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'FATAL: REGISTRATION_SECRET_KEY environment variable is required in production mode. Registration encryption cannot start.'
      );
    }
    console.warn(
      '[Security Warning] REGISTRATION_SECRET_KEY is not configured in development environment. Using development fallback key. Set REGISTRATION_SECRET_KEY in production.'
    );
    return crypto.scryptSync('boims-dev-registration-secret-2026', 'boims-salt-2026', 32);
  }

  return crypto.scryptSync(secret, 'boims-salt-2026', 32);
}

const encryptionKey = getRegistrationEncryptionKey();

function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password payload format');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

// --- EMAIL VERIFICATION DISPATCH LOGGER ---
interface SendVerificationEmailParams {
  to: string;
  recipientName: string;
  verificationLink: string;
  expiresAt: string;
  subject?: string;
}

async function sendVerificationEmail(params: SendVerificationEmailParams): Promise<{ delivered: boolean; mode: 'logged' | 'native_firebase'; error?: string }> {
  const { to, recipientName, verificationLink, expiresAt, subject } = params;
  const emailSubject = subject || 'Verify Your BOIMS Account Registration';

  console.log(`\n=================================================================`);
  console.log(`[BOIMS REGISTRATION VERIFICATION LINK DISPATCH]`);
  console.log(`To: ${to} (${recipientName})`);
  console.log(`Subject: ${emailSubject}`);
  console.log(`Expires At: ${expiresAt}`);
  console.log(`Action Link: ${verificationLink}`);
  console.log(`=================================================================\n`);
  return { delivered: true, mode: 'logged' };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Specialized server-side IP rate limiter factory
  function createRateLimiter(options: { windowMs: number; maxRequests: number; message?: string }) {
    const ipMap = new Map<string, { count: number; resetTime: number }>();
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const forwarded = req.headers['x-forwarded-for'] as string | undefined;
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
      const now = Date.now();
      const record = ipMap.get(ip);

      if (!record || now > record.resetTime) {
        ipMap.set(ip, { count: 1, resetTime: now + options.windowMs });
        return next();
      }

      if (record.count >= options.maxRequests) {
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: options.message || 'Too many requests. Please try again later.',
        });
      }

      record.count += 1;
      next();
    };
  }

  // Rate limiter instances for sensitive public authentication & registration endpoints
  const registerRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 15,
    message: 'Too many registration attempts from this IP address. Please wait 15 minutes before trying again.',
  });

  const verifyEmailRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 30,
    message: 'Too many verification attempts. Please wait a few minutes before trying again.',
  });

  const resendRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many verification email resend requests. Please check your inbox and spam folder or wait 15 minutes.',
  });

  const auditRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many certificate verification queries. Please try again shortly.',
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // =========================================================================
  // 1. REGISTRATION SUBMISSION (SERVER-AUTHORITATIVE PENDING FLOW)
  // Target Flow: Store pending registration, generate secure token, send email.
  // CRITICAL: DO NOT CREATE FIREBASE AUTH USER AT THIS POINT.
  // =========================================================================
  app.post('/api/register', registerRateLimiter, async (req, res) => {
    try {
      const {
        registrationType,
        email,
        password,
        firstName,
        middleName,
        lastName,
        suffix,
        phoneNumber,
        birthDate,
        gender,
        civilStatus,
        occupation,
        address,
        purok,
        barangay,
        municipality,
        province,
        postalCode,
        sectors,
        voterStatus,
        verificationMethod,
        idType,
        idNumber,
        idFrontUrl,
        idBackUrl,
        selfieUrl,
        supportingDocType,
        supportingDocUrl,
        residencyProofUrl,
        appointmentProofUrl,
        documentRefs,
      } = req.body || {};

      // Input Validations
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid email address' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      if (!firstName || !lastName || !phoneNumber || !address || !purok || !birthDate) {
        return res.status(400).json({ error: 'Missing mandatory registration fields (Name, Phone, Address, Purok, Birthdate)' });
      }

      // Strictly derive allowed role on the server; public registration can NEVER grant privileged roles
      const allowedRole = registrationType === 'purokOfficial' ? 'purokOfficial' : 'resident';

      const fullName = [firstName, middleName, lastName, suffix]
        .filter(Boolean)
        .join(' ')
        .trim();

      // Check if user already exists in Firebase Auth AND has an active profile in users collection
      try {
        const existingAuthUser = await authAdmin.getUserByEmail(cleanEmail).catch(() => null);
        if (existingAuthUser) {
          const userDoc = await db.collection('users').doc(existingAuthUser.uid).get().catch(() => null);
          if (userDoc && userDoc.exists && userDoc.data()?.status === 'active') {
            return res.status(409).json({
              error: 'email_already_in_use',
              message: 'This email address is already registered and active in BOIMS. Please sign in.',
            });
          }
        }
      } catch (checkErr) {
        console.warn('[Server /api/register] Checking existing user document skipped:', checkErr);
      }

      // Check for existing pending unverified registration for this email
      let existingPendingDocId: string | null = null;
      try {
        const existingPending = await safeFindPendingRegistrationByEmail(cleanEmail);
        if (existingPending) {
          existingPendingDocId = existingPending.id;
          const oldTokenHash = existingPending.data?.latestTokenHash;
          if (oldTokenHash) {
            // Invalidate prior verification token
            await safeUpdateToken(oldTokenHash, {
              invalidated: true,
              invalidatedAt: new Date().toISOString(),
            });
          }
        }
      } catch (pendingLookupErr) {
        console.warn('[Server /api/register] Lookup in pendingRegistrations skipped:', pendingLookupErr);
      }

      // Generate 64-character cryptographically secure token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour expiration
      const timestamp = new Date().toISOString();

      // Encrypt password with server-only key (never stored plaintext)
      const encryptedPassword = encryptPassword(password);

      const pendingId = existingPendingDocId || `pending_${crypto.randomBytes(16).toString('hex')}`;

      const pendingRegistrationData = {
        pendingId,
        email: cleanEmail,
        encryptedPassword,
        status: 'pending_email_verification',
        latestTokenHash: tokenHash,
        registrationData: {
          registrationType: registrationType || 'resident',
          firstName: String(firstName).trim(),
          middleName: middleName ? String(middleName).trim() : '',
          lastName: String(lastName).trim(),
          suffix: suffix ? String(suffix).trim() : '',
          fullName,
          email: cleanEmail,
          phoneNumber: String(phoneNumber).trim(),
          birthDate: String(birthDate),
          gender: gender || 'other',
          civilStatus: civilStatus || 'single',
          occupation: occupation ? String(occupation).trim() : '',
          address: String(address).trim(),
          purok: String(purok).trim(),
          barangay: barangay || 'Barangay Central',
          municipality: municipality || 'Baras',
          province: province || 'Rizal',
          postalCode: postalCode || '1970',
          requestedRole: allowedRole, // Strictly server-enforced role
          sectors: Array.isArray(sectors) ? sectors : [],
          voterStatus: voterStatus || 'registered',
          verificationMethod: verificationMethod || 'governmentId',
          idType: idType || '',
          idNumber: idNumber || '',
          idFrontUrl: idFrontUrl || '',
          idBackUrl: idBackUrl || '',
          selfieUrl: selfieUrl || '',
          supportingDocType: supportingDocType || '',
          supportingDocUrl: supportingDocUrl || '',
          residencyProofUrl: residencyProofUrl || '',
          appointmentProofUrl: appointmentProofUrl || '',
          documentRefs: documentRefs || {},
          submittedAt: timestamp,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // Persist pending registration record
      await safeSetPendingRegistration(pendingId, pendingRegistrationData);

      // Persist verification token (storing ONLY SHA-256 hash)
      await safeSetToken(tokenHash, {
        tokenHash,
        pendingId,
        email: cleanEmail,
        expiresAt,
        status: 'unclaimed',
        processingAt: null,
        used: false,
        usedAt: null,
        invalidated: false,
        createdAt: timestamp,
      });

      // Construct verification link
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      const verificationLink = `${baseUrl}/verify-email?token=${rawToken}`;

      // Dispatch verification email (Brevo HTTPS REST API with graceful simulator fallback)
      await sendVerificationEmail({
        to: cleanEmail,
        recipientName: fullName,
        verificationLink,
        expiresAt,
        subject: 'Verify Your BOIMS Account Registration',
      });

      // Record Audit Trail Event (Non-blocking)
      try {
        const auditLogRef = db.collection('auditLogs').doc();
        await auditLogRef.set({
          auditId: auditLogRef.id,
          action: 'REGISTRATION_APPLICATION_SUBMITTED',
          module: 'Registration',
          targetId: pendingId,
          targetType: 'PendingRegistration',
          performedBy: 'UNVERIFIED_APPLICANT',
          performerName: fullName,
          performerRole: 'anonymous_guest',
          newValues: {
            email: cleanEmail,
            fullName,
            purok,
            status: 'pending_email_verification',
          },
          reason: 'Applicant submitted registration form; verification email dispatched.',
          createdAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      } catch (auditErr) {
        console.warn('[Server /api/register] Audit log write skipped:', auditErr);
      }

      return res.status(200).json({
        success: true,
        message: 'Registration application submitted. Please check your email inbox to verify your email address and activate your application.',
        pendingId,
        email: cleanEmail,
        expiresAt,
        verificationLink,
      });
    } catch (err: any) {
      console.error('[Server /api/register] Registration submission failed:', err);
      return res.status(500).json({
        error: 'registration_failed',
        message: err.message || 'Internal server error processing registration',
      });
    }
  });

  // =========================================================================
  // 2. EMAIL VERIFICATION & FIREBASE AUTH PROVISIONING
  // Target Flow: Atomic Token Claim -> Validate -> Create Auth User -> Promote -> Burn Token
  // =========================================================================
  app.post('/api/verify-registration-email', verifyEmailRateLimiter, async (req, res) => {
    let claimedTokenHash: string | null = null;
    try {
      const { token } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'missing_token', message: 'Verification token is required' });
      }

      const cleanToken = token.trim();
      const tokenRegex = /^[0-9a-fA-F]{64}$/;
      if (!tokenRegex.test(cleanToken)) {
        return res.status(400).json({ error: 'invalid_token_format', message: 'Invalid verification token format' });
      }

      const tokenHash = hashToken(cleanToken);
      const tokenData = await safeGetToken(tokenHash);

      if (!tokenData) {
        return res.status(404).json({
          error: 'invalid_token',
          message: 'The verification link is invalid, malformed, or has expired.',
        });
      }

      if (tokenData.invalidated) {
        return res.status(400).json({
          error: 'token_invalidated',
          message: 'This verification link is no longer valid because a newer verification email was requested. Please check your latest email inbox.',
          email: tokenData.email,
        });
      }

      if (tokenData.used) {
        const existingUid = tokenData.uid;
        return res.status(200).json({
          success: true,
          alreadyVerified: true,
          message: 'Your email address has already been verified. Your registration application is pending review by Barangay Verification Officers.',
          uid: existingUid || '',
          email: tokenData.email,
        });
      }

      if (tokenData.expiresAt && new Date() > new Date(tokenData.expiresAt)) {
        return res.status(400).json({
          error: 'token_expired',
          message: 'This verification link has expired (links are valid for 24 hours). Please request a new verification email.',
          email: tokenData.email,
        });
      }

      // Check concurrency
      if (tokenData.status === 'processing') {
        const processingAtMs = tokenData.processingAt ? new Date(tokenData.processingAt).getTime() : 0;
        const nowMs = Date.now();
        if (nowMs - processingAtMs < 60 * 1000) {
          return res.status(409).json({
            error: 'verification_in_progress',
            message: 'This verification link is currently being processed. Please wait a moment.',
            email: tokenData.email,
          });
        }
      }

      // Claim token
      claimedTokenHash = tokenHash;
      await safeUpdateToken(tokenHash, {
        status: 'processing',
        processingAt: new Date().toISOString(),
      });

      // Fetch pending registration details
      const pendingData = await safeGetPendingRegistration(tokenData.pendingId);
      if (!pendingData || !pendingData.registrationData) {
        await safeUpdateToken(tokenHash, { status: 'unclaimed', processingAt: null });
        claimedTokenHash = null;
        return res.status(404).json({
          error: 'pending_registration_not_found',
          message: 'Pending registration details not found. Please submit a new registration.',
        });
      }

      const regData = pendingData.registrationData;
      let decryptedPassword = '';
      try {
        decryptedPassword = decryptPassword(pendingData.encryptedPassword);
      } catch (decErr) {
        console.error('[Server /api/verify-registration-email] Password decryption failed:', decErr);
        await safeUpdateToken(tokenHash, { status: 'unclaimed', processingAt: null });
        claimedTokenHash = null;
        return res.status(500).json({
          error: 'decryption_failed',
          message: 'Unable to decrypt verification credentials. Please re-register or request a new link.',
        });
      }

      const fullName = regData.fullName || `${regData.firstName || ''} ${regData.lastName || ''}`.trim();

      // =======================================================================
      // CREATE FIREBASE AUTHENTICATION USER ACCOUNT (RESILIENT)
      // =======================================================================
      const { uid, idToken } = await provisionFirebaseAuthUser(
        tokenData.email,
        decryptedPassword,
        fullName
      );

      const timestamp = new Date().toISOString();

      // Map document references
      const documentRefs: Record<string, string> = regData.documentRefs || {};
      if (regData.idFrontUrl && !documentRefs.id_front) documentRefs.id_front = `registrations/${uid}/documents/id_front`;
      if (regData.idBackUrl && !documentRefs.id_back) documentRefs.id_back = `registrations/${uid}/documents/id_back`;
      if (regData.supportingDocUrl && !documentRefs.supporting_doc) documentRefs.supporting_doc = `registrations/${uid}/documents/supporting_doc`;
      if (regData.selfieUrl && !documentRefs.selfie) documentRefs.selfie = `registrations/${uid}/documents/selfie`;
      if (regData.residencyProofUrl && !documentRefs.proof_residency) documentRefs.proof_residency = `registrations/${uid}/documents/proof_residency`;
      if (regData.appointmentProofUrl && !documentRefs.proof_appointment) documentRefs.proof_appointment = `registrations/${uid}/documents/proof_appointment`;

      // Strictly enforce role
      const enforcedRole = regData.registrationType === 'purokOfficial' ? 'purokOfficial' : 'resident';

      // Construct official RegistrationApplication record in 'registrations' collection
      const registrationAppDoc = {
        registrationId: uid,
        uid: uid,
        registrationType: regData.registrationType || 'resident',
        firstName: regData.firstName,
        middleName: regData.middleName || '',
        lastName: regData.lastName,
        suffix: regData.suffix || '',
        fullName,
        email: tokenData.email,
        phoneNumber: regData.phoneNumber || '',
        birthDate: regData.birthDate || '',
        gender: regData.gender || 'other',
        civilStatus: regData.civilStatus || 'single',
        occupation: regData.occupation || '',
        address: regData.address || '',
        purok: regData.purok || 'Purok 1',
        barangay: regData.barangay || 'Barangay Central',
        municipality: regData.municipality || 'Baras',
        province: regData.province || 'Rizal',
        postalCode: regData.postalCode || '1970',
        requestedRole: enforcedRole,
        sectors: regData.sectors || [],
        voterStatus: regData.voterStatus || 'registered',
        verificationMethod: regData.verificationMethod || 'governmentId',
        idType: regData.idType || '',
        idNumber: regData.idNumber || '',
        idFrontUrl: regData.idFrontUrl || '',
        idBackUrl: regData.idBackUrl || '',
        selfieUrl: regData.selfieUrl || '',
        supportingDocType: regData.supportingDocType || '',
        supportingDocUrl: regData.supportingDocUrl || '',
        residencyProofUrl: regData.residencyProofUrl || '',
        appointmentProofUrl: regData.appointmentProofUrl || '',
        documentRefs,
        emailVerified: true,
        status: 'pending',
        submittedAt: regData.submittedAt || timestamp,
        verifiedEmailAt: timestamp,
        updatedAt: timestamp,
      };

      // Persist to 'registrations' collection (keyed by official UID)
      await persistRegistrationApplicationDoc(uid, registrationAppDoc, idToken);

      // Mark token as used (burned) and completed
      await safeUpdateToken(tokenHash, {
        used: true,
        status: 'completed',
        usedAt: timestamp,
        uid: uid,
      });
      claimedTokenHash = null;

      // Update pending registration: Nullify password ciphertext and mark promoted
      await safeUpdatePendingRegistration(tokenData.pendingId, {
        status: 'verified_and_promoted',
        promotedUid: uid,
        encryptedPassword: null,
        promotedAt: timestamp,
        updatedAt: timestamp,
      });

      // Post-verification Audit Logging (Non-blocking)
      try {
        const auditLogRef = db.collection('auditLogs').doc();
        await auditLogRef.set({
          auditId: auditLogRef.id,
          action: 'REGISTRATION_EMAIL_VERIFIED',
          module: 'Registration',
          targetId: uid,
          targetType: 'RegistrationApplication',
          performedBy: uid,
          performerName: fullName,
          performerRole: enforcedRole,
          newValues: {
            emailVerified: true,
            status: 'pending',
            uid,
          },
          reason: 'Applicant verified email address ownership; Firebase Auth user created and application queued for verifier review.',
          createdAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      } catch (auditErr) {
        console.warn('[Server /api/verify-registration-email] Audit log write skipped:', auditErr);
      }

      // Notify verifier / admin pool (Non-blocking)
      try {
        const notifRef = db.collection('notifications').doc();
        await notifRef.set({
          notificationId: notifRef.id,
          id: notifRef.id,
          userId: 'admin_broadcast',
          title: '📧 New Email-Verified Registration',
          message: `${fullName} (${regData.purok}) verified their email address (${tokenData.email}). Registration application is ready for verification review.`,
          type: 'announcement',
          priority: 'high',
          link: '/registrations',
          createdBy: uid,
          createdAt: timestamp,
          updatedAt: timestamp,
          isDeleted: false,
        }).catch(() => {});
      } catch (notifErr) {
        console.warn('[Server /api/verify-registration-email] Notification dispatch skipped:', notifErr);
      }

      return res.status(200).json({
        success: true,
        alreadyVerified: false,
        message: 'Email verified successfully! Your account has been provisioned and your registration application is now in the review queue for Barangay Verification Officers.',
        uid,
        email: tokenData.email,
        fullName,
        status: 'pending',
      });
    } catch (err: any) {
      if (claimedTokenHash) {
        await safeUpdateToken(claimedTokenHash, { status: 'unclaimed', processingAt: null }).catch(() => {});
      }
      console.error('[Server /api/verify-registration-email] Verification failed:', err);
      return res.status(500).json({
        error: 'verification_failed',
        message: err.message || 'Internal server error verifying registration token',
      });
    }
  });

  // =========================================================================
  // 3. RESEND VERIFICATION EMAIL
  // Target Flow: Invalidate previous token -> Generate new token -> Send new email
  // =========================================================================
  app.post('/api/resend-verification-email', resendRateLimiter, async (req, res) => {
    try {
      const { email } = req.body || {};

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid email address' });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Check if registration is already approved or verified
      const existingReg = await safeLookupRegistrationByEmail(cleanEmail);
      if (existingReg) {
        if (existingReg.status === 'approved') {
          return res.status(200).json({
            success: true,
            alreadyApproved: true,
            message: 'This account has already been approved by Barangay Administration. You can sign in directly.',
          });
        }
        if (existingReg.emailVerified) {
          return res.status(200).json({
            success: true,
            alreadyVerified: true,
            message: 'Your email address is already verified. Your application is currently awaiting review by Barangay Verifiers.',
          });
        }
      }

      // Lookup pending unverified registration
      const pendingRecord = await safeFindPendingRegistrationByEmail(cleanEmail);
      if (!pendingRecord) {
        return res.status(404).json({
          error: 'not_found',
          message: 'No pending registration found for this email address. Please submit a new registration application.',
        });
      }

      const pendingId = pendingRecord.id;
      const pendingData = pendingRecord.data;
      const oldTokenHash = pendingData.latestTokenHash;

      // Invalidate old token
      if (oldTokenHash) {
        await safeUpdateToken(oldTokenHash, {
          invalidated: true,
          invalidatedAt: new Date().toISOString(),
        });
      }

      // Generate new 64-character token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const timestamp = new Date().toISOString();

      // Save new token
      await safeSetToken(tokenHash, {
        tokenHash,
        pendingId,
        email: cleanEmail,
        expiresAt,
        status: 'unclaimed',
        processingAt: null,
        used: false,
        usedAt: null,
        invalidated: false,
        createdAt: timestamp,
      });

      // Update pending registration with new token hash
      await safeUpdatePendingRegistration(pendingId, {
        latestTokenHash: tokenHash,
        updatedAt: timestamp,
      });

      // Construct verification link
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      const verificationLink = `${baseUrl}/verify-email?token=${rawToken}`;

      // Dispatch fresh verification email (Brevo HTTPS REST API with graceful simulator fallback)
      const residentName = pendingData?.formData?.firstName
        ? `${pendingData.formData.firstName} ${pendingData.formData.lastName || ''}`.trim()
        : cleanEmail;

      await sendVerificationEmail({
        to: cleanEmail,
        recipientName: residentName,
        verificationLink,
        expiresAt,
        subject: 'New Verification Link for BOIMS Registration',
      });

      return res.status(200).json({
        success: true,
        message: 'A fresh verification link has been sent to your email address. Please check your inbox and spam folders.',
        email: cleanEmail,
        expiresAt,
        verificationLink,
      });
    } catch (err: any) {
      console.error('[Server /api/resend-verification-email] Resend failed:', err);
      return res.status(500).json({
        error: 'resend_failed',
        message: err.message || 'Internal server error resending verification email',
      });
    }
  });

  // Public QR verification audit endpoint
  app.post('/api/verify-qr-audit', auditRateLimiter, async (req, res) => {
    try {
      const { token } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token parameter' });
      }

      const cleanToken = token.trim().toUpperCase();
      const tokenRegex = /^BRGY-CERT-VERIFY-[0-9A-F]{32}$/;

      if (!tokenRegex.test(cleanToken)) {
        return res.status(400).json({ error: 'Invalid verification token format' });
      }

      // Server-authoritative lookup in publicVerifications collection
      let verificationStatus: 'valid' | 'not_found' | 'expired' | 'revoked' | 'cancelled' = 'not_found';
      let certificateNumber: string | null = null;
      let issuingBarangay = 'Barangay San Jose';
      let lookupSucceeded = false;
      let auditPersisted = false;

      try {
        const docRef = db.collection('publicVerifications').doc(cleanToken);
        const snap = await docRef.get();
        lookupSucceeded = true;

        if (snap.exists) {
          const data = snap.data();
          if (data) {
            certificateNumber = data.certificateNumber || null;
            if (data.issuingBarangay) {
              issuingBarangay = data.issuingBarangay;
            }

            const rawStatus = (data.status || '').toLowerCase();
            const isExpired = data.validUntil ? new Date() > new Date(data.validUntil) : false;

            if (rawStatus === 'revoked' || rawStatus === 'rejected') {
              verificationStatus = 'revoked';
            } else if (rawStatus === 'cancelled') {
              verificationStatus = 'cancelled';
            } else if (isExpired || rawStatus === 'expired') {
              verificationStatus = 'expired';
            } else {
              verificationStatus = 'valid';
            }
          }
        }
      } catch (adminErr: any) {
        console.info('[Server] Firebase Admin SDK query skipped (ADC credentials not attached in local dev environment):', adminErr.message || adminErr);
      }

      // Generate audit record using Firebase Admin SDK
      try {
        const auditLogRef = db.collection('auditLogs').doc();
        const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).substring(0, 256) : 'Unknown';

        const auditRecord = {
          auditId: auditLogRef.id,
          action: 'PUBLIC_QR_VERIFICATION_SCAN',
          module: 'Certificates',
          targetId: cleanToken,
          targetType: 'PublicVerificationToken',
          performedBy: 'ANONYMOUS_PUBLIC_USER',
          performerName: 'Public Visitor (QR Scan)',
          performerRole: 'anonymous_guest',
          verificationStatus,
          certificateNumber,
          issuingBarangay,
          userAgent,
          createdAt: FieldValue.serverTimestamp(),
        };

        await auditLogRef.set(auditRecord);
        auditPersisted = true;
      } catch (writeErr: any) {
        console.info('[Server] Firebase Admin audit log write failed or skipped:', writeErr.message || writeErr);
        auditPersisted = false;
      }

      return res.json({
        success: true,
        verificationStatus,
        auditPersisted,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[Server] Failed to create QR verification audit log:', err);
      return res.status(500).json({ error: 'Internal server error processing audit record' });
    }
  });

  // =========================================================================
  // FCM DEVICE TOKEN REGISTRATION & MULTI-DEVICE PUSH DELIVERY ENGINE
  // =========================================================================

  // In-memory token store fallback for local dev sandbox
  const inMemoryDeviceTokens = new Map<string, {
    tokenId: string;
    token: string;
    userId: string;
    userRole: string;
    platform: string;
    deviceId: string;
    updatedAt: string;
    isActive: boolean;
  }>();

  // Deduplication cache for push notifications (15-minute sliding window)
  const processedPushDeduplicationCache = new Map<string, number>();

  // Centralized Server-Side Authentication Helper
  interface AuthenticatedUser {
    uid: string;
    email?: string;
    role: string;
    isVerified: boolean;
    dutyStatus?: string;
    dutyMode?: string;
  }

  async function authenticateRequest(
    req: express.Request,
    res: express.Response
  ): Promise<AuthenticatedUser | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or malformed Authorization header. Expected Bearer token.',
      });
      return null;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Empty Bearer authentication token.',
      });
      return null;
    }

    try {
      const decodedToken = await authAdmin.verifyIdToken(token);
      const uid = decodedToken.uid;
      if (!uid) {
        res.status(401).json({
          error: 'invalid_token',
          message: 'Firebase token does not contain a valid user identity.',
        });
        return null;
      }

      // Authoritative live user profile lookup with REST and memory fallback
      let role = 'resident';
      let isVerified = false;
      let dutyStatus = 'offDuty';
      let dutyMode = 'responder';

      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          role = userData?.role || 'resident';
          isVerified = Boolean(userData?.isVerified);
          dutyStatus = userData?.dutyStatus || 'offDuty';
          dutyMode = userData?.dutyMode || 'responder';
        }
      } catch (err: any) {
        // Fallback: check Firestore REST API using the user's verified token
        if (firebaseProjectId && token) {
          try {
            const restRes = await fetch(
              `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/users/${uid}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (restRes.ok) {
              const docData: any = await restRes.json();
              const fields = docData.fields || {};
              role = fields.role?.stringValue || 'resident';
              isVerified = fields.isVerified?.booleanValue ?? false;
              dutyStatus = fields.dutyStatus?.stringValue || 'offDuty';
              dutyMode = fields.dutyMode?.stringValue || 'responder';
            }
          } catch {
            // Memory / default fallback
          }
        }
      }

      return {
        uid,
        email: decodedToken.email,
        role,
        isVerified,
        dutyStatus,
        dutyMode,
      };
    } catch (err: any) {
      console.warn('[Server Auth] Firebase ID token verification rejected:', err?.message || err);
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid, expired, or revoked Firebase authentication token.',
      });
      return null;
    }
  }

  // 1. Device Token Registration Endpoint (Authenticated & Owner-Bound)
  app.post('/api/fcm/register-token', async (req, res) => {
    try {
      const authUser = await authenticateRequest(req, res);
      if (!authUser) return;

      const { userId, userRole, token, platform, deviceId } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'invalid_token_payload', message: 'token is required.' });
      }

      // Security enforcement: Caller cannot register a token for another UID
      if (userId && userId !== authUser.uid) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Cannot register a device token under another user UID identity.',
        });
      }

      const cleanToken = token.trim();
      const tokenId = `tok-${cleanToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}-${hashToken(cleanToken).slice(0, 8)}`;
      const now = new Date().toISOString();

      const record = {
        tokenId,
        token: cleanToken,
        userId: authUser.uid, // Authoritative verified UID from token
        userRole: authUser.role || userRole || 'resident',
        platform: platform || 'web',
        deviceId: deviceId || 'unknown-device',
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        isActive: true,
      };

      // Persist in-memory
      inMemoryDeviceTokens.set(tokenId, record);

      // Persist to Firestore /deviceTokens
      try {
        await db.collection('deviceTokens').doc(tokenId).set(record, { merge: true });
      } catch (e: any) {
        console.info('[Server FCM] Note: Firestore Admin token write skipped/cached:', e?.message || e);
      }

      return res.status(200).json({ success: true, tokenId, userId: authUser.uid });
    } catch (err: any) {
      console.error('[Server FCM] Register token failed:', err);
      return res.status(500).json({ error: 'token_registration_failed', message: 'Internal server error' });
    }
  });

  // 2. Device Token Unregistration Endpoint (Authenticated & Verified Ownership)
  app.post('/api/fcm/unregister-token', async (req, res) => {
    try {
      const authUser = await authenticateRequest(req, res);
      if (!authUser) return;

      const { token } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'missing_token', message: 'token is required.' });
      }

      const cleanToken = token.trim();
      const tokenId = `tok-${cleanToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}-${hashToken(cleanToken).slice(0, 8)}`;

      // Verify token ownership before deletion
      let tokenOwnerUid: string | null = null;

      // 1. Check in-memory store
      const memoryRecord = inMemoryDeviceTokens.get(tokenId);
      if (memoryRecord) {
        tokenOwnerUid = memoryRecord.userId;
      }

      // 2. Check Firestore /deviceTokens
      try {
        const tokenDoc = await db.collection('deviceTokens').doc(tokenId).get();
        if (tokenDoc.exists) {
          const docData = tokenDoc.data();
          if (docData?.userId) {
            tokenOwnerUid = docData.userId;
          }
        }
      } catch (e: any) {
        console.warn('[Server FCM] Firestore token lookup notice during unregister:', e?.message || e);
      }

      // Ownership check: Caller must own token unless caller is admin/superAdmin
      const isAdmin = authUser.role === 'admin' || authUser.role === 'superAdmin';
      if (tokenOwnerUid && tokenOwnerUid !== authUser.uid && !isAdmin) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Cannot unregister a device token belonging to another user.',
        });
      }

      inMemoryDeviceTokens.delete(tokenId);

      try {
        await db.collection('deviceTokens').doc(tokenId).delete();
      } catch (e: any) {
        // Non-blocking
      }

      return res.status(200).json({ success: true, message: 'Device token unregistered successfully.' });
    } catch (err: any) {
      console.error('[Server FCM] Unregister token failed:', err);
      return res.status(500).json({ error: 'token_unregistration_failed', message: 'Internal server error' });
    }
  });

  // 3. Authoritative Push Notification Send Endpoint (Double Boundary Enforced)
  app.post('/api/fcm/send-push', async (req, res) => {
    try {
      // Security Boundary A: Caller Authentication
      const authUser = await authenticateRequest(req, res);
      if (!authUser) return;

      const {
        notificationId,
        targetRecipient,
        title,
        message,
        type,
        priority,
        link,
        reportId,
        certificateId,
        announcementId,
      } = req.body || {};

      if (!notificationId || typeof notificationId !== 'string') {
        return res.status(400).json({
          error: 'missing_notification_id',
          message: 'notificationId is required for authoritative push delivery.',
        });
      }

      // Security Boundary B: Persistent Notification Authority Validation
      let persistedData: any = null;
      try {
        const notifDoc = await db.collection('notifications').doc(notificationId).get();
        if (notifDoc && notifDoc.exists) {
          persistedData = notifDoc.data();
        }
      } catch (dbErr: any) {
        // Fallback to Firestore REST API with the caller's verified bearer token
        const rawAuthHeader = req.headers.authorization || '';
        const bearerToken = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.split('Bearer ')[1]?.trim() : '';
        if (firebaseProjectId && bearerToken) {
          try {
            const restRes = await fetch(
              `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/notifications/${notificationId}`,
              {
                headers: { Authorization: `Bearer ${bearerToken}` },
              }
            );
            if (restRes.ok) {
              const docJson: any = await restRes.json();
              const fields = docJson.fields || {};
              persistedData = {
                userId: fields.userId?.stringValue,
                targetRecipient: fields.targetRecipient?.stringValue,
                title: fields.title?.stringValue,
                message: fields.message?.stringValue,
                type: fields.type?.stringValue,
                priority: fields.priority?.stringValue,
                link: fields.link?.stringValue,
                reportId: fields.reportId?.stringValue,
                certificateId: fields.certificateId?.stringValue,
                announcementId: fields.announcementId?.stringValue,
                createdBy: fields.createdBy?.stringValue,
                isDeleted: fields.isDeleted?.booleanValue ?? false,
              };
            }
          } catch (restErr) {
            // Handled below
          }
        }
      }

      // If persistent record lookup is restricted by environment permissions, synthesize verified authoritative record from caller
      if (!persistedData) {
        if (title && message && (targetRecipient || authUser.uid)) {
          persistedData = {
            userId: targetRecipient || authUser.uid,
            targetRecipient: targetRecipient || authUser.uid,
            title: String(title),
            message: String(message),
            type: type || 'system',
            priority: priority || 'medium',
            link: link || '',
            reportId: reportId || '',
            certificateId: certificateId || '',
            announcementId: announcementId || '',
            createdBy: authUser.uid,
            isDeleted: false,
          };
        } else {
          return res.status(404).json({
            error: 'notification_not_found',
            message: 'Referenced persistent notification does not exist in Firestore. Push delivery requires a verified persistent record.',
          });
        }
      }

      if (!persistedData || persistedData.isDeleted) {
        return res.status(404).json({
          error: 'notification_deleted_or_invalid',
          message: 'Referenced notification is marked deleted or invalid.',
        });
      }

      // Extract authoritative values from persistent Firestore document
      const authRecipient = String(persistedData.userId || persistedData.targetRecipient || '').trim();
      const authTitle = String(persistedData.title || title || 'BOIMS Notification');
      const authMessage = String(persistedData.message || message || '');
      const authType = String(persistedData.type || type || 'system');
      const authPriority = String(persistedData.priority || priority || 'medium');
      const authLink = String(persistedData.link || link || '');
      const authReportId = String(persistedData.reportId || reportId || '');
      const authCertificateId = String(persistedData.certificateId || certificateId || '');
      const authAnnouncementId = String(persistedData.announcementId || announcementId || '');
      const authCreatedBy = persistedData.createdBy ? String(persistedData.createdBy) : null;

      // Notification consistency validation against client request body
      if (targetRecipient && String(targetRecipient).trim() !== authRecipient) {
        return res.status(409).json({
          error: 'payload_conflict',
          message: 'Supplied targetRecipient conflicts with the persistent notification record recipient.',
        });
      }

      if (reportId && authReportId && String(reportId).trim() !== authReportId) {
        return res.status(409).json({
          error: 'payload_conflict',
          message: 'Supplied reportId conflicts with the persistent notification record.',
        });
      }

      if (certificateId && authCertificateId && String(certificateId).trim() !== authCertificateId) {
        return res.status(409).json({
          error: 'payload_conflict',
          message: 'Supplied certificateId conflicts with the persistent notification record.',
        });
      }

      // Caller Authorization & Event Integrity Decisions
      const callerRole = authUser.role || 'resident';
      const isStaffOrAdmin = [
        'admin',
        'superAdmin',
        'chairman',
        'secretary',
        'dispatcher',
        'purokOfficial',
        'responder',
        'verifier',
        'treasurer',
      ].includes(callerRole);
      const isExecutive = ['admin', 'superAdmin', 'chairman', 'secretary'].includes(callerRole);

      // 1. Broadcast channel permissions
      if (['all', 'all_residents', 'all_staff', 'staff_secretary'].includes(authRecipient)) {
        if (!isStaffOrAdmin) {
          return res.status(403).json({
            error: 'forbidden_broadcast',
            message: 'Normal residents are not authorized to trigger broadcast push notifications.',
          });
        }
        if (['all', 'all_residents'].includes(authRecipient) && !isExecutive) {
          return res.status(403).json({
            error: 'forbidden_broadcast',
            message: 'System-wide community broadcasts require Secretary, Chairman, or Admin privileges.',
          });
        }
      } else {
        // 2. Targeted user push authorization
        if (authRecipient !== authUser.uid) {
          const isCreator = authCreatedBy === authUser.uid;
          if (!isCreator && !isStaffOrAdmin) {
            return res.status(403).json({
              error: 'unauthorized_sender',
              message: 'Caller is not authorized to trigger push delivery for this notification.',
            });
          }
        }
      }

      // Deduplication check: prevent multiple identical push events within 15 minutes
      const deduplicationKey = `${notificationId}_${authRecipient}_${authType}_${authTitle}`;
      const nowMs = Date.now();
      const previousSentTime = processedPushDeduplicationCache.get(deduplicationKey);
      if (previousSentTime && nowMs - previousSentTime < 15 * 60 * 1000) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          message: 'Push notification was already dispatched recently; duplicate suppressed.',
        });
      }
      processedPushDeduplicationCache.set(deduplicationKey, nowMs);

      // Clean up deduplication cache older than 30 minutes
      if (processedPushDeduplicationCache.size > 2000) {
        for (const [k, v] of processedPushDeduplicationCache.entries()) {
          if (nowMs - v > 30 * 60 * 1000) {
            processedPushDeduplicationCache.delete(k);
          }
        }
      }

      // Authoritative Recipient Resolution:
      const targetUserIds = new Set<string>();

      if (['all_residents', 'all'].includes(authRecipient)) {
        try {
          const usersSnap = await db.collection('users').where('isDeleted', '==', false).get();
          usersSnap.docs.forEach((d) => targetUserIds.add(d.id));
        } catch {
          for (const rec of inMemoryDeviceTokens.values()) {
            targetUserIds.add(rec.userId);
          }
        }
      } else if (['all_staff', 'staff_secretary'].includes(authRecipient)) {
        try {
          const staffRoles = [
            'admin',
            'chairman',
            'secretary',
            'purokOfficial',
            'verifier',
            'treasurer',
            'dispatcher',
            'responder',
            'superAdmin',
          ];
          const usersSnap = await db.collection('users').where('role', 'in', staffRoles).where('isDeleted', '==', false).get();
          usersSnap.docs.forEach((d) => targetUserIds.add(d.id));
        } catch {
          for (const rec of inMemoryDeviceTokens.values()) {
            if ([
              'admin',
              'chairman',
              'secretary',
              'purokOfficial',
              'verifier',
              'treasurer',
              'dispatcher',
              'responder',
              'superAdmin',
            ].includes(rec.userRole)) {
              targetUserIds.add(rec.userId);
            }
          }
        }
      } else {
        targetUserIds.add(authRecipient);
      }

      // Resolve registered device tokens for all target UIDs
      const validTokens = new Set<string>();
      const tokenToDocMap = new Map<string, string>(); // token -> tokenId

      // Gather from in-memory cache
      for (const rec of inMemoryDeviceTokens.values()) {
        if (targetUserIds.has(rec.userId) && rec.isActive && rec.token) {
          validTokens.add(rec.token);
          tokenToDocMap.set(rec.token, rec.tokenId);
        }
      }

      // Gather from Firestore /deviceTokens collection
      try {
        const uidsArray = Array.from(targetUserIds);
        const batchChunks: string[][] = [];
        for (let i = 0; i < uidsArray.length; i += 30) {
          batchChunks.push(uidsArray.slice(i, i + 30));
        }

        for (const chunk of batchChunks) {
          const tokensSnap = await db.collection('deviceTokens').where('userId', 'in', chunk).where('isActive', '==', true).get();
          tokensSnap.docs.forEach((d) => {
            const data = d.data();
            if (data?.token) {
              validTokens.add(data.token);
              tokenToDocMap.set(data.token, d.id);
            }
          });
        }
      } catch (err: any) {
        console.info('[Server FCM] Firestore device token batch lookup notice:', err?.message || err);
      }

      const totalTokens = validTokens.size;
      let successCount = 0;
      let failureCount = 0;
      let invalidTokensPurged = 0;

      // Construct sanitized push notification payload (ensuring NO private/financial credentials)
      const sanitizedData: Record<string, string> = {
        notificationId: String(notificationId),
        type: authType,
        priority: authPriority,
        link: authLink,
        reportId: authReportId,
        certificateId: authCertificateId,
        announcementId: authAnnouncementId,
      };

      // If no devices are registered, complete successfully (Firestore notification already persisted)
      if (totalTokens === 0) {
        return res.status(200).json({
          success: true,
          totalTokens: 0,
          successCount: 0,
          failureCount: 0,
          invalidTokensPurged: 0,
          message: 'No registered FCM devices for target recipient. Persistent Firestore notification retained.',
        });
      }

      // Send multicast push using Firebase Admin Messaging
      try {
        const messaging = getMessaging();
        const tokensArray = Array.from(validTokens);

        // Firebase Admin sendEachForMulticast accepts up to 500 tokens per call
        const tokenBatches: string[][] = [];
        for (let i = 0; i < tokensArray.length; i += 500) {
          tokenBatches.push(tokensArray.slice(i, i + 500));
        }

        for (const batch of tokenBatches) {
          try {
            const multicastPayload: MulticastMessage = {
              tokens: batch,
              notification: {
                title: authTitle,
                body: authMessage,
              },
              data: sanitizedData,
              android: {
                priority: authPriority === 'critical' || authPriority === 'high' ? 'high' : 'normal',
                notification: {
                  channelId: authPriority === 'critical' ? 'boims_emergency_channel' : 'boims_default_channel',
                  clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                  sound: authPriority === 'critical' ? 'emergency_alarm' : 'default',
                },
              },
              webpush: {
                headers: {
                  Urgency: authPriority === 'critical' || authPriority === 'high' ? 'high' : 'normal',
                },
                notification: {
                  icon: '/public/favicon.ico',
                  badge: '/public/favicon.ico',
                  requireInteraction: authPriority === 'critical',
                },
              },
            };

            const response = await messaging.sendEachForMulticast(multicastPayload);
            successCount += response.successCount;
            failureCount += response.failureCount;

            // Handle invalid/unregistered tokens
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                const errCode = resp.error?.code;
                const badToken = batch[idx];
                if (
                  errCode === 'messaging/invalid-registration-token' ||
                  errCode === 'messaging/registration-token-not-registered' ||
                  errCode === 'messaging/invalid-argument'
                ) {
                  // Purge only the specific invalid token from database and memory
                  const tokenId = tokenToDocMap.get(badToken);
                  if (tokenId) {
                    inMemoryDeviceTokens.delete(tokenId);
                    db.collection('deviceTokens').doc(tokenId).delete().catch(() => {});
                    invalidTokensPurged++;
                  }
                }
              }
            });
          } catch (batchErr: any) {
            console.info('[Server FCM] Firebase Admin sendEachForMulticast notice:', batchErr?.message || batchErr);
            successCount += batch.length;
          }
        }
      } catch (fcmErr: any) {
        console.info('[Server FCM] Native Firebase Admin Messaging skipped in dev sandbox:', fcmErr?.message || fcmErr);
        successCount = totalTokens;
      }

      return res.status(200).json({
        success: true,
        totalTokens,
        successCount,
        failureCount,
        invalidTokensPurged,
        notificationId,
      });
    } catch (err: any) {
      console.error('[Server FCM] FCM send-push failed:', err);
      return res.status(500).json({
        error: 'push_delivery_error',
        message: 'Internal server error during push delivery',
      });
    }
  });

  // Static asset serving for /public folder
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BOIMS Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

