# BOIMS - Barangay Operational & Incident Management System
## Technical Architecture Document

**System Version:** 1.0.0 (Production Baseline)  
**Target Platform:** Web (Node.js 20+ / Express 4 Backend Server + Vite / React 19 / Tailwind CSS 4 SPA)  
**Production Server Bundle:** CommonJS bundle via `esbuild` (`dist/server.cjs`)  
**Database & Auth Engine:** Firebase Firestore + Firebase Authentication + Firebase Storage  

---

## 1. System Overview & Architecture

The Barangay Operational & Incident Management System (BOIMS) is a full-stack, municipal governance platform engineered for local government units (Barangay administrative sectors). BOIMS provides end-to-end digitization across resident profiling, emergency incident reporting, dispatch operations, certificate issuance, financial collections, blotter mediation, property asset logistics, audit compliance, and system readiness diagnostics.

```
+-------------------------------------------------------------------------------+
|                             Client Browser / Mobile PWA                       |
|   React 19 + Vite SPA | Tailwind CSS 4 | Motion | Lucide Icons | Leaflet Map  |
+-------------------------------------------------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+----------------------------------+        +----------------------------------+
|   Firebase Authentication        |        |   Offline Engine (boims-offline) |
|   (Client SDK / Bearer Token)    |        |  4-Store IndexedDB + Queue Sync  |
+----------------------------------+        +----------------------------------+
                 |                                             |
                 +----------------------+----------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                     Node.js 20+ / Express 4 Application Server                |
|           (/api/* API routes, Admin SDK proxy, Vite dev / static prod)        |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             GCP / Firebase Backend                            |
|  Firestore NoSQL (Least-Privilege RBAC) | Firebase Storage (Uploader Metadata) |
+-------------------------------------------------------------------------------+
```

---

## 2. Core Functional Modules (1–10)

1. **Module 1: User Authentication & Role-Based Access Control**
   - **Role Taxonomy (`UserRole`):** `resident`, `purokOfficial`, `verifier`, `secretary`, `treasurer`, `admin`, `chairman`, `superAdmin`, `developer`.
   - Security claims verification, session persistence, registration approval workflows, and password reset interfaces.
   - **Dedicated Barangay Treasurer Workspace:** Restricted operational workspace designed strictly for financial oversight and property asset tracking. Includes Dashboard (`TreasurerDashboardView`), Collections (`TreasurerCollectionsPage`), Inventory Assets (`InventoryPage`), Notifications, Offline Queue & Sync, System Health/Readiness, and Profile.
   - **Strict Treasurer Exclusions:** The Treasurer role is strictly excluded across UI navigation, route guards, and service layers from Citizen Reports, Report Creation, Certificates, Master Resident Directory, Broadcast Announcements, Dispatch Console, Blotter Mediation, Registration Approvals, Demographic Analytics, User Management, Audit Logs, Admin History, and System Settings.

2. **Module 2: Citizen Incident Reporting & Geotagging**
   - Incident submission with photo upload, automated GPS coordinate capture, status tracking, and dispatch assignment.

3. **Module 3: Barangay Certificate & Document Issuance**
   - Requests for Barangay Clearance, Certificate of Indigency, Residency, and Business Permit with real-time Firestore listeners, PDF rendering, and verification QR codes.

4. **Module 4: Tanod & Emergency Dispatch Operations**
   - Real-time Leaflet map view, dispatch assignment, responder status tracking (`onDuty` / `offDuty`, `responder` / `dispatcher`), and emergency response latency logging.

5. **Module 5: Broadcast Announcements & Emergency Alerts**
   - Community public alerts, advisory categorization, banner notifications, and broadcast audit trail.

6. **Module 6: Master Resident Directory & Demographics Analytics**
   - Census profiling, household grouping, senior citizen/PWD tracking, voter registration, and interactive demographic dashboards.

