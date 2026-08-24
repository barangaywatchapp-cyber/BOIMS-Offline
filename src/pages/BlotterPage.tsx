/**
 * Page: BlotterPage (Module 7)
 * Barangay Peace & Order System & Blotter Management Interface
 * Features:
 * - Case record registry with sequential numbering (BLT-YYYY-XXXX)
 * - Katarungang Pambarangay conciliation hearing scheduler (1st, 2nd, 3rd mediation)
 * - Certificate to File Action (CFA - KP Form 20) generation
 * - Printable case reports & official conciliation notices
 * - Role-Based Access Control (Admin, Chairman, Executive Officer, Secretary, Tanod)
 * - Offline sync capability
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { blotterService } from '../services/blotterService';
import { BlotterCase, BlotterStatus, HearingRecord } from '../types';
import { canAccessBlotter } from '../utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import {
  Shield,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  MapPin,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Gavel,
  Printer,
  ChevronRight,
  UserX,
  FileCheck2,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { ExportBlotterModal } from '../components/blotter/ExportBlotterModal';

export const BlotterPage: React.FC = () => {
  const { user, role, isAuthInitialized } = useAuth();
  const [cases, setCases] = useState<BlotterCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCase, setSelectedCase] = useState<BlotterCase | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showHearingModal, setShowHearingModal] = useState<boolean>(false);
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Create Form State
  const [formData, setFormData] = useState({
    complainantName: '',
    complainantContact: '',
    complainantAddress: '',
    respondentName: '',
    respondentContact: '',
    respondentAddress: '',
    incidentType: 'Noise Disturbance',
    incidentDate: new Date().toISOString().slice(0, 16),
    incidentLocation: '',
    purok: 'Purok 1',
    narrative: '',
    assignedOfficerName: 'Officer Roberto Cruz',
  });

  // Hearing Form State
  const [hearingData, setHearingData] = useState({
    scheduledDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    scheduledTime: '09:00',
    venue: 'Barangay Mediation Office',
    presidingOfficer: 'Lupon Chairman Ernesto Dizon',
    notes: '',
  });

  // Resolve Form State
  const [resolutionSummary, setResolutionSummary] = useState('');

  const isAuthorized = canAccessBlotter(role);
  const canManage = isAuthorized;

  const fetchCases = async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await blotterService.getBlotters(user);
      setCases(data);
    } catch (err) {
      console.error('Failed to load blotter cases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchCases();
  }, [isAuthInitialized, user?.uid, user?.role, role]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await blotterService.createBlotter(
        {
          complainantName: formData.complainantName,
          complainantContact: formData.complainantContact,
          complainantAddress: formData.complainantAddress,
          respondentName: formData.respondentName,
          respondentContact: formData.respondentContact,
          respondentAddress: formData.respondentAddress,
          incidentType: formData.incidentType,
          incidentDate: formData.incidentDate,
          incidentLocation: formData.incidentLocation,
          purok: formData.purok,
          narrative: formData.narrative,
          assignedOfficerName: formData.assignedOfficerName,
          status: 'open',
        },
        user.uid
      );
      setShowCreateModal(false);
      fetchCases();
      setFormData({
        complainantName: '',
        complainantContact: '',
        complainantAddress: '',
        respondentName: '',
        respondentContact: '',
        respondentAddress: '',
        incidentType: 'Noise Disturbance',
        incidentDate: new Date().toISOString().slice(0, 16),
        incidentLocation: '',
        purok: 'Purok 1',
        narrative: '',
        assignedOfficerName: 'Officer Roberto Cruz',
      });
    } catch (err) {
      alert('Error creating blotter case: ' + (err as Error).message);
    }
  };

  const handleScheduleHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !user) return;

    try {
      const existingHearings = selectedCase.hearings || [];
      const updated = await blotterService.scheduleHearing(
        selectedCase.caseId,
        {
          hearingNumber: existingHearings.length + 1,
          scheduledDate: hearingData.scheduledDate,
          scheduledTime: hearingData.scheduledTime,
          venue: hearingData.venue,
          presidingOfficer: hearingData.presidingOfficer,
          notes: hearingData.notes,
          status: 'scheduled',
        },
        user.uid
      );
      setSelectedCase(updated);
      setShowHearingModal(false);
      fetchCases();
    } catch (err) {
      alert('Error scheduling hearing: ' + (err as Error).message);
    }
  };

  const handleResolveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !user) return;

    try {
      const updated = await blotterService.resolveCase(selectedCase.caseId, resolutionSummary, user.uid);
      setSelectedCase(updated);
      setShowResolveModal(false);
      setResolutionSummary('');
      fetchCases();
    } catch (err) {
      alert('Error resolving case: ' + (err as Error).message);
    }
  };

  const handleIssueCFA = async () => {
    if (!selectedCase || !user) return;
    if (window.confirm('Are you sure you want to issue a Certificate to File Action (CFA - KP Form 20)? This indicates conciliation failed or respondent repeatedly failed to appear.')) {
      try {
        const updated = await blotterService.issueCFA(selectedCase.caseId, user.uid);
        setSelectedCase(updated);
        fetchCases();
      } catch (err) {
        alert('Error issuing CFA: ' + (err as Error).message);
      }
    }
  };

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.complainantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.respondentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.incidentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.purok && c.purok.toLowerCase().includes(searchQuery.toLowerCase()));

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'cfa') return matchesSearch && c.cfaIssued;
    return matchesSearch && c.status === statusFilter;
  });

  const getStatusBadge = (status: BlotterStatus, cfaIssued?: boolean) => {
    if (cfaIssued) {
      return <Badge variant="danger" className="flex items-center gap-1"><UserX className="w-3 h-3" /> CFA Issued</Badge>;
    }
    switch (status) {
      case 'open':
        return <Badge variant="warning" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Open</Badge>;
      case 'underInvestigation':
        return <Badge variant="info" className="flex items-center gap-1"><Search className="w-3 h-3" /> Under Investigation</Badge>;
      case 'scheduled':
        return <Badge variant="accent" className="flex items-center gap-1"><Gavel className="w-3 h-3" /> Hearing Scheduled</Badge>;
      case 'resolved':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved / Settled</Badge>;
      case 'closed':
        return <Badge variant="neutral" className="flex items-center gap-1"><FileCheck2 className="w-3 h-3" /> Closed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const totalCases = cases.length;
  const openCases = cases.filter((c) => c.status === 'open' || c.status === 'underInvestigation').length;
  const scheduledCases = cases.filter((c) => c.status === 'scheduled').length;
  const resolvedCases = cases.filter((c) => c.status === 'resolved').length;
  const cfaCases = cases.filter((c) => c.cfaIssued).length;

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
          <Shield className="w-12 h-12 text-red-600 mx-auto" />
          <h2 className="text-lg font-bold text-red-900">403 - Access Denied</h2>
          <p className="text-xs text-red-700 max-w-md mx-auto">
            Barangay Peace & Order & Blotter System is strictly restricted to the Barangay Secretary and Barangay Chairman.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Barangay Peace & Order & Blotter System</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Katarungang Pambarangay conciliation, blotter registry, and legal mediation tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchCases} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export to Excel
          </Button>

          {canManage && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 shadow-md"
            >
              <Plus className="w-4 h-4" /> File New Blotter
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card
          onClick={() => setStatusFilter('all')}
          className={`border-l-4 border-l-blue-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'all' ? 'ring-2 ring-blue-500 shadow-md -translate-y-0.5' : ''
          }`}
        >
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Blotters</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalCases}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter('open')}
          className={`border-l-4 border-l-amber-500 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'open' ? 'ring-2 ring-amber-500 shadow-md -translate-y-0.5' : ''
          }`}
        >
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active / Open</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{openCases}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter('scheduled')}
          className={`border-l-4 border-l-indigo-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'scheduled' ? 'ring-2 ring-indigo-500 shadow-md -translate-y-0.5' : ''
          }`}
        >
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scheduled Hearings</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{scheduledCases}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter('resolved')}
          className={`border-l-4 border-l-emerald-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'resolved' ? 'ring-2 ring-emerald-500 shadow-md -translate-y-0.5' : ''
          }`}
        >
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolved / Settled</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{resolvedCases}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter('cfa')}
          className={`border-l-4 border-l-red-600 cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'cfa' ? 'ring-2 ring-red-500 shadow-md -translate-y-0.5' : ''
          }`}
        >
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CFA Issued</p>
            <p className="text-2xl font-black text-red-600 mt-1">{cfaCases}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search case #, complainant, respondent, or incident..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            {[
              { id: 'all', label: 'All Cases' },
              { id: 'open', label: 'Open' },
              { id: 'scheduled', label: 'Hearings' },
              { id: 'resolved', label: 'Resolved' },
              { id: 'cfa', label: 'CFA Issued' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setStatusFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  statusFilter === btn.id
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Blotter Registry Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Blotter Records Registry</span>
            <span className="text-xs font-normal text-slate-500">Showing {filteredCases.length} records</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading blotter cases...</span>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Shield className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold">No blotter cases found.</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Case #</th>
                    <th className="py-3 px-4">Complainant vs Respondent</th>
                    <th className="py-3 px-4">Incident Type</th>
                    <th className="py-3 px-4">Date / Location</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredCases.map((c) => (
                    <tr key={c.caseId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700 text-xs">{c.caseNumber}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{c.complainantName}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <span>vs</span> <span className="font-medium text-slate-700">{c.respondentName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800 text-xs bg-slate-100 px-2 py-1 rounded-md">
                          {c.incidentType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="text-slate-800 flex items-center gap-1 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(c.incidentDate).toLocaleDateString()}
                        </div>
                        <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {c.purok ? `${c.purok} - ` : ''}{c.incidentLocation}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(c.status, c.cfaIssued)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedCase(c);
                            setShowDetailModal(true);
                          }}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Case Details Modal */}
      {showDetailModal && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 bg-slate-900 text-white rounded-t-2xl flex justify-between items-center">
              <div>
                <span className="text-xs font-mono text-blue-400 font-bold">{selectedCase.caseNumber}</span>
                <h2 className="text-xl font-black">{selectedCase.incidentType}</h2>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 text-sm text-slate-700">
              {/* Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Complainant</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedCase.complainantName}</p>
                  <p className="text-xs text-slate-500">{selectedCase.complainantContact || 'No contact provided'}</p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Respondent</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedCase.respondentName}</p>
                  <p className="text-xs text-slate-500">{selectedCase.respondentContact || 'No contact provided'}</p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedCase.status, selectedCase.cfaIssued)}</div>
                </div>
              </div>

              {/* Narrative */}
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1">Incident Narrative</h3>
                <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 text-slate-800 leading-relaxed">
                  {selectedCase.narrative}
                </div>
              </div>

              {/* Hearing History */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                    Conciliation Hearing History
                  </h3>
                  {canManage && !selectedCase.cfaIssued && selectedCase.status !== 'resolved' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHearingModal(true)}
                      className="text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Schedule Hearing
                    </Button>
                  )}
                </div>

                {(!selectedCase.hearings || selectedCase.hearings.length === 0) ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg">No conciliation hearings scheduled yet.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedCase.hearings.map((h, i) => (
                      <div key={h.hearingId || i} className="p-3.5 border border-slate-200 rounded-xl bg-white space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900 text-xs">
                            Hearing #{h.hearingNumber} - {h.venue}
                          </span>
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                            {h.scheduledDate} @ {h.scheduledTime}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          <strong>Presiding Officer:</strong> {h.presidingOfficer}
                        </p>
                        {h.notes && <p className="text-xs text-slate-500 italic mt-1">"{h.notes}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resolution / CFA Details */}
              {selectedCase.resolutionSummary && (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <h4 className="font-bold text-emerald-900 text-xs uppercase">Resolution / Settlement Terms</h4>
                  <p className="text-emerald-800 text-sm mt-1">{selectedCase.resolutionSummary}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 justify-between items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrintModal(true)}
                  className="flex items-center gap-1 text-xs"
                >
                  <Printer className="w-4 h-4" /> Print Report / Notice
                </Button>

                <div className="flex gap-2">
                  {canManage && selectedCase.status !== 'resolved' && !selectedCase.cfaIssued && (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleIssueCFA}
                        className="flex items-center gap-1 text-xs"
                      >
                        <UserX className="w-3.5 h-3.5" /> Issue CFA (KP Form 20)
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setShowResolveModal(true)}
                        className="flex items-center gap-1 text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                      </Button>
                    </>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Hearing Modal */}
      {showHearingModal && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Gavel className="w-5 h-5 text-blue-600" /> Schedule Conciliation Hearing
            </h3>
            <form onSubmit={handleScheduleHearing} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={hearingData.scheduledDate}
                    onChange={(e) => setHearingData({ ...hearingData, scheduledDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={hearingData.scheduledTime}
                    onChange={(e) => setHearingData({ ...hearingData, scheduledTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Venue</label>
                <input
                  type="text"
                  required
                  value={hearingData.venue}
                  onChange={(e) => setHearingData({ ...hearingData, venue: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Presiding Officer / Lupon</label>
                <input
                  type="text"
                  required
                  value={hearingData.presidingOfficer}
                  onChange={(e) => setHearingData({ ...hearingData, presidingOfficer: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={hearingData.notes}
                  onChange={(e) => setHearingData({ ...hearingData, notes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                  placeholder="e.g., Summon complainant and respondent with 2 witnesses."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowHearingModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Schedule Hearing
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" /> Mark Case as Resolved / Amicably Settled
            </h3>
            <form onSubmit={handleResolveCase} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Settlement Summary & Terms</label>
                <textarea
                  rows={4}
                  required
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg"
                  placeholder="Detail the agreed settlement terms signed by both parties..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save Resolution
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File New Blotter Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-slate-900 text-white rounded-t-2xl flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" /> File New Blotter Incident
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCase} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                  <h4 className="font-bold text-xs text-blue-900 uppercase">Complainant Information</h4>
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={formData.complainantName}
                    onChange={(e) => setFormData({ ...formData, complainantName: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Contact Number"
                    value={formData.complainantContact}
                    onChange={(e) => setFormData({ ...formData, complainantContact: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Address"
                    value={formData.complainantAddress}
                    onChange={(e) => setFormData({ ...formData, complainantAddress: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 space-y-2">
                  <h4 className="font-bold text-xs text-amber-900 uppercase">Respondent Information</h4>
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={formData.respondentName}
                    onChange={(e) => setFormData({ ...formData, respondentName: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Contact Number"
                    value={formData.respondentContact}
                    onChange={(e) => setFormData({ ...formData, respondentContact: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Address"
                    value={formData.respondentAddress}
                    onChange={(e) => setFormData({ ...formData, respondentAddress: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Incident Type *</label>
                  <select
                    value={formData.incidentType}
                    onChange={(e) => setFormData({ ...formData, incidentType: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Noise Disturbance">Noise Disturbance</option>
                    <option value="Boundary / Land Dispute">Boundary / Land Dispute</option>
                    <option value="Unpaid Debt / Loan">Unpaid Debt / Loan</option>
                    <option value="Physical Altercation">Physical Altercation</option>
                    <option value="Verbal Threat / Harassment">Verbal Threat / Harassment</option>
                    <option value="Property Damage">Property Damage</option>
                    <option value="Other Disagreements">Other Disagreements</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Incident Date/Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.incidentDate}
                    onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Purok Location</label>
                  <select
                    value={formData.purok}
                    onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  >
                    {['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Specific Incident Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Near Basketball Court, Purok 2 Main Street"
                  value={formData.incidentLocation}
                  onChange={(e) => setFormData({ ...formData, incidentLocation: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Incident Narrative & Details *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe the incident in detail..."
                  value={formData.narrative}
                  onChange={(e) => setFormData({ ...formData, narrative: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Submit Blotter Case
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      {showPrintModal && selectedCase && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 space-y-6 max-h-[90vh] overflow-y-auto print:p-0 print:shadow-none">
            <div className="text-center border-b pb-4">
              <p className="text-xs font-serif uppercase tracking-widest text-slate-500">Republic of the Philippines</p>
              <h2 className="text-lg font-serif font-black uppercase text-slate-900">Barangay Central</h2>
              <p className="text-xs text-slate-600">Office of the Lupon Tagapamayapa / Barangay Executive</p>
              <h3 className="text-xl font-bold mt-3 text-blue-900 uppercase tracking-tight">
                {selectedCase.cfaIssued ? 'CERTIFICATE TO FILE ACTION (KP FORM 20)' : 'OFFICIAL BLOTTER INCIDENT REPORT'}
              </h3>
            </div>

            <div className="space-y-4 text-xs text-slate-800 leading-relaxed font-serif">
              <div className="flex justify-between font-mono font-bold">
                <span>CASE NO: {selectedCase.caseNumber}</span>
                <span>DATE FILED: {new Date(selectedCase.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border p-3 rounded">
                <div>
                  <strong>COMPLAINANT:</strong> {selectedCase.complainantName}<br />
                  <span>Address: {selectedCase.complainantAddress || 'Barangay Central'}</span>
                </div>
                <div>
                  <strong>RESPONDENT:</strong> {selectedCase.respondentName}<br />
                  <span>Address: {selectedCase.respondentAddress || 'Barangay Central'}</span>
                </div>
              </div>

              <div>
                <strong>NATURE OF INCIDENT:</strong> {selectedCase.incidentType}<br />
                <strong>LOCATION:</strong> {selectedCase.incidentLocation}
              </div>

              <div className="border p-3 rounded bg-slate-50/50">
                <strong>SUMMARY STATEMENT / NARRATIVE:</strong>
                <p className="mt-1 leading-normal">{selectedCase.narrative}</p>
              </div>

              {selectedCase.cfaIssued && (
                <div className="p-3 border border-red-300 bg-red-50 rounded text-red-900">
                  <strong>CERTIFICATION:</strong>
                  <p className="mt-1">
                    This is to certify that no settlement/conciliation was reached before the Lupon Tagapamayapa, and therefore the complainant is hereby authorized to file the corresponding action in court.
                  </p>
                  <p className="mt-2 font-mono font-bold">CFA Control No: {selectedCase.cfaControlNumber}</p>
                </div>
              )}

              <div className="pt-8 grid grid-cols-2 gap-8 text-center">
                <div>
                  <div className="border-b border-slate-400 w-3/4 mx-auto mb-1"></div>
                  <span>Prepared by: Barangay Secretary</span>
                </div>
                <div>
                  <div className="border-b border-slate-400 w-3/4 mx-auto mb-1"></div>
                  <span>Attested by: Punong Barangay / Chairman</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t print:hidden">
              <Button variant="secondary" size="sm" onClick={() => setShowPrintModal(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" onClick={() => window.print()} className="flex items-center gap-1">
                <Printer className="w-4 h-4" /> Print Document
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export to Excel Configuration Modal */}
      <ExportBlotterModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        rawCases={cases}
        pageFilters={{
          searchQuery,
          statusFilter,
        }}
      />
    </div>
  );
};
