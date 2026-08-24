/**
 * Layout Component: NavigationDrawer
 * Mobile drawer sidebar for mobile navigation
 */

import React, { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_LABELS, ROUTES } from '../../constants';
import { Avatar } from '../foundation/Avatar';
import {
  canAccessResidentDirectory,
  canAccessMyHousehold,
  canShowMyProfileInNav,
  canAccessAnalytics,
  canAccessDispatchConsole,
  canAccessBlotter,
  canAccessInventory,
  canAccessSystemSettings,
} from '../../utils/permissions';
import {
  X,
  Shield,
  LayoutDashboard,
  FileText,
  FileBadge,
  Megaphone,
  Bell,
  Boxes,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  UserCheck,
  User,
} from 'lucide-react';

export interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({ isOpen, onClose }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const getNavItems = () => {
    if (role === 'verifier') {
      return [
        { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: <LayoutDashboard className="w-5 h-5" /> },
        { label: 'Announcements', path: ROUTES.ANNOUNCEMENTS, icon: <Megaphone className="w-5 h-5" /> },
        { label: 'Notifications', path: ROUTES.NOTIFICATIONS, icon: <Bell className="w-5 h-5" /> },
      ];
    }

    const items = [
      { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: <LayoutDashboard className="w-5 h-5" /> },
      { label: 'Reports', path: ROUTES.REPORTS, icon: <FileText className="w-5 h-5" /> },
      { label: 'Certificates', path: ROUTES.CERTIFICATES, icon: <FileBadge className="w-5 h-5" /> },
      { label: 'Announcements', path: ROUTES.ANNOUNCEMENTS, icon: <Megaphone className="w-5 h-5" /> },
      { label: 'Notifications', path: ROUTES.NOTIFICATIONS, icon: <Bell className="w-5 h-5" /> },
    ];

    if (canAccessDispatchConsole(role)) {
      items.push({ label: 'Dispatch Center', path: ROUTES.DISPATCH, icon: <ShieldCheck className="w-5 h-5" /> });
    }

    if (canAccessResidentDirectory(role)) {
      items.push({ label: 'Residents Directory', path: ROUTES.RESIDENTS, icon: <Users className="w-5 h-5" /> });
    }

    if (canAccessMyHousehold(user, role)) {
      items.push({
        label: 'My Household',
        path: ROUTES.HOUSEHOLDS,
        icon: <Boxes className="w-5 h-5" />,
      });
    }

    if (canShowMyProfileInNav(user, role)) {
      items.push({
        label: 'My Profile',
        path: ROUTES.PROFILE,
        icon: <User className="w-5 h-5" />,
      });
    }

    if (canAccessAnalytics(role)) {
      items.push({ label: 'Demographic Analytics', path: ROUTES.ANALYTICS, icon: <BarChart3 className="w-5 h-5" /> });
    }

    if (canAccessBlotter(role)) {
      items.push({ label: 'Blotter Management', path: ROUTES.BLOTTER, icon: <Shield className="w-5 h-5" /> });
    }

    if (canAccessInventory(role)) {
      items.push({ label: 'Inventory Assets', path: ROUTES.INVENTORY, icon: <Boxes className="w-5 h-5" /> });
    }

    if (role === 'admin' || role === 'chairman' || role === 'superAdmin') {
      items.push({ label: 'User Management', path: ROUTES.USERS, icon: <UserCheck className="w-5 h-5" /> });
    }

    if (canAccessSystemSettings(role)) {
      items.push({ label: 'System Settings', path: ROUTES.SETTINGS, icon: <Settings className="w-5 h-5" /> });
    }

    return items;
  };

  const navItems = getNavItems();
  const roleInfo = role ? ROLE_LABELS[role] : null;

  return (
    <div className="fixed inset-0 z-50 md:hidden overflow-hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-80 max-w-[85vw] bg-slate-900 text-white flex flex-col h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base block leading-none">BOIMS</span>
              <span className="text-[10px] text-blue-400 font-medium">Navigation</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        {user && (
          <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center gap-3">
            <Avatar name={user.fullName || 'User'} src={user.profilePicture} size="md" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate">{user.fullName}</span>
              <span className="text-xs text-blue-400 font-medium">
                {roleInfo?.label || user.role}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-700 text-white font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer border border-red-500/30"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
