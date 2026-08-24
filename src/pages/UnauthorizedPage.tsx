/**
 * Page: UnauthorizedPage (403 Access Denied)
 * Displays standard permission error per UDS Vol 5
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../components/foundation/Button';
import { ROUTES } from '../constants';

export const UnauthorizedPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-xl text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">403 - Access Denied</h1>

        <p className="text-xs text-slate-600 leading-relaxed">
          You do not have permission to access this module or resource. Please check your assigned user role or contact your Barangay System Administrator.
        </p>

        <div className="pt-4 flex justify-center">
          <NavLink to={ROUTES.DASHBOARD}>
            <Button variant="primary" icon={<ArrowLeft className="w-4 h-4" />}>
              Return to Dashboard
            </Button>
          </NavLink>
        </div>
      </div>
    </div>
  );
};
