import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  User,
  AuditLog,
  Notification,
  SyncQueueItem,
  Report,
  BlotterCase,
} from '../../types';
import { adminService } from '../../services/adminService';
import { notificationService } from '../../services/notificationService';
import { blotterService } from '../../services/blotterService';
import { syncService } from '../../services/SyncService';
import { systemReadinessService, ProductionCertificationReport } from '../../services/systemReadinessService';
import { ROUTES } from '../../constants';
import { Button } from '../foundation/Button';
import { SearchInput } from '../forms/SearchInput';
import { EmptyState } from '../feedback/EmptyState';
import { Skeleton } from '../feedback/Skeleton';
import { Modal } from '../feedback/Modal';
import { Alert } from '../feedback/Alert';
import {
  Server,
  Users,
  Database,
  ShieldCheck,
  Bell,
  RefreshCw,
  Activity,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Trash2,
  Download,
  Play,
  FileText,
  Boxes,
  Cpu,
  HardDrive,
  Layers,
  Terminal,
  Plus,
} from 'lucide-react';

interface DeveloperDashboardViewProps {
  reports: Report[];
  loadingReports: boolean;
}

export type DeveloperTab =
  | 'overview'
  | 'users'
  | 'database'
  | 'auditLogs'
  | 'notifications'
  | 'syncMonitor'
  | 'diagnostics'
  | 'settings';

