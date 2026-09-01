/**
 * Page: DashboardShellPage
 * Dynamic Role Dashboard:
 * - Resident Dashboard: Community portal, personal incident report tracker, and File New Report primary CTA.
 * - Sitio/Purok Official Work Queue: Dispatched actionable incident work queue.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isResidentMode, canAccessDispatchConsole } from '../utils/permissions';
import { useOffline } from '../contexts/OfflineContext';
import { reportService } from '../services/reportService';
import { AdminService } from '../services/adminService';
import { auth } from '../firebase/config';
import { formatPresenceDisplay, getPresenceRank } from '../services/presenceService';
import { Report, User as UserType, getReportResponders } from '../types';
import { ROLE_LABELS, APP_METADATA, ROUTES } from '../constants';
import { PageContainer } from '../components/layout/PageContainer';
import { Avatar } from '../components/foundation/Avatar';
import { Badge } from '../components/foundation/Badge';
import { Button } from '../components/foundation/Button';
import { SearchInput } from '../components/forms/SearchInput';
import { EmptyState } from '../components/feedback/EmptyState';
import { Skeleton } from '../components/feedback/Skeleton';
import { Alert } from '../components/feedback/Alert';
import { ReportCard } from '../components/reports/ReportCard';
import {
  Shield,
  Wifi,
  WifiOff,
  UserCheck,
  Calendar,
  AlertTriangle,
  Clock,
  UserCheck2,
  Activity,
  Plus,
  History,
  CheckCircle2,
  FileCheck2,
  FileText,
} from 'lucide-react';
import { isReportOwner, isReportAssignedTo } from '../utils/jurisdictionUtils';
import { SecretaryDashboardView } from '../components/dashboard/SecretaryDashboardView';
import { ChairmanDashboardView } from '../components/dashboard/ChairmanDashboardView';
import { DeveloperDashboardView } from '../components/dashboard/DeveloperDashboardView';
import { RegistrationApprovalPage } from './RegistrationApprovalPage';

export type QueueTab = 'all' | 'pending' | 'assigned' | 'inProgress' | 'critical' | 'onDuty' | 'activeAssignments';
export type ResidentTab = 'all' | 'pending' | 'assigned' | 'inProgress' | 'resolved';
export type ReportWorkflowCategory = 'pending' | 'assigned' | 'inProgress' | 'resolved' | 'other';

/**
 * Centralized status mapping ensuring 1:1 categorization across Resident and Operational dashboards:
 * - Pending: status === 'pending'
 * - Assigned: status === 'assigned'
 * - In Progress: status === 'inProgress'
 * - Resolved: status === 'resolved' || status === 'closed'
 */
export function getReportWorkflowCategory(status?: string): ReportWorkflowCategory {
  if (!status) return 'pending';
  const normalized = status.trim();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'assigned') return 'assigned';
  if (normalized === 'inProgress') return 'inProgress';
  if (normalized === 'resolved' || normalized === 'closed') return 'resolved';
  return 'other';
}

