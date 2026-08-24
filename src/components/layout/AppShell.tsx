/**
 * Layout Component: AppShell
 * Root application wrapper assembling Sidebar, TopNavbar, BottomNavigation, NavigationDrawer,
 * OfflineBanner, and Toast Provider Container
 */

import * as React from 'react';
import { useState, ReactNode, ErrorInfo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { BottomNavigation } from './BottomNavigation';
import { NavigationDrawer } from './NavigationDrawer';
import { OfflineBanner } from '../feedback/OfflineBanner';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppShellErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppShell] Page rendering error caught:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const self = this as any;
    if (prevProps.resetKey !== self.props.resetKey && self.state.hasError) {
      self.setState({ hasError: false, error: null });
    }
  }

  render() {
    const self = this as any;
    if (self.state.hasError) {
      return (
        <div className="bg-white p-8 rounded-3xl border border-red-200 text-center space-y-4 max-w-xl mx-auto my-12 shadow-xs">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Unable to Render View</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            An internal view error occurred while rendering this module. Click below to reload the module view.
          </p>
          {self.state.error && (
            <div className="text-left bg-slate-900 text-red-300 p-4 rounded-xl overflow-auto max-h-60 text-xs font-mono">
              <div className="font-bold text-red-400 mb-1">{self.state.error.name}: {self.state.error.message}</div>
              <pre className="text-[10px] leading-tight whitespace-pre-wrap">{self.state.error.stack}</pre>
            </div>
          )}
          <button
            onClick={() => self.setState({ hasError: false, error: null })}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs gap-2 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Reload View
          </button>
        </div>
      );
    }
    return self.props.children;
  }
}

export interface AppShellProps {
  children?: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Offline Status & Sync Queue Banner */}
      <OfflineBanner />

      <div className="flex flex-1 relative">
        {/* Desktop Sidebar */}
        <Sidebar
          collapsed={collapsedSidebar}
          onToggleCollapse={() => setCollapsedSidebar(!collapsedSidebar)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          {/* Top Header Navbar */}
          <TopNavbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

          {/* Page Content Viewport */}
          <main className="flex-1 overflow-x-hidden p-3 sm:p-6 lg:p-8">
            <AppShellErrorBoundary resetKey={location.pathname}>
              <div key={location.pathname}>
                {children || <Outlet />}
              </div>
            </AppShellErrorBoundary>
          </main>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <NavigationDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavigation />
    </div>
  );
};
