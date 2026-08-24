/**
 * Public Certificate Verification Portal
 * Allows anyone (employers, banks, government offices, citizens) to verify the authenticity of issued Barangay Certificates by QR Code token or Control Number.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { certificateService } from '../services/certificateService';
import { PublicVerificationRecord } from '../types';
import { APP_METADATA, ROUTES } from '../constants';
import { Button } from '../components/foundation/Button';
import { TextInput } from '../components/forms/TextInput';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  QrCode,
  FileText,
  Calendar,
  User,
  Building,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

export const VerifyCertificatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tokenQuery = searchParams.get('token') || '';

  const [inputToken, setInputToken] = useState<string>(tokenQuery);
  const [record, setRecord] = useState<PublicVerificationRecord | null>(null);
  const [searched, setSearched] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const handleReturn = () => {
    // 1. Check if location state has an explicit originating route ('from')
    if (location.state && (location.state as any).from) {
      navigate((location.state as any).from);
      return;
    }

    // 2. Check if in-app navigation history stack index is greater than 0
    if (
      window.history.length > 1 &&
      window.history.state &&
      typeof window.history.state.idx === 'number' &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
      return;
    }

    // 3. Fallback for authenticated users: return to authenticated certificates list
    if (user) {
      navigate(ROUTES.CERTIFICATES);
      return;
    }

    // 4. Default fallback for unauthenticated guest visitors
    navigate(ROUTES.LANDING);
  };

  const handleVerify = async (queryToken?: string) => {
    const target = (queryToken || inputToken).trim();
    if (!target) return;

    setLoading(true);
    setSearched(true);

    // Non-blocking server-side audit event dispatch
    fetch('/api/verify-qr-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: target }),
    }).catch((auditErr) => {
      console.warn('[VerifyCertificatePage] Server audit log request failed:', auditErr);
    });

    try {
      const found = await certificateService.getPublicVerification(target);
      setRecord(found);
    } catch (err) {
      console.error('Verification query failed:', err);
      setRecord(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenQuery) {
      handleVerify(tokenQuery);
    }
  }, [tokenQuery]);

  const isExpired = record?.validUntil ? new Date() > new Date(record.validUntil) : false;
  const isValid = record && record.isAuthentic && !isExpired;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Navigation Back Link */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={handleReturn}
          >
            Return to BOIMS Home
          </Button>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {APP_METADATA.shortName} Verification Engine
          </span>
        </div>

        {/* Portal Header */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center mx-auto shadow-2xs">
            <QrCode className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-blue-950">
              Official Document Verification Portal
            </h1>
            <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
              Verify the legal authenticity of Barangay Certificates issued by {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality}.
            </p>
          </div>

          {/* Search Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
            className="pt-2 space-y-3"
          >
            <TextInput
              placeholder="Enter QR Verification Token (e.g. BRGY-CERT-VERIFY-8A91B2C3D4)..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              prefixIcon={<Search className="w-4 h-4 text-slate-400" />}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              loading={loading}
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Verify Document Authenticity
            </Button>
          </form>
        </div>

        {/* Verification Result Card */}
        {loading ? (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3 shadow-2xs">
            <Loader2 className="w-8 h-8 text-blue-700 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Verifying security token against Firestore registry...</p>
          </div>
        ) : searched && (
          <div className="space-y-6">
            {isValid ? (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-emerald-500 shadow-lg space-y-6">
                
                {/* Status Badge Banner */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-4 text-emerald-900">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold uppercase tracking-wide">
                      OFFICIALLY VERIFIED & VALID
                    </h3>
                    <p className="text-xs text-emerald-800">
                      This document is an authentic record registered under {APP_METADATA.defaultBarangay}.
                    </p>
                  </div>
                </div>

                {/* Document Details Summary */}
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase">Document Title</span>
                    <span className="text-sm font-extrabold text-blue-950">
                      {record.certificateType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                    <div>
                      <span className="text-slate-500 block">Recipient Name</span>
                      <strong className="text-sm text-slate-900 font-bold block">{record.recipientName}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Issuing Authority</span>
                      <strong className="text-slate-900 block">{record.issuingBarangay}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Certificate / Control No.</span>
                      <strong className="text-slate-900 font-mono block">{record.certificateNumber}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Status</span>
                      <strong className="text-emerald-700 uppercase font-bold block">{record.status}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Issue Date</span>
                      <strong className="text-slate-900 block">
                        {record.issuedAt ? new Date(record.issuedAt).toLocaleDateString() : 'Active'}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Expiry Date</span>
                      <strong className="text-slate-900 block">
                        {record.validUntil ? new Date(record.validUntil).toLocaleDateString() : '1 Year Limit'}
                      </strong>
                    </div>
                  </div>

                  {record.purpose && (
                    <div className="pt-3 border-t border-slate-100">
                      <span className="text-xs text-slate-500 block mb-1">Declared Purpose</span>
                      <p className="text-xs font-semibold text-slate-800 bg-slate-50 p-2.5 rounded-xl">
                        {record.purpose}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer timestamp */}
                <div className="text-[11px] text-center text-slate-400 font-mono pt-2">
                  Verification Timestamp: {new Date().toLocaleString()} &bull; Token: {record.qrVerificationToken}
                </div>

              </div>
            ) : record && (record.status === 'rejected' || record.status === 'cancelled' || record.status === 'revoked') ? (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-red-500 shadow-md space-y-4 text-center">
                <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto shadow-2xs">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-red-900 uppercase tracking-wide">
                    DOCUMENT REVOKED / CANCELLED
                  </h3>
                  <p className="text-xs font-semibold text-slate-700">
                    This document record ({record.certificateNumber}) for <strong>{record.recipientName}</strong> was marked as {record.status.toUpperCase()} by Barangay Authorities.
                  </p>
                </div>

                {record.rejectionReason && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 text-left space-y-1">
                    <span className="font-bold block uppercase text-[10px] text-red-700">Reason for Revocation / Rejection:</span>
                    <p>{record.rejectionReason}</p>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 italic">
                  * This document is legally null and void. Please report unauthorized use to the Office of the Barangay Chairman.
                </p>
              </div>
            ) : record && isExpired ? (
              <div className="bg-white p-6 rounded-3xl border-2 border-amber-500 shadow-md space-y-4 text-center">
                <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-amber-900 uppercase">DOCUMENT EXPIRED</h3>
                <p className="text-xs text-slate-600">
                  This certificate was officially issued for <strong>{record.recipientName}</strong>, but reached its expiration date on{' '}
                  {record.validUntil ? new Date(record.validUntil).toLocaleDateString() : '1 Year Limit'}.
                </p>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-3xl border-2 border-red-300 shadow-md text-center space-y-3">
                <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-red-950 uppercase">INVALID OR UNREGISTERED TOKEN</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  No matching official certificate record was found for security token <span className="font-mono font-bold text-slate-800">{inputToken}</span>. Please verify the code or contact the Barangay Hall.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
