/**
 * Initial Seed Settings for Barangay Profile & System Configuration (Module 8)
 */

import { BarangayProfileSettings, AppSettings } from '../types';
import { DEFAULT_EMERGENCY_HOTLINES } from './index';

export const INITIAL_BARANGAY_PROFILE: BarangayProfileSettings = {
  barangayName: 'Barangay Central',
  municipality: 'Baras',
  province: 'Rizal',
  region: 'Region IV-A (CALABARZON)',
  address: 'Barangay Hall, Plaza Drive, Baras, Rizal',
  contactNumber: '(02) 8912-3456 / 0917-111-2222',
  email: 'info@barangaycentral.gov.ph',
  logoUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=300',
  captainName: 'Hon. Roberto Santos',
  secretaryName: 'Maria Santos',
  officeHours: 'Monday - Friday: 8:00 AM - 5:00 PM',
  emergencyHotlines: DEFAULT_EMERGENCY_HOTLINES,
  updatedAt: new Date().toISOString(),
  updatedBy: 'usr-admin-001',
};

export const INITIAL_APP_SETTINGS: AppSettings = {
  appName: 'Barangay Operations & Information Management System (BOIMS)',
  version: '1.0.0',
  maintenanceMode: false,
  registrationEnabled: true,
  anonymousReporting: true,
  maxUploadSizeMB: 10,
  supportedImageFormats: ['JPEG', 'PNG', 'WEBP'],
  updatedAt: new Date().toISOString(),
  updatedBy: 'usr-admin-001',
};
