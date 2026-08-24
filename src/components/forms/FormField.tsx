/**
 * Form Component: FormField
 * Wrapper for form controls managing label, required star, helper text, and validation error
 */

import React, { ReactNode } from 'react';
import { Label } from '../foundation/Label';

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  optional?: boolean;
  helperText?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  optional = false,
  helperText,
  error,
  htmlFor,
  className = '',
  children,
}) => {
  return (
    <div className={`flex flex-col mb-4 ${className}`}>
      {label && (
        <Label htmlFor={htmlFor} required={required} optional={optional}>
          {label}
        </Label>
      )}

      {children}

      {error ? (
        <span className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600"></span>
          {error}
        </span>
      ) : helperText ? (
        <span className="mt-1.5 text-xs text-slate-500">{helperText}</span>
      ) : null}
    </div>
  );
};
