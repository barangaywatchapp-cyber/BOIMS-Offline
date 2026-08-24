# BOIMS - Barangay Operational & Incident Management System
## System Maintenance Guide

**Document Version:** 1.0.0 (Production Baseline)  

---

## 1. Routine Maintenance Tasks

### Daily Operations
- Monitor client error boundaries and audit logs in the **Executive System Readiness Dashboard** (`/production-readiness`).
- Verify automated daily backup export job execution in GCP Cloud Storage (`gs://[BACKUP_BUCKET_NAME]`).

### Weekly Operations
- Perform security log review on `auditLogs` collection for unauthorized administrative privilege escalation attempts.
- Verify storage bucket quota usage for incident attachments and document photo uploads.

### Monthly Operations
- Run `npm audit` to check for security vulnerabilities in third-party npm packages.
- Conduct simulated offline queue sync test on mobile field worker devices.

---

## 2. Observability & Logging Architecture

### Immutable Audit Trail (`auditLogs`)
- **Location:** Firestore `auditLogs` collection.
- **Rules Guard:** `allow update, delete: if false;`
- **Fields Logged:** `action`, `performedBy`, `userRole`, `details`, `timestamp`.

### Cloud Reporting & Alerting Thresholds
- **GCP Error Reporting:** Captures unhandled client JS exceptions.
- **Permission Denied Alerts:** GCP Cloud Logging alert trigger set to flag >5 Firestore `PERMISSION_DENIED` errors per minute.

---

## 3. Disaster Recovery & Backup Strategy

### Automated Scheduled Database Export
Configure a GCP Cloud Scheduler cron trigger (`0 2 * * *`) executing the following export command:

```bash
gcloud firestore export gs://boims-backups-prod/daily-$(date +%Y-%m-%d)
```

**Retention Policy:** Daily backups retained for 30 days in GCP Multi-Region Storage bucket with Lifecycle Deletion Policy.

---

## 4. Known Limitations & Future Enhancement Roadmap

1. **Full Runtime Performance Benchmarks:**  
   - *Current State:* Representative benchmark thresholds in readiness reports.  
   - *Roadmap:* Integrate automated PerformanceObserver API hooks for real-time telemetry streaming to GCP Cloud Monitoring.

2. **Automated E2E Regression Suite:**  
   - *Current State:* Verified via TypeScript type checker, component unit tests, and manual regression matrix.  
   - *Roadmap:* Implement Playwright / Cypress browser automation suite in CI/CD pipeline.

3. **Concurrency Control:**  
   - *Current State:* Optimistic client update pattern with LocalStorage buffer.  
   - *Roadmap:* Implement Firestore `runTransaction()` for atomic counter increments during extreme high-concurrency disaster events.

4. **IndexedDB & ServiceWorker Background Sync:**  
   - *Current State:* LocalStorage queue (`boims_sync_queue`) with window online listener.  
   - *Roadmap:* Migrate sync buffer to IndexedDB for 50MB+ offline capacity and implement ServiceWorker Sync API for background replay.
