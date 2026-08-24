import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { applyActionCode, sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase/config';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Mail,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Building2,
  Send,
  UserCheck,
} from 'lucide-react';
import { ROUTES, APP_METADATA } from '../constants';
import { registrationService } from '../services/registrationService';

type VerificationState =
  | 'verifying'
  | 'success'
  | 'already_verified'
  | 'expired'
  | 'invalid'
  | 'error';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get('oobCode');
  const legacyToken = searchParams.get('token');

  const [state, setState] = useState<VerificationState>('verifying');
  const [message, setMessage] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  // Resend form state
  const [resendEmail, setResendEmail] = useState<string>('');
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendMessage, setResendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function executeVerification() {
      // 1. Firebase Native Out-of-Band Action Code Flow (Primary)
      if (oobCode) {
        try {
          setState('verifying');
          await applyActionCode(auth, oobCode);

          if (!isMounted) return;

          if (auth.currentUser) {
            try {
              await auth.currentUser.reload();
              await registrationService.syncEmailVerificationStatus(auth.currentUser.uid);
              if (auth.currentUser.email) setUserEmail(auth.currentUser.email);
              if (auth.currentUser.displayName) setUserName(auth.currentUser.displayName);
            } catch (syncErr) {
              console.warn('[VerifyEmailPage] Auth user reload/sync warning:', syncErr);
            }
          }

          setState('success');
          setMessage(
            'Email verified successfully! Your email address is now confirmed and your registration application is queued for Barangay Verification Officers review.'
          );
        } catch (err: any) {
          if (!isMounted) return;
          console.error('[VerifyEmailPage] applyActionCode failed:', err);
          const errorCode = err.code || '';
          if (errorCode === 'auth/expired-action-code') {
            setState('expired');
            setMessage('This verification link has expired. Please sign in to request a fresh verification link.');
          } else if (errorCode === 'auth/invalid-action-code') {
            // Check if currentUser is already verified
            if (auth.currentUser?.emailVerified) {
              setState('already_verified');
              setMessage('Your email address has already been verified.');
            } else {
              setState('invalid');
              setMessage('This verification link is invalid, expired, or has already been used.');
            }
          } else if (errorCode === 'auth/user-disabled') {
            setState('error');
            setMessage('The account associated with this verification link has been disabled.');
          } else {
            setState('error');
            setMessage(err.message || 'An unexpected error occurred while verifying your email.');
          }
        }
        return;
      }

      // 2. Backward Compatibility for Legacy 64-char Hex Server Token
      if (legacyToken && legacyToken.trim().length === 64) {
        try {
          setState('verifying');
          const response = await registrationService.verifyRegistrationEmail(legacyToken.trim());

          if (!isMounted) return;

          if (response.alreadyVerified) {
            setState('already_verified');
            setMessage(
              response.message ||
                'Your email address was already verified previously. Your application is in the queue for Barangay Verifiers.'
            );
            if (response.email) setUserEmail(response.email);
          } else if (response.success) {
            setState('success');
            setMessage(
              response.message ||
                'Email verified successfully! Your account has been provisioned and your registration application is awaiting review.'
            );
            if (response.email) setUserEmail(response.email);
            if (response.fullName) setUserName(response.fullName);
          } else {
            setState('error');
            setMessage(response.message || 'Unable to verify email address.');
          }
        } catch (err: any) {
          if (!isMounted) return;

          const errorMsg = err.message || '';
          if (errorMsg.includes('expired')) {
            setState('expired');
            setMessage('This verification link has expired (links are valid for 24 hours).');
          } else if (errorMsg.includes('processing') || errorMsg.includes('in progress') || errorMsg.includes('currently being processed')) {
            setState('verifying');
            setMessage('Verification is currently being processed. Please wait a few seconds and refresh this page.');
          } else if (errorMsg.includes('invalid') || errorMsg.includes('not found')) {
            setState('invalid');
            setMessage('This verification link is invalid, malformed, or has already been replaced.');
          } else if (errorMsg.includes('already been used') || errorMsg.includes('already redeemed') || errorMsg.includes('already verified')) {
            setState('already_verified');
            setMessage('This verification link was already used. Your account is queued for review.');
          } else {
            setState('error');
            setMessage(errorMsg || 'An unexpected error occurred during email verification.');
          }
        }
        return;
      }

      // 3. No Code or Token Provided - Check current session
      if (auth.currentUser?.emailVerified) {
        setState('already_verified');
        setMessage('Your email address is already verified.');
        if (auth.currentUser.email) setUserEmail(auth.currentUser.email);
      } else {
        setState('invalid');
        setMessage('No verification code was provided in the link.');
      }
    }

    executeVerification();

    return () => {
      isMounted = false;
    };
  }, [oobCode, legacyToken]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToUse = resendEmail.trim() || userEmail.trim();

    try {
      setIsResending(true);
      setResendMessage(null);

      if (auth.currentUser) {
        const actionCodeSettings = {
          url: `${window.location.origin}/verify-email`,
          handleCodeInApp: true,
        };
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
        setResendMessage({
          type: 'success',
          text: `A fresh verification link has been sent to ${auth.currentUser.email}. Please check your inbox and spam folders.`,
        });
      } else if (emailToUse) {
        // Direct to Sign In so Firebase can resend from authenticated session
        setResendMessage({
          type: 'success',
          text: `Please sign in with your email (${emailToUse}) to trigger a fresh verification link from your account dashboard.`,
        });
      } else {
        setResendMessage({ type: 'error', text: 'Please enter your registered email address or sign in to resend.' });
      }
    } catch (err: any) {
      setResendMessage({
        type: 'error',
        text: err.message || 'Failed to resend verification link. Please check the email and try again.',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      id="verify-email-page-container"
      className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 mb-3">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {APP_METADATA.shortName} Email Verification
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Barangay Operations & Information Management System
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {/* 1. VERIFYING IN PROGRESS */}
          {state === 'verifying' && (
            <div id="state-verifying" className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 mb-4 animate-spin">
                <RefreshCw className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Verifying Email Address
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed max-w-sm mx-auto">
                Please wait while we validate your single-use verification token and provision your Barangay credentials...
              </p>
            </div>
          )}

          {/* 2. SUCCESS: EMAIL VERIFIED & ACCOUNT CREATED */}
          {state === 'success' && (
            <div id="state-success" className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-4 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full uppercase tracking-wider mb-3">
                Email Verified
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Verification Successful!
              </h2>
              {userName && (
                <p className="text-sm font-medium text-slate-800 mb-1">
                  Welcome, {userName}!
                </p>
              )}
              {userEmail && (
                <p className="text-xs text-slate-500 mb-4">
                  {userEmail}
                </p>
              )}
              <p className="text-slate-600 text-sm leading-relaxed mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 text-left">
                <span className="font-semibold text-slate-800 block mb-1">
                  What happens next?
                </span>
                Your BOIMS credentials have been provisioned. Your registration application has been forwarded to the{' '}
                <span className="font-medium text-indigo-700">Barangay Verification Officers</span> for identity document review. You will receive notifications once your application is reviewed.
              </p>

              <div className="space-y-3">
                <button
                  id="btn-proceed-to-login"
                  type="button"
                  onClick={() => navigate(ROUTES.LOGIN)}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  Proceed to Sign In
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 3. ALREADY VERIFIED: IDEMPOTENT RETURN */}
          {state === 'already_verified' && (
            <div id="state-already-verified" className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-4 ring-8 ring-blue-50/50">
                <UserCheck className="w-10 h-10" />
              </div>
              <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full uppercase tracking-wider mb-3">
                Already Verified
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Email Already Confirmed
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {message ||
                  'Your email address was already verified. Your registration application is currently under review by Barangay Officials.'}
              </p>

              <div className="space-y-3">
                <button
                  id="btn-already-verified-login"
                  type="button"
                  onClick={() => navigate(ROUTES.LOGIN)}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  Sign In to Check Status
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 4. EXPIRED TOKEN */}
          {state === 'expired' && (
            <div id="state-expired" className="py-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 text-amber-600 mb-4 ring-8 ring-amber-50/50">
                  <Clock className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Verification Link Expired
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  For your security, email verification links expire after 24 hours. Request a new verification link below.
                </p>
              </div>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label htmlFor="resend-email-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Your Registered Email Address
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="resend-email-input"
                      type="email"
                      required
                      value={resendEmail || userEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="resident@example.com"
                      className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {resendMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      resendMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {resendMessage.text}
                  </div>
                )}

                <button
                  id="btn-resend-expired-link"
                  type="submit"
                  disabled={isResending}
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending Link...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Resend Verification Link
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* 5. INVALID OR ERROR */}
          {(state === 'invalid' || state === 'error') && (
            <div id="state-invalid-error" className="py-4">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 text-rose-600 mb-4 ring-8 ring-rose-50/50">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  Verification Failed
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  {message || 'The verification link you clicked is invalid, corrupted, or has already been used.'}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
                  Need a new verification link?
                </h3>
                <form onSubmit={handleResend} className="space-y-3">
                  <div className="relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="invalid-resend-email-input"
                      type="email"
                      required
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="Enter registered email"
                      className="block w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    />
                  </div>

                  {resendMessage && (
                    <div
                      className={`p-2.5 rounded-lg text-xs font-medium ${
                        resendMessage.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {resendMessage.text}
                    </div>
                  )}

                  <button
                    id="btn-invalid-resend-submit"
                    type="submit"
                    disabled={isResending}
                    className="w-full inline-flex items-center justify-center px-3 py-2 border border-slate-300 text-xs font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isResending ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Send New Verification Email
                  </button>
                </form>
              </div>

              <div className="flex items-center justify-between text-xs font-medium text-slate-600 pt-2 border-t border-slate-100">
                <Link to={ROUTES.REGISTER} className="text-indigo-600 hover:underline">
                  New Registration
                </Link>
                <Link to={ROUTES.LOGIN} className="text-slate-600 hover:text-slate-900">
                  Return to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Security Assurance Footer */}
        <div className="text-center mt-6">
          <div className="inline-flex items-center text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 mr-1.5 text-slate-400" />
            Barangay Data Protection & Cryptographic Verification Guarantee
          </div>
        </div>
      </div>
    </div>
  );
};
export default VerifyEmailPage;
