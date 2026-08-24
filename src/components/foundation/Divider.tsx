/**
 * Foundation Component: Divider
 * Visual separator for section grouping
 */

import React from 'react';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  className = '',
  label,
}) => {
  if (orientation === 'vertical') {
    return <div className={`inline-block w-px self-stretch bg-slate-200 ${className}`} />;
  }

  if (label) {
    return (
      <div className={`relative flex py-3 items-center ${className}`}>
        <div className="flex-grow border-t border-slate-200"></div>
        <span className="flex-shrink mx-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div className="flex-grow border-t border-slate-200"></div>
      </div>
    );
  }

  return <hr className={`border-0 border-t border-slate-200 my-4 ${className}`} />;
};