export const DashboardShellPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, canViewResidentQueue, hasActiveDispatcher, isAuthInitialized } = useAuth();
  const { isOnline, pendingCount } = useOffline();

  const isResident = isResidentMode(user, role);
  const isPurokOfficial = role === 'purokOfficial';
  const isOffDutyOfficial = isPurokOfficial && (user?.dutyStatus === 'offDuty' || user?.dutyMode === 'offDuty');
  const isFieldResponder = isPurokOfficial && user?.dutyStatus === 'onDuty' && user?.dutyMode === 'responder';
  const isDispatcher = isPurokOfficial && user?.dutyStatus === 'onDuty' && user?.dutyMode === 'dispatcher';
  const isSecretary = role === 'secretary';
  const isChairman = role === 'chairman';
  const isDeveloper = role === 'developer';

  const [reports, setReports] = useState<Report[]>([]);
  const [responders, setResponders] = useState<UserType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [canViewQueue, setCanViewQueue] = useState<boolean>(true);
  const [hasDispatcherOnDuty, setHasDispatcherOnDuty] = useState<boolean>(true);

  // Official Work Queue activeTab initializes to 'assigned' for field responders, or 'all' for dispatchers/admins
  const [activeTab, setActiveTab] = useState<QueueTab>(isFieldResponder ? 'assigned' : 'all');
  // Resident Dashboard activeTab initializes to 'pending'
  const [residentTab, setResidentTab] = useState<ResidentTab>('pending');
  const [search, setSearch] = useState<string>('');

  // Synchronize activeTab when role/dutyMode resolves to field responder
  useEffect(() => {
    if (isFieldResponder && (activeTab === 'all' || activeTab === 'pending' || activeTab === 'onDuty')) {
      setActiveTab('assigned');
    }
  }, [isFieldResponder, activeTab]);

  // Stable anchor and trigger state for auto-scrolling to the filtered work queue section
  const workQueueSectionRef = useRef<HTMLDivElement | null>(null);
  const [scrollTriggerCount, setScrollTriggerCount] = useState<number>(0);

  const handleCardFilterSelect = (targetTab: QueueTab) => {
    setActiveTab(targetTab);
    setScrollTriggerCount((prev) => prev + 1);
  };

  useEffect(() => {
    if (scrollTriggerCount > 0 && workQueueSectionRef.current) {
      workQueueSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollTriggerCount]);

  const roleInfo = role ? ROLE_LABELS[role] : null;

  // Unresolved/Actionable statuses allowed on Official Dashboard Work Queue
  const UNRESOLVED_STATUSES = ['pending', 'assigned', 'inProgress'];

  useEffect(() => {
    // Wait until Firebase Auth initialization is complete AND auth.currentUser is ready
    if (!isAuthInitialized || !auth.currentUser) {
      return;
    }

    setLoading(true);

    // Only query queue permissions and active dispatcher for non-residents and active officials
    if (!isResident && !isOffDutyOfficial) {
      canViewResidentQueue().then(setCanViewQueue);
      if (isFieldResponder || isDispatcher) {
        hasActiveDispatcher().then(setHasDispatcherOnDuty);
      } else {
        setHasDispatcherOnDuty(true);
      }
    } else {
      setCanViewQueue(false);
      setHasDispatcherOnDuty(true);
    }

    const unsubscribeReports = reportService.subscribeToReports((allReports) => {
      if (isResident || isOffDutyOfficial) {
        setReports(allReports.filter((r) => isReportOwner(r, user)));
      } else if (isFieldResponder) {
        const responderReports = allReports.filter((r) => {
          if (!UNRESOLVED_STATUSES.includes(r.status)) return false;
          return isReportAssignedTo(r, user?.uid);
        });
        setReports(responderReports);
      } else {
        const actionable = allReports.filter((r) => UNRESOLVED_STATUSES.includes(r.status));
        setReports(actionable);
      }
      setLoading(false);
    }, user);

    // Only subscribe to users for staff/officials requiring responder tracking
    let unsubscribeUsers: () => void = () => {};
    const isStaffOrActiveOfficial =
      ['secretary', 'chairman', 'admin', 'superAdmin', 'developer', 'treasurer'].includes(role || '') ||
      (isPurokOfficial && !isOffDutyOfficial);

    if (isStaffOrActiveOfficial) {
      const adminService = new AdminService();
      unsubscribeUsers = adminService.subscribeToUsers((users) => {
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
    }

    return () => {
      unsubscribeReports();
      unsubscribeUsers();
    };
  }, [user?.uid, role, user?.dutyStatus, user?.dutyMode, isAuthInitialized, isResident, isOffDutyOfficial, isFieldResponder, isDispatcher, isPurokOfficial]);

  // --- OFFICIAL WORK QUEUE METRICS & FILTERING ---
  const totalActionable = reports.length;
  const pendingCountQueue = reports.filter((r) => getReportWorkflowCategory(r.status) === 'pending').length;
  const assignedCount = reports.filter((r) => {
    if (isFieldResponder) {
      return (
        getReportWorkflowCategory(r.status) === 'assigned' &&
        isReportAssignedTo(r, user?.uid)
      );
    }
    return getReportWorkflowCategory(r.status) === 'assigned';
  }).length;
  const inProgressCount = reports.filter((r) => {
    if (isFieldResponder) {
      return (
        getReportWorkflowCategory(r.status) === 'inProgress' &&
        isReportAssignedTo(r, user?.uid)
      );
    }
    return getReportWorkflowCategory(r.status) === 'inProgress';
  }).length;
  const criticalCount = reports.filter((r) => r.priority === 'critical').length;
  const onDutyCount = responders.length;

  // Helper to find active reports assigned to a specific responder
  const getResponderActiveReports = (responderUid: string) => {
    return reports.filter((r) => {
      const isActionable = r.status === 'assigned' || r.status === 'inProgress';
      if (!isActionable) return false;
      const assignedList = getReportResponders(r);
      return assignedList.some((resp) => resp.uid === responderUid);
    });
  };

  const getResponderOperationalStatus = (activeReports: Report[]): 'idle' | 'assigned' | 'inProgress' => {
    if (activeReports.length === 0) return 'idle';
    const hasInProgress = activeReports.some(
      (r) => r.status === 'inProgress' || getReportWorkflowCategory(r.status) === 'inProgress'
    );
    if (hasInProgress) return 'inProgress';
    return 'assigned';
  };

  const idleCount = responders.filter(
    (resp) => getResponderOperationalStatus(getResponderActiveReports(resp.uid)) === 'idle'
  ).length;
  const assignedResponderCount = responders.filter(
    (resp) => getResponderOperationalStatus(getResponderActiveReports(resp.uid)) === 'assigned'
  ).length;
  const inProgressResponderCount = responders.filter(
    (resp) => getResponderOperationalStatus(getResponderActiveReports(resp.uid)) === 'inProgress'
  ).length;

  const filteredOfficialReports = reports.filter((report) => {
    let matchesTab = true;
    const cat = getReportWorkflowCategory(report.status);
    if (activeTab === 'assigned') {
      if (isFieldResponder) {
        matchesTab =
          cat === 'assigned' && isReportAssignedTo(report, user?.uid);
      } else {
        matchesTab = cat === 'assigned';
      }
    } else if (activeTab === 'pending') {
      if (isFieldResponder) {
        matchesTab = false;
      } else {
        matchesTab = cat === 'pending';
      }
    } else if (activeTab === 'inProgress') {
      if (isFieldResponder) {
        matchesTab =
          cat === 'inProgress' && isReportAssignedTo(report, user?.uid);
      } else {
        matchesTab = cat === 'inProgress';
      }
    } else if (activeTab === 'critical') {
      if (isFieldResponder) {
        matchesTab = report.priority === 'critical' && isReportAssignedTo(report, user?.uid);
      } else {
        matchesTab = report.priority === 'critical';
      }
    } else if (activeTab === 'activeAssignments') {
      if (isFieldResponder) {
        matchesTab =
          (cat === 'assigned' || cat === 'inProgress') && isReportAssignedTo(report, user?.uid);
      } else {
        matchesTab = cat === 'assigned' || cat === 'inProgress';
      }
    } else if (activeTab === 'all') {
      if (isFieldResponder) {
        matchesTab =
          (cat === 'assigned' || cat === 'inProgress') && isReportAssignedTo(report, user?.uid);
      } else {
        matchesTab = true;
      }
    }

    let matchesSearch = true;
    if (search.trim()) {
      const q = search.toLowerCase();
      matchesSearch =
        report.title.toLowerCase().includes(q) ||
        report.reportNumber.toLowerCase().includes(q) ||
        report.description.toLowerCase().includes(q) ||
        report.location.address.toLowerCase().includes(q) ||
        (Boolean(report.userName) && report.userName!.toLowerCase().includes(q));
    }

    return matchesTab && matchesSearch;
  });

  const filteredResponders = responders.filter((resp) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      resp.fullName.toLowerCase().includes(q) ||
      (Boolean(resp.email) && resp.email.toLowerCase().includes(q)) ||
      (Boolean(resp.purok) && resp.purok.toLowerCase().includes(q))
    );
  });

  // --- RESIDENT DASHBOARD METRICS & FILTERING ---
  const residentTotal = reports.length;
  const residentPending = reports.filter((r) => getReportWorkflowCategory(r.status) === 'pending').length;
  const residentAssigned = reports.filter((r) => getReportWorkflowCategory(r.status) === 'assigned').length;
  const residentInProgress = reports.filter((r) => getReportWorkflowCategory(r.status) === 'inProgress').length;
  const residentResolved = reports.filter((r) => getReportWorkflowCategory(r.status) === 'resolved').length;

  const filteredResidentReports = reports.filter((report) => {
    let matchesTab = true;
    if (residentTab !== 'all') {
      matchesTab = getReportWorkflowCategory(report.status) === residentTab;
    }

    let matchesSearch = true;
    if (search.trim()) {
      const q = search.toLowerCase();
      matchesSearch =
        report.title.toLowerCase().includes(q) ||
        report.reportNumber.toLowerCase().includes(q) ||
        report.description.toLowerCase().includes(q) ||
        report.location.address.toLowerCase().includes(q);
    }

    return matchesTab && matchesSearch;
  });

  // ==================== RESIDENT & OFF-DUTY DASHBOARD VIEW ====================
  if (isResident || isOffDutyOfficial) {
    return (
      <PageContainer
        title="Resident Portal Dashboard"
        description={`${APP_METADATA.defaultBarangay}, ${APP_METADATA.defaultMunicipality} • Public Community Services & Incident Reporting`}
        headerActions={
          <div className="flex items-center gap-2">
            <NavLink to={ROUTES.CERTIFICATE_REQUEST}>
              <Button variant="outline" icon={<FileText className="w-4 h-4" />}>
                Request Certificate
              </Button>
            </NavLink>
            <NavLink to={ROUTES.REPORT_CREATE}>
              <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
                File New Report
              </Button>
            </NavLink>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Resident Hero Banner */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-lg border border-blue-950 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={user?.fullName || 'Resident'} src={user?.profilePicture} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    Welcome, {user?.firstName || 'Resident'}!
                  </h2>
                  <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 bg-emerald-600 text-white rounded-md tracking-wider">
                    Verified Resident
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-1">
                  {user?.purok || 'Purok 1'} • {user?.barangay || 'Barangay Central'} Resident Portal
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Submit incident reports, request official barangay clearance/certificates, and track response status in real-time.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <NavLink to={ROUTES.REPORT_CREATE}>
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} className="bg-emerald-600 hover:bg-emerald-500 text-white border-none font-bold">
                  File Incident Report
                </Button>
              </NavLink>
              <NavLink to={ROUTES.REPORTS}>
                <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold">
                  <History className="w-4 h-4 mr-1.5" /> My History Log
                </Button>
              </NavLink>
            </div>
          </div>

          {/* Offline Warning Banner */}
          {pendingCount > 0 && (
            <Alert type="warning" title="Offline Submissions Pending Sync">
              You have {pendingCount} offline transaction(s) pending sync. When back online, use the header sync button to submit.
            </Alert>
          )}

          {/* Resident Incident Trackers - Workflow Layout */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setResidentTab('pending')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                residentTab === 'pending'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${residentTab === 'pending' ? 'text-amber-100' : 'text-slate-500'}`}>
                  Pending
                </span>
                <Clock className={`w-4 h-4 ${residentTab === 'pending' ? 'text-amber-100' : 'text-amber-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{residentPending}</p>
              <p className={`text-[11px] mt-1 ${residentTab === 'pending' ? 'text-amber-100' : 'text-slate-500'}`}>
                Awaiting Assessment
              </p>
            </button>

            <button
              type="button"
              onClick={() => setResidentTab('assigned')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                residentTab === 'assigned'
                  ? 'bg-blue-700 text-white border-blue-700 shadow-md ring-2 ring-blue-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${residentTab === 'assigned' ? 'text-blue-200' : 'text-slate-500'}`}>
                  Assigned
                </span>
                <UserCheck className={`w-4 h-4 ${residentTab === 'assigned' ? 'text-blue-200' : 'text-blue-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{residentAssigned}</p>
              <p className={`text-[11px] mt-1 ${residentTab === 'assigned' ? 'text-blue-100' : 'text-slate-500'}`}>
                Responder Assigned
              </p>
            </button>

            <button
              type="button"
              onClick={() => setResidentTab('inProgress')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                residentTab === 'inProgress'
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-md ring-2 ring-indigo-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${residentTab === 'inProgress' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  In Progress
                </span>
                <Activity className={`w-4 h-4 ${residentTab === 'inProgress' ? 'text-indigo-200' : 'text-indigo-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{residentInProgress}</p>
              <p className={`text-[11px] mt-1 ${residentTab === 'inProgress' ? 'text-indigo-100' : 'text-slate-500'}`}>
                Active Response
              </p>
            </button>

            <button
              type="button"
              onClick={() => setResidentTab('resolved')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                residentTab === 'resolved'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${residentTab === 'resolved' ? 'text-emerald-200' : 'text-slate-500'}`}>
                  Resolved
                </span>
                <CheckCircle2 className={`w-4 h-4 ${residentTab === 'resolved' ? 'text-emerald-200' : 'text-emerald-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{residentResolved}</p>
              <p className={`text-[11px] mt-1 ${residentTab === 'resolved' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Completed Cases
              </p>
            </button>
          </div>

          {/* Controls Bar & Resident Reports Feed */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="w-full md:w-80">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search my reports by #, title, or location..."
                  onClear={() => setSearch('')}
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-none">
                <button
                  type="button"
                  onClick={() => setResidentTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    residentTab === 'all'
                      ? 'bg-white text-blue-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({residentTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setResidentTab('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    residentTab === 'pending'
                      ? 'bg-white text-amber-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending ({residentPending})
                </button>
                <button
                  type="button"
                  onClick={() => setResidentTab('assigned')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    residentTab === 'assigned'
                      ? 'bg-white text-blue-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Assigned ({residentAssigned})
                </button>
                <button
                  type="button"
                  onClick={() => setResidentTab('inProgress')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    residentTab === 'inProgress'
                      ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  In Progress ({residentInProgress})
                </button>
                <button
                  type="button"
                  onClick={() => setResidentTab('resolved')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    residentTab === 'resolved'
                      ? 'bg-white text-emerald-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Resolved ({residentResolved})
                </button>
              </div>

              {/* Primary CTA on Resident Dashboard */}
              <NavLink to={ROUTES.REPORT_CREATE} className="w-full md:w-auto shrink-0">
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} className="w-full">
                  File New Report
                </Button>
              </NavLink>
            </div>
          </div>

          {/* Cards Display */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Skeleton className="h-[270px] rounded-2xl" />
              <Skeleton className="h-[270px] rounded-2xl" />
            </div>
          ) : filteredResidentReports.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-8 h-8 text-blue-500" />}
              title="No Filed Incident Reports"
              description="You have not submitted any incident reports matching this status."
              action={
                <Button variant="primary" size="sm" onClick={() => navigate(ROUTES.REPORT_CREATE)}>
                  File New Incident Report
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredResidentReports.map((report) => (
                <ReportCard
                  key={report.reportId}
                  report={report}
                  onClick={() => navigate(ROUTES.REPORT_DETAILS(report.reportId))}
                />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    );
  }

  // ==================== BARANGAY SECRETARY DASHBOARD VIEW ====================
  if (isSecretary) {
    return (
      <PageContainer
        title="Barangay Secretary Operations Dashboard"
        description="Records, Certificates, Reports & Administrative Operations"
      >
        <SecretaryDashboardView reports={reports} loadingReports={loading} />
      </PageContainer>
    );
  }

  // ==================== BARANGAY CHAIRMAN EXECUTIVE DASHBOARD VIEW ====================
  if (isChairman) {
    return (
      <PageContainer
        title="Barangay Chairman Executive Dashboard"
        description="Executive oversight, governance, approvals, strategic monitoring & barangay operations."
      >
        <ChairmanDashboardView reports={reports} loadingReports={loading} />
      </PageContainer>
    );
  }

  // ==================== DEVELOPER CONSOLE DASHBOARD VIEW ====================
  if (isDeveloper) {
    return (
      <PageContainer
        title="Developer Console"
        description="System administration, development, diagnostics & platform monitoring."
      >
        <DeveloperDashboardView reports={reports} loadingReports={loading} />
      </PageContainer>
    );
  }

  // ==================== BARANGAY VERIFIER DASHBOARD VIEW ====================
  if (role === 'verifier') {
    return <RegistrationApprovalPage />;
  }

  // ==================== SITIO/PUROK OFFICIAL WORK QUEUE VIEW ====================
  const pageTitle = isFieldResponder
    ? 'Field Responder Personal Work Dashboard'
    : 'Sitio/Purok Official Dispatch Dashboard';
  const pageDesc = isFieldResponder
    ? `${APP_METADATA.defaultBarangay}, ${APP_METADATA.defaultMunicipality} • Personal Dispatched Tasks & Incident Assignments`
    : `${APP_METADATA.defaultBarangay}, ${APP_METADATA.defaultMunicipality} • Active Incident Dispatch & Resolution Operations`;

  return (
    <PageContainer
      title={pageTitle}
      description={pageDesc}
      headerActions={
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="success" icon={<Wifi className="w-3 h-3 text-emerald-600" />}>
              Online
            </Badge>
          ) : (
            <Badge variant="warning" icon={<WifiOff className="w-3 h-3 text-amber-600" />}>
              Offline Mode
            </Badge>
          )}
          {canAccessDispatchConsole(role) && (
            <NavLink to={ROUTES.DISPATCH}>
              <Button variant="outline" icon={<Shield className="w-4 h-4 text-blue-700" />}>
                Dispatch Center
              </Button>
            </NavLink>
          )}
          <NavLink to={ROUTES.REPORTS}>
            <Button variant="outline" icon={<History className="w-4 h-4" />}>
              My Report History
            </Button>
          </NavLink>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Official Operational Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={user?.fullName || 'Official'} src={user?.profilePicture} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">{user?.fullName}</h2>
                <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 bg-blue-600 text-white rounded-md tracking-wider">
                  Level {roleInfo?.level || 1}
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 bg-slate-800 text-emerald-400 rounded-md">
                  {formatPresenceDisplay(user?.presence?.status)}
                </span>
              </div>
              <p className="text-xs text-blue-300 font-semibold mt-0.5">{roleInfo?.label}</p>
              <p className="text-[11px] text-slate-400 mt-1">{roleInfo?.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 backdrop-blur-xs px-4 py-3 rounded-xl border border-white/10 text-xs space-y-1 shrink-0">
              <div className="flex items-center gap-2 text-slate-300">
                <UserCheck className="w-4 h-4 text-blue-400" />
                <span>
                  <strong>Official:</strong> {user?.email}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>Jurisdiction:</strong> {user?.purok || 'Purok 1'}
                </span>
              </div>
            </div>

            {canAccessDispatchConsole(role) ? (
              <NavLink to={ROUTES.DISPATCH}>
                <Button variant="primary" icon={<Shield className="w-4 h-4" />} className="bg-blue-600 hover:bg-blue-500 text-white">
                  Dispatch Task Center
                </Button>
              </NavLink>
            ) : isFieldResponder ? (
              <div className="bg-emerald-500/20 text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-emerald-500/30">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Field Responder (On Duty)</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Offline Warning Banner */}
        {pendingCount > 0 && (
          <Alert type="warning" title="Offline Operations Pending Synchronization">
            There are currently {pendingCount} offline transaction(s) queued. Use the "Sync Now" button in the header bar once internet connectivity is restored.
          </Alert>
        )}

        {/* Work Queue Metric Summary Cards */}
        {isFieldResponder ? (
          /* FIELD RESPONDER METRICS: Assigned To Me, In Progress, My Active Assignments, My Report History */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => handleCardFilterSelect('assigned')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'assigned'
                  ? 'bg-blue-700 text-white border-blue-700 shadow-md ring-2 ring-blue-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'assigned' ? 'text-blue-200' : 'text-slate-500'}`}>
                  Assigned To Me
                </span>
                <UserCheck2 className={`w-4 h-4 ${activeTab === 'assigned' ? 'text-blue-200' : 'text-blue-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{assignedCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'assigned' ? 'text-blue-100' : 'text-slate-500'}`}>
                Dispatched Incident Tasks
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('inProgress')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'inProgress'
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-md ring-2 ring-indigo-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'inProgress' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  In Progress
                </span>
                <Activity className={`w-4 h-4 ${activeTab === 'inProgress' ? 'text-indigo-200' : 'text-indigo-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{inProgressCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'inProgress' ? 'text-indigo-100' : 'text-slate-500'}`}>
                Under Active Response
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('activeAssignments')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'activeAssignments'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'activeAssignments' ? 'text-emerald-200' : 'text-slate-500'}`}>
                  My Active Assignments
                </span>
                <Clock className={`w-4 h-4 ${activeTab === 'activeAssignments' ? 'text-emerald-200' : 'text-emerald-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{assignedCount + inProgressCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'activeAssignments' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Pending + In-Progress Tasks
              </p>
            </button>

            <NavLink to={ROUTES.REPORTS} className="p-4 rounded-2xl border text-left bg-white text-slate-900 border-slate-200 hover:border-blue-300 block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  My Report History
                </span>
                <History className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-extrabold mt-2">View</p>
              <p className="text-[11px] mt-1 text-slate-500">
                Past Dispatches & Activity Logs
              </p>
            </NavLink>
          </div>
        ) : (
          /* DISPATCHER METRICS WORKFLOW ORDER: Resident Work Queue -> Pending Reports -> Assigned -> In Progress -> Critical Queue -> On Duty */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => handleCardFilterSelect('all')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'all'
                  ? 'bg-blue-900 text-white border-blue-900 shadow-md ring-2 ring-blue-600/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'all' ? 'text-blue-200' : 'text-slate-500'}`}>
                  Resident Work Queue
                </span>
                <FileCheck2 className={`w-4 h-4 ${activeTab === 'all' ? 'text-blue-300' : 'text-blue-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{totalActionable}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'all' ? 'text-blue-200' : 'text-slate-500'}`}>
                Total Actionable Reports
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('pending')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'pending'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'pending' ? 'text-amber-100' : 'text-slate-500'}`}>
                  Pending Reports
                </span>
                <Clock className={`w-4 h-4 ${activeTab === 'pending' ? 'text-amber-100' : 'text-amber-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{pendingCountQueue}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'pending' ? 'text-amber-100' : 'text-slate-500'}`}>
                Awaiting Dispatch
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('assigned')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'assigned'
                  ? 'bg-blue-700 text-white border-blue-700 shadow-md ring-2 ring-blue-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'assigned' ? 'text-blue-200' : 'text-slate-500'}`}>
                  Assigned
                </span>
                <UserCheck2 className={`w-4 h-4 ${activeTab === 'assigned' ? 'text-blue-200' : 'text-blue-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{assignedCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'assigned' ? 'text-blue-100' : 'text-slate-500'}`}>
                Dispatched Reports
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('inProgress')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'inProgress'
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-md ring-2 ring-indigo-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'inProgress' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  In Progress
                </span>
                <Activity className={`w-4 h-4 ${activeTab === 'inProgress' ? 'text-indigo-200' : 'text-indigo-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{inProgressCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'inProgress' ? 'text-indigo-100' : 'text-slate-500'}`}>
                Under Active Response
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('critical')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'critical'
                  ? 'bg-red-700 text-white border-red-700 shadow-md ring-2 ring-red-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'critical' ? 'text-red-200' : 'text-slate-500'}`}>
                  Critical Queue
                </span>
                <AlertTriangle className={`w-4 h-4 ${activeTab === 'critical' ? 'text-red-200' : 'text-red-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{criticalCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'critical' ? 'text-red-100' : 'text-slate-500'}`}>
                Critical Priority
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleCardFilterSelect('onDuty')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                activeTab === 'onDuty'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/50'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'onDuty' ? 'text-emerald-200' : 'text-slate-500'}`}>
                  On Duty
                </span>
                <UserCheck className={`w-4 h-4 ${activeTab === 'onDuty' ? 'text-emerald-200' : 'text-emerald-600'}`} />
              </div>
              <p className="text-2xl font-extrabold mt-2">{onDutyCount}</p>
              <p className={`text-[11px] mt-1 ${activeTab === 'onDuty' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Active Responders
              </p>
            </button>
          </div>
        )}

        {/* Work Queue Controls & Filter Tabs */}
        <div ref={workQueueSectionRef} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 scroll-mt-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Bar */}
            <div className="w-full md:w-80">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === 'onDuty'
                    ? 'Search on-duty responder name, email, or purok...'
                    : isFieldResponder
                    ? 'Search my assigned tasks...'
                    : 'Search active queue #, title, location...'
                }
                onClear={() => setSearch('')}
              />
            </div>

            {/* Quick Queue Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-none">
              {isFieldResponder ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('assigned')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'assigned'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Assigned To Me ({assignedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('inProgress')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'inProgress'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    In Progress ({inProgressCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('activeAssignments')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'activeAssignments'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    My Active Assignments ({assignedCount + inProgressCount})
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'all'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Resident Work Queue ({totalActionable})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pending')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'pending'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pending Reports ({pendingCountQueue})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('assigned')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'assigned'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Assigned ({assignedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('inProgress')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'inProgress'
                        ? 'bg-white text-blue-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    In Progress ({inProgressCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('critical')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'critical'
                        ? 'bg-red-600 text-white shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Critical Queue ({criticalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('onDuty')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      activeTab === 'onDuty'
                        ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    On Duty ({onDutyCount})
                  </button>
                </>
              )}
            </div>

            {/* Official Quick Action Button */}
            <NavLink to={ROUTES.REPORTS} className="w-full md:w-auto shrink-0">
              <Button variant="outline" icon={<History className="w-4 h-4" />} className="w-full">
                View History Logs
              </Button>
            </NavLink>
          </div>
        </div>

        {/* On Duty Responder Monitoring Table vs Report Cards Grid */}
        {activeTab === 'onDuty' ? (
          <div className="space-y-4">
            {/* Summary Bar Above Table */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  On Duty Responders
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time operational monitoring of field personnel and active incident dispatches.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-slate-700 shadow-2xs">
                  Total On Duty : <span className="font-extrabold text-slate-900">{onDutyCount}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl">
                  Idle : <span className="font-extrabold text-emerald-900">{idleCount}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl">
                  Assigned : <span className="font-extrabold text-amber-900">{assignedResponderCount}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-xl">
                  In Progress : <span className="font-extrabold text-blue-900">{inProgressResponderCount}</span>
                </div>
              </div>
            </div>

            {/* Operational Table */}
            {loading ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredResponders.length === 0 ? (
              <EmptyState
                icon={<UserCheck className="w-8 h-8 text-slate-400" />}
                title="No On Duty Responders"
                description="There are currently no active on-duty field responders matching your criteria."
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                        <th className="py-3.5 px-4">Responder</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Current Report</th>
                        <th className="py-3.5 px-4">Assigned Since</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResponders.map((resp) => {
                        const activeReports = getResponderActiveReports(resp.uid);
                        const responderStatus = getResponderOperationalStatus(activeReports);
                        const hasActiveReports = activeReports.length > 0;

                        return (
                          <tr key={resp.uid} className="hover:bg-slate-50/80 transition-colors">
                            {/* Responder Info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={resp.fullName} src={resp.profilePicture} size="sm" />
                                <div>
                                  <p className="font-bold text-slate-900 text-sm">{resp.fullName}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {resp.purok || 'Purok 1'} • {resp.email || 'Field Responder'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {responderStatus === 'inProgress' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                  🔵 In Progress
                                </span>
                              ) : responderStatus === 'assigned' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                  🟠 Assigned
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  🟢 Idle
                                </span>
                              )}
                            </td>

                            {/* Current Report */}
                            <td className="py-3.5 px-4">
                              {!hasActiveReports ? (
                                <span className="text-slate-400 font-medium">-</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {activeReports.map((r) => (
                                    <button
                                      key={r.reportId}
                                      type="button"
                                      onClick={() => navigate(ROUTES.REPORT_DETAILS(r.reportId))}
                                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors"
                                      title="Click to view report details"
                                    >
                                      {r.reportNumber}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Assigned Since */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                              {!hasActiveReports ? (
                                <span className="text-slate-400 font-medium">-</span>
                              ) : (
                                <div className="space-y-1">
                                  {activeReports.map((r) => {
                                    const responderInfo = getReportResponders(r).find((x) => x.uid === resp.uid);
                                    const assignedAtStr = responderInfo?.assignedAt || r.assignedAt || r.createdAt;
                                    const formattedDate = assignedAtStr
                                      ? new Date(assignedAtStr).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '-';

                                    return (
                                      <div key={r.reportId} className="text-xs font-medium text-slate-700">
                                        {formattedDate}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-[270px] rounded-2xl" />
            <Skeleton className="h-[270px] rounded-2xl" />
            <Skeleton className="h-[270px] rounded-2xl" />
          </div>
        ) : filteredOfficialReports.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
            title={
              isFieldResponder
                ? activeTab === 'assigned'
                  ? 'No Assigned Tasks'
                  : activeTab === 'inProgress'
                  ? 'No Tasks In Progress'
                  : activeTab === 'activeAssignments'
                  ? 'No Active Assignments'
                  : 'All Assigned Tasks Complete!'
                : activeTab === 'assigned'
                ? 'No Assigned Reports'
                : activeTab === 'all'
                ? 'Work Queue Clear!'
                : `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Reports`
            }
            description={
              isFieldResponder
                ? 'You have no active incident response tasks pending in this queue. Completed and resolved reports can be viewed in your report history.'
                : activeTab === 'assigned'
                ? 'There are currently no reports with assigned status in your active queue.'
                : activeTab === 'all'
                ? 'All incident reports in your jurisdiction are resolved, closed, or transferred.'
                : 'There are currently no active reports matching this queue category.'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.REPORTS)}>
                View Reports History
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOfficialReports.map((report) => (
              <ReportCard
                key={report.reportId}
                report={report}
                onClick={() => navigate(ROUTES.REPORT_DETAILS(report.reportId))}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

