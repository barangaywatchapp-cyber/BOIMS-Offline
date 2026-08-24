/**
 * Layout Component: PageContainer
 * Standard page layout container with title, description, header actions, and maximum width
 */

import React, { ReactNode } from 'react';

export interface PageContainerProps {
  title?: string;
  description?: string;
  headerActions?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  description,
  headerActions,
  actions,
  children,
  className = '',
}) => {
  const renderedActions = headerActions || actions;

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ${className}`}>
      {(title || description || renderedActions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-200/80">
          <div>
            {title && <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>}
            {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
          </div>

          {renderedActions && <div className="flex items-center gap-3 shrink-0">{renderedActions}</div>}
        </div>
      )}

      {children}
    </div>
  );
};
