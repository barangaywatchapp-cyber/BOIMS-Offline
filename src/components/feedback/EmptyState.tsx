/**
 * Feedback Component: EmptyState
 * Displays friendly placeholder illustration, description, and primary action button
 */

import React, { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <ShieldAlert className="w-12 h-12 text-slate-300 stroke-[1.5]" />,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-2xs ${className}`}
    >
      <div className="p-4 bg-slate-50 rounded-full mb-4 border border-slate-100 flex items-center justify-center">
        {icon}
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6">{description}</p>

      {action && <div className="inline-flex items-center">{action}</div>}
    </div>
  );
};
