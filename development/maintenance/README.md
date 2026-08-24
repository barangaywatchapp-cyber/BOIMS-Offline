# BOIMS Firestore Maintenance Utility

This directory contains developer maintenance scripts for the **Barangay Official Information Management System (BOIMS)**.

## Database Reset Utility (`clearFirestore.ts`)

The `clearFirestore.ts` script is a reusable developer maintenance tool designed to wipe all Firestore documents across all BOIMS collections and subcollections during development.

### Features
- **Comprehensive Clearance**: Discovers and deletes documents from all target BOIMS collections:
  - `announcements`
  - `auditLogs`
  - `blotter_cases`
  - `blotters`
  - `certificateRequests`
  - `certificates`
  - `households`
  - `inventory`
  - `inventory_assets`
  - `notifications`
  - `presence`
  - `registrations`
  - `reports`
  - `residents`
  - `settings`
  - `systemReadiness`
  - `systemSettings`
  - `users`
  - Plus any dynamically discovered collections via REST API.
- **Subcollection Support**: Recursively checks and clears subcollections (e.g. `households/members`, `reports/comments`, `users/notifications`).
- **Batching Safeguards**: Deletes documents in batches of up to 400 operations to prevent exceeding Firestore write limits.
- **Progress Logging**: Prints clear real-time progress logs and output stats upon completion.
- **Safe & Idempotent**: Can be run repeatedly on empty or partially populated databases without error.

### How to Run

Execute via `npm`:
```bash
npm run clear-firestore
# or
npm run reset-db
```

Direct execution via `tsx`:
```bash
npx tsx development/maintenance/clearFirestore.ts
```

### Important Notes
- **Development Tool Only**: Do NOT run this in production.
- **Firebase Scope**: This utility ONLY deletes Firestore documents. It does NOT alter Firebase Authentication accounts, Storage files, or Firestore Security Rules.
