/**
 * Page: ForgotPasswordPage (Module 2)
 * Allows users to request password reset link via email
 * Implements SRS Vol 3 & MDG Vol 3 requirements
 */

import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { APP_METADATA, ROUTES } from '../constants';
import { FormField } from '../components/forms/FormField';
import { TextInput } from '../components/forms/TextInput';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import { Shield, Mail, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await authService.sendPasswordReset(email);
      setSubmitted(true);
      showToast('Password reset email sent if account exists.', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Reset Your Password
        </h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Enter your registered email address and we will send you instructions to reset your password for {APP_METADATA.shortName}.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/80 space-y-6">
          {error && <Alert type="error">{error}</Alert>}

          {submitted ? (
            <div className="space-y-6 text-center">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h3 className="font-bold text-sm">Instructions Sent</h3>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  If an account exists for <strong>{email}</strong>, you will receive an email with a password reset link shortly.
                </p>
              </div>

              <NavLink to={ROUTES.LOGIN} className="block">
                <Button variant="outline" size="lg" fullWidth icon={<ArrowLeft className="w-4 h-4" />}>
                  Return to Sign In
                </Button>
              </NavLink>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                icon={<Mail className="w-5 h-5" />}
              >
                Send Reset Link
              </Button>

              <div className="text-center pt-2">
                <NavLink
                  to={ROUTES.LOGIN}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </NavLink>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
