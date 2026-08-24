/**
 * Feedback Component: StatusChip
 * Color-coded workflow chips matching BOIMS status definitions
 */

import React from 'react';
import { ReportStatus, CertificateStatus, AccountStatus } from '../../types';

export type AnyStatus = ReportStatus | CertificateStatus | AccountStatus | string;

export interface StatusChipProps {
  status: AnyStatus;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const getStatusStyles = (s: AnyStatus): { label: string; classes: string } => {
    if (!s) {
      return { label: 'Unknown', classes: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    const safeStatus = String(s).toLowerCase();
    switch (safeStatus) {
      // Pending / Submitted
      case 'pending':
      case 'submitted':
      case 'underreview':
        return { label: s === 'underreview' ? 'Under Review' : s.charAt(0).toUpperCase() + s.slice(1), classes: 'bg-amber-100 text-amber-800 border-amber-200' };

      // Assigned / In Progress
      case 'assigned':
        return { label: 'Assigned', classes: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'inprogress':
        return { label: 'In Progress', classes: 'bg-indigo-100 text-indigo-800 border-indigo-200' };

      // Resolved / Approved / Active
      case 'resolved':
      case 'approved':
      case 'active':
      case 'released':
      case 'claimed':
        return { label: s.charAt(0).toUpperCase() + s.slice(1), classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' };

      // Ready for release
      case 'readyforrelease':
        return { label: 'Ready for Release', classes: 'bg-teal-100 text-teal-800 border-teal-200' };

      // Transferred / Escalated
      case 'transferred':
        return { label: 'Transferred', classes: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'escalated':
        return { label: 'Escalated', classes: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' };

      // Closed / Inactive
      case 'closed':
      case 'inactive':
        return { label: s.charAt(0).toUpperCase() + s.slice(1), classes: 'bg-slate-100 text-slate-700 border-slate-200' };

      // Rejected / Suspended / Danger
      case 'rejected':
      case 'suspended':
      case 'failed':
        return { label: s.charAt(0).toUpperCase() + s.slice(1), classes: 'bg-red-100 text-red-800 border-red-200' };

      default:
        return { label: s, classes: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const { label, classes } = getStatusStyles(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${classes} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-75 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
};
