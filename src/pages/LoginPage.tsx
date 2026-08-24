/**
 * Page: LoginPage
 * Production Authentication form supporting Firebase Email/Password sign-in
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { APP_METADATA, ROUTES } from '../constants';
import { getRoleDashboardRoute } from '../utils/permissions';
import { FormField } from '../components/forms/FormField';
import { TextInput } from '../components/forms/TextInput';
import { PasswordInput } from '../components/forms/PasswordInput';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import { Shield, Mail, LogIn } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, user, role } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already authenticated and active, redirect directly to role dashboard
  useEffect(() => {
    if (isAuthenticated && user && user.status === 'active') {
      navigate(getRoleDashboardRoute(role || user.role), { replace: true });
    }
  }, [isAuthenticated, user, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const loginResult = await login(email, password);
      const profile = loginResult.user;

      if (loginResult.status === 'pending') {
        showToast('Account is pending verification by Barangay Administration.', 'info');
        navigate(ROUTES.PENDING_VERIFICATION, { replace: true });
      } else if (loginResult.status === 'rejected') {
        showToast('Your registration application was rejected by Barangay Administration.', 'error');
        navigate(ROUTES.PENDING_VERIFICATION, { replace: true });
      } else {
        showToast(`Login successful. Welcome back, ${profile?.firstName || 'User'}!`, 'success');

        // Always redirect to the appropriate canonical role dashboard after successful login.
        // Previous/last visited routes are NOT restored after login.
        navigate(getRoleDashboardRoute(profile?.role), { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Invalid login credentials. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Sign In to {APP_METADATA.shortName}
        </h2>
        <p className="text-xs text-slate-500">
          {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality} Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/80 space-y-6">
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email Address" required>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                prefixIcon={<Mail className="w-4 h-4" />}
                required
              />
            </FormField>

            <FormField label="Password" required>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </FormField>

            <div className="flex items-center justify-end">
              <NavLink
                to={ROUTES.FORGOT_PASSWORD}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors"
              >
                Forgot password?
              </NavLink>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              icon={<LogIn className="w-5 h-5" />}
            >
              Sign In
            </Button>
          </form>

          <div className="pt-4 border-t border-slate-200/80 text-center">
            <p className="text-xs text-slate-600">
              Don't have an account?{' '}
              <NavLink
                to={ROUTES.REGISTER}
                className="font-bold text-blue-700 hover:text-blue-800 transition-colors"
              >
                Register Online for Barangay Services
              </NavLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
