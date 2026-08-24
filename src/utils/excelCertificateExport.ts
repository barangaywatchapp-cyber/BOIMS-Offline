/**
 * Excel Certificate Export Utility
 * Handles filtering and generating .xlsx spreadsheets for Certificate Request records,
 * including fee calculations, status filters, and summary totals.
 */

import * as XLSX from 'xlsx';
import { CertificateRequest, CertificateStatus, PaymentStatus } from '../types';
import { CERTIFICATE_TYPES } from '../constants';

export type ExportDateScopeOption = 'all' | 'month' | 'custom';

export interface CertificateExportFilterParams {
  selectedType: string;
  selectedStatus: string;
  searchQuery: string;
  userId?: string;
  isStaff: boolean;
}

export interface CertificateExportDateParams {
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
 * Safely parses the authoritative creation/request date for a certificate.
 */
export function parseCertificateDate(cert: CertificateRequest): Date | null {
  if (cert.createdAt) {
    const d = new Date(cert.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (cert.updatedAt) {
    const d = new Date(cert.updatedAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Filters certificate records using the page filters and export date scope.
 */
export function filterCertificatesForExport(
  rawCertificates: CertificateRequest[],
  pageFilters: CertificateExportFilterParams,
  dateParams: CertificateExportDateParams
): CertificateRequest[] {
  const { selectedType, selectedStatus, searchQuery } = pageFilters;

  // 1. Filter by Search Query
  let filtered = rawCertificates.filter((cert) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (cert.fullName || '').toLowerCase().includes(q) ||
      (cert.requestNumber || '').toLowerCase().includes(q) ||
      (cert.controlNumber && cert.controlNumber.toLowerCase().includes(q)) ||
      (cert.purpose || '').toLowerCase().includes(q)
    );
  });

  // 2. Filter by Certificate Type
  if (selectedType !== 'all') {
    filtered = filtered.filter((cert) => cert.certificateType === selectedType);
  }

  // 3. Filter by Status (matching exact logic from CertificatesListPage)
  if (selectedStatus !== 'all') {
    filtered = filtered.filter((cert) => {
      if (cert.status === selectedStatus) return true;
      if (selectedStatus === 'underReview' && cert.status === 'submitted') return true;
      if (
        selectedStatus === 'approved' &&
        (cert.status === 'processing' || cert.status === 'approvedUnderProcess')
      )
        return true;
      if (selectedStatus === 'claimed' && cert.status === 'released') return true;
      return false;
    });
  }

  // 4. Apply Export Date Scope Filter
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'month') {
    filtered = filtered.filter((cert) => {
      const cDate = parseCertificateDate(cert);
      if (!cDate) return false;
      return (
        cDate.getFullYear() === Number(selectedYear) &&
        cDate.getMonth() + 1 === Number(selectedMonth)
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

    filtered = filtered.filter((cert) => {
      const cDate = parseCertificateDate(cert);
      if (!cDate) return false;
      return cDate.getTime() >= startD.getTime() && cDate.getTime() <= endD.getTime();
    });
  }

  return filtered;
}

/**
 * Generates export filename based on date scope.
 */
export function generateCertificateExportFilename(dateParams: CertificateExportDateParams): string {
  const { dateScope, selectedMonth, selectedYear, startDate, endDate } = dateParams;

  if (dateScope === 'all') {
    return 'BOIMS_Certificate_History_All.xlsx';
  }

  if (dateScope === 'month') {
    const mm = String(selectedMonth).padStart(2, '0');
    return `BOIMS_Certificate_History_${selectedYear}-${mm}.xlsx`;
  }

  if (dateScope === 'custom') {
    return `BOIMS_Certificate_History_${startDate}_to_${endDate}.xlsx`;
  }

  return 'BOIMS_Certificate_History.xlsx';
}

/**
 * Formats datetime string for spreadsheet presentation.
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
 * Looks up certificate type label.
 */
function getCertificateTypeLabel(typeId?: string): string {
  if (!typeId) return 'N/A';
  const found = CERTIFICATE_TYPES.find((ct) => ct.id === typeId);
  return found ? found.label : typeId;
}

/**
 * Formats certificate status for display.
 */
function formatCertificateStatus(status?: CertificateStatus): string {
  if (!status) return 'N/A';
  switch (status) {
    case 'submitted':
    case 'underReview':
      return 'Under Review';
    case 'approved':
    case 'approvedUnderProcess':
    case 'processing':
      return 'Approved / Under Process';
    case 'readyForRelease':
      return 'Ready for Release';
    case 'released':
    case 'claimed':
      return 'Claimed';
    case 'expired':
      return 'Expired';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return String(status || 'N/A');
  }
}

/**
 * Formats payment status.
 */
function formatPaymentStatus(status?: PaymentStatus): string {
  if (!status) return 'Unpaid';
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'waived':
      return 'Waived (Free)';
    case 'unpaid':
    default:
      return 'Unpaid';
  }
}

/**
 * Executes the Excel export and triggers browser download.
 */
export function exportCertificatesToExcel(
  certificatesToExport: CertificateRequest[],
  dateParams: CertificateExportDateParams
): { success: boolean; exportedCount: number; totalAmount: number; filename?: string; error?: string } {
  if (!certificatesToExport || certificatesToExport.length === 0) {
    return {
      success: false,
      exportedCount: 0,
      totalAmount: 0,
      error: 'No certificates match the selected filters.',
    };
  }

  try {
    // Calculate total amount sum from actual exported records
    const totalAmount = certificatesToExport.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Map rows for Excel export
    const sheetRows: Record<string, any>[] = certificatesToExport.map((cert, index) => {
      const feeVal = typeof cert.amount === 'number' ? cert.amount : 0;
      return {
        '#': index + 1,
        'Request Number': cert.requestNumber || cert.certificateId || '',
        'Control Number': cert.controlNumber || 'N/A',
        'Applicant Name': cert.fullName || 'N/A',
        'Purok / Sitio': cert.purok || 'Purok 1',
        'Certificate Type': getCertificateTypeLabel(cert.certificateType),
        'Purpose': cert.purpose || 'N/A',
        'Status': formatCertificateStatus(cert.status),
        'Payment Status': formatPaymentStatus(cert.paymentStatus),
        'OR Number': cert.orNumber || 'N/A',
        'Fee / Amount (₱)': feeVal,
        'Applicant Phone': cert.phoneNumber || 'N/A',
        'Applicant Email': cert.email || 'N/A',
        'Business Name': cert.businessName || 'N/A',
        'Request Date': formatExcelDateTime(cert.createdAt),
        'Issued / Processed Date': formatExcelDateTime(cert.issuedAt || cert.approvedAt),
        'Claimed / Released Date': formatExcelDateTime(cert.claimedAt || cert.releasedAt),
      };
    });

    // Append blank row + Summary rows at the bottom
    sheetRows.push({}); // Empty separator row

    sheetRows.push({
      '#': '',
      'Request Number': 'TOTAL CERTIFICATES',
      'Control Number': '',
      'Applicant Name': `${certificatesToExport.length} record(s)`,
      'Purok / Sitio': '',
      'Certificate Type': '',
      'Purpose': '',
      'Status': '',
      'Payment Status': '',
      'OR Number': '',
      'Fee / Amount (₱)': '',
    });

    sheetRows.push({
      '#': '',
      'Request Number': 'TOTAL AMOUNT',
      'Control Number': '',
      'Applicant Name': `₱${totalAmount.toFixed(2)}`,
      'Purok / Sitio': '',
      'Certificate Type': '',
      'Purpose': '',
      'Status': '',
      'Payment Status': '',
      'OR Number': '',
      'Fee / Amount (₱)': totalAmount,
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);

    // Column widths formatting
    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 18 }, // Request Number
      { wch: 20 }, // Control Number
      { wch: 25 }, // Applicant Name
      { wch: 15 }, // Purok / Sitio
      { wch: 28 }, // Certificate Type
      { wch: 30 }, // Purpose
      { wch: 22 }, // Status
      { wch: 15 }, // Payment Status
      { wch: 16 }, // OR Number
      { wch: 18 }, // Fee / Amount (₱)
      { wch: 18 }, // Applicant Phone
      { wch: 25 }, // Applicant Email
      { wch: 22 }, // Business Name
      { wch: 20 }, // Request Date
      { wch: 22 }, // Issued / Processed Date
      { wch: 22 }, // Claimed / Released Date
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Certificate History');

    const filename = generateCertificateExportFilename(dateParams);
    XLSX.writeFile(workbook, filename);

    return {
      success: true,
      exportedCount: certificatesToExport.length,
      totalAmount,
      filename,
    };
  } catch (err) {
    console.error('[ExcelCertificateExport] Export failed:', err);
    return {
      success: false,
      exportedCount: 0,
      totalAmount: 0,
      error: 'An unexpected error occurred while generating the Excel spreadsheet.',
    };
  }
}
