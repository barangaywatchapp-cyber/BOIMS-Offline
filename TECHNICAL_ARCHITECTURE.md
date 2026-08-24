# BOIMS - Barangay Operational & Incident Management System
## Technical Architecture Document

**System Version:** 1.0.0 (Production Baseline)  
**Target Platform:** Web (Cloud Run / Node.js 20 Container + Vite / React 18 / Tailwind CSS)  
**Database & Auth Engine:** Firebase Firestore + Firebase Authentication + Firebase Storage  

---

## 1. System Overview & Architecture

The Barangay Operational & Incident Management System (BOIMS) is a full-stack, enterprise-grade municipal governance platform designed for local government units (Barangay administrative sectors). BOIMS provides end-to-end digitisation across resident profiling, emergency incident reporting, dispatch operations, certificate issuance, blotter mediation, asset logistics, audit compliance, and executive performance analytics.

```
+-------------------------------------------------------------------------------+
|                             Client Browser / Mobile PWA                       |
|   React 18 + Vite SPA | Tailwind CSS | Recharts | Lucide Icons | Motion Anim |
+-------------------------------------------------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+----------------------------------+        +----------------------------------+
|   Firebase Authentication        |        |    Offline Queue Sync Engine     |
|   (JWT, Custom Claims, Claims)   |        |   (LocalStorage / Auto-Replay)   |
+----------------------------------+        +----------------------------------+
                 |                                             |
                 +----------------------+----------------------+
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
   - Role hierarchy: `super_admin`, `barangay_captain`, `barangay_secretary`, `barangay_treasurer`, `barangay_officer`, `resident`.
   - Security claims verification, session persistence, account approval workflows, and password reset interfaces.

2. **Module 2: Citizen Incident Reporting & Geotagging**
   - Incident submission with photo upload, automated GPS coordinate capture, status tracking, and dispatch assignment.

3. **Module 3: Barangay Certificate & Document Issuance**
   - Requests for Barangay Clearance, Certificate of Indigency, Residency, and Business Permit with PDF rendering and verification QR codes.

4. **Module 4: Tanod & Emergency Dispatch Operations**
   - Real-time map view, dispatch assignment, responder status tracking, and emergency response latency logging.

5. **Module 5: Broadcast Announcements & Emergency Alerts**
   - Community public alerts, advisory categorisation, push notifications, and broadcast audit trail.

6. **Module 6: Master Resident Directory & Demographics Analytics**
   - Census profiling, household grouping, senior citizen/PWD tracking, voter registration, and interactive demographic dashboards.

7. **Module 7: Barangay Blotter System & Asset Inventory Logistics**
   - Case filing, conciliation scheduling (Lupon Tagapamayapa), asset borrowing logs, stock tracking, and item maintenance logs.

8. **Module 8: System Administration & Immutable Audit Compliance**
   - Administrative role management, system settings, and an append-only audit log collection (`auditLogs`) enforcing strict `allow update, delete: if false;`.

9. **Module 9: Offline Synchronization Engine & PWA Resilience**
   - Client-side sync buffer (`boims_sync_queue`), background network reconnection listener, 3-tier exponential backoff retry mechanism, and status indicators.

10. **Module 10: System Analytics & Performance Readiness Diagnostics**
    - Executive KPI metrics calculation, diagnostic system checks, performance baseline comparisons, and deployment readiness reports.

---

## 3. Security Architecture & Rules

### Firestore Least-Privilege RBAC (`firestore.rules`)
- **Public/Resident Data Isolation:** Sensitive collections (`residents`, `households`, `inventory`) are restricted to Barangay Officials (`isBarangayOfficial()`) or record owners (`isOwner()`).
- **Immutable Audit Logs:** The `auditLogs` collection enforces `allow update, delete: if false;` to guarantee tamper-proof audit trails.

### Firebase Storage Rules (`storage.rules`)
- **Authoritative Ownership Verification:** File deletion in `/reports/{reportId}/{fileName}` checks `resource.metadata.uploaderUid == request.auth.uid` or official credentials rather than assuming path UID.
- **Strict Media Constraints:** 10MB file ceiling for incident photo uploads and 5MB ceiling for PDF/resident document attachments.

---

## 4. Offline Synchronization Architecture

- **Storage Layer:** LocalStorage key `boims_sync_queue`.
- **Sync Trigger:** Automatic listener on `window.addEventListener('online')` and periodic background batch processing.
- **Retry Logic:** Exponential backoff strategy (`Math.pow(2, retryCount) * 1000` ms) with `MAX_RETRIES = 3`.
- **Conflict Handling:** Server-authoritative timestamp merging with user notifications on failed mutation replay.
