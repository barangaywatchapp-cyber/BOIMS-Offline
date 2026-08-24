/**
 * Page: PendingVerificationPage
 * Rendered when a user with account status 'pending' logs into BOIMS.
 * Displays application status, real email verification state, resend email option,
 * refresh status, authenticated Firebase Storage document uploads, and resubmission workflow.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { registrationService } from '../services/registrationService';
import { storageService, validateRegistrationDocumentFile } from '../services/storageService';
import { RegistrationApplication } from '../types';
import { APP_METADATA, ROUTES } from '../constants';
import {
  Shield,
  Clock,
  AlertTriangle,
  FileCheck,
  PhoneCall,
  LogOut,
  CheckCircle,
  RefreshCw,
  Mail,
  Upload,
  Send,
  X,
  XCircle,
  Eye,
  FileText,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';

interface DocumentSlotConfig {
  key: 'idFront' | 'idBack' | 'selfie' | 'residencyProof' | 'appointmentProof';
  urlKey: 'idFrontUrl' | 'idBackUrl' | 'selfieUrl' | 'residencyProofUrl' | 'appointmentProofUrl';
  title: string;
  description: string;
  required: boolean;
  docType: string;
  allowedTypes: string;
}

export const PendingVerificationPage: React.FC = () => {
  const { user, logout, refreshUser, isAuthInitialized } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState<RegistrationApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Email Verification UI
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Document Uploads State
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Lightbox Modal
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Resubmit Modal UI
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitType, setResubmitType] = useState<string>('idFront');
  const [resubmitNotes, setResubmitNotes] = useState<string>('');
  const [submittingDocs, setSubmittingDocs] = useState(false);

  const loadApplication = async () => {
    if (!user) return;
    try {
      setRefreshing(true);
      setEmailMsg(null);

      // Reload auth user and sync real email verification state
      await registrationService.syncEmailVerificationStatus(user.uid);
      await refreshUser();

      const app = await registrationService.getRegistrationById(user.uid);
      setApplication(app);

      // If application approved or user active, redirect
      if (app?.status === 'approved') {
        navigate(ROUTES.DASHBOARD);
      }
    } catch (e) {
      console.warn('Failed to load registration app:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    loadApplication();
  }, [isAuthInitialized, user?.uid]);

  const handleResendEmail = async () => {
    const targetEmail = auth.currentUser?.email || user?.email;
    if (!targetEmail) return;
    try {
      setEmailSending(true);
      setEmailMsg(null);
      if (auth.currentUser) {
        const actionCodeSettings = {
          url: `${window.location.origin}/verify-email`,
          handleCodeInApp: true,
        };
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
      } else {
        throw new Error('Please sign in to resend your verification email.');
      }
      setEmailMsg({
        type: 'success',
        text: `A fresh Firebase verification link has been sent to ${targetEmail}. Please check your inbox and spam folder.`,
      });
    } catch (err: any) {
      console.error('Failed to resend verification email:', err);
      setEmailMsg({
        type: 'error',
        text: err.message || 'Failed to send verification email. Please try again shortly.',
      });
    } finally {
      setEmailSending(false);
    }
  };

  // Direct Authenticated Document Upload Slot Handler
  const handleSlotFileUpload = async (
    slotKey: 'idFront' | 'idBack' | 'selfie' | 'residencyProof' | 'appointmentProof',
    urlKey: 'idFrontUrl' | 'idBackUrl' | 'selfieUrl' | 'residencyProofUrl' | 'appointmentProofUrl',
    docType: string,
    file: File
  ) => {
    if (!user || !application) return;

    try {
      validateRegistrationDocumentFile(file);
      setUploadingSlot(slotKey);
      setUploadFeedback(null);
      setUploadProgress((prev) => ({ ...prev, [slotKey]: 5 }));

      const downloadUrl = await storageService.uploadRegistrationDocument(
        user.uid,
        file,
        docType,
        (pct) => {
          setUploadProgress((prev) => ({ ...prev, [slotKey]: pct }));
        }
      );

      // Persist URL to Firestore /registrations/{uid}
      await registrationService.updateRegistrationDocuments(user.uid, {
        [urlKey]: downloadUrl,
      });

      // Update local state immediately
      setApplication((prev) => (prev ? { ...prev, [urlKey]: downloadUrl } : null));

      setUploadFeedback({
        type: 'success',
        message: `Successfully uploaded ${docType.replace('_', ' ')} to Firebase Storage.`,
      });
    } catch (err: any) {
      console.error(`[PendingVerificationPage] Upload failed for ${slotKey}:`, err);
      setUploadFeedback({
        type: 'error',
        message: err.message || 'Failed to upload document.',
      });
    } finally {
      setUploadingSlot(null);
      setUploadProgress((prev) => ({ ...prev, [slotKey]: 0 }));
    }
  };

  const handleResubmitDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !application) return;

    if (!resubmitFile && !resubmitNotes.trim()) {
      alert('Please select a file to upload or enter explanatory notes.');
      return;
    }

    try {
      setSubmittingDocs(true);
      let uploadedUrl = '';
      const fileToUpload = resubmitFile;
      if (fileToUpload) {
        uploadedUrl = await storageService.uploadRegistrationDocument(
          user.uid,
          fileToUpload,
          resubmitType
        );
      }

      await registrationService.resubmitDocuments(user.uid, {
        documentUrl: uploadedUrl,
        documentType: resubmitType,
        notes: resubmitNotes,
      });

      alert('Additional documents submitted successfully! Your application is now back under review.');
      setShowResubmitModal(false);
      await loadApplication();
    } catch (err: any) {
      console.error('Resubmission error:', err);
      alert(err.message || 'Failed to resubmit documents.');
    } finally {
      setSubmittingDocs(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const isEmailVerifiedInAuth = auth.currentUser?.emailVerified || application?.emailVerified;
  const isPurokOfficial = application?.registrationType === 'purokOfficial' || user?.role === 'purokOfficial';

  // Configured slots based on role
  const documentSlots: DocumentSlotConfig[] = [
    {
      key: 'idFront',
      urlKey: 'idFrontUrl',
      title: '1. Government ID (Front Photo)',
      description: application?.idType ? `Valid ID Type: ${application.idType} (No: ${application.idNumber || 'N/A'})` : 'Valid Government ID front image',
      required: true,
      docType: 'id_front',
      allowedTypes: 'image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf',
    },
    {
      key: 'idBack',
      urlKey: 'idBackUrl',
      title: '2. Government ID (Back Photo / Optional)',
      description: 'Back side of Government ID or barcode/signature page',
      required: false,
      docType: 'id_back',
      allowedTypes: 'image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf',
    },
    ...(!isPurokOfficial
      ? [
          {
            key: 'selfie' as const,
            urlKey: 'selfieUrl' as const,
            title: '3. Facial Selfie with ID',
            description: 'Clear portrait photo of applicant holding the identification card',
            required: false,
            docType: 'selfie',
            allowedTypes: 'image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,.jpg,.jpeg,.jfif,.png,.webp',
          },
        ]
      : [
          {
            key: 'residencyProof' as const,
            urlKey: 'residencyProofUrl' as const,
            title: '3. Proof of Barangay Residency',
            description: 'Barangay Certificate of Residency or utility billing statement',
            required: true,
            docType: 'proof_residency',
            allowedTypes: 'image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf',
          },
          {
            key: 'appointmentProof' as const,
            urlKey: 'appointmentProofUrl' as const,
            title: '4. Proof of Official Appointment',
            description: 'Appointment Order, Designation Paper, or Barangay Chairman Endorsement',
            required: true,
            docType: 'proof_appointment',
            allowedTypes: 'image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf',
          },
        ]),
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-inner">
            <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Account Pending Verification
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality} Portal
          </p>
        </div>

        {/* Main Status Container */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Status Alert Header */}
          {application?.status === 'needs_additional_docs' ? (
            <Alert type="warning">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-200 text-sm">Action Required: Additional Documents Requested</p>
                  <p className="text-xs text-amber-300/90 mt-1 font-medium">
                    Remarks: &quot;{application.additionalDocsRemarks || 'Please upload a clearer ID copy.'}&quot;
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-3 bg-amber-600 hover:bg-amber-500 text-white"
                    onClick={() => setShowResubmitModal(true)}
                    icon={<Upload className="w-3.5 h-3.5" />}
                  >
                    Resubmit Requested Document
                  </Button>
                </div>
              </div>
            </Alert>
          ) : (
            <Alert type="warning">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-200 text-sm">Application Under Review</p>
                  <p className="text-xs text-amber-300/80 mt-1">
                    Your self-registration request is currently pending verification by Barangay Verification Officers. You can upload or update your required identity documents below.
                  </p>
                </div>
              </div>
            </Alert>
          )}

          {/* Email Verification Status Banner */}
          <div className={`p-4 rounded-xl border ${isEmailVerifiedInAuth ? 'bg-emerald-950/40 border-emerald-800/50' : 'bg-amber-950/40 border-amber-800/50'} space-y-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className={`w-4 h-4 ${isEmailVerifiedInAuth ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="text-xs font-bold text-white">Email Address Ownership:</span>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isEmailVerifiedInAuth ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700' : 'bg-amber-900/80 text-amber-300 border border-amber-700'}`}>
                {isEmailVerifiedInAuth ? 'Verified & Authenticated' : 'Verification Pending'}
              </span>
            </div>

            {!isEmailVerifiedInAuth && (
              <div className="text-xs text-amber-200/80 space-y-2 pt-1">
                <p>
                  A confirmation link was sent to <strong className="text-white font-mono">{user?.email}</strong>. You must verify your email before your registration can be formally approved.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={emailSending}
                    onClick={handleResendEmail}
                    icon={<Send className="w-3 h-3 text-amber-400" />}
                  >
                    Resend Verification Email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={refreshing}
                    onClick={loadApplication}
                    icon={<RefreshCw className="w-3 h-3 text-blue-400" />}
                  >
                    I Verified, Refresh Status
                  </Button>
                </div>
              </div>
            )}

            {emailMsg && (
              <p className={`text-xs mt-2 ${emailMsg.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {emailMsg.text}
              </p>
            )}
          </div>

          {/* Identity & Verification Documents Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-blue-400" />
                  Verification Documents (Firebase Storage)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Authenticated uploads are archived securely under your personal account path.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                UID: {user?.uid.substring(0, 10)}...
              </span>
            </div>

            {uploadFeedback && (
              <div className={`p-3 rounded-lg text-xs font-semibold ${uploadFeedback.type === 'success' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'}`}>
                {uploadFeedback.message}
              </div>
            )}

            <div className="space-y-3">
              {documentSlots.map((slot) => {
                const currentUrl = application?.[slot.urlKey];
                const isUploading = uploadingSlot === slot.key;
                const progressPct = uploadProgress[slot.key] || 0;

                return (
                  <div
                    key={slot.key}
                    className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{slot.title}</span>
                        {slot.required && <span className="text-[10px] text-red-400 font-bold">*</span>}
                        {currentUrl ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-900/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Attached
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                            Missing / Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{slot.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {currentUrl && (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(currentUrl)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      )}

                      <label className={`relative inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${isUploading ? 'bg-blue-800 text-white cursor-not-allowed' : currentUrl ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploading ? `Uploading (${progressPct}%)` : currentUrl ? 'Replace' : 'Upload File'}</span>
                        <input
                          type="file"
                          accept={slot.allowedTypes}
                          disabled={isUploading}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleSlotFileUpload(slot.key, slot.urlKey, slot.docType, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User & Application Summary */}
          <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Applicant Name</span>
                <span className="text-base font-bold text-white">{user?.fullName || 'Registered Applicant'}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Reference UID</span>
                <span className="text-xs font-mono font-semibold text-blue-400">{user?.uid}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Applied Role:</span>
                <span className="font-bold text-white uppercase tracking-wider bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50 inline-block mt-0.5">
                  {user?.role || 'resident'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Sitio / Purok:</span>
                <span className="font-bold text-slate-200">{user?.purok || 'Purok 1'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Registered Email:</span>
                <span className="font-mono text-slate-300">{user?.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Application Status:</span>
                <span className="font-bold text-amber-300 uppercase tracking-wider">
                  {application?.status ? application.status.replace('_', ' ') : 'PENDING'}
                </span>
              </div>
            </div>
          </div>

          {/* Support Contacts & Actions */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-slate-700/80 pt-4 gap-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-blue-400" />
              <span>Barangay Helpdesk: <strong>(02) 8912-3456</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadApplication}
                loading={refreshing}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Status
              </Button>
            </div>
          </div>

          {/* Sign Out */}
          <div className="pt-2">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={handleLogout}
              icon={<LogOut className="w-4 h-4" />}
            >
              Sign Out Session
            </Button>
          </div>
        </div>
      </div>

      {/* Lightbox Preview Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-400" /> Document Preview
              </h4>
              <button
                onClick={() => setLightboxUrl(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-slate-950 rounded-xl p-3 min-h-[300px]">
              {lightboxUrl.toLowerCase().includes('.pdf') ? (
                <div className="text-center space-y-3 py-8">
                  <FileText className="w-16 h-16 text-blue-400 mx-auto" />
                  <p className="text-xs text-slate-300">PDF Document Attached</p>
                  <a
                    href={lightboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg"
                  >
                    Open PDF in New Window
                  </a>
                </div>
              ) : (
                <img
                  src={lightboxUrl}
                  alt="Document Full Preview"
                  className="max-h-[70vh] max-w-full rounded object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resubmit Documents Modal */}
      {showResubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-400" />
                Resubmit Verification Documents
              </h3>
              <button
                onClick={() => setShowResubmitModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResubmitDocs} className="space-y-4">
              <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3 text-xs text-blue-200">
                <span className="font-bold text-blue-300 block mb-0.5">
                  Authenticated Firebase Storage Upload
                </span>
                <p className="text-[11px] text-blue-200/80">
                  Updated document files will be uploaded directly to Firebase Storage under your account path.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Document Type to Update
                </label>
                <select
                  value={resubmitType}
                  onChange={(e) => setResubmitType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="idFront">Government ID (Front)</option>
                  <option value="idBack">Government ID (Back)</option>
                  <option value="selfie">Facial Proof Selfie</option>
                  <option value="supportingDoc">Supporting Document</option>
                  <option value="residencyProof">Residency Proof Document</option>
                  <option value="appointmentProof">Official Appointment Proof</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Upload Updated File (JPG, PNG, WEBP, or PDF)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf"
                  onChange={(e) => setResubmitFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Explanatory Remarks / Notes for Verifier
                </label>
                <textarea
                  rows={3}
                  value={resubmitNotes}
                  onChange={(e) => setResubmitNotes(e.target.value)}
                  placeholder="Explain any corrections or detail your uploaded replacement document..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowResubmitModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submittingDocs}
                  icon={<Send className="w-4 h-4" />}
                >
                  Submit Updated Documents
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
