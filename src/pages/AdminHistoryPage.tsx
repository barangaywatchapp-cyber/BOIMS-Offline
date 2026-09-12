/**
 * Page: AdminHistoryPage
 * Super Admin Dedicated Administrative History & Audit Trail Interface
 *
 * Requirements:
 * - Immutable system audit record of administrative actions, user accounts, and role modifications.
 * - Reuses existing /auditLogs collection and adminService.getAuditLogs() infrastructure.
 * - Read-only display: no edit or delete controls (preserving append-only security).
 * - Clear capture of actor UID/name, target UID/name, timestamp, previous & new roles/statuses.
 * - Filterable by action type, searchable, with detailed payload inspection and CSV export.
 */

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { adminService } from '../services/adminService';
import { AuditLog, UserRole } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import { Modal } from '../components/feedback/Modal';
import { ROLE_LABELS, ROUTES } from '../constants';
import {
  History,
  Shield,
  ShieldCheck,
  User,
  Users,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Download,
  Calendar,
  Clock,
  ArrowRight,
  CheckCircle2,
  Lock,
  WifiOff,
  UserCheck,
  AlertCircle,
  FileCode,
  Tag,
} from 'lucide-react';

export const AdminHistoryPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();
  const isOnline = useOnlineStatus();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionCategoryFilter, setActionCategoryFilter] = useState<'all' | 'role' | 'creation' | 'status'>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  const fetchHistoryLogs = async () => {
    if (!user?.uid) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Primary Firestore query strictly enforces performedBy == authenticated Super Admin UID
      const data = await adminService.getAuditLogs({ limitCount: 200, performedBy: user.uid }, user);
      setLogs(data);
    } catch (err) {
      console.error('[AdminHistoryPage] Failed to load admin history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchHistoryLogs();
  }, [isAuthInitialized, user?.uid]);

  // Categorize log action for easy filtering
  const isRoleAction = (action: string) => {
    const act = action.toUpperCase();
    return act.includes('ROLE') || act === 'ROLE_CHANGED' || act === 'ROLE_AND_STATUS_CHANGED';
  };

  const isCreationAction = (action: string) => {
    const act = action.toUpperCase();
    return act.includes('CREATE') || act.includes('OFFICIAL_ACCOUNT') || act.includes('USER_ACCOUNT');
  };

  const isStatusAction = (action: string) => {
    const act = action.toUpperCase();
    return act.includes('STATUS') || act.includes('DEACTIVATE') || act.includes('SUSPEND') || act.includes('ACTIVATE');
  };

  const filteredLogs = logs.filter((log) => {
    // Action category filtering
    if (actionCategoryFilter === 'role' && !isRoleAction(log.action)) return false;
    if (actionCategoryFilter === 'creation' && !isCreationAction(log.action)) return false;
    if (actionCategoryFilter === 'status' && !isStatusAction(log.action)) return false;

    // Free text search
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();

    return (
      log.auditId.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.targetName && log.targetName.toLowerCase().includes(q)) ||
      (log.targetId && log.targetId.toLowerCase().includes(q)) ||
      (log.performerName && log.performerName.toLowerCase().includes(q)) ||
      log.performedBy.toLowerCase().includes(q) ||
      (log.reason && log.reason.toLowerCase().includes(q)) ||
      log.module.toLowerCase().includes(q)
    );
  });

  // Metrics counts
  const totalLogsCount = logs.length;
  const roleChangesCount = logs.filter((l) => isRoleAction(l.action)).length;
  const accountCreationsCount = logs.filter((l) => isCreationAction(l.action)).length;
  const statusUpdatesCount = logs.filter((l) => isStatusAction(l.action)).length;

  const handleExportCSV = () => {
    const headers = [
      'Audit ID',
      'Timestamp',
      'Action',
      'Performer Name',
      'Performer Role',
      'Performer UID',
      'Target User Name',
      'Target User UID',
      'Previous Role',
      'New Role',
      'Previous Status',
      'New Status',
      'Reason / Context',
    ];

    const rows = filteredLogs.map((l) => [
      `"${l.auditId}"`,
      `"${l.createdAt}"`,
      `"${l.action}"`,
      `"${l.performerName || 'Unknown'}"`,
      `"${l.performerRole}"`,
      `"${l.performedBy}"`,
      `"${l.targetName || l.newValues?.fullName || l.targetId}"`,
      `"${l.targetId}"`,
      `"${l.previousValues?.role || ''}"`,
      `"${l.newValues?.role || ''}"`,
      `"${l.previousValues?.status || ''}"`,
      `"${l.newValues?.status || ''}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BOIMS_Admin_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action: string) => {
    if (isRoleAction(action)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
          <Shield className="w-3 h-3 text-purple-600" />
          {action}
        </span>
      );
    }
    if (isCreationAction(action)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {action}
        </span>
      );
    }
    if (isStatusAction(action)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <AlertCircle className="w-3 h-3 text-amber-600" />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <Tag className="w-3 h-3 text-slate-500" />
        {action}
      </span>
    );
  };

  const getRolePill = (roleKey?: string) => {
    if (!roleKey) return <span className="text-slate-400 italic text-xs">None</span>;
    const roleInfo = ROLE_LABELS[roleKey as UserRole];
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
        {roleInfo?.label || roleKey}
      </span>
    );
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return {
        formatted: date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        dateOnly: date.toLocaleDateString(),
      };
    } catch {
      return { formatted: isoString, dateOnly: isoString };
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Offline Notice */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-xs">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-900">Offline History Mode</p>
            <p className="text-amber-800">
              Viewing cached administrative audit trail entries. Live synchronization requires network connectivity.
            </p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <History className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Super Admin History</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <Lock className="w-3 h-3" /> Append-Only Audit Trail
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-0.5">
              Immutable history of administrative actions, account creations, and role assignments performed by this account
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NavLink to={ROUTES.USERS}>
            <Button variant="secondary" size="md" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> User Management
            </Button>
          </NavLink>
          <Button
            variant="outline"
            size="md"
            onClick={fetchHistoryLogs}
            disabled={loading}
            className="flex items-center gap-2 text-white border-slate-700 hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 shadow-md"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Recorded Events</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalLogsCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role Transitions</p>
            <p className="text-2xl font-black text-purple-700 mt-1">{roleChangesCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accounts Created</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{accountCreationsCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status & Access Updates</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{statusUpdatesCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search user, administrator, action, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setActionCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                actionCategoryFilter === 'all'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Actions ({totalLogsCount})
            </button>
            <button
              onClick={() => setActionCategoryFilter('role')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                actionCategoryFilter === 'role'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Role Changes ({roleChangesCount})
            </button>
            <button
              onClick={() => setActionCategoryFilter('creation')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                actionCategoryFilter === 'creation'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Account Creations ({accountCreationsCount})
            </button>
            <button
              onClick={() => setActionCategoryFilter('status')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                actionCategoryFilter === 'status'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Status Updates ({statusUpdatesCount})
            </button>
          </div>
        </CardContent>
      </Card>

      {/* History Records Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>Administrative Action Log</span>
            </div>
            <span className="text-xs font-normal text-slate-500">Showing {filteredLogs.length} events</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-sm">Retrieving immutable audit history...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-base text-slate-700">No administrative events found.</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery ? 'Try clearing your search filters.' : 'Actions on user accounts will appear here permanently.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Action / Event</th>
                    <th className="py-3 px-4">Performed By</th>
                    <th className="py-3 px-4">Affected Account (Target)</th>
                    <th className="py-3 px-4">Modifications / Diffs</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredLogs.map((log) => {
                    const time = formatTimestamp(log.createdAt);
                    const prevRole = log.previousValues?.role;
                    const newRole = log.newValues?.role;
                    const prevStatus = log.previousValues?.status;
                    const newStatus = log.newValues?.status;
                    const targetDisplay = log.targetName || log.newValues?.fullName || log.targetId;

                    return (
                      <tr key={log.auditId} className="hover:bg-slate-50/80 transition-colors">
                        {/* Action Column */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            {getActionBadge(log.action)}
                            <div className="text-[11px] font-mono text-slate-400">ID: {log.auditId}</div>
                          </div>
                        </td>

                        {/* Performed By Column */}
                        <td className="py-3.5 px-4">
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {log.performerName || 'Authorized Super Admin'}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] font-medium text-slate-500">
                                {ROLE_LABELS[log.performerRole]?.label || log.performerRole}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[140px]" title={log.performedBy}>
                              UID: {log.performedBy}
                            </div>
                          </div>
                        </td>

                        {/* Affected Account Column */}
                        <td className="py-3.5 px-4">
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[160px]" title={targetDisplay}>{targetDisplay}</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[140px]" title={log.targetId}>
                              UID: {log.targetId}
                            </div>
                          </div>
                        </td>

                        {/* Modifications / Diffs */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            {prevRole && newRole && prevRole !== newRole ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-500 font-medium">Role:</span>
                                {getRolePill(prevRole)}
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                {getRolePill(newRole)}
                              </div>
                            ) : newRole ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-500 font-medium">Role:</span>
                                {getRolePill(newRole)}
                              </div>
                            ) : null}

                            {prevStatus && newStatus && prevStatus !== newStatus ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                <span className="text-slate-400 font-medium">Status:</span>
                                <span className="font-mono text-slate-500">{prevStatus}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-mono font-bold text-slate-800">{newStatus}</span>
                              </div>
                            ) : newStatus ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                <span className="text-slate-400 font-medium">Status:</span>
                                <span className="font-mono font-bold text-slate-800">{newStatus}</span>
                              </div>
                            ) : null}

                            {log.reason && (
                              <p className="text-[11px] text-slate-500 italic max-w-xs truncate" title={log.reason}>
                                {log.reason}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{time.formatted}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> Immutable Record
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedLog(log);
                              setShowDetailModal(true);
                            }}
                            className="text-xs flex items-center gap-1 ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5" /> Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Immutable Log Detail Modal */}
      {showDetailModal && selectedLog && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title="Administrative Audit Record"
          size="lg"
        >
          <div className="space-y-4 text-sm font-sans">
            {/* Guarantee Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-blue-900 text-xs">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Firestore Immutable Audit Guarantee</p>
                <p className="text-blue-700 leading-relaxed mt-0.5">
                  This audit log is permanently stored in the <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">/auditLogs</code> collection. Firestore security rules enforce append-only permissions (<code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">allow update, delete: if false</code>). Neither administrators nor super administrators can edit or delete this entry.
                </p>
              </div>
            </div>

            {/* Core Summary Grid */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">Action Type</span>
                <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">Module</span>
                <span className="font-bold text-slate-900 text-sm mt-1 block">{selectedLog.module}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">Timestamp</span>
                <span className="font-mono text-slate-800 mt-1 block">{selectedLog.createdAt}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">Audit Record ID</span>
                <span className="font-mono text-slate-800 mt-1 block">{selectedLog.auditId}</span>
              </div>
            </div>

            {/* Actor & Target Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Performed By (Actor)
                </span>
                <p className="font-bold text-slate-900 text-sm">{selectedLog.performerName || 'Authorized Super Admin'}</p>
                <p className="text-slate-600">Role: <span className="font-semibold">{ROLE_LABELS[selectedLog.performerRole]?.label || selectedLog.performerRole}</span></p>
                <p className="font-mono text-[10px] text-slate-500 truncate" title={selectedLog.performedBy}>
                  UID: {selectedLog.performedBy}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-purple-600" /> Affected Account (Target)
                </span>
                <p className="font-bold text-slate-900 text-sm">{selectedLog.targetName || selectedLog.newValues?.fullName || selectedLog.targetId}</p>
                <p className="text-slate-600">Type: <span className="font-semibold">{selectedLog.targetType}</span></p>
                <p className="font-mono text-[10px] text-slate-500 truncate" title={selectedLog.targetId}>
                  Target UID: {selectedLog.targetId}
                </p>
              </div>
            </div>

            {/* Previous vs New Values */}
            {(selectedLog.previousValues || selectedLog.newValues) && (
              <div className="space-y-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Diff & State Changes
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200 text-xs">
                    <span className="font-bold text-rose-800 block mb-1">Previous Values</span>
                    {selectedLog.previousValues ? (
                      <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.previousValues, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-slate-400 italic">None recorded</span>
                    )}
                  </div>

                  <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 text-xs">
                    <span className="font-bold text-emerald-800 block mb-1">New Values</span>
                    {selectedLog.newValues ? (
                      <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.newValues, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-slate-400 italic">None recorded</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Reason / Context */}
            {selectedLog.reason && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  Context / Justification Note
                </span>
                <p className="text-slate-800">{selectedLog.reason}</p>
              </div>
            )}

            {/* Complete Payload JSON Inspector */}
            <details className="group">
              <summary className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5 py-1 select-none">
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                <span>View Complete Raw Audit Payload</span>
              </summary>
              <div className="mt-2 bg-slate-900 text-slate-200 p-4 rounded-xl overflow-auto max-h-48 text-[11px] font-mono leading-relaxed">
                <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
              </div>
            </details>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>
                Close Audit Record
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
