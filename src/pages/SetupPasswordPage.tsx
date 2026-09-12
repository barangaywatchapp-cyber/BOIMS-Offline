/**
 * Page: SetupPasswordPage
 * First-login credential setup for administratively provisioned accounts.
 * Enforces mustChangePassword requirement before granting normal application access.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { APP_METADATA, ROLE_LABELS, ROUTES } from '../constants';
import { getRoleDashboardRoute } from '../utils/permissions';
import { Shield, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { Button } from '../components/foundation/Button';

export const SetupPasswordPage: React.FC = () => {
  const { user, completePasswordSetup, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isMinLength = newPassword.length >= 8;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = isMinLength && isMatching && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isMinLength) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!isMatching) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await completePasswordSetup(newPassword);
      showToast('Password established successfully! Welcome to BOIMS.', 'success');
      if (user) {
        navigate(getRoleDashboardRoute(user.role), { replace: true });
      } else {
        navigate(ROUTES.LOGIN, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to establish password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate(ROUTES.LOGIN, { replace: true });
    } catch (err: any) {
      console.error('Logout error:', err);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Set Up Your Permanent Password
        </h2>
        <p className="text-xs text-slate-500">
          {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality} Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200/80 space-y-6">
          {user && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-xs text-slate-500 font-medium">Provisioned Account</div>
              <div className="text-sm font-semibold text-slate-800">{user.fullName || user.email}</div>
              <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                <span>{user.email}</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-[11px]">
                  {ROLE_LABELS[user.role]?.label || user.role}
                </span>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Your account was administratively created. For security, please establish your personal password before accessing the system.
            </span>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Confirm New Password *
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${isMinLength ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                <span className={isMinLength ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${isMatching ? 'text-emerald-600' : 'text-slate-300'}`}
                />
                <span className={isMatching ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                  Passwords match
                </span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              loading={loading}
              className="w-full py-2.5 font-semibold text-sm shadow-md"
            >
              Complete Setup & Access Dashboard
            </Button>
          </form>

          <div className="pt-2 border-t border-slate-100 flex justify-center">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out and return to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SetupPasswordPage;
