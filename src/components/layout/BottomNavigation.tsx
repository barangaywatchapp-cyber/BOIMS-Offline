/**
 * Layout Component: BottomNavigation
 * Mobile bottom navigation bar for quick 1-tap navigation on smartphones
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { isResidentMode } from '../../utils/permissions';
import { LayoutDashboard, FileText, PlusCircle, Bell, User } from 'lucide-react';

export const BottomNavigation: React.FC = () => {
  const { user, role } = useAuth();

  const getQuickActionRoute = () => {
    if (isResidentMode(user, role)) return ROUTES.REPORT_CREATE;
    if (role === 'secretary') return ROUTES.CERTIFICATES;
    if (role === 'chairman') return ROUTES.DISPATCH;
    return ROUTES.REPORTS;
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg px-2 py-1 flex items-center justify-around">
      <NavLink
        to={ROUTES.DASHBOARD}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`
        }
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span>Dashboard</span>
      </NavLink>

      <NavLink
        to={ROUTES.REPORTS}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`
        }
      >
        <FileText className="w-5 h-5 mb-0.5" />
        <span>Reports</span>
      </NavLink>

      {/* Quick Action Button */}
      <NavLink
        to={getQuickActionRoute()}
        className="flex flex-col items-center justify-center -mt-5 p-2 bg-blue-700 text-white rounded-full shadow-lg ring-4 ring-white hover:bg-blue-800 transition-transform active:scale-95"
        title="Quick Action"
      >
        <PlusCircle className="w-6 h-6" />
      </NavLink>

      <NavLink
        to={ROUTES.NOTIFICATIONS}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`
        }
      >
        <Bell className="w-5 h-5 mb-0.5" />
        <span>Alerts</span>
      </NavLink>

      <NavLink
        to={ROUTES.PROFILE}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium transition-colors ${
            isActive ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`
        }
      >
        <User className="w-5 h-5 mb-0.5" />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
};
