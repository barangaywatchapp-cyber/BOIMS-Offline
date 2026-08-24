/**
 * Foundation Component: Badge
 * Descriptive metadata pill or badge
 */

import React, { ReactNode } from 'react';

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'outline';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  pill?: boolean;
  className?: string;
  icon?: ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  pill = true,
  className = '',
  icon,
}) => {
  const variantClasses: Record<BadgeVariant, string> = {
    primary: 'bg-blue-100 text-blue-800 border-blue-200',
    secondary: 'bg-slate-100 text-slate-800 border-slate-200',
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-sky-100 text-sky-800 border-sky-200',
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    outline: 'bg-white text-slate-700 border-slate-300',
  };

  const shapeClass = pill ? 'rounded-full' : 'rounded-md';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold border ${shapeClass} ${variantClasses[variant]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
};
