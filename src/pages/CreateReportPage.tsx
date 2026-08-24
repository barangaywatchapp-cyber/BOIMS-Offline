/**
 * Page: CreateReportPage (Module 3)
 * Allows residents and responders to submit incident and emergency public safety reports
 * Features category visual selectors, priority setting, photo attachments, GPS/address picker,
 * anonymous reporting, and offline queuing support.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { reportService } from '../services/reportService';
import { storageService, compressAndEncodeFileForFirestore } from '../services/storageService';
import { INCIDENT_CATEGORIES, ROUTES, APP_METADATA } from '../constants';
import { IncidentCategory, ReportPriority } from '../types';
import { isBarangayWideRole } from '../utils/jurisdictionUtils';
import { PageContainer } from '../components/layout/PageContainer';
import { FormField } from '../components/forms/FormField';
import { TextInput } from '../components/forms/TextInput';
import { TextArea } from '../components/forms/TextArea';
import { Select } from '../components/forms/Select';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import { PriorityBadge } from '../components/feedback/PriorityBadge';
import {
  AlertTriangle,
  MapPin,
  Camera,
  Image as ImageIcon,
  EyeOff,
  Send,
  ArrowLeft,
  X,
  WifiOff,
  Navigation,
  CheckCircle2,
  UploadCloud,
  FileImage,
  Loader2,
  Lock,
} from 'lucide-react';

const PUROK_OPTIONS = [
  { value: 'Purok 1', label: 'Purok 1 - Barangay Central' },
  { value: 'Purok 2', label: 'Purok 2 - Barangay Central' },
  { value: 'Purok 3', label: 'Purok 3 - Barangay Central' },
  { value: 'Purok 4', label: 'Purok 4 - Barangay Central' },
  { value: 'Purok 5', label: 'Purok 5 - Barangay Central' },
  { value: 'Purok 6', label: 'Purok 6 - Barangay Central' },
  { value: 'Purok 7', label: 'Purok 7 - Barangay Central' },
];

export const CreateReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userJurisdiction = (user?.jurisdiction || user?.purok || 'Purok 1').trim();
  const canSelectPurok = isBarangayWideRole(user?.role);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('garbage');
  const [priority, setPriority] = useState<ReportPriority>('medium');
  const [description, setDescription] = useState('');
  const [purok, setPurok] = useState(userJurisdiction);
  const [streetAddress, setStreetAddress] = useState('');
  const [latitude, setLatitude] = useState<number>(14.5205);
  const [longitude, setLongitude] = useState<number>(121.2655);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSelectCategory = (selectedCat: IncidentCategory) => {
    setCategory(selectedCat);
    if (selectedCat === 'neighborhood_dispute') {
      setPriority('critical');
    }
  };

  useEffect(() => {
    if (!canSelectPurok && userJurisdiction) {
      setPurok(userJurisdiction);
    }
  }, [user?.uid, canSelectPurok, userJurisdiction]);
  
  // Image attachments state
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleRemoveExistingUrl = (index: number) => {
    setExistingUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAutoDetectGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(parseFloat(pos.coords.latitude.toFixed(4)));
          setLongitude(parseFloat(pos.coords.longitude.toFixed(4)));
          showToast('GPS coordinates updated to current location.', 'info');
        },
        () => {
          setLatitude(14.5212);
          setLongitude(121.2648);
          showToast('Using Barangay Central center GPS coordinates.', 'info');
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a brief report title.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide incident details and description.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const tempReportId = `rpt-${Date.now()}`;
      let uploadedStorageUrls: string[] = [];

      // If there are raw image files selected, upload them or encode them
      if (selectedFiles.length > 0) {
        if (isOnline) {
          setIsUploading(true);
          setUploadProgress(0);
          setUploadStatusText('Compressing and uploading photo attachments to Firebase Storage...');

          const filesToUpload = selectedFiles.map((item) => item.file);
          uploadedStorageUrls = await storageService.uploadMultipleReportImages(
            filesToUpload,
            tempReportId,
            (progress, fileName) => {
              setUploadProgress(progress);
              setUploadStatusText(`Uploading ${fileName} (${progress}%)...`);
            }
          );
          setIsUploading(false);
        } else {
          // Offline mode: convert photos to compressed data URLs so they persist in the offline queued report payload
          for (const item of selectedFiles) {
            try {
              const dataUrl = await compressAndEncodeFileForFirestore(item.file, 600, 300 * 1024);
              uploadedStorageUrls.push(dataUrl);
            } catch (e) {
              console.warn('[CreateReportPage] Could not encode offline image:', e);
            }
          }
        }
      }

      const finalImageUrls = [...existingUrls, ...uploadedStorageUrls];

      const reportPurok = canSelectPurok ? (purok || userJurisdiction) : userJurisdiction;
      const reportJurisdiction = canSelectPurok ? reportPurok : userJurisdiction;
      const fullAddress = `${streetAddress ? streetAddress + ', ' : ''}${reportPurok}, ${APP_METADATA.defaultBarangay}, ${APP_METADATA.defaultMunicipality}`;

      const effectivePriority: ReportPriority = category === 'neighborhood_dispute' ? 'critical' : priority;

      const created = await reportService.createReport(
        {
          title: title.trim(),
          description: description.trim(),
          category,
          priority: effectivePriority,
          status: 'pending',
          isAnonymous,
          purok: reportPurok,
          jurisdiction: reportJurisdiction,
          location: {
            latitude,
            longitude,
            address: fullAddress,
          },
          imageUrls: finalImageUrls,
          userId: isAnonymous ? 'anonymous-user' : user?.uid || 'guest-user',
          userName: isAnonymous ? 'Anonymous Resident' : user?.fullName || 'Resident',
          userEmail: isAnonymous ? 'anonymous@boims.gov.ph' : user?.email || '',
        },
        isOnline
      );

      if (!isOnline) {
        showToast('Report saved offline. Will automatically sync when connection returns.', 'warning');
      } else {
        showToast(`Incident report ${created.reportNumber} submitted successfully with storage attachments!`, 'success');
      }

      navigate(ROUTES.REPORTS);
    } catch (err: any) {
      console.error('Error submitting report:', err);
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
      setIsUploading(false);
    }
  };

  return (
    <PageContainer
      title="File Incident & Safety Report"
      description="Log public safety hazards, infrastructure issues, or emergency concerns for immediate barangay action"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Link */}
        <NavLink
          to={ROUTES.REPORTS}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incident Reports List</span>
        </NavLink>

        {!isOnline && (
          <Alert type="warning">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Offline Mode Active:</strong> You can still file this report. It will be saved locally and queued for automatic sync as soon as you reconnect.
              </span>
            </div>
          </Alert>
        )}

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-8">
          {/* Section 1: Category Selection */}
          <div className="space-y-4">
            <label className="block text-sm font-bold text-slate-900">
              Select Incident Category <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {INCIDENT_CATEGORIES.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat.id as IncidentCategory)}
                    className={`p-3.5 rounded-xl border text-xs font-semibold text-center transition-all flex flex-col items-center justify-center gap-2 ${
                      isSelected
                        ? 'border-blue-700 bg-blue-50/80 text-blue-900 ring-2 ring-blue-700/20 shadow-2xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <span className="line-clamp-1">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Priority Level */}
          {category === 'neighborhood_dispute' ? (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Priority / Urgency Level</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 bg-red-100 text-red-800 rounded-md border border-red-200">
                    Auto-Set
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Neighborhood dispute reports are automatically assigned <strong>Critical</strong> priority for immediate mediation and barangay action.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <PriorityBadge priority="critical" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-900">
                Priority / Urgency Level <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['low', 'medium', 'high', 'critical'] as ReportPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-blue-700 bg-blue-50/70 shadow-2xs ring-2 ring-blue-700/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="capitalize font-semibold text-slate-800">{p} Priority</span>
                      <PriorityBadge priority={p} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Title & Description */}
          <div className="space-y-4">
            <FormField label="Incident Title" required hint="E.g., Broken streetlight at Alley 3, Overflowing trash bin">
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the incident..."
                required
              />
            </FormField>

            <FormField label="Detailed Narrative / Description" required hint="Include relevant details, specific landmarks, or time observed">
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide comprehensive details about what occurred..."
                rows={4}
                required
              />
            </FormField>
          </div>

          {/* Section 4: Location Picker */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-700" />
                Incident Location & GPS Coordinates
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoDetectGPS}
                icon={<Navigation className="w-3.5 h-3.5 text-blue-700" />}
              >
                Auto-Detect GPS
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canSelectPurok ? (
                <FormField label="Select Purok / Area">
                  <Select
                    value={purok}
                    onChange={(e) => setPurok(e.target.value)}
                    options={PUROK_OPTIONS}
                  />
                </FormField>
              ) : (
                <FormField label="Purok / Area (Registered Jurisdiction)" hint="Locked to your registered account jurisdiction">
                  <div className="relative">
                    <input
                      type="text"
                      value={userJurisdiction}
                      disabled
                      readOnly
                      className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-700 font-semibold text-sm cursor-not-allowed pr-10 shadow-2xs"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4" />
                    </div>
                  </div>
                </FormField>
              )}

              <FormField label="Street Address / Landmark">
                <TextInput
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="Near Corner Store, House #12, etc."
                />
              </FormField>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
              <span>Latitude: <strong>{latitude}</strong></span>
              <span>Longitude: <strong>{longitude}</strong></span>
              <span className="text-slate-400">({APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality})</span>
            </div>
          </div>

          {/* Section 5: Photo Attachments with Firebase Storage Upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900">
                Photo Evidence / Attachments (Firebase Storage Upload)
              </label>
              <span className="text-xs text-slate-500">Auto-compressed client-side</span>
            </div>

            {/* File Upload Zone */}
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
                  Click or drag photos here to upload
                </p>
                <p className="text-xs text-slate-500">
                  PNG, JPG, or WEBP. Photos will be compressed before saving to Firebase Storage.
                </p>
              </div>
            </div>

            {/* Upload Progress Bar */}
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
                <p className="text-xs font-bold text-slate-700">Selected Photos to Upload ({selectedFiles.length}):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedFiles.map((item, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-2xs">
                      <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 p-1 text-[10px] text-white truncate px-2">
                        {item.file.name}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSelectedFile(idx);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 text-white hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attached Existing URLs */}
            {existingUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {existingUrls.map((url, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                    <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingUrl(idx)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/70 text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Anonymous Toggle */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start gap-4">
            <input
              type="checkbox"
              id="anonymous-toggle"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-700 rounded border-slate-300 focus:ring-blue-600 cursor-pointer"
            />
            <label htmlFor="anonymous-toggle" className="cursor-pointer space-y-1">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <EyeOff className="w-4 h-4 text-slate-600" />
                Submit Report Anonymously
              </span>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your name and email address will be hidden from public view and general records. Barangay officers will still be able to process the report tracking ID.
              </p>
            </label>
          </div>

          {/* Form Action */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <NavLink to={ROUTES.REPORTS}>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </NavLink>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              icon={<Send className="w-4 h-4" />}
            >
              Submit Report
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
};
