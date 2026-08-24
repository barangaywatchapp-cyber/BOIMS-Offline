/**
 * Layout Component: TopNavbar
 * Top bar featuring branding, global search, online/offline status indicator,
 * notification bell, and user avatar menu
 */

import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOffline } from '../../contexts/OfflineContext';
import { useToast } from '../../contexts/ToastContext';
import { ROLE_LABELS, ROUTES } from '../../constants';
import { notificationService } from '../../services/notificationService';
import { Avatar } from '../foundation/Avatar';
import { Badge } from '../foundation/Badge';
import { Modal } from '../feedback/Modal';
import {
  Bell,
  Menu,
  Search,
  Wifi,
  WifiOff,
  User,
  LogOut,
  ChevronDown,
  RefreshCw,
  Shield,
  Sliders,
  Radio,
  Activity,
  Clock,
} from 'lucide-react';

export interface TopNavbarProps {
  onOpenMobileMenu: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ onOpenMobileMenu }) => {
  const { user, role, isAuthInitialized, logout, updateDutyMode } = useAuth();
  const { isOnline, pendingCount, isSyncing, triggerSync } = useOffline();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showDutyModal, setShowDutyModal] = useState(false);
  const [isSavingDuty, setIsSavingDuty] = useState(false);
  const [dutyError, setDutyError] = useState<string | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  useEffect(() => {
    if (!isAuthInitialized || !user?.uid) {
      setUnreadNotifCount(0);
      return;
    }

    const unsubscribe = notificationService.subscribeToUserNotifications(
      user.uid,
      role,
      user,
      (notifs) => {
        const unread = notifs.filter((n) => !n.isRead).length;
        setUnreadNotifCount(unread);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, user?.uid, role]);

  const handleLogout = async () => {
    notificationService.clearMemoryCache();
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const currentMode =
    user?.dutyStatus === 'onDuty' && user?.dutyMode === 'dispatcher'
      ? 'dispatcher'
      : user?.dutyStatus === 'onDuty' && user?.dutyMode === 'responder'
      ? 'responder'
      : 'offDuty';

  const handleSelectDutyMode = async (status: 'onDuty' | 'offDuty', mode: 'dispatcher' | 'responder' | 'offDuty') => {
    try {
      setIsSavingDuty(true);
      setDutyError(null);
      await updateDutyMode(status, mode);
      showToast(
        mode === 'dispatcher'
          ? 'Duty mode changed to Dispatcher.'
          : mode === 'responder'
          ? 'Duty mode changed to Field Responder.'
          : 'Status changed to Off Duty.',
        'success'
      );
      setShowDutyModal(false);
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update duty mode.';
      setDutyError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsSavingDuty(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 w-full h-16 bg-white border-b border-slate-200/80 shadow-2xs flex items-center justify-between px-4 sm:px-6">
      {/* Left: Mobile Menu Trigger & Branding */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Logo */}
        <NavLink to={ROUTES.DASHBOARD} className="md:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-base text-slate-900 tracking-tight">BOIMS</span>
        </NavLink>
      </div>

      {/* Middle: Network Status Badge */}
      <div className="hidden lg:flex items-center gap-2">
        {isOnline ? (
          <Badge variant="success" icon={<Wifi className="w-3 h-3 text-emerald-600" />}>
            System Online
          </Badge>
        ) : (
          <Badge variant="warning" icon={<WifiOff className="w-3 h-3 text-amber-600" />}>
            Offline Mode
          </Badge>
        )}

        {pendingCount > 0 && (
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-full border border-amber-200 transition-colors cursor-pointer"
            title="Sync pending queue"
          >
            <RefreshCw className={`w-3 h-3 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{pendingCount} Pending Sync</span>
          </button>
        )}
      </div>

      {/* Right Actions: Notification Bell, User Menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notifications Icon */}
        <NavLink
          to={ROUTES.NOTIFICATIONS}
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadNotifCount > 0 && (
            <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-extrabold text-white bg-red-600 rounded-full ring-2 ring-white leading-none">
              {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
            </span>
          )}
        </NavLink>

        {/* User Profile Dropdown */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <Avatar name={user.fullName || 'User'} src={user.profilePicture} size="sm" />
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 leading-tight">
                  {user.firstName}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {role ? ROLE_LABELS[role]?.label : 'User'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="font-bold text-slate-900 text-sm">{user.fullName}</p>
                  <p className="text-slate-500 text-[11px] truncate">{user.email}</p>
                </div>

                <NavLink
                  to={ROUTES.PROFILE}
                  onClick={() => setShowUserDropdown(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  <User className="w-4 h-4 text-slate-500" />
                  <span>My Profile</span>
                </NavLink>

                {role === 'purokOfficial' && (
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowDutyModal(true);
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-slate-500" />
                    <span>Duty Mode</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-red-600 hover:bg-red-50 font-medium cursor-pointer border-t border-slate-100"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showDutyModal && (
        <Modal
          isOpen={showDutyModal}
          onClose={() => {
            setShowDutyModal(false);
            setDutyError(null);
          }}
          title="Duty Mode"
          description="Select your operational mode as a Sitio/Purok Official"
          size="md"
        >
          <div className="space-y-3">
            {dutyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700 flex items-center gap-2">
                <span>{dutyError}</span>
              </div>
            )}
            {/* Off Duty Option */}
            <button
              disabled={isSavingDuty}
              onClick={() => handleSelectDutyMode('offDuty', 'offDuty')}
              className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                currentMode === 'offDuty'
                  ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className={`p-2.5 rounded-lg shrink-0 ${currentMode === 'offDuty' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Off Duty</span>
                  {currentMode === 'offDuty' && (
                    <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Inactive operational status. Set status to off duty.</p>
              </div>
            </button>

            {/* Dispatcher Option */}
            <button
              disabled={isSavingDuty}
              onClick={() => handleSelectDutyMode('onDuty', 'dispatcher')}
              className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                currentMode === 'dispatcher'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className={`p-2.5 rounded-lg shrink-0 ${currentMode === 'dispatcher' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Radio className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Dispatcher</span>
                  {currentMode === 'dispatcher' && (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Stationed at dispatch desk to triage, monitor, and assign incident reports.</p>
              </div>
            </button>

            {/* Field Responder Option */}
            <button
              disabled={isSavingDuty}
              onClick={() => handleSelectDutyMode('onDuty', 'responder')}
              className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                currentMode === 'responder'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className={`p-2.5 rounded-lg shrink-0 ${currentMode === 'responder' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Activity className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">Field Responder</span>
                  {currentMode === 'responder' && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Active in field operations to respond, investigate, and handle assigned reports.</p>
              </div>
            </button>
          </div>
        </Modal>
      )}
    </header>
  );
};
