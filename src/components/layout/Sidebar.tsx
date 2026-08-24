/**
 * Layout Component: Sidebar
 * Desktop 280px navigation sidebar with role-based menu items and collapse toggle
 */

import React from 'react';
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
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Activity,
  RefreshCw,
  User,
} from 'lucide-react';

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggleCollapse }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

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

    // Residents Directory Navigation Item (Secretary, Chairman, Admin, Super Admin, Developer)
    if (canAccessResidentDirectory(role)) {
      items.push({ label: 'Residents Directory', path: ROUTES.RESIDENTS, icon: <Users className="w-5 h-5" /> });
    }

    // My Household Navigation Item (Visible only when operating in Resident Mode)
    if (canAccessMyHousehold(user, role)) {
      items.push({
        label: 'My Household',
        path: ROUTES.HOUSEHOLDS,
        icon: <Boxes className="w-5 h-5" />,
      });
    }

    // My Profile Navigation Item (Visible when operating in Resident Mode)
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

    if (role === 'admin' || role === 'chairman') {
      items.push({ label: 'Audit Trail Logs', path: ROUTES.AUDIT_LOGS, icon: <Activity className="w-5 h-5" /> });
    }

    if (role === 'admin' || role === 'chairman' || role === 'secretary' || role === 'superAdmin') {
      items.push({ label: 'Registration Requests', path: ROUTES.REGISTRATION_APPROVALS, icon: <UserCheck className="w-5 h-5" /> });
    }

    if (role === 'admin' || role === 'chairman' || role === 'superAdmin') {
      items.push({ label: 'User Management', path: ROUTES.USERS, icon: <Users className="w-5 h-5" /> });
    }

    if (canAccessSystemSettings(role)) {
      items.push({ label: 'System Settings', path: ROUTES.SETTINGS, icon: <Settings className="w-5 h-5" /> });
    }

    items.push({ label: 'Offline Queue & Sync', path: ROUTES.OFFLINE_SYNC, icon: <RefreshCw className="w-5 h-5" /> });
    items.push({ label: 'Production Readiness', path: ROUTES.SYSTEM_HEALTH, icon: <ShieldCheck className="w-5 h-5" /> });

    return items;
  };

  const navItems = getNavItems();

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const roleInfo = role ? ROLE_LABELS[role] : null;

  return (
    <aside
      className={`hidden md:flex flex-col h-screen sticky top-0 bg-slate-900 text-white transition-all duration-300 z-30 shadow-xl border-r border-slate-800 ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
        <NavLink to={ROUTES.DASHBOARD} className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shrink-0 shadow-md">
            <Shield className="w-6 h-6 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-white leading-tight">
                BOIMS
              </span>
              <span className="text-[10px] text-blue-400 font-medium tracking-wider uppercase">
                Barangay Operating System
              </span>
            </div>
          )}
        </NavLink>

        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-blue-700 text-white shadow-md font-bold'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${collapsed ? 'justify-center px-0' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Footer Profile */}
      {user && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <Avatar name={user.fullName || 'User'} src={user.profilePicture} size="sm" />
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate">{user.fullName}</span>
                  <span className="text-[10px] text-blue-400 truncate font-medium">
                    {roleInfo?.label || user.role}
                  </span>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
