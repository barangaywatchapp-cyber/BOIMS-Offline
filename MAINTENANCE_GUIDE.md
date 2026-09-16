# BOIMS - Barangay Operational & Incident Management System
## System Maintenance Guide

**Document Version:** 1.0.0 (Production Baseline)  

---

## 1. Routine Maintenance Tasks

### Daily Operations
- Monitor client error boundaries and diagnostic indicators in the **Executive System Readiness Dashboard** (`/production-readiness`).
- Check the **Offline Queue & Sync Console** (`/offline-sync`) for abnormal spikes in pending synchronization queues or Dead Letter Queue (DLQ) quarantines.
- Verify automated daily backup export execution if scheduled in Cloud Storage.

### Weekly Operations
- **Dead Letter Queue (DLQ) Review:** Inspect quarantined mutations in `/offline-sync`. Identify failed operations (permission errors, schema mismatches, deleted targets) and resolve underlying data discrepancies before triggering targeted retries.
- **Audit Log Inspection:** Perform review on the `auditLogs` collection for unauthorized administrative privilege escalation or suspicious failed authentication events.
- **Storage Bucket Monitoring:** Verify Cloud Storage usage for incident attachments and document photo uploads against quota thresholds.

### Monthly Operations
- Run `npm audit` to check for security vulnerabilities in third-party npm packages.
- Conduct simulated offline field tests using the built-in offline simulation toggle in `/offline-sync` to verify multi-device synchronization integrity.
- Verify multi-tab coordination and leader lease expiration by running multi-window test sessions.

---

## 2. Dead Letter Queue (DLQ) Operational Procedures

### 2.1 Understanding DLQ Records
A DLQ record (`DeadLetterItem`) represents a mutation that was permanently quarantined by the offline engine because automated replay failed. Mutations are moved to `offlineDLQ` under the following verified conditions:
1. **Permanent Permission Denial:** The user's role or token lacks authorization in `firestore.rules` (e.g. `permission-denied`, `Missing or insufficient permissions`).
2. **Schema / Validation Errors:** Mutation payload fails Firestore database validation constraints.
3. **Exceeded Retry Limit:** The mutation encountered repeated transient failures exceeding `MAX_RETRIES = 3`.

Quarantined records are isolated from the normal pending queue (`offlineQueue`) so they do not block subsequent valid mutations.

### 2.2 DLQ Maintenance Workflow (`/offline-sync`)
Maintenance personnel and authorized officials manage the DLQ through the **Offline Queue & Sync** interface:

1. **Navigate to `/offline-sync`:**
   - Review the **Dead Letter Queue (DLQ)** section and inspect the quarantined items list.
2. **Inspect Item Diagnostics:**
   - Click **View Payload** on any quarantined item to review the exact mutation operation (`create`, `update`, `delete`), target collection, document ID, failure timestamp, and error message.
3. **Determine Underlying Root Cause:**
   - *Permission Denied:* Verify whether the originating user had their role modified or deauthorized before sync occurred.
   - *Missing Target Document:* Check if the target record was deleted on the server by another official before the local update could replay.
   - *Schema Error:* Identify if required fields are missing in the quarantined payload.
4. **Execute Remediation Action:**
   - **Retry Item (`RotateCcw` / Retry):** Restores the quarantined item to the active synchronization queue for replay if the underlying condition has been resolved.
   - **Delete Item (`Trash2` / Delete):** Permanently purges the quarantined mutation from `offlineDLQ` when the operation is invalid, obsolete, or superceded by a newer server record.
   - **Purge All (`Clear DLQ`):** Clears all resolved or discarded DLQ entries after verification.

*Caution:* Never clear or delete DLQ records without verifying whether the mutation contained critical citizen data (e.g., an unrecorded incident report or certificate payment).

---

## 3. Observability & Logging Architecture

### Immutable Audit Trail (`auditLogs`)
- **Location:** Firestore `auditLogs` collection.
- **Rules Guard:** `allow update, delete: if false;` (tamper-proof, append-only).
- **Fields Logged:** `action`, `performedBy`, `userRole`, `details`, `timestamp`.

### Error Reporting & Diagnostic Indicators
- **System Readiness Service:** `systemReadinessService.ts` aggregates diagnostic evaluations covering database latency, offline queue volume, storage quotas, and security configuration.
- **Client Error Boundaries:** Critical React render errors are trapped with recovery fallbacks preventing entire application crashes.

---

## 4. Disaster Recovery & Backup Strategy

### Automated Scheduled Database Export (GCP Production Target)
For production GCP environments, configure a GCP Cloud Scheduler cron trigger (`0 2 * * *`) executing the export command:

```bash
gcloud firestore export gs://boims-backups-prod/daily-$(date +%Y-%m-%d)
```

**Retention Policy:** Daily backups retained for 30 days in GCP Multi-Region Storage bucket with Lifecycle Deletion Policy.

---

## 5. Known Limitations & Future Enhancement Roadmap

1. **ServiceWorker Background Sync:**  
   - *Current State:* The client utilizes an IndexedDB-backed 4-store offline engine (`boims-offline`) with `window.addEventListener('online')` and `coordinationService` leader leases. Replay occurs when an application tab is open and online.  
   - *Roadmap:* Integrate the browser ServiceWorker Background Sync API to permit background queue replay even when all application tabs are closed.

2. **Automated E2E Regression Suite:**  
   - *Current State:* Verified via TypeScript type checking (`tsc --noEmit`), automated build validation (`compile_applet`), and manual regression test matrices.  
   - *Roadmap:* Implement a full Playwright / Cypress browser automation suite in the CI/CD pipeline.

3. **High-Concurrency Disaster Event Transactions:**  
   - *Current State:* Optimistic client update pattern with authoritative server reconciliation and direct Firestore writes.  
   - *Roadmap:* Implement Firestore `runTransaction()` for atomic counter increments during extreme concurrent emergency reporting surges.

4. **Runtime Telemetry Streaming:**  
   - *Current State:* Representative code-level diagnostic thresholds and benchmark heuristics in system readiness reports.  
   - *Roadmap:* Integrate automated PerformanceObserver API hooks for live telemetry streaming to GCP Cloud Monitoring.
