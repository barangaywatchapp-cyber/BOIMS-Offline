/**
 * Form Component: PasswordInput
 * Password input field with show/hide visibility toggle
 */

import React, { useState, forwardRef } from 'react';
import { TextInput, TextInputProps } from './TextInput';
import { Eye, EyeOff, Lock } from 'lucide-react';

export interface PasswordInputProps extends Omit<TextInputProps, 'type'> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ prefixIcon = <Lock className="w-4 h-4" />, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <TextInput
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        prefixIcon={prefixIcon}
        suffixIcon={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-slate-400 hover:text-slate-600 focus:outline-none focus:text-blue-600 cursor-pointer p-1"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
        {...props}
      />
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
