/**
 * Page: DispatchPage (Module 3)
 * Emergency Operations & Field Responder Command Console for Barangay Tanod,
 * Executive Officers, and Administrators.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { reportService } from '../services/reportService';
import { AdminService } from '../services/adminService';
import { formatPresenceDisplay, getPresenceRank } from '../services/presenceService';
import { Report, ReportStatus, User as UserType, getReportResponders } from '../types';
import { canAccessDispatchConsole } from '../utils/permissions';
import { ROUTES, APP_METADATA } from '../constants';
import { PageContainer } from '../components/layout/PageContainer';
import { StatusChip } from '../components/feedback/StatusChip';
import { PriorityBadge } from '../components/feedback/PriorityBadge';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import { Skeleton } from '../components/feedback/Skeleton';
import {
  ShieldAlert,
  Radio,
  UserCheck,
  CheckCircle2,
  MapPin,
  Clock,
  ArrowRight,
  PhoneCall,
  Flame,
  AlertTriangle,
  Siren,
  Filter,
} from 'lucide-react';

import { auth } from '../firebase/config';

export const DispatchPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [reports, setReports] = useState<Report[]>([]);
  const [responders, setResponders] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'unassigned' | 'myAssigned' | 'all'>('unassigned');

  const adminService = new AdminService();

  useEffect(() => {
    const isAuthorized = canAccessDispatchConsole(user?.role);
    if (!isAuthInitialized || !auth.currentUser || !isAuthorized) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribeReports = reportService.subscribeToReports((data) => {
      setReports(data);
      setLoading(false);
    }, user);

    const unsubscribeUsers = adminService.subscribeToUsers((users) => {
      const activeResponders = users
        .filter((u) => {
          const isOfficialRole =
            u.role === 'purokOfficial' || u.role === 'admin' || u.role === 'chairman' || u.role === 'secretary';
          return isOfficialRole && u.dutyStatus === 'onDuty' && u.dutyMode === 'responder';
        })
        .sort((a, b) => {
          const rankA = getPresenceRank(a.presence?.status);
          const rankB = getPresenceRank(b.presence?.status);
          if (rankA !== rankB) {
            return rankA - rankB;
          }
          return a.fullName.localeCompare(b.fullName);
        });
      setResponders(activeResponders);
    }, user);

    return () => {
      unsubscribeReports();
      unsubscribeUsers();
    };
  }, [user?.uid, user?.role, isAuthInitialized]);

  const isAuthorized = canAccessDispatchConsole(user?.role);

  if (!isAuthorized) {
    return (
      <PageContainer title="Barangay Dispatch Console">
        <div className="bg-white p-8 rounded-2xl border border-slate-200/80 text-center space-y-4 max-w-lg mx-auto my-12">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">403 - Access Denied</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            The Barangay Dispatch Console is strictly restricted to the Barangay Secretary and Barangay Chairman.
          </p>
          <Button variant="primary" onClick={() => navigate(ROUTES.DASHBOARD)}>
            Return to Dashboard
          </Button>
        </div>
      </PageContainer>
    );
  }

  const handleQuickStatusUpdate = async (reportId: string, status: ReportStatus, remarks: string) => {
    if (!user) return;
    const targetReport = reports.find((r) => r.reportId === reportId);
    if (targetReport && targetReport.status === 'resolved') {
      showToast('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.', 'error');
      return;
    }
    try {
      await reportService.updateReportStatus(
        reportId,
        status,
        remarks,
        {
          uid: user.uid,
          fullName: user.fullName,
          role: user.role,
          dutyStatus: user.dutyStatus,
          dutyMode: user.dutyMode,
          jurisdiction: (user as any).jurisdiction,
          purok: (user as any).purok,
        },
        isOnline
      );
      showToast(`Incident status updated to ${status}.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  // KPI Calculations
  const isAssignedToCurrentUser = (r: Report) => {
    const respondersList = getReportResponders(r);
    return respondersList.some((responder) => responder.uid === user?.uid);
  };

  const criticalCount = reports.filter((r) => (r.priority === 'critical' || r.priority === 'high') && r.status !== 'resolved' && r.status !== 'closed').length;
  const pendingDispatchCount = reports.filter((r) => r.status === 'pending').length;
  const myAssignedCount = reports.filter((r) => isAssignedToCurrentUser(r) && r.status !== 'resolved' && r.status !== 'closed').length;
  const resolvedTodayCount = reports.filter((r) => r.status === 'resolved').length;

  const filteredReports = reports.filter((r) => {
    if (filterMode === 'unassigned') return r.status === 'pending';
    if (filterMode === 'myAssigned') return isAssignedToCurrentUser(r);
    return true;
  });

  return (
    <PageContainer
      title="Field Dispatch & Emergency Response Console"
      description="Real-time operational command center for incident dispatch and responder tracking"
    >
      <div className="space-y-8">
        {/* Metric Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-red-50 p-5 rounded-2xl border border-red-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">Critical / High Alerts</p>
              <p className="text-2xl font-extrabold text-red-900 mt-1">{criticalCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-md animate-pulse">
              <Siren className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Dispatch</p>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">{pendingDispatchCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md">
              <Radio className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">My Assigned Incidents</p>
              <p className="text-2xl font-extrabold text-blue-900 mt-1">{myAssignedCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-700 flex items-center justify-center text-white shadow-md">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Resolved Incidents</p>
              <p className="text-2xl font-extrabold text-emerald-900 mt-1">{resolvedTodayCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Main Console Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Dispatch Feed Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Filter Mode Switcher */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setFilterMode('unassigned')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'unassigned'
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unassigned ({pendingDispatchCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('myAssigned')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'myAssigned'
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My Operations ({myAssignedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'all'
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Incidents ({reports.length})
                </button>
              </div>
            </div>

            {/* Incidents Feed */}
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-36 rounded-2xl" />
                <Skeleton className="h-36 rounded-2xl" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200/80 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">No Active Dispatch Items</h3>
                <p className="text-xs text-slate-500">There are no reports currently matching this queue filter.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReports.map((report) => {
                  const isCritical = report.priority === 'critical' || report.priority === 'high';

                  return (
                    <div
                      key={report.reportId}
                      className={`bg-white p-6 rounded-2xl border transition-all space-y-4 shadow-2xs ${
                        isCritical ? 'border-red-300 ring-2 ring-red-500/10' : 'border-slate-200/80'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">
                            {report.reportNumber}
                          </span>
                          <PriorityBadge priority={report.priority} />
                          <StatusChip status={report.status} />
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(report.createdAt).toLocaleTimeString()}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-base font-bold text-slate-900">{report.title}</h4>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{report.description}</p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                        <MapPin className="w-4 h-4 text-blue-700 shrink-0" />
                        <span className="truncate">{report.location.address}</span>
                      </div>

                      {/* Quick Action Bar for Field Responders */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-500">
                          Assigned Responders: <strong>{getReportResponders(report).map((r) => r.name).join(', ') || 'None'}</strong>
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          {report.status === 'assigned' && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleQuickStatusUpdate(report.reportId, 'inProgress', 'Responder en route to scene.')}
                              icon={<Radio className="w-3.5 h-3.5" />}
                            >
                              En Route / In Progress
                            </Button>
                          )}

                          {report.status === 'inProgress' && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => handleQuickStatusUpdate(report.reportId, 'resolved', 'Incident addressed and resolved on-site.')}
                              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                            >
                              Mark Resolved
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(ROUTES.REPORT_DETAILS(report.reportId))}
                            icon={<ArrowRight className="w-3.5 h-3.5" />}
                          >
                            Full Log
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Responders Roster */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                <span>Barangay Tanod Responders</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                  Active
                </span>
              </h3>

              <div className="space-y-3">
                {responders.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2">No active responders found.</p>
                ) : (
                  responders.map((acc) => {
                    const assignedCount = reports.filter((r) => r.assignedTo === acc.uid && r.status !== 'resolved').length;
                    const presenceText = formatPresenceDisplay(acc.presence?.status);
                    return (
                      <div key={acc.uid} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{acc.fullName}</span>
                            <span className="text-[11px] font-semibold">{presenceText}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 capitalize">{acc.role} - {acc.purok || 'Central'}</p>
                        </div>
                        <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-lg">
                          {assignedCount} Active
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Emergency Hotline Reference */}
            <div className="bg-red-50 p-6 rounded-2xl border border-red-200 space-y-3">
              <h3 className="text-xs font-bold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                <PhoneCall className="w-4 h-4 text-red-700" />
                Emergency Operations Hotline
              </h3>
              <p className="text-xs text-red-800 leading-relaxed">
                Direct hotline dispatch for MDRRMO, Police, and Fire Station coordination.
              </p>
              <div className="text-xs font-mono font-bold text-red-900 bg-white/80 p-2.5 rounded-xl border border-red-200/80">
                (02) 8912-3456 / 0917-111-2222
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
