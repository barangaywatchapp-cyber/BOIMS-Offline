/**
 * Feedback Component: PriorityBadge
 * Color-coded badge for report priority levels
 */

import React from 'react';
import { ReportPriority } from '../../types';

export interface PriorityBadgeProps {
  priority: ReportPriority;
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, className = '' }) => {
  const getStyles = (p: ReportPriority | string) => {
    const safeP = (p || '').toString().toLowerCase();
    switch (safeP) {
      case 'critical':
        return { label: 'CRITICAL', classes: 'bg-red-600 text-white font-bold border-red-700 animate-pulse' };
      case 'high':
        return { label: 'High', classes: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'medium':
        return { label: 'Medium', classes: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'low':
      default:
        return { label: 'Low', classes: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const { label, classes } = getStyles(priority);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold border ${classes} ${className}`}
    >
      {label}
    </span>
  );
};
