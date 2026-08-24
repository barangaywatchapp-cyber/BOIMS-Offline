/**
 * Component: ExportCertificatesModal
 * Modal configuration UI for exporting Certificate Requests to Excel (.xlsx).
 */

import React, { useState, useMemo } from 'react';
import { Modal } from '../feedback/Modal';
import { Button } from '../foundation/Button';
import { CertificateRequest } from '../../types';
import { CERTIFICATE_TYPES } from '../../constants';
import {
  ExportDateScopeOption,
  CertificateExportFilterParams,
  CertificateExportDateParams,
  validateDateRange,
  filterCertificatesForExport,
  exportCertificatesToExcel,
} from '../../utils/excelCertificateExport';
import {
  FileSpreadsheet,
  Calendar,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  DollarSign,
} from 'lucide-react';

export interface ExportCertificatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawCertificates: CertificateRequest[];
  pageFilters: CertificateExportFilterParams;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const ExportCertificatesModal: React.FC<ExportCertificatesModalProps> = ({
  isOpen,
  onClose,
  rawCertificates,
  pageFilters,
}) => {
  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  // Default start date = 30 days ago, end date = today
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29); // 30 days inclusive
    return d.toISOString().split('T')[0];
  }, []);

  const defaultEndDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [dateScope, setDateScope] = useState<ExportDateScopeOption>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Year options for dropdown
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Date parameters bundle
  const dateParams: CertificateExportDateParams = useMemo(
    () => ({
      dateScope,
      selectedMonth,
      selectedYear,
      startDate,
      endDate,
    }),
    [dateScope, selectedMonth, selectedYear, startDate, endDate]
  );

  // Custom date range validation
  const rangeValidation = useMemo(() => {
    if (dateScope !== 'custom') {
      return { isValid: true, daysCount: 0 };
    }
    return validateDateRange(startDate, endDate);
  }, [dateScope, startDate, endDate]);

  // Computed matching certificates
  const matchingCertificates = useMemo(() => {
    return filterCertificatesForExport(rawCertificates, pageFilters, dateParams);
  }, [rawCertificates, pageFilters, dateParams]);

  // Total calculated fee sum for matching export records
  const totalAmountSum = useMemo(() => {
    return matchingCertificates.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [matchingCertificates]);

  // Readable labels for current active page filters summary
  const typeLabel =
    pageFilters.selectedType === 'all'
      ? 'All Certificate Types'
      : CERTIFICATE_TYPES.find((ct) => ct.id === pageFilters.selectedType)?.label || pageFilters.selectedType;

  const statusLabelMap: Record<string, string> = {
    all: 'All Statuses',
    underReview: 'Under Review',
    approved: 'Approved / Under Process',
    readyForRelease: 'Ready for Release',
    claimed: 'Claimed',
    expired: 'Expired',
  };
  const statusLabel = statusLabelMap[pageFilters.selectedStatus] || pageFilters.selectedStatus;

  const handleExecuteExport = () => {
    setExportMessage(null);

    if (dateScope === 'custom' && !rangeValidation.isValid) {
      setExportMessage({
        type: 'error',
        text: rangeValidation.errorMessage || 'Invalid date range selected.',
      });
      return;
    }

    if (matchingCertificates.length === 0) {
      setExportMessage({
        type: 'error',
        text: 'No certificates match the selected filters.',
      });
      return;
    }

    const result = exportCertificatesToExcel(matchingCertificates, dateParams);

    if (result.success) {
      setExportMessage({
        type: 'success',
        text: `Successfully exported ${result.exportedCount} records (Total: ₱${result.totalAmount.toFixed(2)}) to ${result.filename}.`,
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setExportMessage({
        type: 'error',
        text: result.error || 'Failed to export certificates.',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Certificate History to Excel"
      description="Generate a spreadsheet (.xlsx) of certificate issuance records with fee totals."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 font-medium">
            {matchingCertificates.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {matchingCertificates.length} {matchingCertificates.length === 1 ? 'record' : 'records'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-700 font-extrabold flex items-center gap-0.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  Total Fees: ₱{totalAmountSum.toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="text-amber-700 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                0 certificates match selection
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Download className="w-4 h-4" />}
              disabled={
                matchingCertificates.length === 0 || (dateScope === 'custom' && !rangeValidation.isValid)
              }
              onClick={handleExecuteExport}
            >
              Export to Excel
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Active Page Filters Summary Card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Active Page Filters</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium bg-white px-2 py-0.5 rounded-full border border-slate-200">
              Source of Truth
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white p-2 rounded-lg border border-slate-200/60">
              <span className="text-[11px] text-slate-400 block font-medium">Certificate Type</span>
              <span className="font-semibold text-slate-800 truncate block">{typeLabel}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/60">
              <span className="text-[11px] text-slate-400 block font-medium">Status</span>
              <span className="font-semibold text-slate-800 truncate block">{statusLabel}</span>
            </div>
          </div>

          {pageFilters.searchQuery.trim() && (
            <div className="bg-blue-50/60 border border-blue-200/60 rounded-lg p-2 text-xs text-blue-900 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                Search Query Active: <strong className="font-bold">"{pageFilters.searchQuery}"</strong>
              </span>
            </div>
          )}
        </div>

        {/* Date Scope Configuration */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Select Export Date Scope
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Option A: All Certificates */}
            <button
              type="button"
              onClick={() => {
                setDateScope('all');
                setExportMessage(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                dateScope === 'all'
                  ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/30 text-blue-950 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">All Certificates</span>
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    dateScope === 'all' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {dateScope === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                All records matching active filters without date restrictions.
              </p>
            </button>

            {/* Option B: Specific Month */}
            <button
              type="button"
              onClick={() => {
                setDateScope('month');
                setExportMessage(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                dateScope === 'month'
                  ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/30 text-blue-950 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Specific Month</span>
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    dateScope === 'month' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {dateScope === 'month' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                Filter by a specific calendar month and year.
              </p>
            </button>

            {/* Option C: Custom Date Range */}
            <button
              type="button"
              onClick={() => {
                setDateScope('custom');
                setExportMessage(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                dateScope === 'custom'
                  ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/30 text-blue-950 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Custom Range</span>
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    dateScope === 'custom' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {dateScope === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                Select start & end dates (max 30 calendar days).
              </p>
            </button>
          </div>

          {/* Month Selector */}
          {dateScope === 'month' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Select Calendar Month & Year</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Custom Date Range Selector */}
          {dateScope === 'custom' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Custom Date Range (Inclusive)</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  Max: 30 days
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setExportMessage(null);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setExportMessage(null);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Range Validation Feedback */}
              {!rangeValidation.isValid ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Invalid Date Range</p>
                    <p className="mt-0.5 text-red-700">{rangeValidation.errorMessage}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Valid range selected: <strong className="font-bold">{rangeValidation.daysCount} calendar days</strong> (within 30-day limit).
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty matching records alert */}
        {matchingCertificates.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">No certificates match the selected filters.</p>
              <p className="mt-0.5 text-amber-700">
                Please adjust the page filters or select a different date scope to export records.
              </p>
            </div>
          </div>
        )}

        {/* Export Feedback Banner */}
        {exportMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              exportMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {exportMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{exportMessage.type === 'success' ? 'Export Generated' : 'Export Failed'}</p>
              <p className="mt-0.5">{exportMessage.text}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
