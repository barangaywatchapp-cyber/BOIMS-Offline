import {
  User,
  UserRole,
  Report,
  ResidentProfile,
  Household,
  CertificateRequest,
  BlotterCase,
  Notification,
  RegistrationApplication,
} from '../types';
import { isResidentMode } from './permissions';

export type OperationalMode =
  | 'resident'
  | 'offDuty'
  | 'fieldResponder'
  | 'dispatcher'
  | 'barangayOfficial'
  | 'barangayWideOfficer'
  | 'systemAdmin';

export type DatasetScope = 'personal' | 'assigned' | 'jurisdiction' | 'municipality' | 'system';

export interface UserOperationalContext {
  mode: OperationalMode;
  datasetScope: DatasetScope;
  isResident: boolean;
  isOffDuty: boolean;
  isFieldResponder: boolean;
  isDispatcher: boolean;
  isBarangayOfficial: boolean;
  isBarangayWideOfficer: boolean;
  isScopeLockedToMine: boolean;
  isSingleScope: boolean;
}

/**
 * Pure domain helper to evaluate the single source of operational context for a user.
 */
export function getUserOperationalContext(user?: User | null): UserOperationalContext {
  if (!user || user.role === 'resident') {
    return {
      mode: 'resident',
      datasetScope: 'personal',
      isResident: true,
      isOffDuty: false,
      isFieldResponder: false,
      isDispatcher: false,
      isBarangayOfficial: false,
      isBarangayWideOfficer: false,
      isScopeLockedToMine: true,
      isSingleScope: true,
    };
  }

  if (user.role === 'purokOfficial') {
    const isOnDuty = user.dutyStatus === 'onDuty';
    if (!isOnDuty) {
      return {
        mode: 'offDuty',
        datasetScope: 'personal',
        isResident: true,
        isOffDuty: true,
        isFieldResponder: false,
        isDispatcher: false,
        isBarangayOfficial: false,
        isBarangayWideOfficer: false,
        isScopeLockedToMine: true,
        isSingleScope: true,
      };
    }

    if (user.dutyMode === 'responder') {
      return {
        mode: 'fieldResponder',
        datasetScope: 'assigned',
        isResident: false,
        isOffDuty: false,
        isFieldResponder: true,
        isDispatcher: false,
        isBarangayOfficial: true,
        isBarangayWideOfficer: false,
        isScopeLockedToMine: false,
        isSingleScope: true,
      };
    }

    // Default on-duty Purok Official acts as Dispatcher
    return {
      mode: 'dispatcher',
      datasetScope: 'jurisdiction',
      isResident: false,
      isOffDuty: false,
      isFieldResponder: false,
      isDispatcher: true,
      isBarangayOfficial: true,
      isBarangayWideOfficer: false,
      isScopeLockedToMine: false,
      isSingleScope: false,
    };
  }

  if (user.role === 'secretary' || user.role === 'chairman') {
    return {
      mode: 'barangayWideOfficer',
      datasetScope: 'municipality',
      isResident: false,
      isOffDuty: false,
      isFieldResponder: false,
      isDispatcher: false,
      isBarangayOfficial: true,
      isBarangayWideOfficer: true,
      isScopeLockedToMine: false,
      isSingleScope: false,
    };
  }

  // admin, superAdmin, verifier, or system-level roles
  return {
    mode: 'systemAdmin',
    datasetScope: 'system',
    isResident: false,
    isOffDuty: false,
    isFieldResponder: false,
    isDispatcher: false,
    isBarangayOfficial: false,
    isBarangayWideOfficer: true,
    isScopeLockedToMine: false,
    isSingleScope: false,
  };
}

export function isBarangayWideRole(role?: UserRole): boolean {
  if (!role) return false;
  return ['secretary', 'admin', 'chairman', 'superAdmin', 'verifier'].includes(role);
}

export function isPurokOfficialRole(role?: UserRole): boolean {
  return role === 'purokOfficial';
}

