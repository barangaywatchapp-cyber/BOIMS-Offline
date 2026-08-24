/**
 * Form Component: SearchInput
 * Debounced search input control with clear button
 */

import React, { useState, useEffect, InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onSearch?: (value: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  debounceMs?: number;
  initialValue?: string;
  value?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  onChange,
  onClear,
  debounceMs = 300,
  initialValue = '',
  value,
  placeholder = 'Search records...',
  className = '',
  ...props
}) => {
  const isControlled = value !== undefined;
  const [internalTerm, setInternalTerm] = useState(initialValue);
  const currentTerm = isControlled ? value : internalTerm;

  useEffect(() => {
    if (!onSearch) return;
    const handler = setTimeout(() => {
      onSearch(currentTerm);
    }, debounceMs);

    return () => clearTimeout(handler);
  }, [currentTerm, debounceMs, onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) {
      setInternalTerm(e.target.value);
    }
    if (onChange) {
      onChange(e);
    }
  };

  const handleClear = () => {
    if (!isControlled) {
      setInternalTerm('');
    }
    if (onSearch) {
      onSearch('');
    }
    if (onClear) {
      onClear();
    }
    if (onChange) {
      const event = {
        target: { value: '' },
        currentTarget: { value: '' },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(event);
    }
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <div className="absolute left-3.5 text-slate-400 pointer-events-none">
        <Search className="w-4 h-4" />
      </div>

      <input
        type="text"
        value={currentTerm}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full h-10 pl-10 pr-9 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
        {...props}
      />

      {currentTerm && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none p-1 rounded-full cursor-pointer"
          title="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
