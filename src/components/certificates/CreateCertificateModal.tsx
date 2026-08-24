/**
 * Official Create Certificate Modal for Staff (Secretary / Chairman)
 * Allows authorized staff to directly create, encode, and issue official Barangay Certificate records.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { certificateService } from '../../services/certificateService';
import { storageService } from '../../services/storageService';
import { CERTIFICATE_TYPES, PUROK_OPTIONS } from '../../constants';
import { CertificateType, CertificateStatus, PaymentStatus } from '../../types';
import { Button } from '../foundation/Button';
import { TextInput } from '../forms/TextInput';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  FileText,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Phone,
  Mail,
  Briefcase,
  ShieldCheck,
  DollarSign,
  FileCheck,
  Clock,
} from 'lucide-react';

const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

interface CreateCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateCertificateModal: React.FC<CreateCertificateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('0917-000-0000');
  const [purok, setPurok] = useState<string>('Purok 1');
  const [civilStatus, setCivilStatus] = useState('Single');
  const [yearsOfResidency, setYearsOfResidency] = useState<number>(5);
  const [certificateType, setCertificateType] = useState<CertificateType>('barangayClearance');
  const [businessName, setBusinessName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');

  // Staff specific options
  const [status, setStatus] = useState<CertificateStatus>('approved');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [amount, setAmount] = useState<number>(50);
  const [orNumber, setOrNumber] = useState<string>('');

  // Attached files state
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setEmail('');
      setPhoneNumber('0917-000-0000');
      setPurok('Purok 1');
      setCivilStatus('Single');
      setYearsOfResidency(5);
      setCertificateType('barangayClearance');
      setBusinessName('');
      setPurpose('');
      setRemarks('');
      setStatus('approved');
      setPaymentStatus('paid');
      setAmount(50);
      setOrNumber(`OR-2026-${Math.floor(1000 + Math.random() * 9000)}`);
      setSelectedFiles([]);
      setError('');
    }
  }, [isOpen]);

  // Update default fee when certificate type changes
  useEffect(() => {
    const meta = CERTIFICATE_TYPES.find((ct) => ct.id === certificateType);
    if (meta) {
      setAmount(meta.defaultFee);
      if (meta.defaultFee === 0) {
        setPaymentStatus('waived');
      } else {
        setPaymentStatus('paid');
      }
    }
  }, [certificateType]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newItems = filesArray.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file as Blob),
      }));
      setSelectedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim() || !purpose.trim()) {
      setError('Please fill in applicant full name and purpose of request.');
      return;
    }

    if (certificateType === 'businessClearance' && !businessName.trim()) {
      setError('Business Name is required for Barangay Business Clearance.');
      return;
    }

    setLoading(true);

    try {
      const tempId = `cert-upload-${Date.now()}`;
      let uploadedDocUrls: string[] = [];

      if (selectedFiles.length > 0 && isOnline) {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadStatusText('Uploading supporting documents...');

        const filesToUpload = selectedFiles.map((f) => f.file);
        uploadedDocUrls = await storageService.uploadMultipleReportImages(
          filesToUpload,
          tempId,
          (progress, fileName) => {
            setUploadProgress(progress);
            setUploadStatusText(`Uploading ${fileName} (${progress}%)...`);
          }
        );
        setIsUploading(false);
      }

      const created = await certificateService.createCertificateRequest({
        userId: user?.uid || 'staff-user',
        performerUserId: user?.uid,
        performerName: user?.fullName || 'Barangay Staff',
        performerRole: user?.role || 'secretary',
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        purok,
        civilStatus,
        yearsOfResidency,
        businessName: businessName.trim(),
        certificateType,
        purpose: purpose.trim(),
        remarks: remarks.trim(),
        supportingDocuments: uploadedDocUrls,
        status,
        paymentStatus,
        amount,
        orNumber: orNumber.trim(),
      });

      if (!isOnline) {
        showToast('Certificate created offline. Will sync when network is restored.', 'warning');
      } else {
        showToast(`Certificate record ${created.requestNumber} created successfully!`, 'success');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating certificate:', err);
      setError(err.message || 'Failed to create certificate record.');
    } finally {
      setLoading(false);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-600" />
              Create Official Certificate Record
            </h2>
            <p className="text-xs text-slate-500">
              Encode and issue an official Barangay Certificate directly on behalf of a resident
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 text-sm font-semibold">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form id="create-cert-form" onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Certificate Specification */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                1. Select Certificate Type
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CERTIFICATE_TYPES.map((ct) => {
                  const isSelected = certificateType === ct.id;
                  return (
                    <div
                      key={ct.id}
                      onClick={() => setCertificateType(ct.id as CertificateType)}
                      className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">{ct.label}</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            ct.defaultFee === 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {ct.defaultFee === 0 ? 'Free' : `₱${ct.defaultFee}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{ct.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Applicant Profile Details */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                2. Applicant / Resident Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Applicant Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Juan De La Cruz"
                  required
                  prefixIcon={<User className="w-4 h-4" />}
                />

                <TextInput
                  label="Email Address (Optional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@example.com"
                  prefixIcon={<Mail className="w-4 h-4" />}
                />

                <TextInput
                  label="Phone Number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  prefixIcon={<Phone className="w-4 h-4" />}
                />

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Purok / Zone
                  </label>
                  <select
                    value={purok}
                    onChange={(e) => setPurok(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    {PUROK_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Civil Status
                  </label>
                  <select
                    value={civilStatus}
                    onChange={(e) => setCivilStatus(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    {CIVIL_STATUS_OPTIONS.map((cs) => (
                      <option key={cs} value={cs}>
                        {cs}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Years of Residency
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={yearsOfResidency}
                    onChange={(e) => setYearsOfResidency(parseInt(e.target.value, 10) || 1)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {certificateType === 'businessClearance' && (
                <div className="pt-2">
                  <TextInput
                    label="Business / Establishment Name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Central Mini Mart & Bakery"
                    required
                    prefixIcon={<Briefcase className="w-4 h-4" />}
                  />
                </div>
              )}
            </div>

            {/* 3. Purpose & Purpose Details */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                3. Purpose & Official Remarks
              </h3>

              <TextInput
                label="Purpose of Certificate"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Requirement for Local Employment / Scholarship / ID Application"
                required
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Remarks / Official Notes (Optional)
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Additional remarks or notes for official record..."
                  rows={2}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 4. Status, Payment & Fee Settings */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                4. Record Status & Payment Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Initial Document Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CertificateStatus)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="submitted">Under Review (Submitted)</option>
                    <option value="approved">Approved / Under Process</option>
                    <option value="readyForRelease">Ready for Release</option>
                    <option value="released">Released / Claimed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="waived">Waived / Free</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Amount Fee (₱)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <TextInput
                  label="O.R. Number (Official Receipt)"
                  value={orNumber}
                  onChange={(e) => setOrNumber(e.target.value)}
                  placeholder="e.g. OR-2026-0012"
                />
              </div>
            </div>

            {/* 5. Supporting Document Uploads */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-blue-600" />
                  5. Supporting Documents (Optional)
                </h3>
                <span className="text-[11px] text-slate-500">File Attachment</span>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/30 p-4 rounded-2xl text-center cursor-pointer transition-all space-y-1 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Click to select photos / scanned attachments
                </p>
                <p className="text-[11px] text-slate-500">
                  Valid Government ID, Cedula, or Application Form
                </p>
              </div>

              {isUploading && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-blue-700 animate-spin" />
                      {uploadStatusText}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-700">Attached Documents ({selectedFiles.length}):</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {selectedFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100"
                      >
                        <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/80 text-white hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading || isUploading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-cert-form"
            variant="primary"
            loading={loading || isUploading}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Create Certificate
          </Button>
        </div>
      </div>
    </div>
  );
};