export function isResidentRole(role?: UserRole): boolean {
  return role === 'resident';
}

export function getUserJurisdiction(user?: { jurisdiction?: string; purok?: string } | null): string {
  if (!user) return '';
  return (user.jurisdiction || user.purok || '').trim();
}

/**
 * Normalizes jurisdiction/purok strings and checks if they represent the same jurisdiction
 */
export function isSameJurisdiction(j1?: string, j2?: string): boolean {
  if (!j1 || !j2) return false;
  const norm1 = j1.trim().toLowerCase().replace(/\s+/g, ' ');
  const norm2 = j2.trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm1 === norm2) return true;

  // Extract purok number (e.g. "Purok 1" in "Purok 1 - Maharlika")
  const p1 = norm1.match(/purok\s*(\d+)/i);
  const p2 = norm2.match(/purok\s*(\d+)/i);
  if (p1 && p2) {
    return p1[1] === p2[1];
  }

  // Extract sitio name
  const s1 = norm1.match(/sitio\s*([\w-]+)/i);
  const s2 = norm2.match(/sitio\s*([\w-]+)/i);
  if (s1 && s2) {
    return s1[1] === s2[1];
  }

  return norm1.includes(norm2) || norm2.includes(norm1);
}

/**
 * Extracts purok/jurisdiction from address string if available
 */
export function extractPurokFromAddress(address?: string): string {
  if (!address) return '';
  const match = address.match(/(purok\s*\d+|sitio\s*[\w-]+)/i);
  return match ? match[0] : '';
}

/**
 * Gets report jurisdiction (immutable property, fallback to purok or location)
 */
export function getReportJurisdiction(report?: Partial<Report> | null): string {
  if (!report) return '';
  if (report.jurisdiction) return report.jurisdiction;
  if (report.purok) return report.purok;
  return extractPurokFromAddress(report.location?.address);
}

/**
 * Checks if a user is the owner/creator of a report (by userId, createdBy, or userEmail)
 */
export function isReportOwner(report?: Partial<Report> | null, user?: User | null): boolean {
  if (!report || !user) return false;

  const r = report as any;
  const u = user as any;

  // Normalize string for safety
  const clean = (val: unknown): string => (typeof val === 'string' ? val.trim().toLowerCase() : '');

  // 1. Compare Report User IDs against User UIDs / Identifiers
  const reportIds = [
    r.userId,
    r.createdBy,
    r.reporterId,
    r.reporterUid,
    r.authorId,
    r.uploadedBy,
    r.submittedBy,
  ].map(clean).filter(Boolean);

  const userIds = [
    u.uid,
    u.id,
    u.residentId,
    u.linkedResidentId,
  ].map(clean).filter(Boolean);

  for (const rId of reportIds) {
    for (const uId of userIds) {
      if (rId === uId) return true;
    }
  }

  // 2. Compare Report Emails against User Emails
  const reportEmails = [
    r.userEmail,
    r.email,
    r.reporterEmail,
    r.creatorEmail,
  ].map(clean).filter(Boolean);

  const userEmails = [
    u.email,
    u.userEmail,
  ].map(clean).filter(Boolean);

  for (const rEmail of reportEmails) {
    for (const uEmail of userEmails) {
      if (rEmail === uEmail) return true;
    }
  }

  // 3. Special handling for demo/seed resident account matching by role & default email
  if (user.role === 'resident') {
    if (userEmails.includes('resident@boims.gov.ph') && reportEmails.includes('resident@boims.gov.ph')) {
      return true;
    }
    // Check if report timeline contains submission event by this user
    if (Array.isArray(r.timeline)) {
      for (const evt of r.timeline) {
        if (evt && evt.performedBy) {
          const perf = clean(evt.performedBy);
          if (userIds.includes(perf)) return true;
        }
      }
    }
  }

  // 4. Compare Full Names if available
  const reportNames = [r.userName, r.reporterName, r.creatorName].map(clean).filter((n) => n.length > 2);
  const userNames = [u.fullName, `${u.firstName || ''} ${u.lastName || ''}`].map(clean).filter((n) => n.length > 2);

  for (const rName of reportNames) {
    for (const uName of userNames) {
      if (rName === uName) return true;
    }
  }

  return false;
}

