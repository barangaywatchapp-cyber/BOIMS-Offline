/**
 * Page: TreasurerCollectionsPage
 * Dedicated financial & collection workspace for the Barangay Treasurer.
 * Uses the existing certificate collection as the single source of truth for:
 * - Fee collections & revenue tracking
 * - Payment status management (paid, unpaid, waived)
 * - Official Receipt (OR) issuance & records
 * - Exporting collection ledgers to Excel
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CertificateRequest, PaymentStatus } from '../types';
import { certificateService } from '../services/certificateService';
import { Button } from '../components/foundation/Button';
import { PageContainer } from '../components/layout/PageContainer';
import { EmptyState } from '../components/feedback/EmptyState';
import { Skeleton } from '../components/feedback/Skeleton';
import { Modal } from '../components/feedback/Modal';
import { ExportCertificatesModal } from '../components/certificates/ExportCertificatesModal';
import {
  DollarSign,
  Receipt,
  FileCheck2,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Edit3,
  RefreshCw,
  X,
} from 'lucide-react';

export const TreasurerCollectionsPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();

  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid' | 'waived'>('all');

  // Modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [selectedCertForPayment, setSelectedCertForPayment] = useState<CertificateRequest | null>(null);

  // Form states for Fee Processing / OR issuance
  const [paymentStatusInput, setPaymentStatusInput] = useState<PaymentStatus>('paid');
  const [orNumberInput, setOrNumberInput] = useState<string>('');
  const [remarksInput, setRemarksInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processSuccess, setProcessSuccess] = useState<string | null>(null);

  // Subscribe to real-time certificates
  useEffect(() => {
    if (!isAuthInitialized || !user) return;

    setLoading(true);
    const unsubscribe = certificateService.subscribeToCertificates(user, (data) => {
      setCertificates(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, user?.uid, user?.role]);

  // Derived financial records
  const activeCertificates = useMemo(() => {
    return certificates.filter((c) => !c.isDeleted);
  }, [certificates]);

  const paidCerts = useMemo(() => {
    return activeCertificates.filter((c) => c.paymentStatus === 'paid');
  }, [activeCertificates]);

  const unpaidCerts = useMemo(() => {
    return activeCertificates.filter((c) => c.paymentStatus === 'unpaid');
  }, [activeCertificates]);

  const waivedCerts = useMemo(() => {
    return activeCertificates.filter((c) => c.paymentStatus === 'waived');
  }, [activeCertificates]);

  const totalRevenue = useMemo(() => {
    return paidCerts.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [paidCerts]);

  const pendingRevenue = useMemo(() => {
    return unpaidCerts.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [unpaidCerts]);

  // Filtered ledger records
  const filteredCertificates = useMemo(() => {
    return activeCertificates.filter((cert) => {
      const matchesPayment = paymentFilter === 'all' || cert.paymentStatus === paymentFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        cert.fullName.toLowerCase().includes(q) ||
        (cert.controlNumber && cert.controlNumber.toLowerCase().includes(q)) ||
        (cert.requestNumber && cert.requestNumber.toLowerCase().includes(q)) ||
        (cert.orNumber && cert.orNumber.toLowerCase().includes(q)) ||
        cert.certificateType.toLowerCase().includes(q);

      return matchesPayment && matchesQuery;
    });
  }, [activeCertificates, paymentFilter, searchQuery]);

  // Open fee processing modal for a certificate
  const handleOpenProcessModal = (cert: CertificateRequest) => {
    setSelectedCertForPayment(cert);
    setPaymentStatusInput(cert.paymentStatus || 'paid');
    setOrNumberInput(cert.orNumber || '');
    setRemarksInput(cert.remarks || '');
    setProcessError(null);
    setProcessSuccess(null);
  };

  // Close modal
  const handleCloseProcessModal = () => {
    setSelectedCertForPayment(null);
    setProcessError(null);
    setProcessSuccess(null);
  };

  // Submit payment / OR update
  const handleSubmitPaymentUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertForPayment || !user) return;

    if (paymentStatusInput === 'paid' && !orNumberInput.trim()) {
      setProcessError('Official Receipt (OR) Number is required when marking as Paid.');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    setProcessSuccess(null);

    try {
      await certificateService.updateCertificateStatus(selectedCertForPayment.certificateId, {
        paymentStatus: paymentStatusInput,
        orNumber: orNumberInput.trim() || undefined,
        remarks: remarksInput.trim() || undefined,
        actorUserId: user.uid,
        actorUserName: user.name || user.email || 'Barangay Treasurer',
      });

      setProcessSuccess('Payment and OR records successfully updated.');
      setTimeout(() => {
        handleCloseProcessModal();
      }, 1200);
    } catch (err: any) {
      console.error('[TreasurerCollectionsPage] Failed to update payment:', err);
      setProcessError(err.message || 'Failed to update payment status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case 'waived':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
            Waived (Indigent)
          </span>
        );
      case 'unpaid':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
            <AlertCircle className="w-3 h-3" /> Awaiting Payment
          </span>
        );
    }
  };

  return (
    <PageContainer
      title="Financials & Collections"
      description="Official Barangay Treasury ledger: certificate fee collection, Official Receipt issuance, and revenue records."
    >
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Top Actions & Overview Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Barangay Collection Ledger</h1>
            <p className="text-xs text-slate-500">Official receipts and fee status records</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" />}
              onClick={() => setIsExportModalOpen(true)}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
            >
              Export Ledger to Excel
            </Button>
          </div>
        </div>

        {/* Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Revenue Collected</span>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {loading ? (
                <Skeleton className="h-8 w-28 rounded-lg" />
              ) : (
                `₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">{paidCerts.length} paid certificate transactions</p>
          </div>

          {/* Pending Collections */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Collections</span>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-amber-700 tracking-tight">
              {loading ? (
                <Skeleton className="h-8 w-28 rounded-lg" />
              ) : (
                `₱${pendingRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">{unpaidCerts.length} requests awaiting payment/OR</p>
          </div>

          {/* Paid Transactions */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid Transactions</span>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                <Receipt className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {loading ? <Skeleton className="h-8 w-16 rounded-lg" /> : paidCerts.length}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Receipts issued with official OR numbers</p>
          </div>

          {/* Waived Transactions */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Waived Transactions</span>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {loading ? <Skeleton className="h-8 w-16 rounded-lg" /> : waivedCerts.length}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Statutory indigency fee exemptions</p>
          </div>
        </div>

        {/* Ledger Table Container */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Filter and Search Bar */}
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setPaymentFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  paymentFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({activeCertificates.length})
              </button>
              <button
                type="button"
                onClick={() => setPaymentFilter('unpaid')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  paymentFilter === 'unpaid'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Awaiting Payment ({unpaidCerts.length})
              </button>
              <button
                type="button"
                onClick={() => setPaymentFilter('paid')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  paymentFilter === 'paid'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Paid ({paidCerts.length})
              </button>
              <button
                type="button"
                onClick={() => setPaymentFilter('waived')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  paymentFilter === 'waived'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Waived ({waivedCerts.length})
              </button>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resident, OR #, request #..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : filteredCertificates.length === 0 ? (
              <div className="py-16">
                <EmptyState
                  icon={<Receipt className="w-12 h-12 text-slate-300" />}
                  title="No Collection Records Found"
                  description={
                    searchQuery
                      ? 'No requests match your search criteria.'
                      : 'No collection records found in this category.'
                  }
                />
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Request / Control #</th>
                    <th className="py-3.5 px-4">Resident Name</th>
                    <th className="py-3.5 px-4">Certificate Type</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Payment Status</th>
                    <th className="py-3.5 px-4">OR Number</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCertificates.map((cert) => (
                    <tr key={cert.certificateId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {cert.controlNumber || cert.requestNumber || cert.certificateId.slice(0, 8)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {cert.fullName}
                        {cert.purok && (
                          <span className="block text-[11px] text-slate-400 font-normal">{cert.purok}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 capitalize">
                        {cert.certificateType.replace(/([A-Z])/g, ' $1').trim()}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ₱{(cert.amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">{getPaymentBadge(cert.paymentStatus)}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {cert.orNumber ? (
                          <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                            {cert.orNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(cert.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Edit3 className="w-3.5 h-3.5" />}
                          onClick={() => handleOpenProcessModal(cert)}
                          className="font-bold text-amber-900 bg-amber-50 hover:bg-amber-100"
                        >
                          Collect / Issue OR
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Collect Fee & Issue OR Modal */}
      {selectedCertForPayment && (
        <Modal
          isOpen={!!selectedCertForPayment}
          onClose={handleCloseProcessModal}
          title="Collect Fee & Issue Official Receipt"
          description={`Update fee collection records for ${selectedCertForPayment.fullName}`}
          size="md"
        >
          <form onSubmit={handleSubmitPaymentUpdate} className="space-y-4">
            {processError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{processError}</span>
              </div>
            )}

            {processSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{processSuccess}</span>
              </div>
            )}

            {/* Document Details Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Resident:</span>
                <span className="font-bold text-slate-900">{selectedCertForPayment.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Document Type:</span>
                <span className="font-semibold text-slate-900 capitalize">
                  {selectedCertForPayment.certificateType.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assessed Fee:</span>
                <span className="font-extrabold text-slate-900">
                  ₱{(selectedCertForPayment.amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Status:</span>
                <span className="capitalize text-slate-700">{selectedCertForPayment.status}</span>
              </div>
            </div>

            {/* Payment Status Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(['paid', 'unpaid', 'waived'] as PaymentStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setPaymentStatusInput(status)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border capitalize transition-all ${
                      paymentStatusInput === status
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Official Receipt (OR) Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Official Receipt (OR) Number {paymentStatusInput === 'paid' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={orNumberInput}
                onChange={(e) => setOrNumberInput(e.target.value)}
                placeholder="e.g. OR-2026-0042"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">Required when marking transaction as Paid.</p>
            </div>

            {/* Treasurer Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Collection Remarks (Optional)</label>
              <textarea
                value={remarksInput}
                onChange={(e) => setRemarksInput(e.target.value)}
                rows={2}
                placeholder="e.g. Paid in cash at Barangay Treasury counter"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={handleCloseProcessModal} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isProcessing}
                className="bg-amber-700 hover:bg-amber-800 text-white font-bold"
              >
                {isProcessing ? 'Saving Record...' : 'Save Payment & OR'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Export to Excel Modal */}
      {isExportModalOpen && (
        <ExportCertificatesModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          rawCertificates={activeCertificates}
          pageFilters={{
            searchTerm: searchQuery,
            typeFilter: 'all',
            statusFilter: 'all',
            paymentFilter: paymentFilter,
            purokFilter: 'all',
          }}
        />
      )}
    </PageContainer>
  );
};
