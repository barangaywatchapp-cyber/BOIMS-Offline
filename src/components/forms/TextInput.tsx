/**
 * Form Component: TextInput
 * Standardized input for text, email, number, tel, etc.
 */

import React, { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
  error?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ prefixIcon, suffixIcon, error = false, className = '', disabled, ...props }, ref) => {
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

        <input
          ref={ref}
          disabled={disabled}
          className={`w-full h-11 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 rounded-lg border shadow-2xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
            prefixIcon ? 'pl-10' : ''
          } ${suffixIcon ? 'pr-10' : ''} ${errorStyles} ${disabledStyles} ${className}`}
          {...props}
        />

        {suffixIcon && (
          <div className="absolute right-3.5 text-slate-400 shrink-0 flex items-center">
            {suffixIcon}
          </div>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';