/**
 * Checks if a report is assigned to a specific user (by assignedTo UID or assignedResponders list)
 */
export function isReportAssignedTo(report?: Partial<Report> | null, userId?: string): boolean {
  if (!report || !userId) return false;
  if (report.assignedTo === userId) return true;
  if (Array.isArray(report.assignedResponders)) {
    return report.assignedResponders.some((resp: any) => {
      if (typeof resp === 'string') return resp === userId;
      return resp && (resp.uid === userId || resp.id === userId);
    });
  }
  return false;
}

/**
 * Filter reports by user authorization, duty mode, and jurisdiction
 */
export function filterReportsByAccess(reports: Report[], user?: User | null): Report[] {
  if (!user) {
    return [];
  }
  if (isBarangayWideRole(user.role)) {
    return reports;
  }
  if (user.role === 'resident') {
    return reports.filter((r) => isReportOwner(r, user));
  }
  if (user.role === 'purokOfficial') {
    const isOnDuty = user.dutyStatus === 'onDuty';

    // Purok Official (Off Duty): Behave EXACTLY like a Resident. Return ONLY reports created by that official.
    if (!isOnDuty) {
      return reports.filter((r) => isReportOwner(r, user));
    }

    // Purok Official (On Duty - Field Responder): Return ONLY reports assigned to that responder.
    if (user.dutyMode === 'responder') {
      return reports.filter((r) => isReportAssignedTo(r, user.uid));
    }

    // Purok Official (On Duty - Dispatcher or Default): Return reports within jurisdiction, assigned to them, or created by them.
    const userJur = getUserJurisdiction(user);
    return reports.filter((r) => {
      const rJur = getReportJurisdiction(r);
      return isSameJurisdiction(rJur, userJur) || isReportAssignedTo(r, user.uid) || isReportOwner(r, user);
    });
  }
  return reports;
}

/**
 * Filter residents by user authorization and jurisdiction
 */
export function filterResidentsByAccess(residents: ResidentProfile[], user?: User | null): ResidentProfile[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return residents;
  }
  if (isResidentMode(user, user.role)) {
    return residents.filter((r) => r.residentId === user.uid || r.email === user.email);
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return residents.filter((r) => isSameJurisdiction(r.purok, userJur));
  }
  return residents;
}

/**
 * Filter users (user accounts) by user authorization and jurisdiction
 */
export function filterUsersByAccess(users: User[], user?: User | null): User[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return users;
  }
  if (isResidentMode(user, user.role)) {
    return users.filter((u) => u.uid === user.uid);
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return users.filter((u) => isSameJurisdiction(getUserJurisdiction(u), userJur));
  }
  return users;
}

/**
 * Filter households by user authorization and jurisdiction
 */
export function filterHouseholdsByAccess(households: Household[], user?: User | null): Household[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return households;
  }
  if (isResidentMode(user, user.role)) {
    const uId = user.uid;
    const linkedId = (user as any).linkedResidentId || (user as any).residentId;
    return households.filter(
      (h) =>
        h.householdHeadId === uId ||
        (linkedId && h.householdHeadId === linkedId) ||
        h.createdBy === uId ||
        (h.memberResidentIds && (h.memberResidentIds.includes(uId) || (linkedId && h.memberResidentIds.includes(linkedId)))) ||
        (h.members && h.members.some((m) => m.residentId === uId || (linkedId && m.residentId === linkedId)))
    );
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return households.filter((h) => isSameJurisdiction(h.purok, userJur));
  }
  return households;
}

/**
 * Filter notifications by user authorization and jurisdiction
 */
