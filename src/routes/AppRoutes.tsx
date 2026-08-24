/**
 * Central Route Configuration: AppRoutes
 * Manages public, protected, and role-guarded routes
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGuard } from './RoleGuard';
import { AppShell } from '../components/layout/AppShell';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ReportsListPage } from '../pages/ReportsListPage';
import { CreateReportPage } from '../pages/CreateReportPage';
import { ReportDetailsPage } from '../pages/ReportDetailsPage';
import { DispatchPage } from '../pages/DispatchPage';
import { CertificatesListPage } from '../pages/CertificatesListPage';
import { RequestCertificatePage } from '../pages/RequestCertificatePage';
import { CertificateDetailsPage } from '../pages/CertificateDetailsPage';
import { PrintCertificatePage } from '../pages/PrintCertificatePage';
import { VerifyCertificatePage } from '../pages/VerifyCertificatePage';
import { AnnouncementsListPage } from '../pages/AnnouncementsListPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ResidentsDirectoryPage } from '../pages/ResidentsDirectoryPage';
import { HouseholdsDirectoryPage } from '../pages/HouseholdsDirectoryPage';
import { DemographicsAnalyticsPage } from '../pages/DemographicsAnalyticsPage';
import { ALLOWED_ANALYTICS_ROLES, ALLOWED_SECRETARY_CHAIRMAN_ROLES } from '../utils/permissions';
import { BlotterPage } from '../pages/BlotterPage';
import { InventoryPage } from '../pages/InventoryPage';
import { UserManagementPage } from '../pages/UserManagementPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { OfflineSyncPage } from '../pages/OfflineSyncPage';
import { ProductionReadinessPage } from '../pages/ProductionReadinessPage';
import { RegisterPage } from '../pages/RegisterPage';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
import { PendingVerificationPage } from '../pages/PendingVerificationPage';
import { RegistrationApprovalPage } from '../pages/RegistrationApprovalPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { DashboardShellPage } from '../pages/DashboardShellPage';
import { ROUTES } from '../constants';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path={ROUTES.LANDING} element={<LandingPage />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
      <Route path={ROUTES.VERIFY_EMAIL} element={<VerifyEmailPage />} />
      <Route path={ROUTES.PENDING_VERIFICATION} element={<PendingVerificationPage />} />
      <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
      <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />
      <Route path={ROUTES.CERTIFICATE_VERIFY} element={<VerifyCertificatePage />} />

      {/* Standalone Protected Print Route (No AppShell) */}
      <Route
        path={ROUTES.CERTIFICATE_PRINT(':id')}
        element={
          <ProtectedRoute>
            <PrintCertificatePage />
          </ProtectedRoute>
        }
      />

      {/* Protected Layout Routes (Wrapped in ProtectedRoute and AppShell) */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path={ROUTES.DASHBOARD} element={<DashboardShellPage />} />
        <Route path={ROUTES.REPORTS} element={<ReportsListPage />} />
        <Route path={ROUTES.REPORT_CREATE} element={<CreateReportPage />} />
        <Route path={ROUTES.REPORT_DETAILS(':id')} element={<ReportDetailsPage />} />
        <Route path={ROUTES.CERTIFICATES} element={<CertificatesListPage />} />
        <Route path={ROUTES.CERTIFICATE_REQUEST} element={<RequestCertificatePage />} />
        <Route path={ROUTES.CERTIFICATE_DETAILS(':id')} element={<CertificateDetailsPage />} />
        <Route path={ROUTES.ANNOUNCEMENTS} element={<AnnouncementsListPage />} />
        <Route path={ROUTES.NOTIFICATIONS} element={<NotificationsPage />} />
        <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
        <Route path={ROUTES.HOUSEHOLDS} element={<HouseholdsDirectoryPage />} />
        <Route path={ROUTES.OFFLINE_SYNC} element={<OfflineSyncPage />} />
        <Route path={ROUTES.SYSTEM_HEALTH} element={<ProductionReadinessPage />} />

        {/* Role Guarded Administrative Routes */}
        <Route
          path={ROUTES.DISPATCH}
          element={
            <RoleGuard allowedRoles={ALLOWED_SECRETARY_CHAIRMAN_ROLES}>
              <DispatchPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.RESIDENTS}
          element={
            <RoleGuard requireResidentDirectory>
              <ResidentsDirectoryPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.ANALYTICS}
          element={
            <RoleGuard allowedRoles={ALLOWED_ANALYTICS_ROLES}>
              <DemographicsAnalyticsPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.BLOTTER}
          element={
            <RoleGuard allowedRoles={ALLOWED_SECRETARY_CHAIRMAN_ROLES}>
              <BlotterPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.INVENTORY}
          element={
            <RoleGuard allowedRoles={ALLOWED_SECRETARY_CHAIRMAN_ROLES}>
              <InventoryPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.REGISTRATION_APPROVALS}
          element={
            <RoleGuard allowedRoles={['verifier', 'secretary', 'admin', 'chairman', 'superAdmin']}>
              <RegistrationApprovalPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.USERS}
          element={
            <RoleGuard allowedRoles={['admin', 'chairman', 'superAdmin']}>
              <UserManagementPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.AUDIT_LOGS}
          element={
            <RoleGuard allowedRoles={['admin', 'chairman']}>
              <AuditLogsPage />
            </RoleGuard>
          }
        />

        <Route
          path={ROUTES.SETTINGS}
          element={
            <RoleGuard allowedRoles={ALLOWED_SECRETARY_CHAIRMAN_ROLES}>
              <SettingsPage />
            </RoleGuard>
          }
        />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
