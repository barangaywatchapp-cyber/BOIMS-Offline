/**
 * Feedback Component: Alert
 * Prominent callout box for warnings, success, error, and information
 */

import React, { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  onClose,
  className = '',
}) => {
  const alertStyles: Record<
    AlertType,
    { container: string; icon: ReactNode; titleColor: string }
  > = {
    info: {
      container: 'bg-sky-50 border-sky-200 text-sky-900',
      icon: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
      titleColor: 'text-sky-900',
    },
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      titleColor: 'text-emerald-900',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-900',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      titleColor: 'text-amber-900',
    },
    error: {
      container: 'bg-red-50 border-red-200 text-red-900',
      icon: <XCircle className="w-5 h-5 text-red-600 shrink-0" />,
      titleColor: 'text-red-900',
    },
  };

  const { container, icon, titleColor } = alertStyles[type];

  return (
    <div
      className={`p-4 rounded-xl border flex items-start gap-3 relative shadow-2xs ${container} ${className}`}
      role="alert"
    >
      {icon}
      <div className="flex-grow text-xs leading-relaxed">
        {title && <h4 className={`font-bold text-sm mb-1 ${titleColor}`}>{title}</h4>}
        <div>{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md shrink-0 cursor-pointer"
          title="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
