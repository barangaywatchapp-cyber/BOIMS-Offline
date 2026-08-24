/**
 * Page: RegistrationApprovalPage
 * Administrative Verification & Approval Console for BOIMS Registration Module
 * Supports application filtering, document lightbox inspection, email verification checks,
 * status transitions (pending, under_review, needs_additional_docs, approved, rejected),
 * and atomic concurrency-protected Firestore transaction approvals & rejections.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { registrationService } from '../services/registrationService';
import { RegistrationApplication, RegistrationStatus, UserRole } from '../types';
import { ROLE_LABELS } from '../constants';
import {
  ShieldCheck,
  Search,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  FileText,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Mail,
  FileSearch,
  HelpCircle,
  Check,
  AlertCircle,
  WifiOff,
} from 'lucide-react';
import { Button } from '../components/foundation/Button';
import { Modal } from '../components/feedback/Modal';
import { Badge } from '../components/foundation/Badge';
import { Alert } from '../components/feedback/Alert';

const PUROK_OPTIONS = ['all', 'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7'];

export const RegistrationApprovalPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [applications, setApplications] = useState<RegistrationApplication[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | 'all'>('pending');
  const [purokFilter, setPurokFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal State
  const [selectedApp, setSelectedApp] = useState<RegistrationApplication | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isReqDocsModalOpen, setIsReqDocsModalOpen] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Form inputs
  const [assignedRole, setAssignedRole] = useState<UserRole>('resident');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [additionalDocsRemarks, setAdditionalDocsRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadApplications = async () => {
    try {
      setRefreshing(true);
      const data = await registrationService.getAllRegistrations('all', purokFilter, user);
      setApplications(data);
    } catch (err) {
      console.error('Failed to load registrations:', err);
      showToast('Failed to fetch registration records.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    loadApplications();
  }, [isAuthInitialized, purokFilter, user?.uid, user?.role]);

  // Filtered List
  const filteredApps = applications.filter((app) => {
    if (statusFilter !== 'all' && app.status !== statusFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = app.fullName.toLowerCase().includes(q);
      const emailMatch = app.email.toLowerCase().includes(q);
      const phoneMatch = app.phoneNumber.includes(q);
      const idMatch = (app.idNumber || '').toLowerCase().includes(q);
      if (!nameMatch && !emailMatch && !phoneMatch && !idMatch) return false;
    }

    if (roleFilter !== 'all' && app.requestedRole !== roleFilter) {
      return false;
    }

    return true;
  });

  // Counters
  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const reviewCount = applications.filter((a) => a.status === 'under_review').length;
  const reqDocsCount = applications.filter((a) => a.status === 'needs_additional_docs').length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;

  const handleOpenDetail = (app: RegistrationApplication) => {
    setSelectedApp(app);
    setAssignedRole(app.requestedRole || 'resident');
    setIsDetailModalOpen(true);
  };

  const handleMarkUnderReview = async () => {
    if (!selectedApp || !user) return;
    setActionLoading(true);
    try {
      await registrationService.markUnderReview(selectedApp.registrationId, user);
      showToast('Application marked as Under Review.', 'info');
      setIsDetailModalOpen(false);
      await loadApplications();
    } catch (err: any) {
      showToast(err.message || 'Failed to update review status.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenApproveModal = () => {
    setActionError('');
    setIsApproveModalOpen(true);
  };

  const handleOpenRejectModal = () => {
    setActionError('');
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleOpenReqDocsModal = () => {
    setActionError('');
    setAdditionalDocsRemarks('');
    setIsReqDocsModalOpen(true);
  };

  const handleClaimApplication = async (appToClaim?: RegistrationApplication) => {
    const targetApp = appToClaim || selectedApp;
    if (!targetApp || !user) return;

    setActionLoading(true);
    try {
      const res = await registrationService.claimApplication(targetApp.registrationId, user);
      showToast(res.message, 'success');
      await loadApplications();
      if (selectedApp && selectedApp.registrationId === targetApp.registrationId) {
        setSelectedApp({
          ...selectedApp,
          assignedVerifier: user.uid,
          assignedVerifierName: user.fullName,
          status: 'under_review',
        });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to claim application.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute Atomic Transaction Approval
  const handleConfirmApproval = async () => {
    if (!selectedApp || !user) return;

    setActionLoading(true);
    setActionError('');

    try {
      const res = await registrationService.approveRegistration(
        selectedApp.registrationId,
        user,
        assignedRole,
        approvalNotes
      );

      showToast(res.message, 'success');
      setIsApproveModalOpen(false);
      setIsDetailModalOpen(false);
      setSelectedApp(null);
      await loadApplications();
    } catch (err: any) {
      console.error('Approval failed:', err);
      setActionError(err.message || 'Failed to approve registration application.');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute Atomic Transaction Rejection
  const handleConfirmRejection = async () => {
    if (!selectedApp || !user) return;

    if (!rejectionReason.trim()) {
      setActionError('Please enter a mandatory rejection reason for the applicant.');
      return;
    }

    setActionLoading(true);
    setActionError('');

    try {
      const res = await registrationService.rejectRegistration(
        selectedApp.registrationId,
        user,
        rejectionReason
      );

      showToast(res.message, 'info');
      setIsRejectModalOpen(false);
      setIsDetailModalOpen(false);
      setSelectedApp(null);
      await loadApplications();
    } catch (err: any) {
      console.error('Rejection failed:', err);
      setActionError(err.message || 'Failed to reject registration application.');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute Request Additional Docs
  const handleConfirmReqDocs = async () => {
    if (!selectedApp || !user) return;

    if (!additionalDocsRemarks.trim()) {
      setActionError('Please enter details regarding what additional documents are required.');
      return;
    }

    setActionLoading(true);
    setActionError('');

    try {
      const res = await registrationService.requestAdditionalDocs(
        selectedApp.registrationId,
        user,
        additionalDocsRemarks
      );

      showToast(res.message, 'info');
      setIsReqDocsModalOpen(false);
      setIsDetailModalOpen(false);
      setSelectedApp(null);
      await loadApplications();
    } catch (err: any) {
      console.error('Request additional docs failed:', err);
      setActionError(err.message || 'Failed to request additional documents.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Offline Notice Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-sm">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-900">
              Offline Verification Review Mode Active
            </p>
            <p className="text-amber-800 leading-relaxed">
              You are currently viewing cached registration records and inspection details offline. Final account approval, rejection, and resident account provisioning require live network connectivity for authoritative Firebase Auth credential verification, concurrency locking, and atomic BOIMS ID assignment.
            </p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Registration Verification Console
            </h1>
            <p className="text-xs text-slate-500">
              Review applicant identities, inspect verification documents, and approve user accounts
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadApplications}
          loading={refreshing}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh List
        </Button>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-amber-900 mt-1">{pendingCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter('under_review')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'under_review'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Under Review</span>
            <FileSearch className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-blue-900 mt-1">{reviewCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter('needs_additional_docs')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'needs_additional_docs'
              ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-400'
              : 'bg-white border-slate-200 hover:border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Needs Docs</span>
            <HelpCircle className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-extrabold text-purple-900 mt-1">{reqDocsCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'approved'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-900 mt-1">{approvedCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'rejected'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Rejected</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-extrabold text-rose-900 mt-1">{rejectedCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            {(['pending', 'under_review', 'needs_additional_docs', 'approved', 'rejected', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applicant name, email, or ID..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium shrink-0">Sitio/Purok:</span>
            <select
              value={purokFilter}
              onChange={(e) => setPurokFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-medium text-slate-800"
            >
              {PUROK_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p === 'all' ? 'All Puroks' : p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium shrink-0">Requested Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-medium text-slate-800"
            >
              <option value="all">All Requested Roles</option>
              <option value="resident">Resident</option>
              <option value="purokOfficial">Sitio/Purok Official</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading registration records...</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-800 text-sm">No Registration Records Found</p>
            <p className="text-xs text-slate-400">
              There are no applications matching your current filter choices.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Applicant Details</th>
                  <th className="px-4 py-3.5">Purok / Address</th>
                  <th className="px-4 py-3.5">Verification Method</th>
                  <th className="px-4 py-3.5">Requested Role</th>
                  <th className="px-4 py-3.5">Submitted Date</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.map((app) => (
                  <tr key={app.registrationId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">{app.fullName}</span>
                        <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {app.email}
                        </span>
                        <span className="text-[11px] text-slate-500">{app.phoneNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{app.purok}</span>
                        <span className="text-[11px] text-slate-500 truncate max-w-[160px]">{app.address}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800">
                          {app.verificationMethod === 'supportingDocument'
                            ? app.supportingDocType || 'Supporting Document'
                            : app.idType || 'Government ID'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {app.idNumber ? `#${app.idNumber}` : 'Document Uploaded'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="bg-blue-50 text-blue-800 font-bold px-2.5 py-1 rounded-lg border border-blue-200 inline-block uppercase text-[10px]">
                        {ROLE_LABELS[app.requestedRole]?.label || app.requestedRole}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                      {new Date(app.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {app.status === 'pending' && <Badge variant="warning">PENDING</Badge>}
                      {app.status === 'under_review' && <Badge variant="info">UNDER REVIEW</Badge>}
                      {app.status === 'needs_additional_docs' && <Badge variant="warning">NEEDS DOCS</Badge>}
                      {app.status === 'approved' && <Badge variant="success">APPROVED</Badge>}
                      {app.status === 'rejected' && <Badge variant="danger">REJECTED</Badge>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => handleOpenDetail(app)}
                        icon={<Eye className="w-3.5 h-3.5" />}
                      >
                        Inspect & Verify
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAILED VERIFICATION MODAL */}
      {selectedApp && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Verification Application: ${selectedApp.fullName}`}
          size="xl"
        >
          <div className="space-y-6 text-xs text-slate-700">
            {/* Status & Email Verification Banner */}
            <div className="flex flex-wrap items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Status:</span>
                {selectedApp.status === 'pending' && <Badge variant="warning">PENDING VERIFICATION</Badge>}
                {selectedApp.status === 'under_review' && <Badge variant="info">UNDER REVIEW</Badge>}
                {selectedApp.status === 'needs_additional_docs' && <Badge variant="warning">NEEDS ADDITIONAL DOCS</Badge>}
                {selectedApp.status === 'approved' && <Badge variant="success">APPROVED</Badge>}
                {selectedApp.status === 'rejected' && <Badge variant="danger">REJECTED</Badge>}

                <span className="text-slate-400">|</span>
                <span className="text-slate-500 font-semibold">Assigned Verifier:</span>
                <span className="font-bold text-slate-800">{selectedApp.assignedVerifierName || 'Unassigned'}</span>
              </div>

              {/* Email Verification Status */}
              <div className="flex items-center gap-1.5 font-bold">
                {selectedApp.emailVerified ? (
                  <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-300 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Email Verified
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Email Verification Pending
                  </span>
                )}
              </div>
            </div>

            {/* Warning if email not verified */}
            {!selectedApp.emailVerified && (
              <Alert type="warning">
                <p className="font-bold">Applicant Email Verification Pending</p>
                <p className="text-[11px] mt-0.5">
                  The applicant has been sent a verification email link. The Verifier should confirm the applicant verifies their email prior to final approval.
                </p>
              </Alert>
            )}

            {/* Grid 2 Cols */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Details */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 text-sm flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-700" />
                  Personal Information
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Birthdate / Gender:</span>
                    <span className="font-semibold text-slate-900">{selectedApp.birthDate} ({selectedApp.gender})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Civil Status / Occupation:</span>
                    <span className="font-semibold text-slate-900">{selectedApp.civilStatus} / {selectedApp.occupation || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact Number:</span>
                    <span className="font-semibold text-slate-900 font-mono">{selectedApp.phoneNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email Address:</span>
                    <span className="font-semibold text-slate-900 font-mono">{selectedApp.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Voter Status:</span>
                    <span className="font-semibold text-slate-900 capitalize">{selectedApp.voterStatus}</span>
                  </div>
                </div>
              </div>

              {/* Location & Application Details */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 text-sm flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-700" />
                  Address & Access Requested
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sitio / Purok:</span>
                    <span className="font-bold text-blue-800">{selectedApp.purok}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Street Address:</span>
                    <span className="font-semibold text-slate-900 text-right max-w-[180px]">{selectedApp.address}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2">
                    <span className="text-slate-500 font-bold">Applied Role:</span>
                    <span className="font-extrabold text-blue-800 uppercase">
                      {ROLE_LABELS[selectedApp.requestedRole]?.label || selectedApp.requestedRole}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verification Type:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedApp.verificationMethod === 'supportingDocument' ? 'Supporting Document' : 'Government-Issued ID'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Uploaded Verification Documents Preview */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">
                Uploaded Verification Documents ({selectedApp.registrationType === 'purokOfficial' ? 'Official Registration - 3 Mandatory Documents' : 'Resident Application'})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* ID / Supporting Doc */}
                <div className="border rounded-xl p-3 bg-slate-900 text-white space-y-2 text-center">
                  <span className="text-[11px] font-bold text-slate-300 block">
                    1. {selectedApp.verificationMethod === 'supportingDocument' ? 'Supporting Document' : 'Government ID Photo'}
                  </span>
                  {selectedApp.idFrontUrl || selectedApp.supportingDocUrl ? (
                    <img
                      src={selectedApp.idFrontUrl || selectedApp.supportingDocUrl}
                      alt="Primary Identity Doc"
                      onClick={() => setLightboxImageUrl(selectedApp.idFrontUrl || selectedApp.supportingDocUrl!)}
                      className="max-h-40 mx-auto rounded border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity object-contain"
                    />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-slate-500 italic">No document attached</div>
                  )}
                </div>

                {/* Proof of Residency / Selfie */}
                <div className="border rounded-xl p-3 bg-slate-900 text-white space-y-2 text-center">
                  <span className="text-[11px] font-bold text-slate-300 block">2. Proof of Residency / Selfie</span>
                  {selectedApp.residencyProofUrl ? (
                    <img
                      src={selectedApp.residencyProofUrl}
                      alt="Residency Proof"
                      onClick={() => setLightboxImageUrl(selectedApp.residencyProofUrl!)}
                      className="max-h-40 mx-auto rounded border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity object-contain"
                    />
                  ) : selectedApp.selfieUrl ? (
                    <img
                      src={selectedApp.selfieUrl}
                      alt="Selfie"
                      onClick={() => setLightboxImageUrl(selectedApp.selfieUrl!)}
                      className="max-h-40 mx-auto rounded border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity object-contain"
                    />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-slate-500 italic">No residency proof</div>
                  )}
                </div>

                {/* Proof of Official Appointment */}
                <div className="border rounded-xl p-3 bg-slate-900 text-white space-y-2 text-center">
                  <span className="text-[11px] font-bold text-slate-300 block">3. Proof of Appointment</span>
                  {selectedApp.appointmentProofUrl ? (
                    <img
                      src={selectedApp.appointmentProofUrl}
                      alt="Appointment Proof"
                      onClick={() => setLightboxImageUrl(selectedApp.appointmentProofUrl!)}
                      className="max-h-40 mx-auto rounded border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity object-contain"
                    />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-slate-500 italic">
                      {selectedApp.registrationType === 'purokOfficial' ? 'Missing Appointment Proof' : 'N/A (Resident Flow)'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Docs Remarks if present */}
            {selectedApp.additionalDocsRemarks && (
              <Alert type="info">
                <p className="font-bold">Requested Additional Documents Remarks:</p>
                <p className="mt-1">{selectedApp.additionalDocsRemarks}</p>
              </Alert>
            )}

            {/* Rejection Details if present */}
            {selectedApp.status === 'rejected' && selectedApp.rejectionReason && (
              <Alert type="error">
                <p className="font-bold">Rejection Reason:</p>
                <p className="mt-1">{selectedApp.rejectionReason}</p>
              </Alert>
            )}

            {/* Offline Notification in Details */}
            {!isOnline && (
              <Alert type="warning">
                <p className="font-bold">Offline Review Mode</p>
                <p className="mt-0.5">
                  Application review and document inspection are available offline. Final status updates, requesting documents, and approving accounts require an active network connection for server-authoritative Firebase transactions and ID assignment.
                </p>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <div>
                {selectedApp.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkUnderReview}
                    loading={actionLoading}
                    disabled={!isOnline}
                    icon={<FileSearch className="w-4 h-4" />}
                  >
                    Mark Under Review
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setIsDetailModalOpen(false)}>
                  Close
                </Button>

                {(!selectedApp.assignedVerifier || selectedApp.assignedVerifier !== user?.uid) &&
                  selectedApp.status !== 'approved' &&
                  selectedApp.status !== 'rejected' && (
                    <Button
                      variant="outline"
                      onClick={() => handleClaimApplication(selectedApp)}
                      loading={actionLoading}
                      disabled={!isOnline}
                      icon={<FileSearch className="w-4 h-4 text-blue-600" />}
                    >
                      Claim Application
                    </Button>
                  )}

                {selectedApp.status !== 'approved' && selectedApp.status !== 'rejected' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleOpenReqDocsModal}
                      disabled={!isOnline}
                      icon={<HelpCircle className="w-4 h-4 text-purple-600" />}
                    >
                      Request Additional Docs
                    </Button>

                    <Button
                      variant="danger"
                      onClick={handleOpenRejectModal}
                      disabled={!isOnline}
                      icon={<XCircle className="w-4 h-4" />}
                    >
                      Reject Application
                    </Button>

                    <Button
                      variant="success"
                      onClick={handleOpenApproveModal}
                      disabled={!isOnline}
                      icon={<CheckCircle2 className="w-4 h-4" />}
                    >
                      Approve Application
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* REQUEST ADDITIONAL DOCUMENTS MODAL */}
      <Modal
        isOpen={isReqDocsModalOpen}
        onClose={() => setIsReqDocsModalOpen(false)}
        title="Request Additional Verification Documents"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <p className="text-slate-600 leading-relaxed">
            Specify what additional identity documents or clear photos <strong>{selectedApp?.fullName}</strong> must provide to complete identity verification.
          </p>

          <div className="space-y-1">
            <label className="font-bold text-slate-900 block">
              Required Documents / Remarks <span className="text-red-600">*</span>:
            </label>
            <textarea
              value={additionalDocsRemarks}
              onChange={(e) => setAdditionalDocsRemarks(e.target.value)}
              placeholder="e.g. Uploaded government ID photo is blurry. Please upload a high-resolution photo or a recent utility bill."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-purple-500"
              rows={3}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setIsReqDocsModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmReqDocs}
              loading={actionLoading}
            >
              Send Document Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* APPROVE ACTION CONFIRMATION MODAL */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve User Registration"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <p className="text-slate-600 leading-relaxed">
            Approving this application will transition <strong>{selectedApp?.fullName}</strong> to an{' '}
            <strong className="text-emerald-700">Active Account</strong>, create a verified resident record, and grant system access.
          </p>

          <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="font-bold text-slate-900 block">Assign Official User Role:</label>
            <select
              value={assignedRole}
              onChange={(e) => setAssignedRole(e.target.value as UserRole)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-800 text-xs"
            >
              <option value="resident">Resident (Community Citizen)</option>
              <option value="purokOfficial">Sitio/Purok Official (Field/Purok Representative)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-900 block">Approval Notes / Internal Remarks (Optional):</label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Identity verified via PhilSys ID / Barangay Residency Document."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setIsApproveModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleConfirmApproval}
              loading={actionLoading}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              Confirm & Activate Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* REJECT ACTION CONFIRMATION MODAL */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject User Registration"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <p className="text-slate-600 leading-relaxed">
            Please enter the official reason for declining <strong>{selectedApp?.fullName}</strong>'s registration application. This will be recorded in the audit trail.
          </p>

          <div className="space-y-1">
            <label className="font-bold text-slate-900 block">
              Mandatory Rejection Reason <span className="text-red-600">*</span>:
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Unreadable identity documents. Please register with valid government identity documents."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-red-500"
              rows={3}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setIsRejectModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmRejection}
              loading={actionLoading}
              icon={<XCircle className="w-4 h-4" />}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* LIGHTBOX FULLSCREEN IMAGE / PDF MODAL */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl p-4 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold text-slate-300">Identity Document Viewer</span>
              <button
                onClick={() => setLightboxImageUrl(null)}
                className="text-white font-bold text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-lg border border-slate-600 cursor-pointer"
              >
                ✕ Close Preview
              </button>
            </div>

            {lightboxImageUrl.toLowerCase().includes('.pdf') ? (
              <div className="text-center py-12 px-6 space-y-4">
                <FileCheck className="w-16 h-16 text-blue-400 mx-auto" />
                <p className="text-sm font-semibold text-white">PDF Verification Document</p>
                <a
                  href={lightboxImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors"
                >
                  Open PDF in New Window
                </a>
              </div>
            ) : (
              <img
                src={lightboxImageUrl}
                alt="Fullscreen Document"
                className="max-h-[75vh] max-w-full rounded-xl object-contain mx-auto border border-slate-800"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
