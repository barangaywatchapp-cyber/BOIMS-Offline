/**
 * Component: ReportCard
 * Standardized fixed-height responsive card for incident reports
 */

import React from 'react';
import { Report } from '../../types';
import { INCIDENT_CATEGORIES } from '../../constants';
import { PriorityBadge } from '../feedback/PriorityBadge';
import { StatusChip } from '../feedback/StatusChip';
import { MapPin, EyeOff, ChevronRight, Calendar, User } from 'lucide-react';

export interface ReportCardProps {
  report: Report;
  onClick?: () => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({ report, onClick }) => {
  const categoryObj = INCIDENT_CATEGORIES.find((c) => c.id === report.category);

  // Format date cleanly
  const formattedDate = report.createdAt
    ? new Date(report.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div
      onClick={onClick}
      className="bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-[270px] min-h-[270px] overflow-hidden group select-none"
    >
      {/* Top Content Area */}
      <div className="space-y-3 min-w-0">
        {/* Header Row: ID + Priority + Status */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 shrink">
            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
              {report?.reportNumber || 'N/A'}
            </span>
            <div className="shrink-0">
              <PriorityBadge priority={report?.priority || 'low'} />
            </div>
          </div>
          <div className="shrink-0">
            <StatusChip status={report?.status || 'pending'} />
          </div>
        </div>

        {/* Title & Description */}
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 leading-snug">
            {report?.title || 'Incident Report'}
          </h3>
          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
            {report?.description || 'No description provided.'}
          </p>
        </div>
      </div>

      {/* Footer Area: Fixed at bottom */}
      <div className="mt-auto pt-3 border-t border-slate-100 space-y-2.5 min-w-0">
        {/* Location - strictly 1 line with ellipsis */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate line-clamp-1 block text-slate-600 font-medium">
            {report.location?.address || 'Location unspecified'}
          </span>
        </div>

        {/* Bottom Metadata & Action Row */}
        <div className="flex items-center justify-between gap-2 min-w-0 text-xs text-slate-500 pt-0.5">
          {/* Category & Reporter Tag */}
          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${
                categoryObj?.color || 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {categoryObj?.label || report.category}
            </span>

            {report.isAnonymous ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                <EyeOff className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="hidden sm:inline">Anonymous</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 truncate max-w-[100px] sm:max-w-[130px]">
                {report.userName || 'Citizen'}
              </span>
            )}
          </div>

          {/* Details Action Button - Always Right Aligned */}
          <div className="flex items-center gap-1 text-blue-700 font-bold text-xs shrink-0 group-hover:translate-x-1 transition-transform ml-auto">
            <span>Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
