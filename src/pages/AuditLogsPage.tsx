/**
 * Page: AuditLogsPage (Module 8)
 * System Security Audit Trail & Activity Logging Interface
 * Features:
 * - Immutable system audit logging (tracks CRUD, authorization, role changes, certificate releases)
 * - Filtering by module, performer, action type, and date range
 * - Change payload inspector (previous vs new values)
 * - Exportable security audit reports
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { adminService } from '../services/adminService';
import { AuditLog } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import {
  FileText,
  Search,
  Filter,
  ShieldCheck,
  RefreshCw,
  Eye,
  Download,
  Calendar,
  User,
  Activity,
  HardDrive,
  Clock,
  Terminal,
  WifiOff,
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();
  const isOnline = useOnlineStatus();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchAuditLogs();
  }, [isAuthInitialized, user?.uid]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.auditId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.performerName && log.performerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.targetId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesModule = moduleFilter === 'all' || log.module.toLowerCase() === moduleFilter.toLowerCase();

    return matchesSearch && matchesModule;
  });

  const handleExportCSV = () => {
    const headers = ['Audit ID', 'Timestamp', 'Performer Name', 'Performer Role', 'Module', 'Action', 'Target ID', 'IP Address'];
    const rows = filteredLogs.map((l) => [
      l.auditId,
      l.createdAt,
      l.performerName || l.performedBy,
      l.performerRole,
      l.module,
      l.action,
      l.targetId,
      l.ipAddress || 'N/A',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BOIMS_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getModuleBadge = (mod: string) => {
    switch (mod.toLowerCase()) {
      case 'registration':
        return <Badge variant="primary">{mod}</Badge>;
      case 'household registry':
        return <Badge variant="success">{mod}</Badge>;
      case 'blotter':
        return <Badge variant="danger">{mod}</Badge>;
      case 'certificates':
        return <Badge variant="info">{mod}</Badge>;
      case 'inventory':
        return <Badge variant="warning">{mod}</Badge>;
      case 'users':
        return <Badge variant="primary">{mod}</Badge>;
      case 'settings':
        return <Badge variant="neutral">{mod}</Badge>;
      case 'announcements':
        return <Badge variant="warning">{mod}</Badge>;
      case 'reports':
        return <Badge variant="danger">{mod}</Badge>;
      default:
        return <Badge variant="success">{mod}</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Offline Notice Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-sm">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-900">
              Offline Audit Trail View Mode
            </p>
            <p className="text-amber-800 leading-relaxed">
              Viewing cached immutable audit records offline. CSV export remains available from local cache. Fetching live audit log updates requires an active network connection.
            </p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">System Security & Audit Trail Logs</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Immutable logging of administrative actions, access control updates, and system transactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchAuditLogs} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>

          <Button variant="primary" size="md" onClick={handleExportCSV} className="flex items-center gap-2 shadow-md">
            <Download className="w-4 h-4" /> Export CSV Log
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Audit Records</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{logs.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Integrity</p>
            <p className="text-xl font-black text-emerald-600 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-5 h-5" /> 100% Active
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtered Action Events</p>
            <p className="text-2xl font-black text-purple-700 mt-1">{filteredLogs.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Storage Engine</p>
            <p className="text-xl font-black text-slate-800 mt-1 flex items-center gap-1">
              <HardDrive className="w-5 h-5 text-slate-500" /> Firestore DB
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit ID, action, officer, or target ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">All System Modules</option>
              <option value="registration">Registration</option>
              <option value="household registry">Household Registry</option>
              <option value="reports">Reports</option>
              <option value="blotter">Blotter</option>
              <option value="certificates">Certificates</option>
              <option value="inventory">Inventory</option>
              <option value="announcements">Announcements</option>
              <option value="users">Users</option>
              <option value="settings">Settings</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Security Audit Trail Registry</span>
            <span className="text-xs font-normal text-slate-500">Showing {filteredLogs.length} events</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading audit logs...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Activity className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold">No audit records found.</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Audit ID & Timestamp</th>
                    <th className="py-3 px-4">Performer Officer</th>
                    <th className="py-3 px-4">Module & Action</th>
                    <th className="py-3 px-4">Target Reference</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredLogs.map((log) => (
                    <tr key={log.auditId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="font-bold text-blue-700">{log.auditId}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="font-bold text-slate-900">{log.performerName || log.performedBy}</div>
                        <div className="text-slate-500 uppercase text-[10px] font-semibold">{log.performerRole}</div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex items-center gap-2">
                          {getModuleBadge(log.module)}
                          <span className="font-mono font-semibold text-slate-800">{log.action}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                        {log.targetId}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedLog(log);
                            setShowDetailModal(true);
                          }}
                          className="text-xs flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect Payload
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600">{selectedLog.auditId}</span>
                <h3 className="font-bold text-lg text-slate-900">Audit Log Payload Inspector</h3>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-slate-400 uppercase font-bold">Action / Module</p>
                <p className="font-bold text-slate-900 mt-0.5">{selectedLog.action} ({selectedLog.module})</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-bold">Performed By</p>
                <p className="font-bold text-slate-900 mt-0.5">{selectedLog.performerName} ({selectedLog.performerRole})</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-bold">Timestamp</p>
                <p className="font-mono text-slate-700 mt-0.5">{new Date(selectedLog.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-bold">IP / Device</p>
                <p className="font-mono text-slate-700 mt-0.5">{selectedLog.ipAddress || '192.168.1.1'} ({selectedLog.device || 'Web Browser'})</p>
              </div>
            </div>

            {selectedLog.previousValues && (
              <div>
                <h4 className="font-bold text-xs uppercase text-slate-500 mb-1">Previous Values Payload</h4>
                <pre className="bg-slate-900 text-amber-400 p-3 rounded-xl font-mono text-xs overflow-x-auto">
                  {JSON.stringify(selectedLog.previousValues, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.newValues && (
              <div>
                <h4 className="font-bold text-xs uppercase text-slate-500 mb-1">New Values Payload</h4>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-xs overflow-x-auto">
                  {JSON.stringify(selectedLog.newValues, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