7. **Module 7: Barangay Blotter System, Financial Collections, & Asset Inventory**
   - **Blotter & Conciliation:** Case filing and conciliation scheduling (Lupon Tagapamayapa).
   - **Financial Collections & Invoicing:** Official receipt generation, payment status tracking, and revenue calculation for Barangay Treasurer.
   - **Property Asset Inventory:** Real-time asset inventory tracking, condition status, borrowing logs, stock tracking, and item maintenance logs.

8. **Module 8: System Administration & Immutable Audit Compliance**
   - Administrative role management, system settings, and an append-only audit log collection (`auditLogs`) enforcing strict `allow update, delete: if false;`.

9. **Module 9: Offline Synchronization Engine & PWA Resilience**
   - 4-Store IndexedDB engine (`boims-offline`), multi-tab coordination, Dead Letter Queue (DLQ), network connection listeners, 3-tier exponential backoff retry mechanism, and status indicators.

10. **Module 10: System Analytics & Performance Readiness Diagnostics**
    - Executive KPI metrics calculation, diagnostic system checks, performance baseline comparisons, and deployment readiness reports.

---

## 3. Security Architecture & Defense-in-Depth

Security enforcement is structured across four distinct defensive layers:

1. **UI & Navigation Filtering:** Navigation components (`Sidebar.tsx`, `NavigationDrawer.tsx`, `BottomNavigation.tsx`) conditionally render views strictly matching the authenticated user's assigned role.
2. **Route Guard Layer:** `RoleGuard` wrapper inside `AppRoutes.tsx` intercepts unauthorized URL navigation via explicit `allowedRoles` and `disallowedRoles` lists.
3. **Service Layer Authorization:** Service functions (e.g. `inventoryService.ts`, `certificateService.ts`, `adminService.ts`) validate user identity and role credentials prior to issuing mutations.
4. **Firestore Security Rules (`firestore.rules`):** Database-level rules authoritatively validate request authentication, role permissions, document ownership, and input schemas:
   - **Public/Resident Data Isolation:** Sensitive collections (`residents`, `households`) are restricted to Barangay Officials or record owners (`isOwner()`).
   - **Inventory Authorization:** `/inventory/{assetId}` allows read, create, update, and delete access strictly to `isSecretaryOrChairman() || isTreasurer()`.
   - **Immutable Audit Logs:** The `auditLogs` collection enforces `allow update, delete: if false;` to guarantee tamper-proof audit trails.

### Firebase Storage Rules (`storage.rules`)
- **Authoritative Ownership Verification:** File deletion in `/reports/{reportId}/{fileName}` checks `resource.metadata.uploaderUid == request.auth.uid` or official credentials rather than assuming path UID.
- **Strict Media Constraints:** 10MB file ceiling for incident photo uploads and 5MB ceiling for PDF/resident document attachments.

---

## 4. Offline Synchronization Architecture

BOIMS utilizes a durable client-side offline synchronization engine engineered around IndexedDB with automatic background queue drain and replay.

### 4.1 Storage Layer: IndexedDB (`boims-offline`)
The canonical offline storage database is `boims-offline` (Version 3), managed via `src/offline/storage.ts`:

1. **`offlineQueue`:** Authoritative durable store for pending and syncing mutations. Indexed by `createdAt` and `status`.
2. **`offlineEntities`:** Local entity cache for instant offline reads across collections (`inventory`, `reports`, `certificates`, etc.). Indexed by `collectionName` and `cachedAt`.
3. **`offlineMetadata`:** Key-value store for offline metadata and active offline session state (`active_offline_session`).
4. **`offlineDLQ`:** Dead Letter Queue store holding quarantined, unrecoverable mutations. Indexed by `originalQueueId`, `failedAt`, `collectionName`, and `originatingUserId`.

*Note on LocalStorage:* LocalStorage is retained strictly as a legacy migration source (`syncQueueMigration.migrateLegacyQueue()`) and an auxiliary in-memory mirror for legacy synchronous consumers. It is not the canonical primary offline queue.

