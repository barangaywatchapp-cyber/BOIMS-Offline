/**
 * Foundation Component: Typography
 * Standardized typography scale matching UDS Vol 2
 */

import React, { ReactNode } from 'react';

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bodyLarge'
  | 'body'
  | 'small'
  | 'caption';

export interface TypographyProps {
  variant?: TypographyVariant;
  className?: string;
  children: ReactNode;
  as?: React.ElementType;
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'body',
  className = '',
  children,
  as,
}) => {
  const variantMap: Record<TypographyVariant, { tag: React.ElementType; classes: string }> = {
    display: { tag: 'h1', classes: 'text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900' },
    h1: { tag: 'h1', classes: 'text-3xl md:text-4xl font-bold tracking-tight text-slate-900' },
    h2: { tag: 'h2', classes: 'text-2xl md:text-3xl font-bold text-slate-900' },
    h3: { tag: 'h3', classes: 'text-xl md:text-2xl font-semibold text-slate-900' },
    h4: { tag: 'h4', classes: 'text-lg md:text-xl font-semibold text-slate-900' },
    h5: { tag: 'h5', classes: 'text-base md:text-lg font-medium text-slate-800' },
    h6: { tag: 'h6', classes: 'text-sm md:text-base font-medium text-slate-800' },
    bodyLarge: { tag: 'p', classes: 'text-base leading-relaxed text-slate-700' },
    body: { tag: 'p', classes: 'text-sm leading-normal text-slate-700' },
    small: { tag: 'span', classes: 'text-xs font-medium text-slate-600' },
    caption: { tag: 'span', classes: 'text-[11px] text-slate-500 tracking-wide' },
  };

  const { tag: DefaultTag, classes } = variantMap[variant];
  const Component = as || DefaultTag;

  return <Component className={`${classes} ${className}`}>{children}</Component>;
};
