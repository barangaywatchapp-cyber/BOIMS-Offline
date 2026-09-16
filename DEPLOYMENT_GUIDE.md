# BOIMS - Barangay Operational & Incident Management System
## Deployment Guide

**Target Environments:**
1. **Development / Preview Runtime:** AI Studio Managed Container (Node.js 20+ / Express + Vite, Port 3000, Firebase Spark Tier)
2. **Production Deployment Option:** Dedicated GCP Cloud Run Container / Firebase Services  
**Baseline Release:** Version 1.0.0 (Production Hardened)  

---

## 1. Runtime Environments & Architecture

### A. Current Development & Preview Runtime
The application currently runs in a sandboxed Node.js 20+ container environment:
- **Dev Runner:** `tsx server.ts` launching Express and mounting Vite in middleware mode.
- **Port Binding:** Strictly port `3000` bound to host `0.0.0.0`, routed externally via an Nginx ingress reverse proxy layer.
- **Firebase Tier:** Operates on the Firebase Spark (free) plan without requiring external billing or self-managed Cloud Run instances.

### B. Dedicated Production Deployment (Optional Cloud Run Target)
For independent municipal deployments outside the managed preview environment:
- **Container Build:** Compiles the client with `npm run build` and bundles the server into `dist/server.cjs` via `esbuild`.
- **Infrastructure:** Self-hosted GCP project with Cloud Run API enabled, Artifact Registry, and Cloud Storage buckets.

---

## 2. Environment Variables Configuration

Declare all standard environment configuration variables in `.env` (refer to `.env.example` template):

```env
# Client-side Firebase Configuration (Accessible via import.meta.env)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Server Port (Required port 3000 for ingress routing)
PORT=3000

# Optional: Server-side Firebase Service Account Key (JSON string)
# Required only for live administrative Firebase Auth user deletion (Identity Toolkit IAM)
# FIREBASE_SERVICE_ACCOUNT_KEY=
```

---

## 3. Server-Side Administrative Capabilities & Firebase Admin SDK

The application backend (`server.ts`) includes administrative API endpoints (e.g. `DELETE /api/admin/users/:uid` for Super Admin account removal):

### Development / Preview Runtime Limitation
In the managed preview environment running without explicit GCP Service Account credentials, the default environment identity does not have IAM authority over the Firebase Authentication / Identity Toolkit backend (`authAdmin.deleteUser()`).
- When this occurs, the server catches the permission error and executes a **graceful administrative archival fallback**:
  - The user document in Firestore `/users/{uid}` is updated with `status: 'archived_deleted'`, `deletedAt`, and `deletedBy`.
  - The API returns HTTP 200 with `{ success: true, authDeletionSkipped: true, message: "User account administratively archived in Firestore. Firebase Auth pool deletion skipped due to preview environment credentials." }`.

### Production Service Account Requirement
To enable true physical deletion of user accounts from the Firebase Authentication user pool in an independent production deployment:
1. Generate a Service Account key in Google Cloud Console with the **Firebase Authentication Admin** role (`roles/firebaseauth.admin`).
2. Provide the key JSON string in the server environment variable: `FIREBASE_SERVICE_ACCOUNT_KEY`.
3. The server automatically initializes `authAdmin` with the provided credential, enabling complete Auth pool deletion.

---

## 4. Firebase Security Rules Deployment

Execute security rules deployment via Firebase CLI:

```bash
# Authenticate with Firebase
firebase login

# Select production Firebase project
firebase use --add

# Deploy Firestore & Storage Security Rules
firebase deploy --only firestore:rules,storage
```

---

## 5. Building & Running for Production

### Standalone Build Verification

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript compilation and lint checks
npm run lint

# 3. Compile client bundle & bundle server to dist/server.cjs
npm run build

# 4. Launch production server
npm run start
```

### Optional: Docker Container Deployment (Cloud Run)

```bash
# Build & submit container image to Google Artifact Registry
gcloud builds submit --tag gcr.io/[PROJECT_ID]/boims-applet:1.0.0

# Deploy to Cloud Run
gcloud run deploy boims-applet \
  --image gcr.io/[PROJECT_ID]/boims-applet:1.0.0 \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 3000
```

---

## 6. Rollback & Disaster Recovery Procedures

### Cloud Run Revision Traffic Shifting (Zero Downtime Revert)
If deployed on standalone Cloud Run, instantly revert traffic to the previous healthy revision:

```bash
gcloud run services update-traffic boims-applet \
  --to-revisions [PREVIOUS_REVISION_NAME]=100
```

### Firestore Point-in-Time Restoration
To restore database state from a daily automated GCP Cloud Storage export:

```bash
gcloud firestore import gs://[BACKUP_BUCKET_NAME]/[EXPORT_PREFIX]
```
