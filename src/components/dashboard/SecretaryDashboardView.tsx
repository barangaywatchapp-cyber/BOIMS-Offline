import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  CertificateRequest,
  RegistrationApplication,
  Announcement,
  BlotterCase,
  Household,
  Report,
  HouseholdNumberChangeRequest,
  getReportResponders,
} from '../../types';
import { certificateService } from '../../services/certificateService';
import { registrationService } from '../../services/registrationService';
import { announcementService } from '../../services/announcementService';
import { blotterService } from '../../services/blotterService';
import { residentService } from '../../services/residentService';
import { ROUTES } from '../../constants';
import { Button } from '../foundation/Button';
import { SearchInput } from '../forms/SearchInput';
import { EmptyState } from '../feedback/EmptyState';
import { Skeleton } from '../feedback/Skeleton';
import { Modal } from '../feedback/Modal';
import { Alert } from '../feedback/Alert';
import {
  FileCheck2,
  Users,
  Megaphone,
  FileText,
  AlertTriangle,
  Plus,
  Eye,
  ExternalLink,
  ShieldAlert,
  FileSpreadsheet,
  Building,
  UserCheck,
  Home,
} from 'lucide-react';

interface SecretaryDashboardViewProps {
  reports: Report[];
  loadingReports: boolean;
}

export type SecretaryTab = 'certificates' | 'registrations' | 'reports' | 'announcements' | 'blotter';

