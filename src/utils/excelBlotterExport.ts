/**
 * Excel Blotter Export Utility
 * Handles filtering and generating .xlsx spreadsheets for Blotter Case records.
 */

import * as XLSX from 'xlsx';
import { BlotterCase, BlotterStatus } from '../types';

export type ExportDateScopeOption = 'all' | 'month' | 'custom';

export interface BlotterExportFilterParams {
  searchQuery: string;
  statusFilter: string; // 'all' | 'open' | 'scheduled' | 'resolved' | 'cfa' | etc.
  overrideStatusFilter?: boolean;
}

export interface BlotterExportDateParams {
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
 * Helper to safely extract a Javascript Date object from a blotter case's incidentDate or createdAt field.
 */
export function parseBlotterDate(blotter: BlotterCase): Date | null {
  if (blotter.incidentDate) {
    const d = new Date(blotter.incidentDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (blotter.createdAt) {
    const d = new Date(blotter.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Filter accessible blotter cases by page filters AND export date scope.
 */
export function filterBlottersForExport(
  rawCases: BlotterCase[],
  pageFilters: BlotterExportFilterParams,
  dateParams: BlotterExportDateParams
): BlotterCase[] {
  const { searchQuery, statusFilter, overrideStatusFilter } = pageFilters;

  let filtered = rawCases;

  // 1. Apply Search Query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (c) =>
        (c.caseNumber || '').toLowerCase().includes(q) ||
        (c.complainantName || '').toLowerCase().includes(q) ||
        (c.respondentName || '').toLowerCase().includes(q) ||
        (c.incidentType || '').toLowerCase().includes(q) ||
        (c.purok || '').toLowerCase().includes(q) ||
        (c.incidentLocation || '').toLowerCase().includes(q) ||
        (c.narrative || '').toLowerCase().includes(q)
    );
  }

  // 2. Apply Status Filter (unless overrideStatusFilter is set)
  if (!overrideStatusFilter && statusFilter !== 'all') {
    if (statusFilter === 'cfa') {
      filtered = filtered.filter((c) => c.cfaIssued === true);
    } else {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }
  }

  // 3. Apply Export Date Scope filter
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'month') {
    filtered = filtered.filter((c) => {
      const bDate = parseBlotterDate(c);
      if (!bDate) return false;
      return (
        bDate.getFullYear() === Number(selectedYear) &&
        bDate.getMonth() + 1 === Number(selectedMonth)
      );
    });
  } else if (dateScope === 'custom') {
    const rangeValidation = validateDateRange(startDate, endDate);
    if (!rangeValidation.isValid) {
      return [];
    }

    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);

    const startD = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
    const endD = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);

    filtered = filtered.filter((c) => {
      const bDate = parseBlotterDate(c);
      if (!bDate) return false;
      return bDate.getTime() >= startD.getTime() && bDate.getTime() <= endD.getTime();
    });
  }

  return filtered;
}

/**
 * Generates filename based on Export Date Scope.
 */
export function generateBlotterExportFilename(dateParams: BlotterExportDateParams): string {
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'all') {
    return 'BOIMS_Blotter_Records_All.xlsx';
  }

  if (dateScope === 'month') {
    const mm = String(selectedMonth).padStart(2, '0');
    return `BOIMS_Blotter_Records_${selectedYear}-${mm}.xlsx`;
  }

  if (dateScope === 'custom') {
    return `BOIMS_Blotter_Records_${startDate}_to_${endDate}.xlsx`;
  }

