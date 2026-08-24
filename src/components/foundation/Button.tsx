/**
 * Foundation Component: Button
 * Reusable button supporting variants, sizes, icons, loading, and disabled states
 */

import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  children,
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-blue-700 hover:bg-blue-800 text-white shadow-sm hover:shadow focus:ring-blue-600 border border-transparent',
    secondary:
      'bg-blue-100 hover:bg-blue-200 text-blue-800 focus:ring-blue-500 border border-transparent',
    outline:
      'bg-white hover:bg-slate-50 text-blue-700 border border-blue-600 focus:ring-blue-500',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-700 focus:ring-slate-400 border border-transparent',
    danger:
      'bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500 border border-transparent',
    link:
      'bg-transparent text-blue-700 hover:underline p-0 focus:ring-blue-500 border border-transparent',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-3 py-1.5 min-h-[32px] gap-1.5',
    md: 'text-sm px-4 py-2 min-h-[42px] gap-2',
    lg: 'text-base px-6 py-2.5 min-h-[50px] gap-2.5',
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-current" />
          <span>Processing...</span>
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>}
          <span>{children}</span>
          {icon && iconPosition === 'right' && <span className="shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
};
