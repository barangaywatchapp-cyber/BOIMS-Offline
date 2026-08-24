/**
 * Primary Application Shell & Provider Assembly
 */

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppRoutes } from './routes/AppRoutes';
import { useOfflineBootstrap } from './offline/useOfflineBootstrap';

export default function App() {
  useOfflineBootstrap();

  return (
    <BrowserRouter>
      <OfflineProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </OfflineProvider>
    </BrowserRouter>
  );
}