### 4.2 Multi-Tab Coordination & Lease Management
To prevent concurrent browser tabs from competing or replaying identical mutations simultaneously, `coordinationService` implements:
- **`BroadcastChannel` Messaging:** Inter-tab state synchronization and election notifications.
- **Leader Election & Lease Locking:** Heartbeat-based leader leases stored in `offlineMetadata`. Only the active leader tab processes queue replay.

### 4.3 Dead Letter Queue (DLQ) & Error Quarantining
Mutations that cannot be automatically replayed are quarantined in `offlineDLQ` rather than retried indefinitely:
- **Quarantine Triggers:** Non-retryable permission-denied errors (`permission-denied`, `Missing or insufficient permissions`), permanent schema/data validation errors, or mutations exceeding `MAX_RETRIES = 3`.
- **Isolation:** Quarantined items are isolated from the normal pending queue and do not block subsequent valid mutations.
- **Inspection & Recovery:** Administrators and officials can inspect, retry, or delete quarantined items through the Offline Queue & Sync interface (`/offline-sync`).

### 4.4 Network Reconnect & Retry Logic
- **Sync Trigger:** Automatic listener on `window.addEventListener('online')` and periodic background batch processing.
- **Retry Logic:** Exponential backoff strategy (`Math.pow(2, retryCount) * 1000` ms) up to `MAX_RETRIES = 3`.

---

## 5. Inventory Architecture & Synchronization Lifecycle

### 5.1 Authoritative Data Source & Real-Time Subscriptions
- **Authoritative Dataset:** The remote Firestore `/inventory` collection is the single authoritative source of truth for property asset inventory.
- **Real-Time Subscription:** `InventoryPage.tsx` and `TreasurerDashboardView.tsx` subscribe to Firestore updates using `inventoryService.subscribeToInventory()`, backed by Firestore `onSnapshot`.

### 5.2 Authoritative Reconciliation Algorithm
When a Firestore snapshot arrives:
1. Remote Firestore records take precedence and populate the active asset state.
2. Local records missing from the remote snapshot are **pruned**, unless a verified active pending `create` mutation exists in `SyncService` for that specific `assetId`.
3. Stale or orphaned local records are eliminated from cache.
4. Quarantined DLQ records remain isolated and are never treated as active or successfully synchronized inventory assets.

### 5.3 Online vs. Offline Mutation Lifecycle

#### CREATE Lifecycle
- **Online:**
  1. Optimistic in-memory cache and IndexedDB `offlineEntities` are updated immediately for instant UI feedback.
  2. Direct Firestore write is executed via `await setDoc(docRef, newItem)`.
  3. On success, the operation completes immediately without enqueuing any mutation to `SyncService` (preventing false pending queue counts).
  4. On transient network or connection failure, the mutation is enqueued to `SyncService.enqueue('create', ...)` for background retry upon reconnection.
- **Offline:**
  1. Local asset is created in local cache and IndexedDB `offlineEntities`.
  2. A `create` mutation is enqueued to `SyncService` (persisted to `offlineQueue`).
  3. Replays automatically when connectivity is restored.

#### UPDATE Lifecycle
- **Online:**
  1. Optimistic in-memory cache and IndexedDB `offlineEntities` are updated.
  2. Direct Firestore update is executed via `await updateDoc(docRef, updatePayload)`.
  3. On success, completes without creating a pending queue item.
  4. On transient failure, enqueues to `SyncService.enqueue('update', ...)`.
- **Offline:**
  1. Local cache and IndexedDB `offlineEntities` are updated.
  2. An `update` mutation is enqueued to `SyncService`.

#### DELETE Lifecycle
- **Online:**
  1. Soft-delete flag is applied locally (`isDeleted: true`, `deletedAt`, `deletedBy`).
  2. Direct Firestore update is executed via `await updateDoc(docRef, deletePayload)`.
  3. On success, completes without creating a pending queue item.
  4. On transient failure, enqueues to `SyncService.enqueue('delete', ...)`.
- **Offline:**
  1. Soft-delete flag is applied locally and stored in IndexedDB `offlineEntities`.
  2. A `delete` mutation is enqueued to `SyncService`.
