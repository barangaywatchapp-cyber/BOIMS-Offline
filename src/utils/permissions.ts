/**
 * Role-Based Access Control (RBAC) & Permission Utilities
 * Single Source of Truth for BOIMS Module Access & Navigation
 */

import { User, UserRole } from '../types';
import { ROUTES } from '../constants';

/**
 * Roles allowed to view and access the Resident Directory (/residents).
 * Strictly limited to: Secretary, Chairman, Admin, Super Admin, Developer.
 */
export const ALLOWED_RESIDENT_DIRECTORY_ROLES: UserRole[] = [
  'secretary',
  'chairman',
  'admin',
  'superAdmin',
  'developer',
];

/**
 * Roles allowed to export certificates to Excel (.xlsx).
 * Authorized administrative roles: Secretary, Chairman, Admin, Super Admin, Developer.
 * Explicitly EXCLUDED: resident, purokOfficial (in any duty mode/assignment), verifier.
 */
export const ALLOWED_CERTIFICATE_EXPORT_ROLES: UserRole[] = [
  'secretary',
  'chairman',
  'admin',
  'superAdmin',
  'developer',
];

/**
 * Checks if a user is authorized to export certificates to Excel.
 * Strictly returns true for authorized administrative roles.
 * Returns false for resident and purokOfficial regardless of duty mode.
 */
export function canExportCertificates(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return ALLOWED_CERTIFICATE_EXPORT_ROLES.includes(role);
}

/**
 * Checks if the user interface is currently operating in "Resident Mode".
 * Resident Mode is active for:
 * 1. 'resident' role
 * 2. 'purokOfficial' role when OFF DUTY (dutyStatus === 'offDuty' or dutyMode === 'offDuty' or dutyStatus !== 'onDuty')
 */
export function isResidentMode(user: User | null | undefined, role: UserRole | null | undefined): boolean {
  if (!user && !role) return false;
  const activeRole = role || user?.role || null;
  if (activeRole === 'resident') return true;
  if (activeRole === 'purokOfficial') {
    if (!user) return true; // Default fallback to resident mode if user object not loaded
    return user.dutyStatus === 'offDuty' || user.dutyMode === 'offDuty' || user.dutyStatus !== 'onDuty';
  }
  return false;
}

/**
 * Checks if a user can access the Resident Directory (/residents).
 * Strictly returns true for Secretary, Chairman, Admin, Super Admin, and Developer.
 */
export function canAccessResidentDirectory(role: UserRole | null): boolean {
  if (!role) return false;
  return ALLOWED_RESIDENT_DIRECTORY_ROLES.includes(role);
}

/**
 * Checks if a user can access My Household (/households).
 * Visible/accessible ONLY when operating in Resident Mode.
 */
export function canAccessMyHousehold(user: User | null, role: UserRole | null): boolean {
  return isResidentMode(user, role);
}

/**
 * Roles allowed to view and access Demographic Analytics (/analytics).
 * Strictly limited to: Secretary and Chairman.
 * Explicitly DENIED: resident, purokOfficial, verifier, admin, superAdmin, developer.
 */
export const ALLOWED_ANALYTICS_ROLES: UserRole[] = [
  'secretary',
  'chairman',
];

/**
 * Checks if a user can access Demographic Analytics (/analytics).
 * Strictly returns true ONLY for Secretary and Chairman.
 */
export function canAccessAnalytics(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return ALLOWED_ANALYTICS_ROLES.includes(role);
}

/**
 * Roles allowed to create, broadcast, post, and manage announcements.
 * Strictly limited to: Chairman and Secretary.
 * Explicitly DENIED: resident, purokOfficial, verifier, admin, superAdmin, developer.
 */
export const ALLOWED_ANNOUNCEMENT_POST_ROLES: UserRole[] = [
  'chairman',
  'secretary',
];

/**
 * Strict role list for the four hardened administrative modules:
 * 1. Barangay System Configuration & Governance (/settings)
 * 2. Barangay Property & Inventory Assets (/inventory)
 * 3. Barangay Peace & Order & Blotter System (/blotter)
 * 4. Dispatch Console (/dispatch)
 *
 * ONLY Secretary and Chairman are permitted.
 * ALL OTHER ROLES (resident, verifier, purokOfficial, fieldResponder/responder, dispatcher, treasurer, admin, superAdmin, developer, etc.) ARE STRICTLY DENIED.
 */
export const ALLOWED_SECRETARY_CHAIRMAN_ROLES: UserRole[] = [
  'secretary',
  'chairman',
];

/**
 * Checks if a user or role has Secretary or Chairman privileges.
 */
export function isSecretaryOrChairman(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return ALLOWED_SECRETARY_CHAIRMAN_ROLES.includes(role);
}

/**
 * Checks if a user can access Barangay System Configuration & Governance (/settings).
 * Strictly returns true ONLY for Secretary and Chairman.
 */
export function canAccessSystemSettings(role: UserRole | null | undefined): boolean {
  return isSecretaryOrChairman(role);
}

/**
 * Checks if a user can access Barangay Property & Inventory Assets (/inventory).
 * Strictly returns true ONLY for Secretary and Chairman.
 */
export function canAccessInventory(role: UserRole | null | undefined): boolean {
  return isSecretaryOrChairman(role);
}

/**
 * Checks if a user can access Barangay Peace & Order & Blotter System (/blotter).
 * Strictly returns true ONLY for Secretary and Chairman.
 */
export function canAccessBlotter(role: UserRole | null | undefined): boolean {
  return isSecretaryOrChairman(role);
}

/**
 * Checks if a user can access the Dispatch Console (/dispatch).
 * Strictly returns true ONLY for Secretary and Chairman.
 */
export function canAccessDispatchConsole(role: UserRole | null | undefined): boolean {
  return isSecretaryOrChairman(role);
}

/**
 * Checks if a user can create/post/broadcast/manage announcements.
 * Strictly returns true ONLY for Chairman and Secretary.
 */
export function canCreateAnnouncements(role: UserRole | null | undefined): boolean {
  return isSecretaryOrChairman(role);
}

/**
 * Checks if a user should see "My Profile" in the main navigation.
 */
export function canShowMyProfileInNav(user: User | null, role: UserRole | null): boolean {
  return isResidentMode(user, role);
}

/**
 * Resolves the canonical dashboard route for a given user role or profile.
 * In BOIMS, all roles land on the centralized, role-adaptive dashboard at ROUTES.DASHBOARD ('/dashboard').
 */
export function getRoleDashboardRoute(_role?: UserRole | null): string {
  return ROUTES.DASHBOARD;
}
