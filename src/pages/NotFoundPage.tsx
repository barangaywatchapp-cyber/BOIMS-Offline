/**
 * Page: NotFoundPage (404 Page Not Found)
 * Standardized 404 page per UDS Vol 5
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '../components/foundation/Button';
import { ROUTES } from '../constants';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-xl text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
          <FileQuestion className="w-10 h-10" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">404 - Page Not Found</h1>

        <p className="text-xs text-slate-600 leading-relaxed">
          The requested page or route does not exist or may have been moved.
        </p>

        <div className="pt-4 flex justify-center">
          <NavLink to={ROUTES.DASHBOARD}>
            <Button variant="primary" icon={<ArrowLeft className="w-4 h-4" />}>
              Back to Safety
            </Button>
          </NavLink>
        </div>
      </div>
    </div>
  );
};
