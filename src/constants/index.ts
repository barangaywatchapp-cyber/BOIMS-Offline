/**
 * Centralized Application Constants & Design System Tokens
 * Aligned with UI Design System (UDS) and Software Requirements Specification (SRS)
 */

import { UserRole } from '../types';

export const APP_METADATA = {
  name: 'Barangay Operations & Information Management System',
  shortName: 'BOIMS',
  version: '1.0.0',
  defaultBarangay: 'Barangay Central',
  defaultMunicipality: 'Baras',
  defaultProvince: 'Rizal',
  defaultRegion: 'Region IV-A (CALABARZON)',
};

// Design System Colors (UDS Vol 2)
export const COLORS = {
  primary: '#1E40AF', // BOIMS Shield Blue
  secondary: '#3B82F6', // Community Blue
  accent: '#60A5FA', // Sky Blue
  success: '#16A34A', // Green
  warning: '#F59E0B', // Amber
  danger: '#DC2626', // Red
  info: '#0284C7', // Sky Info
  background: '#F8FAFC',
  card: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#64748B',
  border: '#E2E8F0',
};

// Barangay Sitio / Purok Jurisdictions
export const PUROK_OPTIONS = [
  'Purok 1',
  'Purok 2',
  'Purok 3',
  'Purok 4',
  'Purok 5',
  'Purok 6',
  'Purok 7',
] as const;

// Role hierarchy labels & access levels (RPM Vol 1 & MDG)
export const ROLE_LABELS: Record<UserRole, { label: string; level: number; description: string }> = {
  resident: { label: 'Resident', level: 1, description: 'Registered Community Resident' },
  purokOfficial: { label: 'Sitio/Purok Official', level: 1, description: 'Sitio / Purok Representative & Official' },
  verifier: { label: 'Verifier', level: 2, description: 'Identity & Document Verification Officer' },
  secretary: { label: 'Barangay Secretary', level: 2, description: 'Records & Certificates Officer' },
  admin: { label: 'Administrator', level: 2, description: 'System Administrator' },
  chairman: { label: 'Barangay Chairman', level: 3, description: 'Executive Authority & Governance' },
  superAdmin: { label: 'Super Administrator', level: 3, description: 'Super Admin & Full System Authority' },
  developer: { label: 'Developer', level: 3, description: 'System Administrator & Developer' },
};

// Incident Categories with display labels and colors
export const INCIDENT_CATEGORIES = [
  { id: 'neighborhood_dispute', label: 'Neighborhood Dispute', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { id: 'garbage', label: 'Garbage & Solid Waste', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'road', label: 'Road & Infrastructure Damage', color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { id: 'drainage', label: 'Drainage & Canal Obstruction', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 'streetlight', label: 'Defective Streetlight', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { id: 'noise', label: 'Noise Disturbance', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'crime', label: 'Crime & Security Concern', color: 'bg-red-100 text-red-800 border-red-300' },
  { id: 'fire', label: 'Fire Hazard / Incident', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { id: 'flood', label: 'Flooding & Calamity', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { id: 'animal', label: 'Stray Animal / Rabies Risk', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'others', label: 'Other Concerns', color: 'bg-gray-100 text-gray-800 border-gray-300' },
] as const;

// Certificate Types & Fees
export const CERTIFICATE_TYPES = [
  { id: 'barangayClearance', label: 'Barangay Clearance', defaultFee: 50, desc: 'For employment, ID application, and legal transactions' },
  { id: 'certificateOfResidency', label: 'Certificate of Residency', defaultFee: 30, desc: 'Proof of residency within the barangay' },
  { id: 'certificateOfIndigency', label: 'Certificate of Indigency', defaultFee: 0, desc: 'For medical, educational, or financial assistance (Free)' },
  { id: 'businessClearance', label: 'Barangay Business Clearance', defaultFee: 200, desc: 'For new and renewal business permits' },
  { id: 'certificateOfGoodMoral', label: 'Certificate of Good Moral', defaultFee: 50, desc: 'Character background verification' },
  { id: 'other', label: 'Other Special Certification', defaultFee: 50, desc: 'Custom certification requests' },
] as const;

// Asset Categories for Inventory
export const ASSET_CATEGORIES = [
  { id: 'officeEquipment', label: 'Office Equipment' },
  { id: 'electronics', label: 'Electronics & Computers' },
  { id: 'furniture', label: 'Furniture & Fixtures' },
  { id: 'medicalEquipment', label: 'Medical & First Aid' },
  { id: 'emergencyEquipment', label: 'Emergency & Rescue Gear' },
  { id: 'constructionTools', label: 'Maintenance & Tools' },
  { id: 'vehicles', label: 'Vehicles & Patrol Units' },
  { id: 'others', label: 'Other Barangay Property' },
] as const;

// Application Routes
export const ROUTES = {
  LANDING: '/',
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  REGISTER: '/register',
  VERIFY_EMAIL: '/verify-email',
  REGISTRATION_APPROVALS: '/registrations',
  PENDING_VERIFICATION: '/pending-verification',
  UNAUTHORIZED: '/unauthorized',
  NOT_FOUND: '/404',
  DASHBOARD: '/dashboard',
  REPORTS: '/reports',
  REPORT_CREATE: '/reports/create',
  REPORT_DETAILS: (id: string) => `/reports/${id}`,
  CERTIFICATES: '/certificates',
  CERTIFICATE_REQUEST: '/certificates/request',
  CERTIFICATE_DETAILS: (id: string) => `/certificates/${id}`,
  CERTIFICATE_VERIFY: '/certificates/verify',
  CERTIFICATE_PRINT: (id: string) => `/certificates/${id}/print`,
  ANNOUNCEMENTS: '/announcements',
  NOTIFICATIONS: '/notifications',
  PROFILE: '/profile',
  DISPATCH: '/dispatch',
  RESIDENTS: '/residents',
  HOUSEHOLDS: '/households',
  BLOTTER: '/blotter',
  INVENTORY: '/inventory',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
  USERS: '/users',
  AUDIT_LOGS: '/audit-logs',
  OFFLINE_SYNC: '/offline-sync',
  SYSTEM_HEALTH: '/system-health',
};

// Emergency Hotlines
export const DEFAULT_EMERGENCY_HOTLINES = [
  { name: 'Barangay Emergency Patrol', number: '(02) 8912-3456 / 0917-111-2222' },
  { name: 'Barangay Health Center', number: '(02) 8912-3457' },
  { name: 'Municipal Police Station', number: '117 / (02) 8912-9999' },
  { name: 'Bureau of Fire Protection (BFP)', number: '911 / (02) 8912-8888' },
  { name: 'MDRRMO Rescue Hotline', number: '0919-888-7777' },
];
