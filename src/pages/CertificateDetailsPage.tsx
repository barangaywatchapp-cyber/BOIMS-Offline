/**
 * Certificate Details Page
 * Complete request information view, staff processing controls, supporting document attachments, and embedded official certificate renderer.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { certificateService } from '../services/certificateService';
import { CertificateRequest, CertificateStatus, PaymentStatus } from '../types';
import { CERTIFICATE_TYPES, ROUTES, ROLE_LABELS } from '../constants';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import { PrintableCertificate } from '../components/certificates/PrintableCertificate';
import {
  FileText,
  User,
  Phone,
  Mail,
  Home,
  CheckCircle2,
  Clock,
  Printer,
  QrCode,
  DollarSign,
  ArrowLeft,
  XCircle,
  FileCheck,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export const CertificateDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthInitialized } = useAuth();
  const { showToast } = useToast();

  const isStaff = user && ['secretary', 'treasurer', 'executiveOfficer', 'admin', 'chairman'].includes(user.role);

  const [certificate, setCertificate] = useState<CertificateRequest | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Staff Update Console State
  const [targetStatus, setTargetStatus] = useState<CertificateStatus>('approved');
  const [orNumberInput, setOrNumberInput] = useState<string>('');
  const [paymentStatusInput, setPaymentStatusInput] = useState<PaymentStatus>('paid');
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [claimMethodInput, setClaimMethodInput] = useState<string>('In-Person Pick Up');
  const [updating, setUpdating] = useState<boolean>(false);

  const loadDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await certificateService.getCertificateById(id);
      if (data) {
        setCertificate(data);
        setOrNumberInput(data.orNumber || '');
        setPaymentStatusInput(data.paymentStatus);
        setRejectionReasonInput(data.rejectionReason || '');
        setClaimMethodInput(data.claimMethod || 'In-Person Pick Up');
        
        // Suggest next status step
        if (data.status === 'submitted' || data.status === 'underReview') setTargetStatus('underReview');
        else if (data.status === 'approved' || data.status === 'processing' || data.status === 'approvedUnderProcess') setTargetStatus('approved');
        else if (data.status === 'readyForRelease') setTargetStatus('readyForRelease');
        else if (data.status === 'claimed' || data.status === 'released') setTargetStatus('claimed');
        else if (data.status === 'expired') setTargetStatus('expired');
        else setTargetStatus(data.status);
      } else {
        showToast('Certificate request not found.', 'error');
        navigate(ROUTES.CERTIFICATES);
      }
    } catch (err) {
      console.error('Error loading certificate details:', err);
      showToast('Failed to load certificate details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    loadDetails();
  }, [id, isAuthInitialized]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificate) return;

    if (targetStatus === 'rejected' && !rejectionReasonInput.trim()) {
      showToast('Please specify a rejection reason.', 'error');
      return;
    }

    setUpdating(true);
    try {
      const updated = await certificateService.updateCertificateStatus(certificate.certificateId, {
        status: targetStatus,
        paymentStatus: paymentStatusInput,
        orNumber: orNumberInput.trim() || undefined,
        rejectionReason: rejectionReasonInput.trim() || undefined,
        claimMethod: targetStatus === 'claimed' || targetStatus === 'released' ? claimMethodInput : undefined,
        actorUserId: user?.uid || 'staff-user',
        actorUserName: user?.fullName || 'Barangay Staff',
      });

      setCertificate(updated);
      showToast(`Request ${updated.requestNumber} status updated to ${targetStatus}!`, 'success');
      navigate(ROUTES.CERTIFICATES);
    } catch (err: any) {
      showToast(err.message || 'Failed to update request.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="Document Request Details" description="Loading document details...">
        <div className="p-16 text-center text-slate-500 space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-medium">Fetching request record from Firestore...</p>
        </div>
      </PageContainer>
    );
  }

  if (!certificate) return null;

  const certTypeMeta = CERTIFICATE_TYPES.find((ct) => ct.id === certificate.certificateType);

  return (
    <PageContainer
      title={`Request ${certificate.requestNumber}`}
      description={`${certTypeMeta?.label || certificate.certificateType} - ${certificate.fullName}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <NavLink to={ROUTES.CERTIFICATES}>
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              Back to List
            </Button>
          </NavLink>
          <NavLink to={`${ROUTES.CERTIFICATE_VERIFY}?token=${certificate.qrVerificationToken}`} state={{ from: `${location.pathname}${location.search}` }}>
            <Button variant="outline" size="sm" icon={<QrCode className="w-4 h-4" />}>
              Verify QR Code
            </Button>
          </NavLink>
          {(certificate.status === 'approved' || certificate.status === 'readyForRelease' || certificate.status === 'released' || certificate.status === 'claimed') && (
            <NavLink to={ROUTES.CERTIFICATE_PRINT(certificate.certificateId)}>
              <Button variant="primary" size="sm" icon={<Printer className="w-4 h-4" />}>
                Print Document
              </Button>
            </NavLink>
          )}
        </div>
      }
    >
      <div className="space-y-8">
        
        {/* Header Summary Banner */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xl font-extrabold text-blue-950 font-mono">
                  {certificate.requestNumber}
                </span>
                <Badge
                  variant={
                    certificate.status === 'claimed' || certificate.status === 'released'
                      ? 'success'
                      : certificate.status === 'expired' || certificate.status === 'rejected'
                      ? 'danger'
                      : certificate.status === 'readyForRelease'
                      ? 'secondary'
                      : certificate.status === 'approved' || certificate.status === 'processing' || certificate.status === 'approvedUnderProcess'
                      ? 'info'
                      : 'warning'
                  }
                >
                  {certificate.status === 'submitted' || certificate.status === 'underReview'
                    ? 'UNDER REVIEW'
                    : certificate.status === 'approved' || certificate.status === 'processing' || certificate.status === 'approvedUnderProcess'
                    ? 'APPROVED / UNDER PROCESS'
                    : certificate.status === 'readyForRelease'
                    ? 'READY FOR RELEASE'
                    : certificate.status === 'claimed' || certificate.status === 'released'
                    ? 'CLAIMED'
                    : certificate.status === 'expired'
                    ? 'EXPIRED'
                    : certificate.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Created on {new Date(certificate.createdAt).toLocaleString()} &bull; Control No: {certificate.controlNumber || 'N/A'}
              </p>
            </div>

            <div className="flex items-center gap-4 text-sm font-bold text-slate-800 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
              <span>Fee: {certificate.amount > 0 ? `₱${certificate.amount}` : 'Free'}</span>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs ${
                certificate.paymentStatus === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : certificate.paymentStatus === 'waived'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {certificate.paymentStatus.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Rejection Alert Banner if applicable */}
          {certificate.status === 'rejected' && certificate.rejectionReason && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-900 text-sm">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Request Rejected:</strong>
                <span>{certificate.rejectionReason}</span>
              </div>
            </div>
          )}
        </div>

        {/* 2-Column Grid: Left (Applicant Info & Docs), Right (Staff Processing Console) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Applicant Profile & Supporting Documents */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Applicant Profile Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Applicant Details
              </h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">Full Name</span>
                  <span className="font-bold text-slate-900">{certificate.fullName}</span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-medium block">Purok / Residence</span>
                  <span className="font-semibold text-slate-800">{certificate.purok || 'Purok 1'}</span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-medium block">Email Address</span>
                  <span className="font-medium text-slate-700">{certificate.email}</span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-medium block">Phone Number</span>
                  <span className="font-medium text-slate-700">{certificate.phoneNumber}</span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-medium block">Civil Status</span>
                  <span className="font-medium text-slate-700">{certificate.civilStatus || 'Single'}</span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-medium block">Residency Duration</span>
                  <span className="font-medium text-slate-700">{certificate.yearsOfResidency || 1} Year(s)</span>
                </div>

                {certificate.businessName && (
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium block">Business / Establishment</span>
                    <span className="font-bold text-blue-900">{certificate.businessName}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1">
                <span className="text-xs text-slate-500 font-medium block">Purpose of Request</span>
                <p className="text-sm font-semibold text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {certificate.purpose}
                </p>
              </div>

              {certificate.remarks && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium block">Additional Remarks</span>
                  <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-xl">
                    {certificate.remarks}
                  </p>
                </div>
              )}
            </div>

            {/* Attached Supporting Documents */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Supporting Documents (Valid ID / Cedula)
              </h3>

              {certificate.supportingDocuments && certificate.supportingDocuments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {certificate.supportingDocuments.map((docUrl, idx) => (
                    <a
                      key={idx}
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-2xs hover:border-blue-500 transition-all"
                    >
                      <img src={docUrl} alt={`Doc ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                        <ExternalLink className="w-3.5 h-3.5" /> View Full
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  No supporting image attachments uploaded.
                </p>
              )}
            </div>

          </div>

          {/* Right Column: Staff Management Console */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Staff Status Update Box */}
            {isStaff ? (
              <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-5">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold">Barangay Staff Processing Console</h3>
                    <p className="text-xs text-slate-400">Authorized for Secretary, Treasurer & Admin</p>
                  </div>
                </div>

                {certificate.status === 'claimed' || certificate.status === 'released' ? (
                  <div className="p-4 bg-amber-900/40 border border-amber-600/50 rounded-2xl text-xs text-amber-200 font-medium space-y-1">
                    <p className="font-bold text-amber-100 text-sm">This certificate has already been claimed.</p>
                    <p>Further status changes are disabled.</p>
                  </div>
                ) : (
                  <form onSubmit={handleUpdateStatus} className="space-y-4 text-slate-800">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
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
                        className="w-full h-11 px-3.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-white focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="underReview">Under Review</option>
                        <option value="approved">Approved / Under Process</option>
                        <option value="readyForRelease">Ready for Release / Pick-Up</option>
                        <option value="claimed">Claimed</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                          Payment Status
                        </label>
                        <select
                          value={paymentStatusInput}
                          onChange={(e) => setPaymentStatusInput(e.target.value as PaymentStatus)}
                          className="w-full h-11 px-3.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-white focus:ring-2 focus:ring-blue-400"
                        >
                          <option value="paid">Paid</option>
                          <option value="unpaid">Unpaid</option>
                          <option value="waived">Waived (Indigent)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                          OR Number
                        </label>
                        <input
                          type="text"
                          value={orNumberInput}
                          onChange={(e) => setOrNumberInput(e.target.value)}
                          placeholder="OR-2026-XXXX"
                          className="w-full h-11 px-3.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono text-white focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full justify-center"
                      loading={updating}
                    >
                      Apply Status Changes
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <div className="bg-blue-50 p-6 rounded-3xl border border-blue-200 space-y-3">
                <h4 className="font-bold text-sm text-blue-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-700" />
                  Resident Request Tracker
                </h4>
                <p className="text-xs text-blue-900 leading-relaxed">
                  Your certificate request is currently <strong className="uppercase">{certificate.status}</strong>. Please present a valid ID at the Barangay Hall when claiming your printed copy.
                </p>
              </div>
            )}

            {/* Official Control & Verification Metadata */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-slate-600">
                <span>Control Number</span>
                <span className="font-bold text-slate-900">{certificate.controlNumber || 'CTRL-BC-2026-0000'}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-slate-600">
                <span>Official Receipt (OR)</span>
                <span className="font-bold text-slate-900">{certificate.orNumber || 'N/A'}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-slate-600">
                <span>Verification QR Token</span>
                <span className="font-bold text-blue-700">{certificate.qrVerificationToken}</span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>Issuing Authority</span>
                <span className="font-bold text-slate-900">{certificate.issuedByName || 'Barangay Central Admin'}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Embedded Official Printable Certificate Preview */}
        <div className="pt-8 border-t border-slate-200 space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-700" />
            Official Printable Certification Preview
          </h3>

          <PrintableCertificate
            certificate={certificate}
            onPrint={() => navigate(ROUTES.CERTIFICATES + '/' + certificate.certificateId + '/print')}
          />
        </div>

      </div>
    </PageContainer>
  );
};
