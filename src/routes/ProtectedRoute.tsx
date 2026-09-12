/**
 * Route Guard: ProtectedRoute
 * Verifies authenticated session before rendering children
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../constants';
import { Skeleton } from '../components/feedback/Skeleton';

export interface ProtectedRouteProps {
  children: React.ReactElement;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <Skeleton variant="card" className="max-w-md w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Functional enforcement: newly provisioned users must complete password setup before accessing any protected application view
  if (user?.mustChangePassword) {
    return <Navigate to={ROUTES.SETUP_PASSWORD} replace />;
  }

  return children;
};
