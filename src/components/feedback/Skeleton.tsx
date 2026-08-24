/**
 * Feedback Component: Skeleton
 * Content loading placeholder instead of raw spinners
 */

import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'button' | 'table';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'text' }) => {
  const baseClasses = 'animate-pulse bg-slate-200 rounded';

  if (variant === 'avatar') {
    return <div className={`${baseClasses} rounded-full w-10 h-10 ${className}`} />;
  }

  if (variant === 'button') {
    return <div className={`${baseClasses} rounded-lg h-10 w-28 ${className}`} />;
  }

  if (variant === 'card') {
    return (
      <div className={`p-6 rounded-2xl border border-slate-200 bg-white space-y-4 ${className}`}>
        <div className="h-4 bg-slate-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-8 bg-slate-200 rounded w-1/2 animate-pulse"></div>
        <div className="h-3 bg-slate-200 rounded w-full animate-pulse"></div>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`w-full space-y-3 p-4 bg-white border border-slate-200 rounded-xl ${className}`}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center space-x-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded w-1/6"></div>
          </div>
        ))}
      </div>
    );
  }

  return <div className={`${baseClasses} h-4 w-full ${className}`} />;
};
