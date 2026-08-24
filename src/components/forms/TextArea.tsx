/**
 * Form Component: TextArea
 * Multi-line input with optional character limit counter
 */

import React, { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  maxLength?: number;
  showCount?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ error = false, maxLength, showCount = false, className = '', disabled, value, ...props }, ref) => {
    const currentLength = typeof value === 'string' ? value.length : 0;

    const errorStyles = error
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50/20'
      : 'border-slate-300 focus:ring-blue-600 focus:border-blue-600 bg-white';

    const disabledStyles = disabled
      ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
      : '';

    return (
      <div className="relative w-full">
        <textarea
          ref={ref}
          disabled={disabled}
          value={value}
          maxLength={maxLength}
          className={`w-full min-h-[110px] p-3 text-sm text-slate-900 placeholder:text-slate-400 rounded-lg border shadow-2xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 resize-y ${errorStyles} ${disabledStyles} ${className}`}
          {...props}
        />

        {showCount && maxLength && (
          <div className="text-right text-[11px] text-slate-400 mt-1">
            {currentLength} / {maxLength}
          </div>
        )}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
