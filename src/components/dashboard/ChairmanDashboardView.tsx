import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  CertificateRequest,
  RegistrationApplication,
  Announcement,
  BlotterCase,
  Report,
  InventoryItem,
  AuditLog,
  getReportResponders,
} from '../../types';
import { certificateService } from '../../services/certificateService';
import { registrationService } from '../../services/registrationService';
import { announcementService } from '../../services/announcementService';
import { blotterService } from '../../services/blotterService';
import { inventoryService } from '../../services/inventoryService';
import { adminService } from '../../services/adminService';
import { ROUTES } from '../../constants';
import { Button } from '../foundation/Button';
import { SearchInput } from '../forms/SearchInput';
import { EmptyState } from '../feedback/EmptyState';
import { Skeleton } from '../feedback/Skeleton';
import { Modal } from '../feedback/Modal';
import { Alert } from '../feedback/Alert';
import {
  AlertTriangle,
  FileCheck2,
  Users,
  Megaphone,
  FileSpreadsheet,
  Boxes,
  ShieldCheck,
  Eye,
  ExternalLink,
  Plus,
  ShieldAlert,
  Activity,
  CheckCircle2,
  Clock,
  Building,
} from 'lucide-react';

interface ChairmanDashboardViewProps {
  reports: Report[];
  loadingReports: boolean;
}

export type ChairmanTab =
  | 'reports'
  | 'certificates'
  | 'registrations'
  | 'announcements'
  | 'blotter'
  | 'inventory'
  | 'auditLogs';