export const SecretaryDashboardView: React.FC<SecretaryDashboardViewProps> = ({
  reports,
  loadingReports,
}) => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();

  const [activeTab, setActiveTab] = useState<SecretaryTab>('certificates');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const workspaceRef = useRef<HTMLDivElement>(null);

  const handleTabSelect = (tab: SecretaryTab, shouldScroll = false) => {
    setActiveTab(tab);
    if (shouldScroll && workspaceRef.current) {
      const yOffset = -16;
      const element = workspaceRef.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Data states
  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationApplication[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [blotters, setBlotters] = useState<BlotterCase[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [numberChangeRequests, setNumberChangeRequests] = useState<HouseholdNumberChangeRequest[]>([]);

  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Registration Detail Modal state (VIEW ONLY)
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationApplication | null>(null);

  // Load all Secretary administrative data with real-time subscriptions
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

    const unsubHouseholds = residentService.subscribeToHouseholds(user, (hh) => {
      setHouseholds(hh || []);
    });

    const unsubNumberRequests = residentService.subscribeToHouseholdNumberChangeRequests((reqs) => {
      setNumberChangeRequests(reqs || []);
    });

    registrationService.getAllRegistrations('all', 'all', user, { limitCount: 30 }).then((regs) => {
      setRegistrations(regs || []);
    }).catch((err) => console.error('[SecretaryDashboard] Error fetching registrations:', err));

    blotterService.getBlotters(user, { limitCount: 30 }).then((blot) => {
      setBlotters(blot || []);
    }).catch((err) => console.error('[SecretaryDashboard] Error fetching blotters:', err));

    return () => {
      unsubCerts();
      unsubAnn();
      unsubHouseholds();
      unsubNumberRequests();
    };
  }, [isAuthInitialized, user?.uid, user?.role, user?.jurisdiction, user?.barangay]);

  // Counts for Summary Cards
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
    (r) => r.status === 'pending' || r.status === 'underReview' || r.status === 'needsInfo'
  ).length;

  const activeAnnouncementsCount = announcements.filter(
    (a) => a.status === 'published' && !a.isDeleted
  ).length;

  const pendingBlottersCount = blotters.filter(
    (b) => b.status === 'open' || b.status === 'underInvestigation' || b.status === 'scheduled'
  ).length;

  const activeReportsCount = reports.filter(
    (r) => r.status === 'pending' || r.status === 'assigned' || r.status === 'inProgress' || r.status === 'escalated'
  ).length;

  const pendingHouseholdsCount = households.filter(
    (h) =>
      h.verificationStatus === 'pending_verification' &&
      (!h.householdNumber || !h.householdNumber.trim() || h.householdNumber === 'HH-PENDING')
  ).length;

  const pendingHnrCount = numberChangeRequests.filter(
    (r) => r.status === 'pending_review'
  ).length;

  // Filtered lists based on search query
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
      r.email?.toLowerCase().includes(q) ||
      r.address?.toLowerCase().includes(q) ||
      r.purok?.toLowerCase().includes(q)
    );
  });

  const filteredReports = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.reportNumber?.toLowerCase().includes(q) ||
      r.title?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q) ||
      r.location?.address?.toLowerCase().includes(q)
    );
  });

  const filteredAnnouncements = announcements.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q) ||
      a.content?.toLowerCase().includes(q)
    );
  });

  const filteredBlotters = blotters.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.caseNumber?.toLowerCase().includes(q) ||
      b.complainantName?.toLowerCase().includes(q) ||
      b.respondentName?.toLowerCase().includes(q) ||
      b.incidentType?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* SUMMARY CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Pending Certificates */}
        <button
          type="button"
          onClick={() => handleTabSelect('certificates', true)}
          className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            activeTab === 'certificates'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500 ring-offset-2 -translate-y-0.5'
              : 'bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'certificates' ? 'text-blue-100' : 'text-slate-500'}`}>
              Pending Certificates
            </span>
            <div className={`p-2 rounded-xl transition-colors ${activeTab === 'certificates' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <p className={`text-3xl font-extrabold mt-3 ${activeTab === 'certificates' ? 'text-white' : 'text-slate-900'}`}>{pendingCertsCount}</p>
          <p className={`text-xs mt-1 font-medium ${activeTab === 'certificates' ? 'text-blue-100' : 'text-slate-500'}`}>Waiting for Processing</p>
        </button>

        {/* Card 2: Active Incident Reports */}
        <button
          type="button"
          onClick={() => handleTabSelect('reports', true)}
          className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            activeTab === 'reports'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500 ring-offset-2 -translate-y-0.5'
              : 'bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-rose-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'reports' ? 'text-rose-100' : 'text-slate-500'}`}>
              Incident Reports
            </span>
            <div className={`p-2 rounded-xl transition-colors ${activeTab === 'reports' ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className={`text-3xl font-extrabold mt-3 ${activeTab === 'reports' ? 'text-white' : 'text-slate-900'}`}>{activeReportsCount}</p>
          <p className={`text-xs mt-1 font-medium ${activeTab === 'reports' ? 'text-rose-100' : 'text-slate-500'}`}>Administrative monitoring only</p>
        </button>

        {/* Card 3: Household Registry */}
        <button
          type="button"
          onClick={() => navigate(`${ROUTES.HOUSEHOLDS}?tab=number_requests`)}
          className="w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-300 hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Household Registry [{pendingHnrCount}]
            </span>
            <div className="p-2 rounded-xl transition-colors bg-teal-50 text-teal-600">
              <Home className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold mt-3 text-slate-900">{pendingHnrCount}</p>
          <p className="text-xs mt-1 font-medium text-slate-500">HH Number Conflicts</p>
        </button>

        {/* Card 4: Pending Blotter Cases */}
        <button
          type="button"
          onClick={() => handleTabSelect('blotter', true)}
          className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            activeTab === 'blotter'
              ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500 ring-offset-2 -translate-y-0.5'
              : 'bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-purple-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'blotter' ? 'text-purple-100' : 'text-slate-500'}`}>
              Blotter Cases
            </span>
            <div className={`p-2 rounded-xl transition-colors ${activeTab === 'blotter' ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-600'}`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <p className={`text-3xl font-extrabold mt-3 ${activeTab === 'blotter' ? 'text-white' : 'text-slate-900'}`}>{pendingBlottersCount}</p>
          <p className={`text-xs mt-1 font-medium ${activeTab === 'blotter' ? 'text-purple-100' : 'text-slate-500'}`}>Pending Blotter Cases</p>
        </button>

        {/* Card 5: Active Announcements */}
        <button
          type="button"
          onClick={() => handleTabSelect('announcements', true)}
          className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            activeTab === 'announcements'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500 ring-offset-2 -translate-y-0.5'
              : 'bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-emerald-300 hover:-translate-y-0.5'
          }`}
        >
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'announcements' ? 'text-emerald-100' : 'text-slate-500'}`}>
              Announcements
            </span>
          </div>
          <div className="mt-2">
            <div className={`p-2 rounded-xl inline-block transition-colors ${activeTab === 'announcements' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
              <Megaphone className="w-5 h-5" />
            </div>
          </div>
          <p className={`text-3xl font-extrabold mt-3 ${activeTab === 'announcements' ? 'text-white' : 'text-slate-900'}`}>{activeAnnouncementsCount}</p>
          <p className={`text-xs mt-1 font-medium ${activeTab === 'announcements' ? 'text-emerald-100' : 'text-slate-500'}`}>Active Bulletins</p>
        </button>

        {/* Card 6: Pending Registration Requests */}
        <button
          type="button"
          onClick={() => handleTabSelect('registrations', true)}
          className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 relative overflow-hidden ${
            activeTab === 'registrations'
              ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500 ring-offset-2 -translate-y-0.5'
              : 'bg-white text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'registrations' ? 'text-amber-100' : 'text-slate-500'}`}>
              Registrations
            </span>
            <div className={`p-2 rounded-xl transition-colors ${activeTab === 'registrations' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-600'}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex justify-end mt-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
              activeTab === 'registrations'
                ? 'bg-white/20 text-white border-white/30'
                : 'bg-amber-100 text-amber-800 border-amber-200'
            }`}>
              VIEW ONLY
            </span>
          </div>
          <p className={`text-3xl font-extrabold mt-2 ${activeTab === 'registrations' ? 'text-white' : 'text-slate-900'}`}>{pendingRegsCount}</p>
          <p className={`text-xs mt-1 font-medium ${activeTab === 'registrations' ? 'text-amber-100' : 'text-slate-500'}`}>Residents Awaiting Verification</p>
        </button>
      </div>

      {/* MAIN CONTENT WORKSPACE TABS */}
      <div ref={workspaceRef} className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-none max-w-full">
            <button
              type="button"
              onClick={() => handleTabSelect('certificates')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'certificates'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📄 Pending Certificates ({pendingCertsCount})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('registrations')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'registrations'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👥 Registration Requests ({registrations.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('reports')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'reports'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🚨 Reports ({reports.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('announcements')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'announcements'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📢 Announcements ({announcements.length})
            </button>

            <button
              type="button"
              onClick={() => handleTabSelect('blotter')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === 'blotter'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚖️ Blotter ({blotters.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-72">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              onClear={() => setSearchQuery('')}
            />
          </div>
        </div>

        {/* TAB 1: CERTIFICATES */}
        {activeTab === 'certificates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Certificate Requests</h3>
                <p className="text-xs text-slate-500">
                  Manage clearance, indigency, residency, and official document issuance.
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
                                : cert.status === 'approved' || cert.status === 'readyForRelease' || cert.status === 'ready'
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

        {/* TAB 2: REGISTRATION REQUESTS (VIEW ONLY) */}
        {activeTab === 'registrations' && (
          <div className="space-y-4">
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950 text-sm">
                  Barangay Secretary View-Only Registration Access
                </p>
                <p className="mt-0.5 text-amber-800">
                  You can inspect resident registration records and submitted verification documents. Account verification, approval, rejection, and role activation are restricted exclusively to the <strong>Verifier</strong> role.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Resident Self-Registration Requests</h3>
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
                                : reg.status === 'underReview'
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

        {/* TAB 3: REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Incident & Emergency Reports</h3>
                <p className="text-xs text-slate-500">
                  Administrative monitoring of community incidents, complaints, and emergency dispatches.
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
                      const responderNames = responders.length > 0
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

        {/* TAB 4: ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Barangay Announcements</h3>
                <p className="text-xs text-slate-500">
                  Public advisories, community news, and official announcements.
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
                <h3 className="text-base font-bold text-slate-900">Barangay Blotter Records</h3>
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
      </div>

      {/* REGISTRATION DETAILS READ-ONLY MODAL */}
      {selectedRegistration && (
        <Modal
          isOpen={!!selectedRegistration}
          onClose={() => setSelectedRegistration(null)}
          title={`Resident Application Details`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-500 italic">
                Read-Only View • Account verification actions belong to the Verifier role.
              </span>
              <Button variant="secondary" onClick={() => setSelectedRegistration(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Alert variant="info" icon={<ShieldAlert className="w-4 h-4 text-blue-600" />}>
              As Barangay Secretary, you can inspect registration applications for record keeping. Verifying and approving accounts is restricted to Verifiers.
            </Alert>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 font-semibold block">Full Name</span>
                <span className="text-slate-900 font-bold text-sm">
                  {selectedRegistration.fullName || `${selectedRegistration.firstName} ${selectedRegistration.lastName}`}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Email Address</span>
                <span className="text-slate-900 font-mono">{selectedRegistration.email}</span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Phone Number</span>
                <span className="text-slate-900 font-medium">{selectedRegistration.phoneNumber || '-'}</span>
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
                  {selectedRegistration.purok ? `${selectedRegistration.purok}, ` : ''}{selectedRegistration.address}
                </span>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block">Voter Status</span>
                <span className="text-slate-900 font-medium capitalize">{selectedRegistration.voterStatus || '-'}</span>
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
                  {selectedRegistration.submittedAt ? new Date(selectedRegistration.submittedAt).toLocaleString() : '-'}
                </span>
              </div>
            </div>

            {/* Verification Documents section */}
            {(selectedRegistration.idFrontUrl || selectedRegistration.supportingDocUrl || selectedRegistration.selfieUrl) && (
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
