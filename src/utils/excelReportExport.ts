/**
 * Excel Report Export Utility
 * Handles filtering and generating .xlsx spreadsheets for Report History records.
 */

import * as XLSX from 'xlsx';
import { Report, IncidentCategory } from '../types';
import { INCIDENT_CATEGORIES } from '../constants';
import { getReportJurisdiction, isSameJurisdiction } from '../utils/jurisdictionUtils';

export type ExportDateScopeOption = 'all' | 'month' | 'custom';

export interface ReportExportFilterParams {
  purokFilter: string;
  categoryFilter: string;
  historyTabFilter: string;
  searchQuery: string;
  isPurokFilterRole: boolean;
  isScopeLockedToMine: boolean;
  viewScope: 'all' | 'mine';
  userId?: string;
  historyStatuses: string[];
}

export interface ReportExportDateParams {
  dateScope: ExportDateScopeOption;
  selectedMonth: number; // 1-12
  selectedYear: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Validates custom date range for max 30 calendar days (inclusive).
 */
export function validateDateRange(startDate: string, endDate: string): {
  isValid: boolean;
  daysCount: number;
  errorMessage?: string;
} {
  if (!startDate || !endDate) {
    return { isValid: false, daysCount: 0, errorMessage: 'Start date and end date are required.' };
  }

  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);

  if (startParts.length !== 3 || endParts.length !== 3) {
    return { isValid: false, daysCount: 0, errorMessage: 'Invalid date format.' };
  }

  const startD = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const endD = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
    return { isValid: false, daysCount: 0, errorMessage: 'Invalid date selection.' };
  }

  const diffMs = endD.getTime() - startD.getTime();
  const daysCount = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

  if (daysCount < 1) {
    return {
      isValid: false,
      daysCount,
      errorMessage: 'End date cannot be earlier than Start date.',
    };
  }

  if (daysCount > 30) {
    return {
      isValid: false,
      daysCount,
      errorMessage: `Selected range is ${daysCount} calendar days. Maximum allowed range is 30 calendar days.`,
    };
  }

  return { isValid: true, daysCount };
}

/**
 * Helper to safely extract a Javascript Date object from a report's createdAt or updatedAt field.
 */

export function parseReportDate(report: Report): Date | null {
  if (report.createdAt) {
    const d = new Date(report.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (report.updatedAt) {
    const d = new Date(report.updatedAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Filter accessible reports by both page filters AND export date scope.
 */
export function filterReportsForExport(
  rawReports: Report[],
  pageFilters: ReportExportFilterParams,
  dateParams: ReportExportDateParams
): Report[] {
  const {
    purokFilter,
    categoryFilter,
    historyTabFilter,
    searchQuery,
    isPurokFilterRole,
    isScopeLockedToMine,
    viewScope,
    userId,
    historyStatuses,
  } = pageFilters;

  // 1. Apply user view scope ('mine' vs 'all')
  let filtered = rawReports;
  const effectiveScope = isScopeLockedToMine ? 'mine' : viewScope;
  if (effectiveScope === 'mine' && userId) {
    filtered = filtered.filter((r) => r.userId === userId);
  }

  // 2. Apply history statuses restriction (unless scope locked to mine)
  if (!isScopeLockedToMine) {
    filtered = filtered.filter((r) => r && r.status && historyStatuses.includes(r.status));
  }

  // 3. Apply Sitio/Purok filter
  if (isPurokFilterRole && purokFilter !== 'all') {
    filtered = filtered.filter((report) => {
      const rJur = getReportJurisdiction(report);
      return (
        isSameJurisdiction(rJur, purokFilter) ||
        (!!report.purok && isSameJurisdiction(report.purok, purokFilter))
      );
    });
  }

  // 4. Apply Category filter
  if (categoryFilter !== 'all') {
    filtered = filtered.filter((r) => r.category === categoryFilter);
  }

  // 5. Apply Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        (r.reportNumber || '').toLowerCase().includes(q) ||
        (r.title || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.location?.address || '').toLowerCase().includes(q)
    );
  }

  // 6. Apply History Status Tab filter
  if (historyTabFilter !== 'all_history') {
    filtered = filtered.filter((r) => r.status === historyTabFilter);
  }

  // 7. Apply Export Date Scope filter
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'month') {
    filtered = filtered.filter((report) => {
      const rDate = parseReportDate(report);
      if (!rDate) return false;
      return (
        rDate.getFullYear() === Number(selectedYear) &&
        rDate.getMonth() + 1 === Number(selectedMonth)
      );
    });
  } else if (dateScope === 'custom') {
    const rangeValidation = validateDateRange(startDate, endDate);
    if (!rangeValidation.isValid) {
      return []; // Return empty if date range is invalid
    }

    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);

    const startD = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
    const endD = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);

    filtered = filtered.filter((report) => {
      const rDate = parseReportDate(report);
      if (!rDate) return false;
      return rDate.getTime() >= startD.getTime() && rDate.getTime() <= endD.getTime();
    });
  }

  return filtered;
}

