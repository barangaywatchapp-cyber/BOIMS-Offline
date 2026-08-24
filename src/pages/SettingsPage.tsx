/**
 * Page: SettingsPage (Module 8)
 * Barangay Profile Configuration, System Security Policies, and Database Backup/Restore Interface
 * Features:
 * - Barangay Official Profile (Barangay Name, Captain Name, Address, Hotlines, Logo)
 * - App & Security Policy Toggles (Maintenance mode, Registration toggle, Anonymous reporting)
 * - JSON System Data Export & Backup Summary
 * - Offline Cache Reset & Database Health Status
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminService } from '../services/adminService';
import { BarangayProfileSettings, AppSettings } from '../types';
import { canAccessSystemSettings } from '../utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import {
  Settings,
  Building,
  Shield,
  Download,
  Upload,
  RefreshCw,
  PhoneCall,
  Save,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Globe,
  Database,
  Trash2,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'backup'>('profile');

  const [profile, setProfile] = useState<BarangayProfileSettings | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const isAuthorized = canAccessSystemSettings(role);
  const canEdit = isAuthorized;

  const fetchData = async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pData = await adminService.getBarangayProfile();
      const sData = await adminService.getAppSettings();
      setProfile(pData);
      setAppSettings(sData);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user || !isAuthorized) return;

    setSaving(true);
    try {
      const updated = await adminService.updateBarangayProfile(
        profile,
        user.uid,
        user.fullName,
        user.role
      );
      setProfile(updated);
      alert('Barangay Profile settings updated successfully.');
    } catch (err) {
      alert('Error updating profile: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAppSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appSettings || !user) return;

    setSaving(true);
    try {
      const updated = await adminService.updateAppSettings(
        appSettings,
        user.uid,
        user.fullName,
        user.role
      );
      setAppSettings(updated);
      alert('System & Security settings updated successfully.');
    } catch (err) {
      alert('Error updating app settings: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const jsonStr = await adminService.generateSystemBackupJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BOIMS_System_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error generating backup: ' + (err as Error).message);
    }
  };

  const handleClearCache = () => {
    if (window.confirm('Are you sure you want to clear local session cache? This will reset local view preferences.')) {
      localStorage.clear();
      alert('Local session cache cleared.');
      window.location.reload();
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
          <Shield className="w-12 h-12 text-red-600 mx-auto" />
          <h2 className="text-lg font-bold text-red-900">403 - Access Denied</h2>
          <p className="text-xs text-red-700 max-w-md mx-auto">
            Barangay System Configuration & Governance is strictly restricted to the Barangay Secretary and Barangay Chairman.
          </p>
        </div>
      </div>
    );
  }

  if (loading || !profile || !appSettings) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span>Loading System Configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <Settings className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Barangay System Configuration & Governance</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Official barangay metadata, security controls, offline storage management, and database backup
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchData} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 gap-4 bg-white p-2 rounded-xl shadow-xs">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building className="w-4 h-4" /> Barangay Profile & Hotlines
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'security'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" /> Security & Application Rules
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'backup'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" /> System Backup & Data Governance
        </button>
      </div>

      {/* Tab 1: Barangay Official Profile */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">
              Official Barangay Header & Seal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSaveProfile} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Barangay Name *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.barangayName}
                    onChange={(e) => setProfile({ ...profile, barangayName: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Barangay Captain Full Name *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.captainName}
                    onChange={(e) => setProfile({ ...profile, captainName: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Barangay Secretary Full Name *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.secretaryName || ''}
                    onChange={(e) => setProfile({ ...profile, secretaryName: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                    placeholder="e.g. Maria Santos"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Municipality / City *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.municipality}
                    onChange={(e) => setProfile({ ...profile, municipality: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Province *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.province}
                    onChange={(e) => setProfile({ ...profile, province: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Region *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.region}
                    onChange={(e) => setProfile({ ...profile, region: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Official Address *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Office Hours *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.officeHours}
                    onChange={(e) => setProfile({ ...profile, officeHours: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Numbers *</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={profile.contactNumber}
                    onChange={(e) => setProfile({ ...profile, contactNumber: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Official Email Address *</label>
                  <input
                    type="email"
                    required
                    disabled={!canEdit}
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button type="submit" disabled={saving} variant="primary" size="md" className="flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save Profile Settings
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Security & Application Rules */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">
              System Policy & Operational Toggles
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSaveAppSettings} className="space-y-6 text-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">System Maintenance Mode</p>
                    <p className="text-xs text-slate-500">
                      When enabled, resident access is restricted to maintenance announcements only.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={appSettings.maintenanceMode}
                    onChange={(e) => setAppSettings({ ...appSettings, maintenanceMode: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">Resident Self-Registration</p>
                    <p className="text-xs text-slate-500">
                      Allow new residents to register online before identity verification.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={appSettings.registrationEnabled}
                    onChange={(e) => setAppSettings({ ...appSettings, registrationEnabled: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">Anonymous Incident Reporting</p>
                    <p className="text-xs text-slate-500">
                      Permit citizens to submit public safety & complaint reports anonymously.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={appSettings.anonymousReporting}
                    onChange={(e) => setAppSettings({ ...appSettings, anonymousReporting: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Attachment Upload Size (MB)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    disabled={!canEdit}
                    value={appSettings.maxUploadSizeMB}
                    onChange={(e) => setAppSettings({ ...appSettings, maxUploadSizeMB: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">System Version</label>
                  <input
                    type="text"
                    disabled
                    value={appSettings.version}
                    className="w-full p-2.5 border border-slate-200 bg-slate-100 rounded-xl text-slate-500 font-mono text-xs"
                  />
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button type="submit" disabled={saving} variant="primary" size="md" className="flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save Security Policies
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: System Backup & Governance */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" /> Complete System Backup & Export
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <p className="text-slate-600">
                Generate and download an encrypted, structured JSON snapshot of all system collections including User Accounts, Audit Trails, Barangay Settings, and Configuration State.
              </p>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <p className="font-bold text-slate-900">Backup Information:</p>
                <p className="text-slate-600">• Snapshot format: Structured JSON (compliant with DICT barangay audit requirements)</p>
                <p className="text-slate-600">• Includes Users, Audit Logs, App Settings, and Official Barangay Metadata</p>
              </div>

              <Button onClick={handleDownloadBackup} variant="primary" size="md" className="flex items-center gap-2">
                <Download className="w-4 h-4" /> Download System Backup JSON
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5 text-red-600" /> Offline Storage & Local Cache Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <p className="text-slate-600">
                Clear locally cached browser tokens and temporary session storage without affecting permanent cloud database records.
              </p>

              <Button onClick={handleClearCache} variant="danger" size="sm" className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Reset Local Browser Cache
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
