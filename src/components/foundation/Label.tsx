/**
 * Foundation Component: Label
 * Accessible form field descriptor with required indicator
 */

import React, { LabelHTMLAttributes, ReactNode } from 'react';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
}

export const Label: React.FC<LabelProps> = ({
  children,
  required = false,
  optional = false,
  className = '',
  ...props
}) => {
  return (
    <label
      className={`block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5 ${className}`}
      {...props}
    >
      {children}
      {required && <span className="ml-1 text-red-600 font-bold" title="Required field">*</span>}
      {optional && <span className="ml-1 text-slate-400 font-normal lowercase">(optional)</span>}
    </label>
  );
};