export const ChairmanDashboardView: React.FC<ChairmanDashboardViewProps> = ({
  reports,
  loadingReports,
}) => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();

  const [activeTab, setActiveTab] = useState<ChairmanTab>('reports');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const workspaceRef = useRef<HTMLDivElement>(null);

  const handleTabSelect = (tab: ChairmanTab, shouldScroll = false) => {
    setActiveTab(tab);
    if (shouldScroll && workspaceRef.current) {
      const yOffset = -16;
      const element = workspaceRef.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Executive Data States
  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationApplication[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [blotters, setBlotters] = useState<BlotterCase[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Read-only modal state for Registration Applications
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationApplication | null>(null);

  // Load Executive Data with real-time subscriptions
  useEffect(() => {
    if (!isAuthInitialized) return;
    setLoadingData(true);

    const unsubCerts = certificateService.subscribeToCertificates(user, (certs) => {
      setCertificates(certs || []);
      setLoadingData(false);
    });

    const unsubAnn = announcementService.subscribeToAnnouncements((anns) => {
      setAnnouncements(anns || []);
    });

    registrationService.getAllRegistrations('all', 'all', user, { limitCount: 30 }).then((regs) => {
      setRegistrations(regs || []);
    }).catch((err) => console.error('[ChairmanDashboard] Error fetching registrations:', err));

    blotterService.getBlotters(user, { limitCount: 30 }).then((blot) => {
      setBlotters(blot || []);
    }).catch((err) => console.error('[ChairmanDashboard] Error fetching blotters:', err));

    inventoryService.getInventoryItems({ limitCount: 30 }).then((inv) => {
      setInventoryItems(inv || []);
    }).catch((err) => console.error('[ChairmanDashboard] Error fetching inventory:', err));

    adminService.getAuditLogs({ limitCount: 30 }).then((audit) => {
      setAuditLogs(audit || []);
    }).catch((err) => console.error('[ChairmanDashboard] Error fetching audit logs:', err));

    return () => {
      unsubCerts();
      unsubAnn();
    };
  }, [isAuthInitialized, user?.uid, user?.role, user?.jurisdiction, user?.barangay]);

  // Executive Summary Card Metrics
  const activeReportsCount = reports.filter(
    (r) => r.status === 'pending' || r.status === 'assigned' || r.status === 'inProgress' || r.status === 'escalated'
  ).length;

  const activeCertificates = certificates.filter(
    (c) =>
      c.status === 'submitted' ||
      c.status === 'underReview' ||
      c.status === 'approved' ||
      c.status === 'approvedUnderProcess' ||
      c.status === 'processing' ||
      c.status === 'readyForRelease'
  );

  const pendingCertsCount = activeCertificates.length;

  const pendingRegsCount = registrations.filter(
    (r) =>
      r.status === 'pending' ||
      r.status === 'under_review' ||
      r.status === 'underReview' ||
      r.status === 'needs_additional_docs' ||
      r.status === 'needsInfo'
  ).length;

  const activeAnnouncementsCount = announcements.filter(
    (a) => a.status === 'published' && !a.isDeleted
  ).length;

  const pendingBlottersCount = blotters.filter(
    (b) => b.status === 'open' || b.status === 'underInvestigation' || b.status === 'scheduled'
  ).length;

  const totalInventoryCount = inventoryItems.length;

  const auditLogsCount = auditLogs.length;

  // Search filter computations
  const filteredReports = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.reportNumber?.toLowerCase().includes(q) ||
      r.title?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q) ||
      r.location?.address?.toLowerCase().includes(q) ||
      r.location?.purok?.toLowerCase().includes(q)
    );
  });

  const filteredCertificates = activeCertificates.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.requestNumber?.toLowerCase().includes(q) ||
      c.fullName?.toLowerCase().includes(q) ||
      c.certificateType?.toLowerCase().includes(q) ||
      c.purpose?.toLowerCase().includes(q)
    );
  });

  const filteredRegistrations = registrations.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.fullName?.toLowerCase().includes(q) ||
      r.firstName?.toLowerCase().includes(q) ||
      r.lastName?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.purok?.toLowerCase().includes(q) ||
      r.address?.toLowerCase().includes(q)
    );
  });

  const filteredAnnouncements = announcements.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title?.toLowerCase().includes(q) ||
      a.content?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q)
    );
  });

  const filteredBlotters = blotters.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.caseNumber?.toLowerCase().includes(q) ||
      b.incidentType?.toLowerCase().includes(q) ||
      b.complainantName?.toLowerCase().includes(q) ||
      b.respondentName?.toLowerCase().includes(q)
    );
  });

  const filteredInventory = inventoryItems.filter((i) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      i.assetCode?.toLowerCase().includes(q) ||
      i.assetName?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q) ||
      i.location?.toLowerCase().includes(q)
    );
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action?.toLowerCase().includes(q) ||
      log.performedByName?.toLowerCase().includes(q) ||
      log.performedByRole?.toLowerCase().includes(q) ||
      log.ipAddress?.toLowerCase().includes(q) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* EXECUTIVE SUMMARY METRIC CARDS (7 CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* 1. Active Incident Reports */}
        <div
          onClick={() => handleTabSelect('reports', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-rose-50/80 border-rose-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">
              Active Incidents
            </span>
            <div className="p-2 rounded-xl bg-rose-100/80 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingReports ? '-' : activeReportsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Emergency & incident dispatches
            </p>
          </div>
        </div>

        {/* 2. Pending Certificates */}
        <div
          onClick={() => handleTabSelect('certificates', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'certificates'
              ? 'bg-blue-50/80 border-blue-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Pending Certificates
            </span>
            <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : pendingCertsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Clearance & residency requests
            </p>
          </div>
        </div>

        {/* 3. Pending Registration Requests (View Only) */}
        <div
          onClick={() => handleTabSelect('registrations', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'registrations'
              ? 'bg-amber-50/80 border-amber-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              Pending Registrations
            </span>
            <div className="p-2 rounded-xl bg-amber-100/80 text-amber-700">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : pendingRegsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Resident applications (View Only)
            </p>
          </div>
        </div>

        {/* 4. Active Announcements */}
        <div
          onClick={() => handleTabSelect('announcements', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'announcements'
              ? 'bg-emerald-50/80 border-emerald-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Active Broadcasts
            </span>
            <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
              <Megaphone className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : activeAnnouncementsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Published advisories & news
            </p>
          </div>
        </div>

        {/* 5. Pending Blotter Cases */}
        <div
          onClick={() => handleTabSelect('blotter', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'blotter'
              ? 'bg-purple-50/80 border-purple-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">
              Pending Blotters
            </span>
            <div className="p-2 rounded-xl bg-purple-100/80 text-purple-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : pendingBlottersCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Lupon dispute mediation cases
            </p>
          </div>
        </div>

        {/* 6. Total Inventory Assets */}
        <div
          onClick={() => handleTabSelect('inventory', true)}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'inventory'
              ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
              : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
              Total Inventory
            </span>
            <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : totalInventoryCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Logged property & equipment
            </p>
          </div>
        </div>

        {/* 7. Audit Trail Events */}
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
              Audit Logs
            </span>
            <div className="p-2 rounded-xl bg-slate-200/80 text-slate-700">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loadingData ? '-' : auditLogsCount}
            </span>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Governance & security logs
            </p>
          </div>
        </div>
      </div>

      {/* EXECUTIVE WORKSPACE ANCHOR */}
      <div ref={workspaceRef} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        {/* WORKSPACE NAVIGATION TABS & SEARCH */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none bg-slate-100/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleTabSelect('reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'reports'
                  ? 'bg-white text-rose-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🚨 Incident Reports ({reports.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('certificates')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'certificates'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📄 Certificates ({certificates.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('registrations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'registrations'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👥 Registrations ({registrations.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('announcements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'announcements'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📢 Announcements ({announcements.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('blotter')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'blotter'
                  ? 'bg-white text-purple-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚖️ Blotter ({blotters.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('inventory')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'inventory'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📦 Inventory ({inventoryItems.length})
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
              🛡️ Audit Trail ({auditLogs.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-64">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              onClear={() => setSearchQuery('')}
            />
          </div>
        </div>

        {/* TAB 1: INCIDENT REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Incident & Emergency Reports Oversight
                </h3>
                <p className="text-xs text-slate-500">
                  Read-only executive monitoring of community dispatches, responder assignments, and resolution progress.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.REPORTS)}
              >
                Go to Reports Directory
              </Button>
            </div>

            {loadingReports ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredReports.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle className="w-8 h-8 text-slate-400" />}
                title="No Reports Found"
                description="There are currently no active incident reports in the system."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Report Number</th>
                      <th className="py-3 px-4">Category / Title</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Assigned Responder</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReports.map((rep) => {
                      const responders = getReportResponders(rep);
                      const responderNames =
                        responders.length > 0
                          ? responders.map((r) => r.name).join(', ')
                          : 'Unassigned';

                      return (
                        <tr key={rep.reportId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            {rep.reportNumber}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-900">{rep.title || rep.category}</p>
                            <p className="text-[11px] text-slate-500 capitalize">{rep.category}</p>
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                            {rep.location?.address || rep.location?.purok || 'Barangay Jurisdiction'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                                rep.status === 'resolved' || rep.status === 'closed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : rep.status === 'escalated'
                                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                  : rep.status === 'inProgress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : rep.status === 'assigned'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {rep.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700">
                            {responderNames}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => navigate(ROUTES.REPORT_DETAILS(rep.reportId))}
                            >
                              View Details
                            </Button>
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

        {/* TAB 2: CERTIFICATES */}
        {activeTab === 'certificates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Barangay Certificate & Clearance Requests
                </h3>
                <p className="text-xs text-slate-500">
                  Executive governance and status monitoring of barangay certificates, clearances, and indigency requests.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.CERTIFICATES)}
              >
                Go to Certificate Module
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredCertificates.length === 0 ? (
              <EmptyState
                icon={<FileCheck2 className="w-8 h-8 text-slate-400" />}
                title="No Certificate Requests Found"
                description="No certificate applications match your search query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Request #</th>
                      <th className="py-3 px-4">Applicant</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Purpose</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Requested Date</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCertificates.map((cert) => (
                      <tr key={cert.certificateId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {cert.requestNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {cert.fullName}
                          {cert.purok && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              {cert.purok}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {cert.certificateType}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {cert.purpose}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              cert.status === 'released' || cert.status === 'claimed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : cert.status === 'approved' || cert.status === 'ready'
                                ? 'bg-blue-100 text-blue-800'
                                : cert.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {cert.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(cert.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => navigate(ROUTES.CERTIFICATES)}
                          >
                            View / Manage
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

        {/* TAB 3: REGISTRATION REQUESTS (VIEW ONLY) */}
        {activeTab === 'registrations' && (
          <div className="space-y-4">
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950 text-sm">
                  Executive Registration Review (View-Only Access)
                </p>
                <p className="mt-0.5 text-amber-800">
                  You are viewing resident self-registration applications for governance oversight. Account verification and approval workflows are managed by the <strong>Verifier</strong> role.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Resident Self-Registration Requests
                </h3>
                <p className="text-xs text-slate-500">
                  List of self-registered resident applications awaiting or completed verification.
                </p>
              </div>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredRegistrations.length === 0 ? (
              <EmptyState
                icon={<Users className="w-8 h-8 text-slate-400" />}
                title="No Registration Requests Found"
                description="There are currently no resident registration applications matching your filter."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Resident Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Address / Purok</th>
                      <th className="py-3 px-4">Submitted Date</th>
                      <th className="py-3 px-4">Current Status</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRegistrations.map((reg) => (
                      <tr key={reg.registrationId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {reg.fullName || `${reg.firstName} ${reg.lastName}`}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {reg.email}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {reg.purok ? `${reg.purok}, ` : ''}{reg.address}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {reg.submittedAt ? new Date(reg.submittedAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              reg.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : reg.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : reg.status === 'underReview' || reg.status === 'under_review'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {reg.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<Eye className="w-3.5 h-3.5 text-slate-600" />}
                            onClick={() => setSelectedRegistration(reg)}
                          >
                            View
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

        {/* TAB 4: ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Barangay Announcements & Advisories
                </h3>
                <p className="text-xs text-slate-500">
                  Public advisories, community news, and official broadcasts.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.ANNOUNCEMENTS)}
              >
                New Announcement
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredAnnouncements.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="w-8 h-8 text-slate-400" />}
                title="No Announcements Found"
                description="There are currently no active announcements matching your query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Audience</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Published Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAnnouncements.map((ann) => (
                      <tr key={ann.announcementId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900 max-w-sm truncate">
                          {ann.title}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {ann.category}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {ann.audience}
                        </td>
                        <td className="py-3 px-4 capitalize font-semibold">
                          {ann.priority}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(ann.publishAt || ann.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              ann.status === 'published'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {ann.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => navigate(ROUTES.ANNOUNCEMENTS)}
                          >
                            Manage
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

        {/* TAB 5: BLOTTER */}
        {activeTab === 'blotter' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Barangay Blotter & Dispute Cases
                </h3>
                <p className="text-xs text-slate-500">
                  Lupong Tagapamayapa dispute mediation and official blotter logs.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.BLOTTER)}
              >
                Create Blotter Record
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredBlotters.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet className="w-8 h-8 text-slate-400" />}
                title="No Blotter Cases Found"
                description="There are currently no blotter records matching your query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Case #</th>
                      <th className="py-3 px-4">Incident Type</th>
                      <th className="py-3 px-4">Complainant</th>
                      <th className="py-3 px-4">Respondent</th>
                      <th className="py-3 px-4">Incident Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBlotters.map((caseItem) => (
                      <tr key={caseItem.caseId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {caseItem.caseNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {caseItem.incidentType}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {caseItem.complainantName}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {caseItem.respondentName}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {caseItem.incidentDate}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              caseItem.status === 'resolved' || caseItem.status === 'closed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : caseItem.status === 'scheduled'
                                ? 'bg-blue-100 text-blue-800'
                                : caseItem.status === 'underInvestigation'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {caseItem.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => navigate(ROUTES.BLOTTER)}
                          >
                            Manage
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

        {/* TAB 6: INVENTORY */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Barangay Assets & Inventory Monitoring
                </h3>
                <p className="text-xs text-slate-500">
                  Executive oversight of equipment, asset condition, stock levels, and maintenance status.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.INVENTORY)}
              >
                Manage Inventory
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredInventory.length === 0 ? (
              <EmptyState
                icon={<Boxes className="w-8 h-8 text-slate-400" />}
                title="No Inventory Items Found"
                description="There are currently no inventory assets matching your query."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Asset Code</th>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Quantity / Stock</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.map((item) => (
                      <tr key={item.assetId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {item.assetCode}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.assetName}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {item.category}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {item.quantity} {item.unit || 'units'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {item.location || 'Barangay Hall'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                              item.status === 'available'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'borrowed'
                                ? 'bg-blue-100 text-blue-800'
                                : item.status === 'maintenance'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => navigate(ROUTES.INVENTORY)}
                          >
                            View / Manage
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

        {/* TAB 7: AUDIT TRAIL */}
        {activeTab === 'auditLogs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  System Audit Trail & Governance Logs
                </h3>
                <p className="text-xs text-slate-500">
                  Full executive security audit log monitoring for governance and administrative compliance.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => navigate(ROUTES.AUDIT_LOGS)}
              >
                View Full Audit Logs
              </Button>
            </div>

            {loadingData ? (
              <Skeleton className="h-[200px] rounded-2xl" />
            ) : filteredAuditLogs.length === 0 ? (
              <EmptyState
                icon={<Activity className="w-8 h-8 text-slate-400" />}
                title="No Audit Logs Found"
                description="There are currently no security or audit events matching your search."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-4">Audit ID</th>
                      <th className="py-3 px-4">Action Event</th>
                      <th className="py-3 px-4">Performed By</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.auditId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">
                          {log.auditId}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {log.action}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {log.performedByName || log.performedByUid}
                        </td>
                        <td className="py-3 px-4 text-slate-600 capitalize">
                          {log.performedByRole}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => navigate(ROUTES.AUDIT_LOGS)}
                          >
                            View Full Logs
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
      </div>

      {/* REGISTRATION DETAILS READ-ONLY MODAL FOR CHAIRMAN */}
      {selectedRegistration && (
        <Modal
          isOpen={!!selectedRegistration}
          onClose={() => setSelectedRegistration(null)}
          title="Resident Application Details"
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-500 italic">
                Read-Only Executive View • Account verification actions belong to the Verifier role.
              </span>
              <Button variant="secondary" onClick={() => setSelectedRegistration(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Alert variant="info" icon={<ShieldAlert className="w-4 h-4 text-blue-600" />}>
              As Barangay Chairman, you are inspecting resident applications for governance and oversight. Account verification and approval are handled by authorized Verifiers.
            </Alert>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 font-semibold block">Full Name</span>
                <span className="text-slate-900 font-bold text-sm">
                  {selectedRegistration.fullName ||
                    `${selectedRegistration.firstName} ${selectedRegistration.lastName}`}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Email Address</span>
                <span className="text-slate-900 font-mono">{selectedRegistration.email}</span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Phone Number</span>
                <span className="text-slate-900 font-medium">
                  {selectedRegistration.phoneNumber || '-'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Birth Date / Civil Status</span>
                <span className="text-slate-900 font-medium">
                  {selectedRegistration.birthDate || '-'} • {selectedRegistration.civilStatus || '-'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Address / Purok</span>
                <span className="text-slate-900 font-medium">
                  {selectedRegistration.purok ? `${selectedRegistration.purok}, ` : ''}
                  {selectedRegistration.address}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Voter Status</span>
                <span className="text-slate-900 font-medium capitalize">
                  {selectedRegistration.voterStatus || '-'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Application Status</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold capitalize bg-blue-100 text-blue-800 mt-0.5">
                  {selectedRegistration.status}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Submitted Date</span>
                <span className="text-slate-900 font-medium">
                  {selectedRegistration.submittedAt
                    ? new Date(selectedRegistration.submittedAt).toLocaleString()
                    : '-'}
                </span>
              </div>
            </div>

            {/* Verification Documents section */}
            {(selectedRegistration.idFrontUrl ||
              selectedRegistration.supportingDocUrl ||
              selectedRegistration.selfieUrl) && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Submitted Verification Documents
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedRegistration.idFrontUrl && (
                    <a
                      href={selectedRegistration.idFrontUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-blue-300 transition-colors"
                    >
                      <span className="font-semibold text-slate-700">Govt ID (Front)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    </a>
                  )}
                  {selectedRegistration.idBackUrl && (
                    <a
                      href={selectedRegistration.idBackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-blue-300 transition-colors"
                    >
                      <span className="font-semibold text-slate-700">Govt ID (Back)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    </a>
                  )}
                  {selectedRegistration.supportingDocUrl && (
                    <a
                      href={selectedRegistration.supportingDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-blue-300 transition-colors"
                    >
                      <span className="font-semibold text-slate-700">Supporting Document</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    </a>
                  )}
                  {selectedRegistration.selfieUrl && (
                    <a
                      href={selectedRegistration.selfieUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-blue-300 transition-colors"
                    >
                      <span className="font-semibold text-slate-700">Selfie Verification</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
