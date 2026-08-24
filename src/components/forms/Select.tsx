/**
 * Form Component: Select
 * Standardized dropdown menu
 */

import React, { SelectHTMLAttributes, ReactNode, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  error?: boolean;
  prefixIcon?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, error = false, prefixIcon, className = '', disabled, ...props }, ref) => {
    const errorStyles = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50/20'
      : 'border-slate-300 focus:ring-blue-600 focus:border-blue-600 bg-white';

    const disabledStyles = disabled
      ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
      : '';

    return (
      <div className="relative flex items-center w-full">
        {prefixIcon && (
          <div className="absolute left-3.5 text-slate-400 pointer-events-none shrink-0 flex items-center">
            {prefixIcon}
          </div>
        )}

        <select
          ref={ref}
          disabled={disabled}
          className={`w-full h-11 appearance-none px-3.5 py-2 text-sm text-slate-900 rounded-lg border shadow-2xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 pr-10 cursor-pointer ${
            prefixIcon ? 'pl-10' : ''
          } ${errorStyles} ${disabledStyles} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="absolute right-3.5 text-slate-400 pointer-events-none shrink-0 flex items-center">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
