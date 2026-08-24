/**
 * Page: ReportsListPage (Module 3)
 * Reports History Page displaying resolved, closed, rejected, and transferred reports.
 * Automatically archives completed work without requiring users to manual-filter.
 * Restricts scope to 'mine' for Resident role.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { reportService } from '../services/reportService';
import { Report, IncidentCategory } from '../types';
import { INCIDENT_CATEGORIES, ROUTES, PUROK_OPTIONS } from '../constants';
import { getUserOperationalContext, DatasetScope, getReportJurisdiction, isSameJurisdiction } from '../utils/jurisdictionUtils';
import { PageContainer } from '../components/layout/PageContainer';
import { SearchInput } from '../components/forms/SearchInput';
import { Select } from '../components/forms/Select';
import { Button } from '../components/foundation/Button';
import { EmptyState } from '../components/feedback/EmptyState';
import { Skeleton } from '../components/feedback/Skeleton';
import { ReportCard } from '../components/reports/ReportCard';
import {
  History,
  LayoutDashboard,
  Plus,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Lock,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';
import { ExportReportsModal } from '../components/reports/ExportReportsModal';

export type HistoryStatusFilter = 'all_history' | 'resolved' | 'closed' | 'rejected' | 'transferred';

export const ReportsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();
  const opContext = getUserOperationalContext(user);
  const { isFieldResponder, isScopeLockedToMine, isSingleScope, datasetScope } = opContext;
  const isPurokFilterRole = user?.role === 'secretary' || user?.role === 'chairman';

  const [rawReports, setRawReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [historyTab, setHistoryTab] = useState<HistoryStatusFilter>('all_history');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const [category, setCategory] = useState<string>('all');
  const [purokFilter, setPurokFilter] = useState<string>('all');
  // Initial viewScope: 'mine' if locked to mine, otherwise 'all'
  const [viewScope, setViewScope] = useState<'all' | 'mine'>(isScopeLockedToMine ? 'mine' : 'all');
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Completed/Historical statuses shown on Reports History Page
  const HISTORY_STATUSES = useMemo(() => ['resolved', 'closed', 'rejected', 'transferred'], []);

  // Current page filters bundle passed to Export Modal
  const pageFilters = useMemo(
    () => ({
      purokFilter,
      categoryFilter: category,
      historyTabFilter: historyTab,
      searchQuery: debouncedSearch,
      isPurokFilterRole,
      isScopeLockedToMine,
      viewScope,
      userId: user?.uid,
      historyStatuses: HISTORY_STATUSES,
    }),
    [
      purokFilter,
      category,
      historyTab,
      debouncedSearch,
      isPurokFilterRole,
      isScopeLockedToMine,
      viewScope,
      user?.uid,
      HISTORY_STATUSES,
    ]
  );

  // Compute presentation-filtered reports list from raw subscription reports
  const reports = useMemo(() => {
    let filtered = rawReports;

    const effectiveScope = isScopeLockedToMine ? 'mine' : viewScope;
    if (effectiveScope === 'mine' && user) {
      filtered = filtered.filter((r) => r.userId === user.uid);
    }

    if (category !== 'all') {
      filtered = filtered.filter((r) => r.category === category);
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          (r.reportNumber || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.location?.address || '').toLowerCase().includes(q)
      );
    }

    return isScopeLockedToMine
      ? filtered
      : filtered.filter((r) => r && r.status && HISTORY_STATUSES.includes(r.status));
  }, [rawReports, isScopeLockedToMine, viewScope, user?.uid, category, debouncedSearch, HISTORY_STATUSES]);

  // Generate options for Sitio / Purok dropdown (Secretary role)
  const purokSelectOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Sitio/Purok' }];
    const setOfPuroks = new Set<string>(PUROK_OPTIONS);

    // Dynamically include any additional unique jurisdictions found in reports
    rawReports.forEach((r) => {
      const jur = getReportJurisdiction(r);
      if (jur) {
        setOfPuroks.add(jur);
      }
    });

    Array.from(setOfPuroks).forEach((p) => {
      opts.push({ value: p, label: p });
    });

    return opts;
  }, [rawReports]);

  // Base reports after applying Secretary/Chairman Sitio/Purok filter (if secretary or chairman)
  const baseFilteredReports = useMemo(() => {
    if (!isPurokFilterRole || purokFilter === 'all') {
      return reports;
    }
    return reports.filter((report) => {
      const rJur = getReportJurisdiction(report);
      return (
        isSameJurisdiction(rJur, purokFilter) ||
        (!!report.purok && isSameJurisdiction(report.purok, purokFilter))
      );
    });
  }, [reports, isPurokFilterRole, purokFilter]);

  // Determine scope label based on datasetScope
  const getScopeLabel = (scope: DatasetScope): string => {
    switch (scope) {
      case 'personal':
        return 'My Filed History';
      case 'assigned':
        return 'All Assigned to Me';
      case 'jurisdiction':
        return 'Jurisdiction History';
      case 'municipality':
      case 'system':
      default:
        return 'All Barangay History';
    }
  };

  const scopeLabel = getScopeLabel(datasetScope);
  const activeScopeLabel = isScopeLockedToMine
    ? 'My Filed History'
    : isFieldResponder
    ? 'All Assigned to Me'
    : viewScope === 'mine'
    ? 'My Filed History'
    : scopeLabel;

  // Sync viewScope if role or duty status changes
  useEffect(() => {
    if (isScopeLockedToMine) {
      setViewScope('mine');
    } else if (isFieldResponder) {
      setViewScope('all');
    }
  }, [isScopeLockedToMine, isFieldResponder]);

  useEffect(() => {
    if (!isAuthInitialized || !user) {
      console.info('[Reports Diagnostic] [ReportsListPage] Waiting for auth initialization / user profile before subscribing...');
      return;
    }

    setLoading(true);

    console.info('[Reports Diagnostic] [ReportsListPage] Initializing reports subscription...', {
      uid: user.uid,
      role: user.role,
      dutyStatus: user.dutyStatus,
      dutyMode: user.dutyMode,
      jurisdiction: user.jurisdiction || user.purok,
    });

    const unsubscribe = reportService.subscribeToReports((allReports) => {
      console.info('[Reports Diagnostic] [ReportsListPage] Received reports snapshot:', {
        totalReceived: allReports.length,
      });

      setRawReports(allReports);
      setLoading(false);
    }, user);

    return () => {
      console.info('[Reports Diagnostic] [ReportsListPage] Cleaning up reports subscription');
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [
    isAuthInitialized,
    user?.uid,
    user?.role,
    user?.dutyStatus,
    user?.dutyMode,
    user?.purok,
    user?.jurisdiction,
  ]);

  // Tab Filtering for History Statuses
  const filteredReports = baseFilteredReports.filter((report) => {
    if (historyTab === 'all_history') return true;
    return report.status === historyTab;
  });

  // Calculate status counts for history tabs based on baseFilteredReports
  const resolvedCount = baseFilteredReports.filter((r) => r.status === 'resolved').length;
  const closedCount = baseFilteredReports.filter((r) => r.status === 'closed').length;
  const rejectedCount = baseFilteredReports.filter((r) => r.status === 'rejected').length;
  const transferredCount = baseFilteredReports.filter((r) => r.status === 'transferred').length;

  return (
    <PageContainer
      title={activeScopeLabel}
      description={
        activeScopeLabel === 'My Filed History'
          ? 'Archived status logs and records for your submitted incident reports'
          : activeScopeLabel === 'Jurisdiction History'
          ? 'Archived logs and historical records for incident reports within your jurisdiction'
          : activeScopeLabel === 'All Assigned to Me'
          ? 'Archived logs and historical records for incident reports assigned to you'
          : 'Archived logs and historical records for all barangay incident reports'
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
            onClick={() => setIsExportModalOpen(true)}
          >
            Export to Excel
          </Button>
          <NavLink to={ROUTES.DASHBOARD}>
            <Button variant="outline" icon={<LayoutDashboard className="w-4 h-4" />}>
              Dashboard
            </Button>
          </NavLink>
          <NavLink to={ROUTES.REPORT_CREATE}>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
              File New Report
            </Button>
          </NavLink>
        </div>
      }
    >
      <div className="space-y-6">
        {/* History Summary Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setHistoryTab('resolved')}
            className={`p-4 rounded-2xl border text-left transition-all ${
              historyTab === 'resolved'
                ? 'bg-emerald-800 text-white border-emerald-800 shadow-md ring-2 ring-emerald-500/50'
                : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${historyTab === 'resolved' ? 'text-emerald-100' : 'text-slate-500'}`}>
                Resolved
              </span>
              <CheckCircle2 className={`w-4 h-4 ${historyTab === 'resolved' ? 'text-emerald-200' : 'text-emerald-600'}`} />
            </div>
            <p className="text-2xl font-extrabold mt-2">{resolvedCount}</p>
            <p className={`text-[11px] mt-1 ${historyTab === 'resolved' ? 'text-emerald-100' : 'text-slate-500'}`}>
              Successfully Closed
            </p>
          </button>

          <button
            type="button"
            onClick={() => setHistoryTab('closed')}
            className={`p-4 rounded-2xl border text-left transition-all ${
              historyTab === 'closed'
                ? 'bg-slate-800 text-white border-slate-800 shadow-md ring-2 ring-slate-600/50'
                : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${historyTab === 'closed' ? 'text-slate-300' : 'text-slate-500'}`}>
                Closed
              </span>
              <Lock className={`w-4 h-4 ${historyTab === 'closed' ? 'text-slate-300' : 'text-slate-600'}`} />
            </div>
            <p className="text-2xl font-extrabold mt-2">{closedCount}</p>
            <p className={`text-[11px] mt-1 ${historyTab === 'closed' ? 'text-slate-300' : 'text-slate-500'}`}>
              Archived Logs
            </p>
          </button>

          <button
            type="button"
            onClick={() => setHistoryTab('rejected')}
            className={`p-4 rounded-2xl border text-left transition-all ${
              historyTab === 'rejected'
                ? 'bg-red-800 text-white border-red-800 shadow-md ring-2 ring-red-500/50'
                : 'bg-white text-slate-900 border-slate-200 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${historyTab === 'rejected' ? 'text-red-200' : 'text-slate-500'}`}>
                Rejected
              </span>
              <XCircle className={`w-4 h-4 ${historyTab === 'rejected' ? 'text-red-200' : 'text-red-600'}`} />
            </div>
            <p className="text-2xl font-extrabold mt-2">{rejectedCount}</p>
            <p className={`text-[11px] mt-1 ${historyTab === 'rejected' ? 'text-red-100' : 'text-slate-500'}`}>
              Invalid / Duplicate
            </p>
          </button>

          <button
            type="button"
            onClick={() => setHistoryTab('transferred')}
            className={`p-4 rounded-2xl border text-left transition-all ${
              historyTab === 'transferred'
                ? 'bg-purple-800 text-white border-purple-800 shadow-md ring-2 ring-purple-500/50'
                : 'bg-white text-slate-900 border-slate-200 hover:border-purple-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${historyTab === 'transferred' ? 'text-purple-200' : 'text-slate-500'}`}>
                Transferred
              </span>
              <ArrowRightLeft className={`w-4 h-4 ${historyTab === 'transferred' ? 'text-purple-200' : 'text-purple-600'}`} />
            </div>
            <p className="text-2xl font-extrabold mt-2">{transferredCount}</p>
            <p className={`text-[11px] mt-1 ${historyTab === 'transferred' ? 'text-purple-100' : 'text-slate-500'}`}>
              Re-routed Agencies
            </p>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Search Input */}
            <div className="w-full md:flex-1">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search history report #, title, location..."
                onClear={() => setSearch('')}
              />
            </div>

            {/* View Scope Controls (Dataset Selector) OR Sitio/Purok Dropdown (Secretary & Chairman) */}
            {isPurokFilterRole ? (
              <div className="w-full md:w-64 shrink-0">
                <Select
                  value={purokFilter}
                  onChange={(e) => setPurokFilter(e.target.value)}
                  prefixIcon={<MapPin className="w-4 h-4 text-slate-400" />}
                  options={purokSelectOptions}
                />
              </div>
            ) : !isSingleScope ? (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setViewScope('all')}
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewScope === 'all'
                      ? 'bg-white text-blue-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {scopeLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope('mine')}
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewScope === 'mine'
                      ? 'bg-white text-blue-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My Filed History
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-blue-50 text-blue-900 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>{activeScopeLabel}</span>
              </div>
            )}
          </div>

          {/* Secondary Filters & History Tabs */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* History Status Category Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setHistoryTab('all_history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  historyTab === 'all_history'
                    ? 'bg-white text-blue-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All History ({baseFilteredReports.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('resolved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  historyTab === 'resolved'
                    ? 'bg-white text-emerald-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Resolved ({resolvedCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('closed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  historyTab === 'closed'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Closed ({closedCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('rejected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  historyTab === 'rejected'
                    ? 'bg-white text-red-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rejected ({rejectedCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('transferred')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  historyTab === 'transferred'
                    ? 'bg-white text-purple-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Transferred ({transferredCount})
              </button>
            </div>

            {/* Category Dropdown */}
            <div className="w-full md:w-64">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={[
                  { value: 'all', label: 'All Incident Categories' },
                  ...INCIDENT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
                ]}
              />
            </div>
          </div>
        </div>

        {/* History Content Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-[270px] rounded-2xl" />
            <Skeleton className="h-[270px] rounded-2xl" />
            <Skeleton className="h-[270px] rounded-2xl" />
          </div>
        ) : filteredReports.length === 0 ? (
          <EmptyState
            icon={<History className="w-8 h-8 text-slate-400" />}
            title={
              isPurokFilterRole && purokFilter !== 'all'
                ? `No Reports Found in ${purokFilter}`
                : `No Reports Found in ${activeScopeLabel}`
            }
            description={
              isPurokFilterRole && purokFilter !== 'all'
                ? `There are no completed or archived reports found for ${purokFilter} matching your active filters.`
                : `There are no completed or archived reports found under ${activeScopeLabel.toLowerCase()} matching your active filters.`
            }
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(ROUTES.DASHBOARD)}
              >
                View Active Dashboard
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => (
              <ReportCard
                key={report.reportId || report.reportNumber}
                report={report}
                onClick={() => navigate(ROUTES.REPORT_DETAILS(report.reportId || report.reportNumber))}
              />
            ))}
          </div>
        )}
      </div>

      <ExportReportsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        rawReports={rawReports}
        pageFilters={pageFilters}
      />
    </PageContainer>
  );
};