/**
 * Generates filename based on Export Date Scope.
 */
export function generateExportFilename(dateParams: ReportExportDateParams): string {
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'all') {
    return 'BOIMS_Report_History_All.xlsx';
  }

  if (dateScope === 'month') {
    const mm = String(selectedMonth).padStart(2, '0');
    return `BOIMS_Report_History_${selectedYear}-${mm}.xlsx`;
  }

  if (dateScope === 'custom') {
    return `BOIMS_Report_History_${startDate}_to_${endDate}.xlsx`;
  }

  return 'BOIMS_Report_History.xlsx';
}

/**
 * Formats a Date or string nicely for spreadsheet display.
 */
function formatExcelDateTime(dateVal?: string | null): string {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * Maps Category ID to readable label.
 */
function getCategoryLabel(catId?: string): string {
  if (!catId) return 'N/A';
  const found = INCIDENT_CATEGORIES.find((c) => c.id === catId);
  return found ? found.label : catId;
}

/**
 * Formats Status string nicely.
 */
function formatStatus(status?: string): string {
  if (!status) return 'N/A';
  switch (status) {
    case 'inProgress':
      return 'In Progress';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    case 'rejected':
      return 'Rejected';
    case 'transferred':
      return 'Transferred';
    case 'assigned':
      return 'Assigned';
    case 'pending':
      return 'Pending';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Executes the Excel export and triggers browser download.
 */
export function exportReportsToExcel(
  reportsToExport: Report[],
  dateParams: ReportExportDateParams
): { success: boolean; exportedCount: number; filename?: string; error?: string } {
  if (!reportsToExport || reportsToExport.length === 0) {
    return {
      success: false,
      exportedCount: 0,
      error: 'No reports match the selected filters.',
    };
  }

  try {
    const sheetData = reportsToExport.map((r, index) => ({
      '#': index + 1,
      'Report Number': r.reportNumber || r.reportId || '',
      'Title': r.title || 'N/A',
      'Incident Category': getCategoryLabel(r.category),
      'Status': formatStatus(r.status),
      'Priority': (r.priority || 'medium').toUpperCase(),
      'Description': r.description || '',
      'Purok / Sitio': r.purok || 'N/A',
      'Location Address': r.location?.address || 'N/A',
      'Reported By': r.isAnonymous ? 'Anonymous' : r.userName || 'Resident',
      'User Email': r.isAnonymous ? 'N/A' : r.userEmail || 'N/A',
      'Assigned Responder': r.assignedToName || 'Unassigned',
      'Report Date': formatExcelDateTime(r.createdAt),
      'Resolved Date': formatExcelDateTime(r.resolvedAt),
      'Resolution Remarks': r.resolutionRemarks || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetData);

    // Column formatting widths
    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 18 }, // Report Number
      { wch: 28 }, // Title
      { wch: 22 }, // Incident Category
      { wch: 14 }, // Status
      { wch: 12 }, // Priority
      { wch: 40 }, // Description
      { wch: 16 }, // Purok / Sitio
      { wch: 35 }, // Location Address
      { wch: 22 }, // Reported By
      { wch: 25 }, // User Email
      { wch: 22 }, // Assigned Responder
      { wch: 20 }, // Report Date
      { wch: 20 }, // Resolved Date
      { wch: 35 }, // Resolution Remarks
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report History');

    const filename = generateExportFilename(dateParams);
    XLSX.writeFile(workbook, filename);

    return {
      success: true,
      exportedCount: reportsToExport.length,
      filename,
    };
  } catch (err) {
    console.error('[ExcelReportExport] Export failed:', err);
    return {
      success: false,
      exportedCount: 0,
      error: 'An unexpected error occurred while generating the Excel spreadsheet.',
    };
  }
}
