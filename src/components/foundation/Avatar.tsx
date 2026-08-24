/**
 * Foundation Component: Avatar
 * Renders user profile photo or initials fallback with status indicator
 */

import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className = '',
}) => {
  const getInitials = (fullName: string): string => {
    if (!fullName) return 'U';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizeClasses: Record<AvatarSize, { container: string; text: string; dot: string }> = {
    xs: { container: 'w-6 h-6', text: 'text-[10px]', dot: 'w-1.5 h-1.5' },
    sm: { container: 'w-8 h-8', text: 'text-xs', dot: 'w-2 h-2' },
    md: { container: 'w-10 h-10', text: 'text-sm', dot: 'w-2.5 h-2.5' },
    lg: { container: 'w-14 h-14', text: 'text-lg', dot: 'w-3.5 h-3.5' },
    xl: { container: 'w-20 h-20', text: 'text-2xl', dot: 'w-4 h-4' },
  };

  const statusColors = {
    online: 'bg-emerald-500 ring-white ring-2',
    offline: 'bg-slate-400 ring-white ring-2',
    busy: 'bg-red-500 ring-white ring-2',
    away: 'bg-amber-500 ring-white ring-2',
  };

  const { container, text, dot } = sizeClasses[size];

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${container} rounded-full object-cover border border-slate-200 shadow-xs`}
        />
      ) : (
        <div
          className={`${container} ${text} rounded-full bg-blue-700 text-white font-bold flex items-center justify-center border border-blue-800 shadow-xs uppercase tracking-wider`}
        >
          {getInitials(name)}
        </div>
      )}

      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ${dot} ${statusColors[status]}`}
          title={`Status: ${status}`}
        />
      )}
    </div>
  );
};
