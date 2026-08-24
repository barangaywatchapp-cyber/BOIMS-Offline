/**
 * Request Certificate / Document Page
 * Allows residents to apply for official Barangay Certificates online with photo uploads to Firebase Storage
 */

import React, { useState, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { certificateService } from '../services/certificateService';
import { storageService } from '../services/storageService';
import { CERTIFICATE_TYPES, ROUTES, APP_METADATA } from '../constants';
import { CertificateType } from '../types';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/foundation/Button';
import { TextInput } from '../components/forms/TextInput';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  FileText,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
  ShieldCheck,
  User,
  Phone,
  Mail,
  Home,
  Briefcase,
  ArrowLeft,
} from 'lucide-react';

const PUROK_OPTIONS = [
  'Purok 1 - Maharlika',
  'Purok 2 - Masagana',
  'Purok 3 - Sampaguita',
  'Purok 4 - Bagong Silang',
  'Purok 5 - Ilang-Ilang',
  'Purok 6 - Riverside',
  'Purok 7 - Summit View',
];

const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

export const RequestCertificatePage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState('0917-000-0000');
  const [purok, setPurok] = useState('Purok 1 - Maharlika');
  const [civilStatus, setCivilStatus] = useState('Single');
  const [yearsOfResidency, setYearsOfResidency] = useState<number>(5);
  const [certificateType, setCertificateType] = useState<CertificateType>('barangayClearance');
  const [businessName, setBusinessName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');

  // Attached files state
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const selectedCertMeta = CERTIFICATE_TYPES.find((ct) => ct.id === certificateType);
  const currentFee = certificateType === 'certificateOfIndigency' ? 0 : selectedCertMeta?.defaultFee || 50;

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

      // If user selected supporting files (ID, Cedula, Proof of Billing)
      if (selectedFiles.length > 0 && isOnline) {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadStatusText('Compressing and uploading supporting documents to Firebase Storage...');

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
        userId: user?.uid || 'resident-guest',
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
        performerRole: user?.role,
      });

      if (!isOnline) {
        showToast('Certificate request saved offline. Will sync when network is restored.', 'warning');
      } else {
        showToast(`Document request ${created.requestNumber} submitted successfully!`, 'success');
      }

      navigate(ROUTES.CERTIFICATES);
    } catch (err: any) {
      console.error('Error creating certificate request:', err);
      setError(err.message || 'Failed to submit certificate request.');
    } finally {
      setLoading(false);
      setIsUploading(false);
    }
  };

  return (
    <PageContainer
      title="Apply for Barangay Certificate / Document"
      description="Submit online request for clearances, indigency, residency, or business permits"
      actions={
        <NavLink to={ROUTES.CERTIFICATES}>
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Requests
          </Button>
        </NavLink>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
          
          {/* Section 1: Certificate Type Selector */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              1. Select Certification Type
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CERTIFICATE_TYPES.map((ct) => {
                const isSelected = certificateType === ct.id;
                return (
                  <div
                    key={ct.id}
                    onClick={() => setCertificateType(ct.id as CertificateType)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">{ct.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        ct.defaultFee === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
                      }`}>
                        {ct.defaultFee === 0 ? 'Free' : `₱${ct.defaultFee}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{ct.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Applicant Information */}
          <div className="space-y-4 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              2. Applicant Profile & Residence Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Full Name (First, Middle, Last)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                prefixIcon={<User className="w-4 h-4" />}
              />

              <TextInput
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                  Purok / Zone Residence
                </label>
                <select
                  value={purok}
                  onChange={(e) => setPurok(e.target.value)}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
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
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
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
                  Years of Residency in Barangay
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={yearsOfResidency}
                  onChange={(e) => setYearsOfResidency(parseInt(e.target.value, 10) || 1)}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Business Name field if Business Permit Clearance selected */}
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

          {/* Section 3: Purpose & Remarks */}
          <div className="space-y-4 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              3. Purpose & Additional Notes
            </h3>

            <TextInput
              label="Purpose of Request (State specific reason e.g. Employment, Bank, Scholarship)"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Requirement for Local Employment at Baras Commercial Center"
              required
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Additional Remarks / Special Instructions (Optional)
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any special notes for the Barangay Secretary or Treasurer..."
                rows={2}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 4: Supporting Document Uploads */}
          <div className="space-y-4 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                4. Supporting Documents (Valid ID, Cedula, Proof of Residency)
              </h3>
              <span className="text-xs text-slate-500">Firebase Storage Upload</span>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/30 p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  Click to select photos of ID / Cedula
                </p>
                <p className="text-xs text-slate-500">
                  Valid Government ID, Community Tax Certificate (Cedula), or Billing Statement.
                </p>
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-700 animate-spin" />
                    {uploadStatusText}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Selected File Previews */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">Attached Documents ({selectedFiles.length}):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedFiles.map((item, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                      <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 text-white hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Summary & Fee Confirmation */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Document Fee</span>
              <p className="text-lg font-extrabold text-slate-900">
                {currentFee === 0 ? 'Free (Waived for Indigent)' : `₱${currentFee.toFixed(2)}`}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p>Payment Method: Cash upon Pick-up / Verification</p>
              <p>Processing Time: 1 - 2 Working Days</p>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <NavLink to={ROUTES.CERTIFICATES}>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </NavLink>
            <Button
              type="submit"
              variant="primary"
              loading={loading || isUploading}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              Submit Certificate Request
            </Button>
          </div>

        </form>
      </div>
    </PageContainer>
  );
};