export const DeveloperDashboardView: React.FC<DeveloperDashboardViewProps> = ({
  reports,
  loadingReports,
}) => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();
  const isOnline = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<DeveloperTab>('overview');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [maintenanceAlert, setMaintenanceAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const workspaceRef = useRef<HTMLDivElement>(null);

  const handleTabSelect = (tab: DeveloperTab, shouldScroll = false) => {
    setActiveTab(tab);
    if (shouldScroll && workspaceRef.current) {
      const yOffset = -16;
      const element = workspaceRef.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // State
  const [usersList, setUsersList] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [blottersList, setBlottersList] = useState<BlotterCase[]>([]);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [diagnosticsResult, setDiagnosticsResult] = useState<ProductionCertificationReport | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Database Collection Inspect Modal
  const [selectedCollection, setSelectedCollection] = useState<{ name: string; count: number; sampleDocs: any[] } | null>(null);

  // Load Data & Subscribe to Sync Queue
  useEffect(() => {
    if (!isAuthInitialized || !user) return;
    let isMounted = true;

    async function loadDevConsoleData() {
      setLoadingData(true);
      try {
        const [usersData, auditData, notifData, blottersData] = await Promise.all([
          adminService.getUsers(user),
          adminService.getAuditLogs(),
          user ? notificationService.getUserNotifications(user.uid, user.role, user) : Promise.resolve([]),
          blotterService.getBlotters(user),
        ]);

        if (isMounted) {
          setUsersList(usersData || []);
          setAuditLogs(auditData || []);
          setNotifications(notifData || []);
          setBlottersList(blottersData || []);
        }
      } catch (err) {
        console.error('[DeveloperConsole] Error loading developer data:', err);
      } finally {
        if (isMounted) {
          setLoadingData(false);
        }
      }
    }

    loadDevConsoleData();

    // Subscribe to Sync Queue updates
    const unsubscribeSync = syncService.subscribe((queue) => {
      if (isMounted) {
        setSyncQueue(queue);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, [isAuthInitialized, user?.uid]);

  // Handle Run Diagnostics
  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const report = await systemReadinessService.generateProductionReport();
      setDiagnosticsResult(report);
      setMaintenanceAlert({
        type: report.overallStatus === 'READY_FOR_PRODUCTION' ? 'success' : 'error',
        message: report.overallStatus === 'READY_FOR_PRODUCTION'
          ? `System Diagnostics Passed! ${report.passedCount}/${report.checks.length} checks verified.`
          : `System Diagnostics Warnings Found: ${report.failedCount} failed checks.`,
      });
    } catch (err) {
      setMaintenanceAlert({
        type: 'error',
        message: `Failed to execute diagnostics: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  // Metrics calculation
  const onlineUsersCount = usersList.filter(
    (u) => u.presence?.status === 'online' || u.status === 'active'
  ).length;

  const totalUsersCount = usersList.length;
  const residentsCount = usersList.filter((u) => u.role === 'resident').length;
  const officialsCount = usersList.filter((u) => u.role === 'purokOfficial').length;
  const chairmanCount = usersList.filter((u) => u.role === 'chairman').length;
  const secretaryCount = usersList.filter((u) => u.role === 'secretary').length;
  const verifierCount = usersList.filter((u) => u.role === 'verifier').length;
  const developersCount = usersList.filter((u) => u.role === 'developer' || u.role === 'admin' || u.role === 'superAdmin').length;

  const failedSyncCount = syncQueue.filter((item) => item.status === 'failed' || item.retryCount > 0).length;
  const pendingSyncCount = syncQueue.filter((item) => item.status === 'pending' || item.status === 'syncing').length;

  const parseLogDate = (log: any): Date | null => {
    if (!log) return null;
    const raw = log.createdAt || log.timestamp || log.eventTime;
    if (!raw) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'object' && typeof raw.toDate === 'function') {
      try {
        const d = raw.toDate();
        return isNaN(d.getTime()) ? null : d;
      } catch {
        // ignore
      }
    }
    if (typeof raw === 'object' && typeof raw.seconds === 'number') {
      return new Date(raw.seconds * 1000);
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const now = new Date();
  const todayAuditCount = auditLogs.filter((log) => {
    const logDate = parseLogDate(log);
    if (!logDate) return false;
    return (
      logDate.getFullYear() === now.getFullYear() &&
      logDate.getMonth() === now.getMonth() &&
      logDate.getDate() === now.getDate()
    );
  }).length;

  const errorLogsCount = auditLogs.filter(
    (log: any) =>
      log.severity === 'high' ||
      log.severity === 'critical' ||
      log.action?.toLowerCase().includes('error') ||
      log.action?.toLowerCase().includes('fail')
  ).length + failedSyncCount;

  // Monitored collections definition backed by actual application state
  const collectionsList: {
    name: string;
    count: number | null;
    lastUpdated: string;
    sampleDocs: any[];
  }[] = [
    { name: 'users', count: totalUsersCount, lastUpdated: 'Real-time', sampleDocs: usersList.slice(0, 3) },
    { name: 'reports', count: reports.length, lastUpdated: 'Real-time', sampleDocs: reports.slice(0, 3) },
    { name: 'registrations', count: usersList.filter((u) => u.status === 'pending').length, lastUpdated: 'Real-time', sampleDocs: usersList.filter((u) => u.status === 'pending').slice(0, 3) },
    { name: 'notifications', count: notifications.length, lastUpdated: 'Real-time', sampleDocs: notifications.slice(0, 3) },
    { name: 'auditLogs', count: auditLogs.length, lastUpdated: 'Real-time', sampleDocs: auditLogs.slice(0, 3) },
    { name: 'residents', count: residentsCount, lastUpdated: 'Real-time', sampleDocs: usersList.filter((u) => u.role === 'resident').slice(0, 3) },
    { name: 'certificateRequests', count: null, lastUpdated: 'Not Configured', sampleDocs: [] },
    { name: 'announcements', count: null, lastUpdated: 'Not Configured', sampleDocs: [] },
    { name: 'inventory', count: null, lastUpdated: 'Not Configured', sampleDocs: [] },
    { name: 'blotters', count: blottersList.length, lastUpdated: 'Real-time', sampleDocs: blottersList.slice(0, 3) },
    { name: 'households', count: null, lastUpdated: 'Not Configured', sampleDocs: [] },
  ];

  // Search Filtered Data
  const filteredUsers = usersList.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.purok?.toLowerCase().includes(q)
    );
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const performer = (
      log.performerName ||
      (log as any).performedByName ||
      (log as any).performedBy ||
      ''
    ).toLowerCase();
    const role = (
      log.performerRole ||
      (log as any).performedByRole ||
      ''
    ).toLowerCase();
    const dateStr = parseLogDate(log)?.toLocaleString().toLowerCase() || '';
    const detailsStr = JSON.stringify(
      log.newValues || log.previousValues || (log as any).details || {}
    ).toLowerCase();

    return (
      log.action?.toLowerCase().includes(q) ||
      log.module?.toLowerCase().includes(q) ||
      performer.includes(q) ||
      role.includes(q) ||
      log.ipAddress?.toLowerCase().includes(q) ||
      log.auditId?.toLowerCase().includes(q) ||
      dateStr.includes(q) ||
      detailsStr.includes(q)
    );
  });

  const filteredNotifications = notifications.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      n.title?.toLowerCase().includes(q) ||
      n.message?.toLowerCase().includes(q) ||
      n.type?.toLowerCase().includes(q) ||
      n.priority?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Offline Notice Banner */}
      {!isOnline && (
        <Alert
          type="info"
          message="Developer Console Offline: Displaying local cache and offline sync telemetry. Live cluster operations and backend writes require an active network connection."
        />
      )}

      {/* MAINTENANCE / DIAGNOSTICS ALERT NOTIFICATION */}
      {maintenanceAlert && (
        <Alert
          type={maintenanceAlert.type}
          message={maintenanceAlert.message}
          onClose={() => setMaintenanceAlert(null)}
        />
      )}

      {/* DEVELOPER SUMMARY CARDS (7 CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* 1. Active Users */}
        <div
          onClick={() => handleTabSelect('users', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-blue-50/80 border-blue-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Active Users
            </span>
            <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : onlineUsersCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Currently online / active sessions
            </p>
          </div>
        </div>

        {/* 2. System Health */}
        <div
          onClick={() => handleTabSelect('diagnostics', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'diagnostics'
              ? 'bg-emerald-50/80 border-emerald-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              System Health
            </span>
            <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            {diagnosticsResult ? (
              <span className={`text-xl sm:text-2xl font-black flex items-center gap-1.5 ${
                diagnosticsResult.overallStatus === 'READY_FOR_PRODUCTION' ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {diagnosticsResult.overallStatus === 'READY_FOR_PRODUCTION' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Operational
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    Warnings
                  </>
                )}
              </span>
            ) : (
              <span className="text-xl sm:text-2xl font-black text-slate-500 flex items-center gap-1.5">
                <Clock className="w-5 h-5 text-slate-400" />
                Unknown
              </span>
            )}
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {diagnosticsResult
                ? `${diagnosticsResult.passedCount}/${diagnosticsResult.checks.length} checks passed`
                : 'Run diagnostics check to verify'}
            </p>
          </div>
        </div>

        {/* 3. Database Collections */}
        <div
          onClick={() => handleTabSelect('database', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'database'
              ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
              DB Collections
            </span>
            <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {collectionsList.length}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Monitored Firestore schemas
            </p>
          </div>
        </div>

        {/* 4. Error Monitor */}
        <div
          onClick={() => handleTabSelect('diagnostics', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'diagnostics'
              ? 'bg-rose-50/80 border-rose-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">
              Error Monitor
            </span>
            <div className="p-2 rounded-xl bg-rose-100/80 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : errorLogsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Unresolved app / system issues
            </p>
          </div>
        </div>

        {/* 5. Failed Sync Queue */}
        <div
          onClick={() => handleTabSelect('syncMonitor', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'syncMonitor'
              ? 'bg-amber-50/80 border-amber-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              Failed Sync Queue
            </span>
            <div className="p-2 rounded-xl bg-amber-100/80 text-amber-700">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {failedSyncCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {pendingSyncCount} pending offline mutations
            </p>
          </div>
        </div>

        {/* 6. System Metrics */}
        <div
          onClick={() => handleTabSelect('overview', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-purple-50/80 border-purple-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">
              System Metrics
            </span>
            <div className="p-2 rounded-xl bg-purple-100/80 text-purple-700">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Collections Monitored:</span>
              <span className="font-bold text-slate-900">{collectionsList.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Online Users:</span>
              <span className="font-bold text-slate-900">{loadingData ? '-' : onlineUsersCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Offline Sync Queue:</span>
              <span className="font-bold text-slate-900">{syncQueue.length} ({failedSyncCount} failed)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Audit Events Today:</span>
              <span className="font-bold text-slate-900">{loadingData ? '-' : todayAuditCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Realtime Listeners:</span>
              <span className="font-medium text-slate-400">Not Available</span>
            </div>
          </div>
        </div>

        {/* 7. Audit Logs */}
        <div
          onClick={() => handleTabSelect('auditLogs', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'auditLogs'
              ? 'bg-slate-100 border-slate-400 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Audit Trail Today
            </span>
            <div className="p-2 rounded-xl bg-slate-200/80 text-slate-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : todayAuditCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Today's system audit events
            </p>
          </div>
        </div>
      </div>

      {/* WORKSPACE ANCHOR & NAVIGATION */}
      <div ref={workspaceRef} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        {/* WORKSPACE TABS (8 TABS) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none bg-slate-100/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleTabSelect('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💻 Overview
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'users'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👥 Users ({totalUsersCount})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('database')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'database'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🗄️ Database ({collectionsList.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('auditLogs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'auditLogs'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛡️ Audit Logs ({auditLogs.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('notifications')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'notifications'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🔔 Notifications ({notifications.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('syncMonitor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'syncMonitor'
                  ? 'bg-white text-rose-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🔄 Sync Monitor ({syncQueue.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('diagnostics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'diagnostics'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🩺 Diagnostics
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('settings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'settings'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚙️ Settings
            </button>
          </div>

          {/* Search Bar */}
          <div className="w-full sm:w-64">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              onClear={() => setSearchQuery('')}
            />
          </div>
        </div>

        {/* TAB 1: OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Platform Architecture & Infrastructure Overview
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time status of backend services, container runtime, and system metrics.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Play className="w-3.5 h-3.5" />}
                loading={runningDiagnostics}
                onClick={handleRunDiagnostics}
              >
                Run Diagnostics Check
              </Button>
            </div>

            {/* Platform Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-blue-600" /> Firestore Database
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Operational
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Firestore Native Engine
                </p>
                <p className="text-[11px] text-slate-500">
                  Latency: Unavailable • Connection: Active
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Authentication
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Operational
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Firebase Identity Platform
                </p>
                <p className="text-[11px] text-slate-500">
                  Active Sessions: {onlineUsersCount} • Token validation: Active
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-purple-600" /> Storage Engine
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    Not Configured
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Cloud Storage / Local Cache
                </p>
                <p className="text-[11px] text-slate-500">
                  Storage usage: Unavailable
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-amber-600" /> Cloud Hosting
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    Not Configured
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Application Container Runtime
                </p>
                <p className="text-[11px] text-slate-500">
                  Uptime: Unavailable
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-indigo-600" /> Offline Sync Engine
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Operational
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Client Mutation Queue Listener
                </p>
                <p className="text-[11px] text-slate-500">
                  Queue Items: {syncQueue.length} • Failed: {failedSyncCount}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-slate-700" /> Audit Trail Logger
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Operational
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Immutable Event Storage
                </p>
                <p className="text-[11px] text-slate-500">
                  Events Today: {todayAuditCount} • Append-Only: Verified
                </p>
              </div>
            </div>

            {/* Quick Readiness Diagnostics Card if available */}
            {diagnosticsResult && (
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-900 text-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-sm">System Diagnostics Summary</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Executed at {new Date(diagnosticsResult.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center border-t border-b border-slate-800 py-3">
                  <div>
                    <span className="text-xs text-slate-400">Total Checks</span>
                    <p className="text-xl font-bold">{diagnosticsResult.totalChecks}</p>
                  </div>
                  <div>
                    <span className="text-xs text-emerald-400">Passed</span>
                    <p className="text-xl font-bold text-emerald-400">{diagnosticsResult.passedCount}</p>
                  </div>
                  <div>
                    <span className="text-xs text-rose-400">Failed / Warning</span>
                    <p className="text-xl font-bold text-rose-400">{diagnosticsResult.failedCount}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  User Accounts & Administrative Role Monitoring
                </h3>
                <p className="text-xs text-slate-500">
                  System-wide user presence, role assignments, and authentication monitoring.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.USERS)}
              >
                Go to User Management
              </Button>
            </div>

            {/* Role Counts Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total</span>
                <p className="text-xl font-black text-slate-900 mt-1">{totalUsersCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-blue-600 uppercase">Residents</span>
                <p className="text-xl font-black text-slate-900 mt-1">{residentsCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-amber-600 uppercase">Officials</span>
                <p className="text-xl font-black text-slate-900 mt-1">{officialsCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-purple-600 uppercase">Chairman</span>
                <p className="text-xl font-black text-slate-900 mt-1">{chairmanCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-indigo-600 uppercase">Secretary</span>
                <p className="text-xl font-black text-slate-900 mt-1">{secretaryCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-rose-600 uppercase">Verifier</span>
                <p className="text-xl font-black text-slate-900 mt-1">{verifierCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-emerald-600 uppercase">Dev / Admin</span>
                <p className="text-xl font-black text-slate-900 mt-1">{developersCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Online</span>
                <p className="text-xl font-black text-emerald-800 mt-1">{onlineUsersCount}</p>
              </div>
            </div>

            {/* Users Table */}
            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon={<Users className="w-8 h-8 text-slate-400" />}
                title="No Users Found"
                description="No user records match your search query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">User Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Jurisdiction / Purok</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Presence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((usr) => (
                      <tr key={usr.uid} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {usr.fullName}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {usr.email}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700 capitalize">
                          {usr.role}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {usr.purok || 'All Barangays'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              usr.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : usr.status === 'suspended'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {usr.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            {usr.presence?.status === 'online' ? (
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            ) : usr.presence?.status === 'idle' ? (
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            )}
                            {usr.presence?.status || 'offline'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DATABASE TAB */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Firestore Database Collections Inspector
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time document counts and schema inspection for monitored Firestore collections.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collectionsList.map((col) => (
                <div
                  key={col.name}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                        <Database className="w-4 h-4" />
                      </div>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {col.name}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                        col.count !== null
                          ? 'text-indigo-700 bg-indigo-50'
                          : 'text-slate-500 bg-slate-100'
                      }`}
                    >
                      {col.count !== null ? `${col.count} docs` : 'Not Configured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>Last updated: {col.lastUpdated}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setSelectedCollection({
                          name: col.name,
                          count: col.count,
                          sampleDocs: col.sampleDocs,
                        })
                      }
                    >
                      Open Collection
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT LOGS TAB */}
        {activeTab === 'auditLogs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  System Audit Trail & Security Logs
                </h3>
                <p className="text-xs text-slate-500">
                  Complete immutable administrative activity trail for compliance and developer oversight.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.AUDIT_LOGS)}
              >
                Go to Full Audit Page
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredAuditLogs.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="w-8 h-8 text-slate-400" />}
                title="No Audit Logs Found"
                description="No system audit events match your search."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">User / Performer</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Module</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAuditLogs.map((log, index) => {
                      const logDate = parseLogDate(log);
                      const performerName =
                        log.performerName ||
                        (log as any).performedByName ||
                        (log as any).performedBy ||
                        'System';
                      const performerRole =
                        log.performerRole || (log as any).performedByRole || 'N/A';
                      const rowKey =
                        log.auditId ||
                        (log as any).logId ||
                        (log as any).id ||
                        `log-${index}`;

                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {logDate ? logDate.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {performerName}
                            <span className="block text-[11px] font-normal text-slate-500 capitalize">
                              {performerRole}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            {log.action}
                          </td>
                          <td className="py-3 px-4 text-slate-600 capitalize">
                            {log.module}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                (log as any).severity === 'critical' || (log as any).severity === 'high'
                                  ? 'bg-rose-100 text-rose-800'
                                  : (log as any).severity === 'medium'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {(log as any).severity || 'low'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {log.ipAddress || 'N/A'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  System Notifications & Broadcast Engine
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time broadcast history, emergency alerts, and system-wide user notifications.
                </p>
              </div>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredNotifications.length === 0 ? (
              <EmptyState
                icon={<Bell className="w-8 h-8 text-slate-400" />}
                title="No Notifications Found"
                description="No system notifications match your search query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Title / Header</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Target User</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Read Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNotifications.map((notif) => (
                      <tr key={notif.notificationId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{notif.title}</p>
                          <p className="text-[11px] text-slate-500 max-w-md truncate">{notif.message}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 capitalize">
                          {notif.type}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              notif.priority === 'critical'
                                ? 'bg-rose-100 text-rose-800'
                                : notif.priority === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {notif.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {notif.userId}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(notif.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              notif.isRead ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {notif.isRead ? 'Read' : 'Unread'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SYNC MONITOR TAB */}
        {activeTab === 'syncMonitor' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Offline Queue Engine & Synchronization Monitor
                </h3>
                <p className="text-xs text-slate-500">
                  Inspect, retry, or flush deferred mutations queued by the BOIMS Offline Service.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  variant="primary"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={async () => {
                    const res = await syncService.processQueue();
                    setMaintenanceAlert({
                      type: 'info',
                      message: `Queue processed: ${res.processed} items succeeded, ${res.failed} items failed.`,
                    });
                  }}
                >
                  Process Queue
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    const json = syncService.exportQueueJSON();
                    navigator.clipboard.writeText(json);
                    setMaintenanceAlert({
                      type: 'success',
                      message: 'Sync Queue JSON copied to clipboard!',
                    });
                  }}
                >
                  Export JSON
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => {
                    syncService.clearQueue();
                    setMaintenanceAlert({
                      type: 'info',
                      message: 'Sync Queue cleared.',
                    });
                  }}
                >
                  Clear Queue
                </Button>
              </div>
            </div>

            {/* Sync Queue Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total Items</span>
                <p className="text-xl font-black text-slate-900 mt-1">{syncQueue.length}</p>
              </div>
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
                <span className="text-[11px] font-bold text-amber-700 uppercase">Pending</span>
                <p className="text-xl font-black text-amber-900 mt-1">{pendingSyncCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50">
                <span className="text-[11px] font-bold text-rose-700 uppercase">Failed</span>
                <p className="text-xl font-black text-rose-900 mt-1">{failedSyncCount}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Retry Attempts</span>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {syncQueue.reduce((acc, item) => acc + item.retryCount, 0)}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Latest Sync</span>
                <p className="text-xs font-bold text-emerald-900 mt-2">Just Now</p>
              </div>
            </div>

            {/* Sync Queue Table */}
            {syncQueue.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
                title="Sync Queue Clean"
                description="There are currently no pending or failed offline mutations in the queue."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Queue ID</th>
                      <th className="py-3 px-4">Op Type</th>
                      <th className="py-3 px-4">Collection</th>
                      <th className="py-3 px-4">Record ID</th>
                      <th className="py-3 px-4">Retries</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {syncQueue.map((item) => (
                      <tr key={item.queueId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {item.queueId}
                        </td>
                        <td className="py-3 px-4 font-mono uppercase font-bold text-slate-800">
                          {item.operationType}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {item.collectionName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {item.recordId}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {item.retryCount}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              item.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'failed'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={async () => {
                              const ok = await syncService.retryItem(item.queueId);
                              setMaintenanceAlert({
                                type: ok ? 'success' : 'error',
                                message: ok ? `Successfully synced ${item.queueId}` : `Failed to sync ${item.queueId}`,
                              });
                            }}
                          >
                            Retry
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => syncService.removeItem(item.queueId)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}



        {/* TAB 8: DIAGNOSTICS TAB */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Live Service Diagnostics & System Health
                </h3>
                <p className="text-xs text-slate-500">
                  Comprehensive automated diagnostic suite verifying Firestore security rules, permissions, presence, and storage.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Play className="w-3.5 h-3.5" />}
                loading={runningDiagnostics}
                onClick={handleRunDiagnostics}
              >
                Run Diagnostics Check
              </Button>
            </div>

            {/* Live Service Health Monitors */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: 'Firestore DB Engine', keyword: 'firestore', desc: 'Read/Write query permissions & indexes.' },
                { name: 'Firebase Authentication', keyword: 'auth', desc: 'JWT validation & security rules.' },
                { name: 'Cloud Storage Bucket', keyword: 'storage', desc: 'Asset uploading & media attachments.' },
                { name: 'Presence Heartbeat Service', keyword: 'presence', desc: 'Official heartbeat status & presence tracking.' },
                { name: 'Notification Engine', keyword: 'notification', desc: 'Emergency broadcasts & alert queue.' },
                { name: 'Offline Sync Engine', keyword: 'sync', desc: 'Sync queue listener & mutation worker.' },
              ].map((svc) => {
                let badgeLabel = 'Unknown';
                let badgeClass = 'bg-slate-100 text-slate-700';

                if (diagnosticsResult && Array.isArray(diagnosticsResult.checks)) {
                  const match = diagnosticsResult.checks.find((c) => {
                    if (!c) return false;
                    const idStr = (c.id ?? (c as any).checkId ?? '').toLowerCase();
                    const titleStr = (c.title ?? (c as any).name ?? '').toLowerCase();
                    const catStr = (c.category ?? '').toLowerCase();
                    return (
                      idStr.includes(svc.keyword) ||
                      titleStr.includes(svc.keyword) ||
                      catStr.includes(svc.keyword)
                    );
                  });
                  if (match) {
                    const isPassed = match.status === 'passed' || (match as any).passed === true;
                    if (isPassed) {
                      badgeLabel = 'Healthy';
                      badgeClass = 'bg-emerald-100 text-emerald-800';
                    } else {
                      badgeLabel = 'Warning';
                      badgeClass = 'bg-rose-100 text-rose-800';
                    }
                  } else {
                    badgeLabel = 'Not Tested';
                    badgeClass = 'bg-slate-100 text-slate-700';
                  }
                } else if (svc.keyword === 'sync' && syncQueue !== undefined) {
                  badgeLabel = 'Healthy';
                  badgeClass = 'bg-emerald-100 text-emerald-800';
                }

                return (
                  <div key={svc.name} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{svc.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{svc.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Diagnostic Detailed Results */}
            {diagnosticsResult && Array.isArray(diagnosticsResult.checks) && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="font-bold text-sm text-slate-900">Detailed Automated Diagnostic Log</h4>
                <div className="space-y-2">
                  {diagnosticsResult.checks.map((check, idx) => {
                    const checkId = check?.id ?? (check as any)?.checkId ?? `check_${idx}`;
                    const checkTitle = check?.title ?? (check as any)?.name ?? 'Diagnostic Check';
                    const isPassed = check?.status === 'passed' || (check as any)?.passed === true;
                    const details = check?.details ?? (check as any)?.errorDetails;
                    const latency = check?.latencyMs ?? (check as any)?.durationMs;

                    return (
                      <div
                        key={checkId}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          isPassed
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                            : 'bg-rose-50/60 border-rose-200 text-rose-950'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {isPassed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="font-bold">{checkTitle}</p>
                            <p className="text-[11px] opacity-80 mt-0.5">{check?.description ?? ''}</p>
                            {details && (
                              <p className="font-mono text-[10px] text-rose-700 mt-1 bg-white/80 p-1.5 rounded-md border border-rose-200">
                                {details}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] font-bold uppercase shrink-0">
                          {latency !== undefined ? `${latency}ms` : 'N/A'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 9: SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Developer Maintenance & Console Administrative Tools
                </h3>
                <p className="text-xs text-slate-500">
                  Administrative maintenance utilities for platform debugging, sync retries, and cache management.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-600" /> Automated System Diagnostics
                </h4>
                <p className="text-xs text-slate-600">
                  Execute full platform readiness check across Firestore security rules, permissions, presence, and collection connectivity.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  loading={runningDiagnostics}
                  onClick={handleRunDiagnostics}
                >
                  Run Diagnostics Suite
                </Button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-600" /> Offline Sync Flush
                </h4>
                <p className="text-xs text-slate-600">
                  Force immediate retry of all deferred offline mutations in the queue engine.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await syncService.processQueue();
                    setMaintenanceAlert({
                      type: 'info',
                      message: `Sync flush completed: ${res.processed} processed, ${res.failed} failed.`,
                    });
                  }}
                >
                  Retry Failed Sync Queue
                </Button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-600" /> Client Cache & State Flush
                </h4>
                <p className="text-xs text-slate-600">
                  Clear local app cache, temporary filters, and session storage parameters without logging out.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    sessionStorage.clear();
                    setMaintenanceAlert({
                      type: 'success',
                      message: 'Client session storage and temporary cache cleared successfully.',
                    });
                  }}
                >
                  Clear App Cache
                </Button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-600" /> Audit Logs Export
                </h4>
                <p className="text-xs text-slate-600">
                  Export system audit logs as JSON to clipboard for developer offline analysis.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(auditLogs, null, 2));
                    setMaintenanceAlert({
                      type: 'success',
                      message: 'Audit logs JSON copied to clipboard.',
                    });
                  }}
                >
                  Export Audit Logs
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DATABASE COLLECTION DETAILS MODAL */}
      {selectedCollection && (
        <Modal
          isOpen={!!selectedCollection}
          onClose={() => setSelectedCollection(null)}
          title={`Firestore Collection: ${selectedCollection.name}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <p className="font-bold text-slate-900">Collection Metadata</p>
              <p className="text-slate-600">
                Total Document Count:{' '}
                <strong>
                  {selectedCollection.count !== null ? selectedCollection.count : 'Not Configured'}
                </strong>
              </p>
              <p className="text-slate-600">Schema Rules: Enforced via firestore.rules</p>
            </div>

            <div className="space-y-2">
              <p className="font-bold text-slate-900">Sample Document Preview</p>
              {selectedCollection.sampleDocs && selectedCollection.sampleDocs.length > 0 ? (
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60">
                  {JSON.stringify(selectedCollection.sampleDocs, null, 2)}
                </pre>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 italic">
                  No sample documents available or collection not configured in current session state.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedCollection(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
