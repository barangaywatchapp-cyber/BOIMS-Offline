/**
 * Route Guard: PasswordSetupRoute
 * Only accessible to authenticated users whose mustChangePassword flag is true.
 * Redirects unauthenticated users to /login.
 * Redirects users whose mustChangePassword flag is false/cleared to their role dashboard.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../constants';
import { getRoleDashboardRoute } from '../utils/permissions';
import { Skeleton } from '../components/feedback/Skeleton';

export interface PasswordSetupRouteProps {
  children: React.ReactElement;
}

export const PasswordSetupRoute: React.FC<PasswordSetupRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <Skeleton variant="card" className="max-w-md w-full" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // If the user does not need password setup, direct them to their canonical role dashboard
  if (!user.mustChangePassword) {
    return <Navigate to={getRoleDashboardRoute(user.role)} replace />;
  }

  return children;
};
