/**
 * Barangay Document & Certification Issuance System - List & Management Console
 * Aligned with Module 4 SRS specs & UDS design system.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isResidentMode, canExportCertificates } from '../utils/permissions';
import { useToast } from '../contexts/ToastContext';
import { certificateService } from '../services/certificateService';
import { CertificateRequest, CertificateType, CertificateStatus, PaymentStatus } from '../types';
import { CERTIFICATE_TYPES, ROUTES } from '../constants';
import { isCertificateOwner } from '../utils/jurisdictionUtils';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/foundation/Button';
import { TextInput } from '../components/forms/TextInput';
import { Badge } from '../components/foundation/Badge';
import { RequestCertificateModal } from '../components/certificates/RequestCertificateModal';
import { CreateCertificateModal } from '../components/certificates/CreateCertificateModal';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  Printer,
  DollarSign,
  Eye,
  X,
  FileCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { ExportCertificatesModal } from '../components/certificates/ExportCertificatesModal';

export const CertificatesListPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const isResident = isResidentMode(user, user?.role || null);
  const isStaff = !isResident && user && ['secretary', 'treasurer', 'executiveOfficer', 'admin', 'chairman'].includes(user.role);

  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Active page filters bundle passed to Export Modal
  const pageFilters = useMemo(
    () => ({
      selectedType,
      selectedStatus,
      searchQuery,
      userId: user?.uid,
      isStaff,
    }),
    [selectedType, selectedStatus, searchQuery, user?.uid, isStaff]
  );

  // Staff Create Modal & Resident Request Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);

  // Staff Processing Modal State
  const [processingCert, setProcessingCert] = useState<CertificateRequest | null>(null);
  const [targetStatus, setTargetStatus] = useState<CertificateStatus>('approved');
  const [orNumberInput, setOrNumberInput] = useState<string>('');
  const [paymentStatusInput, setPaymentStatusInput] = useState<PaymentStatus>('paid');
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [processingSubmitLoading, setProcessingSubmitLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isAuthInitialized) return;
    setLoading(true);
    const unsubscribe = certificateService.subscribeToCertificates(user, (data) => {
      let finalCertList: CertificateRequest[] = [];
      if (!isStaff && user) {
        finalCertList = data.filter((c) => isCertificateOwner(c, user));
      } else {
        finalCertList = data;
      }
      setCertificates(finalCertList);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, user?.uid, user?.role, isStaff]);

  // Filtered List
  const filteredCertificates = certificates.filter((cert) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (cert.fullName || '').toLowerCase().includes(q) ||
      (cert.requestNumber || '').toLowerCase().includes(q) ||
      (cert.controlNumber && cert.controlNumber.toLowerCase().includes(q)) ||
      (cert.purpose || '').toLowerCase().includes(q);

    const matchesType = selectedType === 'all' || cert.certificateType === selectedType;
    const matchesStatus =
      selectedStatus === 'all' ||
      cert.status === selectedStatus ||
      (selectedStatus === 'underReview' && cert.status === 'submitted') ||
      (selectedStatus === 'approved' && (cert.status === 'processing' || cert.status === 'approvedUnderProcess')) ||
      (selectedStatus === 'claimed' && cert.status === 'released');

    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate Metrics
  const pendingReview = certificates.filter((c) => c.status === 'submitted' || c.status === 'underReview').length;
  const approvedUnderProcess = certificates.filter(
    (c) => c.status === 'approved' || c.status === 'processing' || c.status === 'approvedUnderProcess'
  ).length;
  const readyForRelease = certificates.filter((c) => c.status === 'readyForRelease').length;
  const totalExpired = certificates.filter((c) => c.status === 'expired').length;
  const totalClaimed = certificates.filter((c) => c.status === 'released' || c.status === 'claimed').length;
  const totalRevenue = certificates
    .filter((c) => c.paymentStatus === 'paid')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const handleOpenProcessModal = (cert: CertificateRequest) => {
    setProcessingCert(cert);
    setOrNumberInput(cert.orNumber || '');
    setPaymentStatusInput(cert.paymentStatus);
    setRejectionReasonInput(cert.rejectionReason || '');
    if (cert.status === 'submitted' || cert.status === 'underReview') setTargetStatus('underReview');
    else if (cert.status === 'approved' || cert.status === 'processing' || cert.status === 'approvedUnderProcess') setTargetStatus('approved');
    else if (cert.status === 'readyForRelease') setTargetStatus('readyForRelease');
    else if (cert.status === 'claimed' || cert.status === 'released') setTargetStatus('claimed');
    else if (cert.status === 'expired') setTargetStatus('expired');
    else setTargetStatus('underReview');
  };

  const handleProcessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processingCert) return;

    if (targetStatus === 'rejected' && !rejectionReasonInput.trim()) {
      showToast('Please specify a rejection reason.', 'error');
      return;
    }

    setProcessingSubmitLoading(true);
    try {
      await certificateService.updateCertificateStatus(processingCert.certificateId, {
        status: targetStatus,
        paymentStatus: paymentStatusInput,
        orNumber: orNumberInput.trim() || undefined,
        rejectionReason: rejectionReasonInput.trim() || undefined,
        actorUserId: user?.uid || 'staff-user',
        actorUserName: user?.fullName || 'Barangay Staff',
      });

      showToast(`Document request ${processingCert.requestNumber} status updated!`, 'success');
      setProcessingCert(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to update document status.', 'error');
    } finally {
      setProcessingSubmitLoading(false);
    }
  };

  const getStatusBadge = (status: CertificateStatus) => {
    switch (status) {
      case 'submitted':
      case 'underReview':
        return <Badge variant="warning">Under Review</Badge>;
      case 'approved':
      case 'approvedUnderProcess':
      case 'processing':
        return <Badge variant="info">Approved / Under Process</Badge>;
      case 'readyForRelease':
        return <Badge variant="secondary">Ready for Release</Badge>;
      case 'released':
      case 'claimed':
        return <Badge variant="success">Claimed</Badge>;
      case 'expired':
        return <Badge variant="neutral">Expired</Badge>;
      case 'rejected':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Paid</span>;
      case 'waived':
        return <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200"><ShieldAlert className="w-3 h-3" /> Waived</span>;
      case 'unpaid':
      default:
        return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"><Clock className="w-3 h-3" /> Unpaid</span>;
    }
  };

  return (
    <PageContainer
      title="Document & Certification Issuance System"
      description="Manage official Barangay Clearances, Indigency, Residency, and Business Permits"
      headerActions={
        <div className="flex flex-wrap items-center gap-3">
          {canExportCertificates(user?.role) && (
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
              onClick={() => setIsExportModalOpen(true)}
            >
              Export to Excel
            </Button>
          )}
          <NavLink to={ROUTES.CERTIFICATE_VERIFY} state={{ from: `${location.pathname}${location.search}` }}>
            <Button variant="outline" size="sm" icon={<QrCode className="w-4 h-4" />}>
              Public Verification Portal
            </Button>
          </NavLink>
          {isResident && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsRequestModalOpen(true)}
            >
              Request Certificate
            </Button>
          )}
          {(user?.role === 'secretary' || user?.role === 'chairman') && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create Certificate
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Key Metrics & Filter Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Pending Review */}
          <button
            type="button"
            onClick={() => setSelectedStatus('underReview')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
              selectedStatus === 'underReview'
                ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500 ring-offset-2 -translate-y-0.5'
                : 'bg-white text-slate-900 border-slate-200 shadow-2xs hover:border-amber-300 hover:shadow-xs hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${selectedStatus === 'underReview' ? 'text-amber-100' : 'text-slate-500'}`}>
                Pending Review
              </span>
              <Clock className={`w-4 h-4 ${selectedStatus === 'underReview' ? 'text-white' : 'text-amber-600'}`} />
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${selectedStatus === 'underReview' ? 'text-white' : 'text-amber-700'}`}>
              {pendingReview}
            </p>
            <p className={`text-[11px] font-medium mt-1 ${selectedStatus === 'underReview' ? 'text-amber-100' : 'text-slate-500'}`}>
              Awaiting Verification
            </p>
          </button>

          {/* Card 2: Approved / Under Process */}
          <button
            type="button"
            onClick={() => setSelectedStatus('approved')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              selectedStatus === 'approved'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500 ring-offset-2 -translate-y-0.5'
                : 'bg-white text-slate-900 border-slate-200 shadow-2xs hover:border-blue-300 hover:shadow-xs hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${selectedStatus === 'approved' ? 'text-blue-100' : 'text-slate-500'}`}>
                Approved / Process
              </span>
              <CheckCircle2 className={`w-4 h-4 ${selectedStatus === 'approved' ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${selectedStatus === 'approved' ? 'text-white' : 'text-blue-700'}`}>
              {approvedUnderProcess}
            </p>
            <p className={`text-[11px] font-medium mt-1 ${selectedStatus === 'approved' ? 'text-blue-100' : 'text-slate-500'}`}>
              Processing & Payment
            </p>
          </button>

          {/* Card 3: Ready for Release */}
          <button
            type="button"
            onClick={() => setSelectedStatus('readyForRelease')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              selectedStatus === 'readyForRelease'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500 ring-offset-2 -translate-y-0.5'
                : 'bg-white text-slate-900 border-slate-200 shadow-2xs hover:border-indigo-300 hover:shadow-xs hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${selectedStatus === 'readyForRelease' ? 'text-indigo-100' : 'text-slate-500'}`}>
                Ready for Release
              </span>
              <FileCheck className={`w-4 h-4 ${selectedStatus === 'readyForRelease' ? 'text-white' : 'text-indigo-600'}`} />
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${selectedStatus === 'readyForRelease' ? 'text-white' : 'text-indigo-700'}`}>
              {readyForRelease}
            </p>
            <p className={`text-[11px] font-medium mt-1 ${selectedStatus === 'readyForRelease' ? 'text-indigo-100' : 'text-slate-500'}`}>
              Ready for Pickup/Print
            </p>
          </button>

          {/* Card 4: Expired */}
          <button
            type="button"
            onClick={() => setSelectedStatus('expired')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 ${
              selectedStatus === 'expired'
                ? 'bg-rose-700 text-white border-rose-700 shadow-md ring-2 ring-rose-600 ring-offset-2 -translate-y-0.5'
                : 'bg-white text-slate-900 border-slate-200 shadow-2xs hover:border-rose-300 hover:shadow-xs hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${selectedStatus === 'expired' ? 'text-rose-100' : 'text-slate-500'}`}>
                Expired
              </span>
              <AlertCircle className={`w-4 h-4 ${selectedStatus === 'expired' ? 'text-white' : 'text-rose-600'}`} />
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${selectedStatus === 'expired' ? 'text-white' : 'text-rose-700'}`}>
              {totalExpired}
            </p>
            <p className={`text-[11px] font-medium mt-1 ${selectedStatus === 'expired' ? 'text-rose-100' : 'text-slate-500'}`}>
              Validity Lapsed
            </p>
          </button>

          {/* Card 5: Issued / Claimed */}
          <button
            type="button"
            onClick={() => setSelectedStatus('claimed')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              selectedStatus === 'claimed'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500 ring-offset-2 -translate-y-0.5'
                : 'bg-white text-slate-900 border-slate-200 shadow-2xs hover:border-emerald-300 hover:shadow-xs hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${selectedStatus === 'claimed' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Issued / Claimed
              </span>
              <CheckCircle2 className={`w-4 h-4 ${selectedStatus === 'claimed' ? 'text-white' : 'text-emerald-600'}`} />
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${selectedStatus === 'claimed' ? 'text-white' : 'text-emerald-700'}`}>
              {totalClaimed}
            </p>
            <p className={`text-[11px] font-medium mt-1 ${selectedStatus === 'claimed' ? 'text-emerald-100' : 'text-slate-500'}`}>
              Completed Records
            </p>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <TextInput
                placeholder="Search by Applicant Name, Request No, Control No, or Purpose..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                prefixIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Certificate Types</option>
                {CERTIFICATE_TYPES.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="underReview">Under Review</option>
                <option value="approved">Approved / Under Process</option>
                <option value="readyForRelease">Ready for Release</option>
                <option value="claimed">Claimed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-medium">Loading document requests from Firestore...</p>
            </div>
          ) : filteredCertificates.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-base font-bold text-slate-800">No document requests found.</p>
              <p className="text-xs text-slate-500">
                Try clearing your search or filter parameters, or apply for a new certificate.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Request & Control No.</th>
                    <th className="py-3.5 px-4">Applicant & Purok</th>
                    <th className="py-3.5 px-4">Certificate Type</th>
                    <th className="py-3.5 px-4">Fee & Payment</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredCertificates.map((cert) => {
                    const certMeta = CERTIFICATE_TYPES.find((ct) => ct.id === cert.certificateType);
                    return (
                      <tr key={cert.certificateId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-mono font-bold text-blue-900">
                          <div>{cert.requestNumber}</div>
                          {cert.controlNumber && (
                            <div className="text-[11px] text-slate-500 font-normal">{cert.controlNumber}</div>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900">{cert.fullName}</div>
                          <div className="text-xs text-slate-500">{cert.purok || 'Purok 1'}</div>
                        </td>

                        <td className="py-4 px-4 font-semibold text-slate-800">
                          {certMeta?.label || cert.certificateType}
                        </td>

                        <td className="py-4 px-4 space-y-1">
                          <div className="font-bold text-slate-900">
                            {cert.amount > 0 ? `₱${cert.amount}` : 'Free'}
                          </div>
                          <div>{getPaymentBadge(cert.paymentStatus)}</div>
                        </td>

                        <td className="py-4 px-4">{getStatusBadge(cert.status)}</td>

                        <td className="py-4 px-4 text-xs text-slate-500">
                          {new Date(cert.createdAt).toLocaleDateString()}
                        </td>

                        <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                          <NavLink to={ROUTES.CERTIFICATE_DETAILS(cert.certificateId)}>
                            <Button variant="ghost" size="sm" icon={<Eye className="w-3.5 h-3.5" />}>
                              Details
                            </Button>
                          </NavLink>

                          {isStaff && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenProcessModal(cert)}
                            >
                              Process
                            </Button>
                          )}

                          {(cert.status === 'approved' || cert.status === 'readyForRelease' || cert.status === 'released' || cert.status === 'claimed') && (
                            <NavLink to={ROUTES.CERTIFICATE_PRINT(cert.certificateId)}>
                              <Button variant="secondary" size="sm" icon={<Printer className="w-3.5 h-3.5" />}>
                                Print
                              </Button>
                            </NavLink>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Staff Processing Modal */}
      {processingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Process Certificate Request</h3>
                <p className="text-xs text-slate-500 font-mono">{processingCert.requestNumber} - {processingCert.fullName}</p>
              </div>
              <button
                onClick={() => setProcessingCert(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {processingCert.status === 'claimed' || processingCert.status === 'released' ? (
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium space-y-1">
                  <p className="font-bold text-amber-950 text-sm">This certificate has already been claimed.</p>
                  <p>Further status changes are disabled.</p>
                </div>
                <div className="flex items-center justify-end pt-4 border-t border-slate-100">
                  <Button type="button" variant="outline" onClick={() => setProcessingCert(null)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProcessSubmit} className="space-y-4">
                {/* Target Status Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Update Request Status
                  </label>
                  <select
                    value={targetStatus}
                    onChange={(e) => {
                      const newStatus = e.target.value as CertificateStatus;
                      setTargetStatus(newStatus);
                      if (newStatus === 'claimed' && paymentStatusInput === 'unpaid') {
                        setPaymentStatusInput('paid');
                      }
                    }}
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="underReview">Under Review</option>
                    <option value="approved">Approved / Under Process</option>
                    <option value="readyForRelease">Ready for Release / Pick-Up</option>
                    <option value="claimed">Claimed</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                {/* Payment Status & Official Receipt (OR) Number */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                      Payment Status
                    </label>
                    <select
                      value={paymentStatusInput}
                      onChange={(e) => setPaymentStatusInput(e.target.value as PaymentStatus)}
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="waived">Waived (Indigent)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                      OR Number
                    </label>
                    <input
                      type="text"
                      value={orNumberInput}
                      onChange={(e) => setOrNumberInput(e.target.value)}
                      placeholder="OR-2026-XXXX"
                      className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button type="button" variant="outline" onClick={() => setProcessingCert(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={processingSubmitLoading}>
                    Save Updates
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Staff Create Certificate Modal */}
      <CreateCertificateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {}}
      />

      {/* Resident Certificate Request Modal */}
      <RequestCertificateModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={() => {}}
      />

      {/* Certificate Export Modal */}
      <ExportCertificatesModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        rawCertificates={certificates}
        pageFilters={pageFilters}
      />
    </PageContainer>
  );
};
