/**
 * Page: ReportDetailsPage (Module 3)
 * Comprehensive single report view with interactive timeline, map preview, photo gallery,
 * and responder dispatch management controls.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { reportService } from '../services/reportService';
import { AdminService } from '../services/adminService';
import { formatPresenceDisplay, getPresenceRank } from '../services/presenceService';
import { Report, ReportStatus, ReportTimelineEvent, User as UserType, getReportResponders } from '../types';
import { INCIDENT_CATEGORIES, ROUTES, APP_METADATA } from '../constants';
import { PageContainer } from '../components/layout/PageContainer';
import { StatusChip } from '../components/feedback/StatusChip';
import { PriorityBadge } from '../components/feedback/PriorityBadge';
import { Modal } from '../components/feedback/Modal';
import { Button } from '../components/foundation/Button';
import { FormField } from '../components/forms/FormField';
import { TextArea } from '../components/forms/TextArea';
import { Select } from '../components/forms/Select';
import { Alert } from '../components/feedback/Alert';
import { Skeleton } from '../components/feedback/Skeleton';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Shield,
  EyeOff,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Send,
  Navigation,
  Check,
} from 'lucide-react';

export const ReportDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isPureDispatcher = Boolean(
    role === 'purokOfficial' && user?.dutyStatus === 'onDuty' && user?.dutyMode === 'dispatcher'
  );
  const isExecutiveOrSecretary =
    role === 'secretary' ||
    role === 'chairman' ||
    role === 'admin' ||
    role === 'superAdmin' ||
    role === 'developer';
  const isDispatcher = isExecutiveOrSecretary || isPureDispatcher;
  const canManageEscalatedReport =
    role === 'secretary' ||
    role === 'chairman';
  const isFieldResponder =
    role === 'purokOfficial' && user?.dutyStatus === 'onDuty' && user?.dutyMode === 'responder';
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [report, setReport] = useState<Report | null>(null);
  const respondersList = getReportResponders(report);
  const isAssignedToMe = Boolean(
    isFieldResponder &&
      report &&
      (report.assignedTo === user?.uid || respondersList.some((r) => r.uid === user?.uid))
  );
  const [loading, setLoading] = useState(true);

  // Lightbox Modal for Photo
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Escalate to Secretary Modal State
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [escalateRemarks, setEscalateRemarks] = useState('');
  const [escalateLoading, setEscalateLoading] = useState(false);

  // Staff Operations Form State
  const [newStatus, setNewStatus] = useState<ReportStatus>('inProgress');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  const [selectedResponder, setSelectedResponder] = useState('');
  const [responders, setResponders] = useState<UserType[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const [timelineRemark, setTimelineRemark] = useState('');
  const [remarkLoading, setRemarkLoading] = useState(false);

  const adminService = new AdminService();

  const loadReport = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await reportService.getReportById(id, user);
      if (data) {
        setReport(data);
        setNewStatus(data.status);
      } else {
        setReport(null);
      }
    } catch (e) {
      console.error('Failed to load report:', e);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    if (user && user.role !== 'resident') {
      const unsubscribeUsers = adminService.subscribeToUsers((users) => {
        const activeResponders = users
          .filter((u) => {
            const isOfficialRole =
              u.role === 'purokOfficial' || u.role === 'secretary' || u.role === 'admin' || u.role === 'chairman';
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
        if (activeResponders.length > 0 && !selectedResponder) {
          setSelectedResponder(activeResponders[0].uid);
        }
      }, user);

      return () => {
        unsubscribeUsers();
      };
    }
  }, [id, user?.uid, user?.role]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !user) return;

    if (report.status === 'resolved') {
      showToast('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.', 'error');
      return;
    }

    setStatusLoading(true);
    try {
      await reportService.updateReportStatus(
        report.reportId,
        newStatus,
        statusRemarks.trim(),
        {
          uid: user.uid,
          fullName: user.fullName,
          role: user.role,
          dutyStatus: user.dutyStatus,
          dutyMode: user.dutyMode,
          jurisdiction: (user as any).jurisdiction,
          purok: (user as any).purok,
        },
        isOnline
      );
      showToast(`Report status updated to ${newStatus}`, 'success');
      setStatusRemarks('');
      await loadReport();
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssignResponder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !user) return;

    if (report.status === 'resolved') {
      showToast('Unauthorized: Resolved reports are immutable and cannot be updated or reassigned.', 'error');
      return;
    }

    if (user.role === 'purokOfficial' && (user.dutyStatus !== 'onDuty' || user.dutyMode !== 'dispatcher')) {
      showToast('Unauthorized: Dispatch actions are restricted to active Dispatchers (On Duty).', 'error');
      return;
    }

    const responderObj = responders.find((a) => a.uid === selectedResponder);
    const responderUid = responderObj?.uid || (typeof selectedResponder === 'string' ? selectedResponder : '');
    const responderName =
      responderObj?.fullName ||
      (responderObj as any)?.displayName ||
      (responderObj as any)?.name ||
      '';

    const isValidResponder = Boolean(
      selectedResponder &&
        responderObj &&
        typeof responderUid === 'string' &&
        responderUid.trim().length > 0 &&
        typeof responderName === 'string' &&
        responderName.trim().length > 0
    );

    if (!isValidResponder) {
      showToast('Please select a responder before assigning this report.', 'error');
      return;
    }

    setAssignLoading(true);
    try {
      await reportService.assignReport(
        report.reportId,
        responderUid.trim(),
        responderName.trim(),
        {
          uid: user.uid,
          fullName: user.fullName,
          role: user.role,
          dutyStatus: user.dutyStatus,
          dutyMode: user.dutyMode,
          jurisdiction: (user as any).jurisdiction,
          purok: (user as any).purok,
        },
        isOnline
      );
      showToast(`Assigned report to ${responderName.trim()}`, 'success');
      await loadReport();
    } catch (err: any) {
      showToast(err.message || 'Failed to assign responder', 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAddTimelineRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !user || !timelineRemark.trim()) return;

    setRemarkLoading(true);
    try {
      await reportService.addTimelineEvent(
        report.reportId,
        {
          action: 'Progress Update / Note',
          performedBy: user.uid,
          performedByName: user.fullName,
          performedByRole: user.role,
          dutyStatus: user.dutyStatus,
          dutyMode: user.dutyMode,
          jurisdiction: (user as any).jurisdiction,
          purok: (user as any).purok,
          remarks: timelineRemark.trim(),
        },
        isOnline
      );
      showToast('Progress note logged to report timeline.', 'success');
      setTimelineRemark('');
      await loadReport();
    } catch (err: any) {
      showToast(err.message || 'Failed to add timeline remark', 'error');
    } finally {
      setRemarkLoading(false);
    }
  };

  const handleEscalateToSecretary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !user) return;
    if (!escalateRemarks.trim()) {
      showToast('Please provide a reason or remarks for escalating to the Secretary.', 'error');
      return;
    }
    setEscalateLoading(true);
    try {
      await reportService.escalateReport(
        report.reportId,
        escalateRemarks.trim(),
        {
          uid: user.uid,
          fullName: user.fullName,
          role: user.role,
          dutyStatus: user.dutyStatus,
          dutyMode: user.dutyMode,
          jurisdiction: (user as any).jurisdiction,
          purok: (user as any).purok,
        },
        isOnline
      );
      showToast('Incident report successfully escalated to Barangay Secretary.', 'success');
      setIsEscalateModalOpen(false);
      setEscalateRemarks('');
      await loadReport();
    } catch (err: any) {
      showToast(err.message || 'Failed to escalate report', 'error');
    } finally {
      setEscalateLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="Report Details">
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!report) {
    return (
      <PageContainer title="Report Not Found">
        <div className="bg-white p-8 rounded-2xl text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Report Record Not Found</h2>
          <p className="text-xs text-slate-500">The requested incident report does not exist or has been removed.</p>
          <NavLink to={ROUTES.REPORTS}>
            <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />}>
              Return to Incident Reports List
            </Button>
          </NavLink>
        </div>
      </PageContainer>
    );
  }

  const categoryLabel = INCIDENT_CATEGORIES.find((c) => c.id === report.category)?.label || report.category;

  return (
    <PageContainer
      title={report.title}
      description={`Report Reference Number: ${report.reportNumber}`}
      action={
        <NavLink to={ROUTES.REPORTS}>
          <Button variant="outline" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to List
          </Button>
        </NavLink>
      }
    >
      <div className="space-y-8">
        {/* Top Status Header Banner */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              {report.reportNumber}
            </span>
            <StatusChip status={report.status} />
            <PriorityBadge priority={report.priority} />
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
              {categoryLabel}
            </span>
            {report.status === 'escalated' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-900 border border-purple-300">
                <AlertTriangle className="w-3.5 h-3.5 text-purple-700" />
                Escalated to Secretary
              </span>
            )}
            {report.blotterCaseId && (
              canManageEscalatedReport ? (
                <NavLink
                  to={ROUTES.BLOTTER}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-indigo-700" />
                  Blotter Case Linked
                </NavLink>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200">
                  <Shield className="w-3.5 h-3.5 text-indigo-700" />
                  Blotter Case Linked
                </span>
              )
            )}
            {report.isAnonymous && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                Anonymous
              </span>
            )}
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Submitted on {new Date(report.createdAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Details, Photos, Timeline */}
          <div className="lg:col-span-8 space-y-8">
            {/* Detailed Description */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                Incident Narrative & Details
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {report.description}
              </p>
            </div>

            {/* Location & Interactive Map Card */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <MapPin className="w-5 h-5 text-blue-700" />
                Location & Map Coordinates
              </h3>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <p className="text-sm font-semibold text-slate-900">{report.location.address}</p>
                <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                  <span>GPS Lat: {report.location.latitude}</span>
                  <span>GPS Lng: {report.location.longitude}</span>
                </div>
              </div>

              {/* Simulated Map View Canvas */}
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-200 h-48 flex items-center justify-center text-center p-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 to-slate-900/20" />
                <div className="relative bg-white/90 backdrop-blur-xs p-4 rounded-xl border border-slate-200/80 shadow-md max-w-sm space-y-2">
                  <MapPin className="w-8 h-8 text-red-600 mx-auto animate-bounce" />
                  <p className="text-xs font-bold text-slate-900">{report.location.address}</p>
                  <a
                    href={`https://maps.google.com/?q=${report.location.latitude},${report.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline"
                  >
                    <Navigation className="w-3 h-3" />
                    Open Directions in Google Maps
                  </a>
                </div>
              </div>
            </div>

            {/* Photo Attachments Gallery */}
            {report.imageUrls && report.imageUrls.length > 0 && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <ImageIcon className="w-5 h-5 text-blue-700" />
                  Attached Photo Evidence ({report.imageUrls.length})
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {report.imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedImage(url)}
                      className="group relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:shadow-md transition-all"
                    >
                      <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                        View Image
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Responder & Staff Action Panel */}
          <div className="lg:col-span-4 space-y-6">
            {/* Status & Personnel Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center justify-between">
                <span>Assignment & Personnel</span>
                {respondersList.length > 0 && (
                  <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200/60">
                    {respondersList.length} {respondersList.length === 1 ? 'Responder' : 'Responders'}
                  </span>
                )}
              </h3>

              <div className="text-xs space-y-3.5">
                <div>
                  <span className="text-slate-400 block font-medium">Filed By:</span>
                  <span className="font-semibold text-slate-800">
                    {report.isAnonymous ? 'Anonymous Citizen' : report.userName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium mb-1.5">Assigned Responders:</span>
                  {respondersList.length > 0 ? (
                    <ul className="space-y-2">
                      {respondersList.map((responder, idx) => {
                        const matchedUser = responders.find((u) => u.uid === responder.uid || u.fullName === responder.name);
                        const presenceText = formatPresenceDisplay(matchedUser?.presence?.status);
                        return (
                          <li
                            key={responder.uid || idx}
                            className="flex items-center gap-2.5 font-semibold text-blue-900 bg-blue-50/70 p-2.5 rounded-xl border border-blue-200/60"
                          >
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold shrink-0">
                              {responder.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1 flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-slate-900 truncate">{responder.name}</p>
                                <p className="text-[10px] text-blue-700 font-medium">
                                  {responder.role || 'Field Responder'}
                                </p>
                              </div>
                              <span className="text-xs font-semibold">{presenceText}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span className="text-slate-500 italic flex items-center gap-1.5 mt-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                      Unassigned / Pending Dispatch
                    </span>
                  )}
                </div>

                {report.resolvedAt && (
                  <div>
                    <span className="text-slate-400 block font-medium">Resolved On:</span>
                    <span className="font-semibold text-emerald-800">
                      {new Date(report.resolvedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Dispatcher Console Controls */}
            {isDispatcher && (
              <div className="bg-blue-50/70 p-6 rounded-2xl border border-blue-200/80 shadow-2xs space-y-6">
                <div className="border-b border-blue-200/80 pb-3">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-700" />
                    Barangay Dispatch Console
                  </h3>
                  <p className="text-[11px] text-blue-700 mt-0.5">Operations management controls</p>
                </div>

                {report.status === 'resolved' ? (
                  <div className="bg-emerald-100/70 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>This report is Resolved and immutable. Workflow controls are locked.</span>
                  </div>
                ) : report.status === 'escalated' ? (
                  <div className="space-y-4">
                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 text-xs text-purple-950 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-purple-900">
                        <AlertTriangle className="w-4 h-4 text-purple-700 shrink-0" />
                        <span>Incident Escalated to Barangay Secretary</span>
                      </div>
                      <p className="text-purple-800 leading-relaxed">
                        This report was escalated to the Barangay Secretary on{' '}
                        {report.escalatedAt ? new Date(report.escalatedAt).toLocaleString() : 'N/A'} by{' '}
                        <strong>{report.escalatedByName || 'Dispatcher'}</strong>.
                        {!canManageEscalatedReport && ' Operational status updates and responder assignments are locked pending administrative review.'}
                      </p>
                      {report.escalationRemarks && (
                        <div className="bg-white/80 p-2.5 rounded-lg border border-purple-200 text-purple-900 font-medium">
                          <span className="font-semibold text-purple-950 block text-[11px] uppercase tracking-wider mb-0.5">
                            Escalation Remarks:
                          </span>
                          "{report.escalationRemarks}"
                        </div>
                      )}
                      {report.blotterCaseId && canManageEscalatedReport && (
                        <div className="pt-1">
                          <NavLink
                            to={ROUTES.BLOTTER}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 underline"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            View Associated Blotter Case in Blotter Management &rarr;
                          </NavLink>
                        </div>
                      )}
                    </div>

                    {canManageEscalatedReport && (
                      <form onSubmit={handleUpdateStatus} className="space-y-3 pt-3 border-t border-blue-200/80">
                        <FormField label="Secretary / Chairman Action">
                          <Select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
                            options={[
                              { value: 'escalated', label: 'Escalated (Under Review)' },
                              { value: 'inProgress', label: 'In Progress (Active Processing)' },
                              { value: 'resolved', label: 'Resolved' },
                              { value: 'closed', label: 'Closed' },
                              { value: 'rejected', label: 'Rejected' },
                            ]}
                          />
                        </FormField>

                        <FormField label="Resolution / Administrative Note">
                          <TextArea
                            value={statusRemarks}
                            onChange={(e) => setStatusRemarks(e.target.value)}
                            placeholder="Enter official resolution remarks or administrative disposition..."
                            rows={2}
                          />
                        </FormField>

                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          fullWidth
                          loading={statusLoading}
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Save Administrative Update
                        </Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Assign / Reassign Field Responder Form */}
                    {(() => {
                      const selectedResponderObj = responders.find((a) => a.uid === selectedResponder);
                      const selectedResponderUid = selectedResponderObj?.uid || (typeof selectedResponder === 'string' ? selectedResponder : '');
                      const selectedResponderName =
                        selectedResponderObj?.fullName ||
                        (selectedResponderObj as any)?.displayName ||
                        (selectedResponderObj as any)?.name ||
                        '';

                      const isResponderSelected = Boolean(
                        selectedResponder &&
                          selectedResponderObj &&
                          typeof selectedResponderUid === 'string' &&
                          selectedResponderUid.trim().length > 0 &&
                          typeof selectedResponderName === 'string' &&
                          selectedResponderName.trim().length > 0
                      );

                      return (
                        <form onSubmit={handleAssignResponder} className="space-y-3">
                          <FormField label="Assign Field Responders">
                            <Select
                              value={selectedResponder}
                              onChange={(e) => setSelectedResponder(e.target.value)}
                              placeholder={responders.length === 0 ? '-- No active responders available --' : '-- Select a Field Responder --'}
                              options={responders.map((a) => ({
                                value: a.uid,
                                label: `${a.fullName} ${formatPresenceDisplay(a.presence?.status)}`,
                              }))}
                            />
                          </FormField>
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            fullWidth
                            loading={assignLoading}
                            disabled={!isResponderSelected || assignLoading}
                            className={!isResponderSelected ? 'opacity-60 cursor-not-allowed' : ''}
                            icon={<UserCheck className="w-3.5 h-3.5 text-blue-700" />}
                          >
                            {respondersList.length > 0 ? 'Reassign / Update Responders' : 'Assign Responders'}
                          </Button>
                        </form>
                      );
                    })()}

                    {/* Status Update Form */}
                    <form onSubmit={handleUpdateStatus} className="space-y-3 pt-3 border-t border-blue-200/80">
                      <FormField label="Update Report Status">
                        <Select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
                          options={[
                            { value: 'pending', label: 'Pending' },
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'inProgress', label: 'In Progress' },
                            { value: 'resolved', label: 'Resolved' },
                            { value: 'rejected', label: 'Rejected' },
                            { value: 'closed', label: 'Closed' },
                          ]}
                        />
                      </FormField>

                      <FormField label="Action Remarks / Resolution Note">
                        <TextArea
                          value={statusRemarks}
                          onChange={(e) => setStatusRemarks(e.target.value)}
                          placeholder="Add official notes or resolution remarks..."
                          rows={2}
                        />
                      </FormField>

                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        fullWidth
                        loading={statusLoading}
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        Save Status Update
                      </Button>
                    </form>

                    {/* Escalate to Secretary Button (Restricted to Dispatcher) */}
                    {isPureDispatcher && (
                      <div className="pt-3 border-t border-blue-200/80">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => setIsEscalateModalOpen(true)}
                          className="border-amber-400 bg-amber-50/80 text-amber-900 hover:bg-amber-100 font-semibold"
                          icon={<AlertTriangle className="w-4 h-4 text-amber-700" />}
                        >
                          Escalate to Secretary
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Log Timeline Note */}
                <form onSubmit={handleAddTimelineRemark} className="space-y-3 pt-3 border-t border-blue-200/80">
                  <FormField label="Log Field Progress Note">
                    <TextArea
                      value={timelineRemark}
                      onChange={(e) => setTimelineRemark(e.target.value)}
                      placeholder="Enter field update or officer observation..."
                      rows={2}
                    />
                  </FormField>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    loading={remarkLoading}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Post Progress Note
                  </Button>
                </form>
              </div>
            )}

            {/* Field Responder Controls (For Assigned Incident Only) */}
            {isAssignedToMe && !isDispatcher && (
              <div className="bg-emerald-50/70 p-6 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-6">
                <div className="border-b border-emerald-200/80 pb-3">
                  <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    Field Responder Operations
                  </h3>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Assigned incident status & field notes</p>
                </div>

                {report.status === 'resolved' ? (
                  <div className="bg-emerald-100/70 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>This incident is Resolved. Status cannot be modified.</span>
                  </div>
                ) : report.status === 'escalated' ? (
                  <div className="bg-purple-100/70 p-4 rounded-xl border border-purple-200 text-xs text-purple-900 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>This incident has been escalated to the Barangay Secretary. Field updates are locked.</span>
                  </div>
                ) : (
                  <>
                    {/* Status Update Form (Field Responder Status Flow: Assigned -> In Progress -> Resolved) */}
                    <form onSubmit={handleUpdateStatus} className="space-y-3">
                      <FormField label="Update Report Status">
                        <Select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
                          options={[
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'inProgress', label: 'In Progress' },
                            { value: 'resolved', label: 'Resolved' },
                          ]}
                        />
                      </FormField>

                      <FormField label="Field Remarks / Resolution Note">
                        <TextArea
                          value={statusRemarks}
                          onChange={(e) => setStatusRemarks(e.target.value)}
                          placeholder="Enter field observations or resolution details..."
                          rows={2}
                        />
                      </FormField>

                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        fullWidth
                        loading={statusLoading}
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        Update Incident Status
                      </Button>
                    </form>

                    {/* Log Field Note */}
                    <form onSubmit={handleAddTimelineRemark} className="space-y-3 pt-3 border-t border-emerald-200/80">
                      <FormField label="Log Field Progress Note">
                        <TextArea
                          value={timelineRemark}
                          onChange={(e) => setTimelineRemark(e.target.value)}
                          placeholder="Enter field update or observation..."
                          rows={2}
                        />
                      </FormField>
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        fullWidth
                        loading={remarkLoading}
                        icon={<Send className="w-3.5 h-3.5" />}
                      >
                        Post Progress Note
                      </Button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chronological Audit Timeline */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-5 h-5 text-blue-700" />
            Activity Timeline Log
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {report.timeline?.map((evt) => {
              const isAssignmentEvent =
                evt.action?.toLowerCase().includes('assign') ||
                evt.remarks?.toLowerCase().includes('assigned to') ||
                evt.remarks?.toLowerCase().includes('responders assigned');

              let parsedResponders: string[] = [];
              if (isAssignmentEvent && evt.remarks) {
                if (evt.remarks.toLowerCase().includes('assigned to ')) {
                  const match = evt.remarks.match(/assigned to\s+(.*)/i);
                  const namesStr = match ? match[1] : evt.remarks;
                  parsedResponders = namesStr.split(/,\s*|\s*•\s*/).filter(Boolean);
                } else if (evt.remarks.includes('•')) {
                  parsedResponders = evt.remarks
                    .split('\n')
                    .map((s) => s.replace(/^[•\-\*]\s*/, '').trim())
                    .filter(Boolean);
                } else {
                  parsedResponders = [evt.remarks.trim()];
                }
              }

              return (
                <div key={evt.eventId} className="relative space-y-1">
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-blue-700 ring-4 ring-white" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {isAssignmentEvent ? 'Responders Assigned' : evt.action}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {isAssignmentEvent && parsedResponders.length > 0 ? (
                    <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/60 leading-relaxed space-y-1.5">
                      <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                        Responders Assigned
                      </p>
                      <ul className="space-y-1">
                        {parsedResponders.map((respName, rIdx) => (
                          <li key={rIdx} className="flex items-center gap-1.5 text-slate-800 font-medium">
                            <span className="text-blue-600 font-bold">•</span>
                            <span>{respName}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60 leading-relaxed">
                      {evt.remarks}
                    </p>
                  )}

                  <p className="text-[11px] text-slate-400">
                    By: <strong>{evt.performedByName || 'System User'}</strong> ({evt.performedByRole || 'Staff'})
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Escalate to Secretary Modal */}
      {isEscalateModalOpen && (
        <Modal
          isOpen={isEscalateModalOpen}
          onClose={() => {
            if (!escalateLoading) setIsEscalateModalOpen(false);
          }}
          title="Escalate Incident to Barangay Secretary"
        >
          <form onSubmit={handleEscalateToSecretary} className="space-y-4">
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                Administrative Escalation
              </p>
              <p>
                Escalating this report transfers operational authority to the Barangay Secretary for administrative review, mediation, or blotter recording.
              </p>
              <p className="text-amber-800 font-medium">
                Report Reference: <strong className="font-mono">{report.reportNumber}</strong> — {report.title} ({categoryLabel})
              </p>
            </div>

            <FormField label="Escalation Remarks / Reason" required>
              <TextArea
                value={escalateRemarks}
                onChange={(e) => setEscalateRemarks(e.target.value)}
                placeholder="State the reason for escalating to the Secretary (e.g. mediation requested, formal dispute complaint, elevated risk)..."
                rows={4}
                required
              />
            </FormField>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEscalateModalOpen(false)}
                disabled={escalateLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={escalateLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                icon={<AlertTriangle className="w-4 h-4" />}
              >
                Confirm Escalation
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <Modal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} title="Photo Evidence Preview">
          <div className="space-y-4">
            <img src={selectedImage} alt="Evidence Large" className="w-full rounded-xl object-contain max-h-[70vh]" />
            <div className="text-right">
              <Button variant="outline" onClick={() => setSelectedImage(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  );
};
