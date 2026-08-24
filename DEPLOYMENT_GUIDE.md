# BOIMS - Barangay Operational & Incident Management System
## Deployment Guide

**Target Environment:** GCP Cloud Run Container / Firebase Hosting & Backend Services  
**Baseline Release:** Version 1.0.0 (Production Hardened)  

---

## 1. Prerequisites & Environment Requirements

1. **Google Cloud Platform (GCP) Project** with billing enabled and Cloud Run API activated.
2. **Node.js Environment:** v20.x or higher with npm / bun runtime.
3. **Firebase Project** with Firestore Database and Cloud Storage initialized.
4. **Firebase CLI:** Installed globally (`npm install -g firebase-tools`).

---

## 2. Environment Variables Configuration

Declare all standard environment configuration variables in `.env` (refer to `.env.example` template):

```env
# Client-side Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Server Port (Handled by Cloud Run / Nginx ingress proxy)
PORT=3000
```

---

## 3. Firebase Security Rules Deployment

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

## 4. Building & Running for Production

### Local Container / Standalone Build Verification

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript compilation and lint checks
npm run lint

# 3. Compile client bundle
npm run build

# 4. Launch production server
npm run start
```

### Docker Container Deployment (Cloud Run)

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

## 5. Rollback & Disaster Recovery Procedures

### Cloud Run Revision Traffic Shifting (Zero Downtime Revert)
In the event of an unexpected runtime failure after deployment, instantly revert 100% of user traffic to the previous healthy revision tag:

```bash
gcloud run services update-traffic boims-applet \
  --to-revisions [PREVIOUS_REVISION_NAME]=100
```

### Firestore Point-in-Time Restoration
To restore database state from daily automated GCP Cloud Storage export:

```bash
gcloud firestore import gs://[BACKUP_BUCKET_NAME]/[EXPORT_PREFIX]
```
