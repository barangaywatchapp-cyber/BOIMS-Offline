/**
 * Route Guard: RoleGuard
 * Enforces Role-Based Access Control (RBAC) per Role Permission Matrix
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { ROUTES } from '../constants';
import { canAccessMyHousehold, canAccessResidentDirectory } from '../utils/permissions';

export interface RoleGuardProps {
  allowedRoles?: UserRole[];
  requireResidentMode?: boolean;
  requireResidentDirectory?: boolean;
  children: React.ReactElement;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  requireResidentMode,
  requireResidentDirectory,
  children,
}) => {
  const { user, role } = useAuth();

  if (requireResidentDirectory) {
    if (!canAccessResidentDirectory(role)) {
      return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
    }
  }

  if (requireResidentMode) {
    if (!canAccessMyHousehold(user, role)) {
      return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
    }
  }

  if (allowedRoles) {
    if (!role || !allowedRoles.includes(role)) {
      return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
    }
  }

  return children;
};