export function filterNotificationsByAccess(notifications: Notification[], user?: User | null): Notification[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return notifications;
  }
  if (isResidentMode(user, user.role)) {
    return notifications.filter(
      (n) =>
        n.userId === user.uid ||
        n.type === 'emergency' ||
        n.type === 'announcement' ||
        n.userId === 'all_residents' ||
        n.userId === 'all' ||
        n.userId === 'all_users'
    );
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return notifications.filter((n) => {
      if (n.userId === user.uid) return true;
      if (n.type === 'emergency') return true;
      if (n.type === 'announcement') return true;
      if (n.userId === 'all_residents' || n.userId === 'all' || n.userId === 'all_users') return true;
      const targetJur = (n as any).targetJurisdiction || (n as any).purok;
      if (targetJur) return isSameJurisdiction(targetJur, userJur);
      return true;
    });
  }
  return notifications;
}

/**
 * Filter registration applications by user authorization and jurisdiction
 */
export function filterApplicationsByAccess(apps: RegistrationApplication[], user?: User | null): RegistrationApplication[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return apps;
  }
  if (isResidentMode(user, user.role)) {
    return apps.filter((a) => a.uid === user.uid);
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return apps.filter((a) => isSameJurisdiction(a.purok, userJur));
  }
  return apps;
}

/**
 * Check if a resident user owns a certificate request
 */
export function isCertificateOwner(cert?: Partial<CertificateRequest> | null, user?: User | null): boolean {
  if (!cert || !user) {
    return false;
  }

  const c = cert as any;
  const u = user as any;

  const clean = (val: unknown): string => (typeof val === 'string' ? val.trim().toLowerCase() : '');

  // 1. Compare User IDs against User UIDs / Identifiers
  const certIds = [
    c.userId,
    c.createdBy,
    c.residentId,
    c.requestedBy,
    c.submittedBy,
  ].map(clean).filter(Boolean);

  const userIds = [
    u.uid,
    u.id,
    u.residentId,
    u.linkedResidentId,
  ].map(clean).filter(Boolean);

  for (const cId of certIds) {
    for (const uId of userIds) {
      if (cId === uId) {
        return true;
      }
    }
  }

  // 2. Compare Emails
  const certEmails = [
    c.email,
    c.userEmail,
    c.requestedByEmail,
  ].map(clean).filter(Boolean);

  const userEmails = [
    u.email,
    u.userEmail,
  ].map(clean).filter(Boolean);

  for (const cEmail of certEmails) {
    for (const uEmail of userEmails) {
      if (cEmail === uEmail) {
        return true;
      }
    }
  }

  // 3. Special handling for demo resident email matching
  if (user.role === 'resident') {
    if (userEmails.includes('resident@boims.gov.ph') && certEmails.includes('resident@boims.gov.ph')) {
      return true;
    }
  }

  // 4. Compare Full Names
  const certNames = [c.fullName, c.userName, c.applicantName].map(clean).filter((n) => n.length > 2);
  const userNames = [u.fullName, `${u.firstName || ''} ${u.lastName || ''}`].map(clean).filter((n) => n.length > 2);

  for (const cName of certNames) {
    for (const uName of userNames) {
      if (cName === uName) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter certificates by user authorization and jurisdiction
 */
export function filterCertificatesByAccess(certs: CertificateRequest[], user?: User | null): CertificateRequest[] {
  if (!user) return [];
  if (isBarangayWideRole(user.role)) {
    return certs;
  }
  if (isResidentMode(user, user.role)) {
    return certs.filter((c) => isCertificateOwner(c, user));
  }
  if (user.role === 'purokOfficial') {
    const userJur = getUserJurisdiction(user);
    return certs.filter((c) => isSameJurisdiction(c.purok, userJur));
  }
  return certs;
}

/**
 * Filter blotter cases by user authorization and jurisdiction.
 * Strict RBAC: Only Secretary and Chairman may access Blotter records.
 */
export function filterBlottersByAccess(blotters: BlotterCase[], user?: User | null): BlotterCase[] {
  if (!user) return [];
  if (user.role !== 'secretary' && user.role !== 'chairman') {
    return [];
  }
  return blotters;
}