  return 'BOIMS_Blotter_Records.xlsx';
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
 * Formats Status string nicely.
 */
function formatStatus(status?: BlotterStatus, cfaIssued?: boolean): string {
  if (cfaIssued) return 'CFA Issued (KP Form 20)';
  if (!status) return 'N/A';
  switch (status) {
    case 'open':
      return 'Open';
    case 'underInvestigation':
      return 'Under Investigation';
    case 'scheduled':
      return 'Hearing Scheduled';
    case 'resolved':
      return 'Resolved / Settled';
    case 'closed':
      return 'Closed';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

/**
 * Formats hearing schedule info
 */
function formatHearingSchedule(c: BlotterCase): string {
  if (c.hearingSchedule) return c.hearingSchedule;
  if (c.hearings && c.hearings.length > 0) {
    const latest = c.hearings[c.hearings.length - 1];
    return `Hearing #${latest.hearingNumber} on ${latest.scheduledDate} ${latest.scheduledTime || ''} (${latest.status})`;
  }
  return 'None';
}

/**
 * Executes the Excel export and triggers browser download.
 */
export function exportBlottersToExcel(
  casesToExport: BlotterCase[],
  dateParams: BlotterExportDateParams
): { success: boolean; exportedCount: number; filename?: string; error?: string } {
  if (!casesToExport || casesToExport.length === 0) {
    return {
      success: false,
      exportedCount: 0,
      error: 'No blotter records match the selected filters.',
    };
  }

  try {
    const sheetData = casesToExport.map((c, index) => ({
      '#': index + 1,
      'Case Number': c.caseNumber || '',
      'Complainant Name': c.complainantName || 'N/A',
      'Complainant Contact': c.complainantContact || 'N/A',
      'Complainant Address': c.complainantAddress || 'N/A',
      'Respondent Name': c.respondentName || 'N/A',
      'Respondent Contact': c.respondentContact || 'N/A',
      'Respondent Address': c.respondentAddress || 'N/A',
      'Incident Type': c.incidentType || 'N/A',
      'Incident Date': formatExcelDateTime(c.incidentDate),
      'Incident Location': c.incidentLocation || 'N/A',
      'Purok / Sitio': c.purok || 'N/A',
      'Status': formatStatus(c.status, c.cfaIssued),
      'Narrative / Description': c.narrative || '',
      'Assigned Officer': c.assignedOfficerName || c.assignedOfficer || 'Unassigned',
      'Hearing Schedule': formatHearingSchedule(c),
      'Resolution Summary': c.resolutionSummary || 'N/A',
      'CFA Issued': c.cfaIssued ? 'Yes' : 'No',
      'CFA Control Number': c.cfaControlNumber || (c.cfaIssued ? 'KP Form 20' : 'N/A'),
      'CFA Issued Date': c.cfaIssuedAt ? formatExcelDateTime(c.cfaIssuedAt) : 'N/A',
      'Filed Date': formatExcelDateTime(c.createdAt),
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetData);

    // Column formatting widths
    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 18 }, // Case Number
      { wch: 25 }, // Complainant Name
      { wch: 18 }, // Complainant Contact
      { wch: 30 }, // Complainant Address
      { wch: 25 }, // Respondent Name
      { wch: 18 }, // Respondent Contact
      { wch: 30 }, // Respondent Address
      { wch: 22 }, // Incident Type
      { wch: 20 }, // Incident Date
      { wch: 28 }, // Incident Location
      { wch: 16 }, // Purok / Sitio
      { wch: 22 }, // Status
      { wch: 45 }, // Narrative
      { wch: 24 }, // Assigned Officer
      { wch: 30 }, // Hearing Schedule
      { wch: 35 }, // Resolution Summary
      { wch: 12 }, // CFA Issued
      { wch: 20 }, // CFA Control Number
      { wch: 20 }, // CFA Date
      { wch: 20 }, // Filed Date
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Blotter Records');

    const filename = generateBlotterExportFilename(dateParams);
    XLSX.writeFile(workbook, filename);

    return {
      success: true,
      exportedCount: casesToExport.length,
      filename,
    };
  } catch (err) {
    console.error('[ExcelBlotterExport] Export failed:', err);
    return {
      success: false,
      exportedCount: 0,
      error: 'An unexpected error occurred while generating the Excel spreadsheet.',
    };
  }
}
