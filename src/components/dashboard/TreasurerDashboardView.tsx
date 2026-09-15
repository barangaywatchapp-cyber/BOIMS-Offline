/**
 * Dashboard Component: TreasurerDashboardView
 * Dedicated official workspace for the Barangay Treasurer.
 * Focuses on:
 * - Certificate Fee Collections, OR tracking, and payment processing
 * - Inventory Assets & Valuation overview
 * - Resident Reference Lookup quick access
 * Strictly excludes Blotter, Dispatch, Registration Approvals, and System Settings.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CertificateRequest, InventoryItem, PaymentStatus } from '../../types';
import { certificateService } from '../../services/certificateService';
import { inventoryService } from '../../services/inventoryService';
import { ROUTES } from '../../constants';
import { Button } from '../foundation/Button';
import { EmptyState } from '../feedback/EmptyState';
import { Skeleton } from '../feedback/Skeleton';
import {
  DollarSign,
  Receipt,
  FileCheck2,
  Clock,
  Boxes,
  Users,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const TreasurerDashboardView: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthInitialized } = useAuth();

  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingCerts, setLoadingCerts] = useState<boolean>(true);
  const [loadingInventory, setLoadingInventory] = useState<boolean>(true);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid' | 'waived'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Subscribe to real-time certificates
  useEffect(() => {
    if (!isAuthInitialized) return;

    setLoadingCerts(true);
    const unsubscribe = certificateService.subscribeToCertificates(user, (data) => {
      setCertificates(data);
      setLoadingCerts(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, user?.uid, user?.role]);

  // Fetch Inventory assets
  useEffect(() => {
    if (!isAuthInitialized) return;

    let isMounted = true;
    setLoadingInventory(true);
    inventoryService
      .getInventoryItems()
      .then((items) => {
        if (isMounted) {
          setInventoryItems(items);
          setLoadingInventory(false);
        }
      })
      .catch((err) => {
        console.warn('[TreasurerDashboardView] Failed to load inventory:', err);
        if (isMounted) {
          setLoadingInventory(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthInitialized]);

  // Derived Financial & Certificate Metrics
  const activeCertificates = certificates.filter((c) => !c.isDeleted);
  const paidCerts = activeCertificates.filter((c) => c.paymentStatus === 'paid');
  const unpaidCerts = activeCertificates.filter((c) => c.paymentStatus === 'unpaid');
  const waivedCerts = activeCertificates.filter((c) => c.paymentStatus === 'waived');

  const totalRevenue = paidCerts.reduce((sum, c) => sum + (c.amount || 0), 0);
  const pendingRevenue = unpaidCerts.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Derived Inventory Metrics
  const totalAssetsCount = inventoryItems.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  const totalValuation = inventoryItems.reduce(
    (acc, curr) => acc + (curr.acquisitionCost || 0) * (curr.quantity || 0),
    0
  );
  const borrowedAssetsCount = inventoryItems.reduce(
    (acc, curr) => acc + Math.max(0, (curr.quantity || 0) - (curr.availableQuantity || 0)),
    0
  );

  // Filtered certificates list for table preview
  const filteredCerts = activeCertificates.filter((cert) => {
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
            Waived
          </span>
        );
      case 'unpaid':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
            <AlertCircle className="w-3 h-3" /> Unpaid
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-600/50 backdrop-blur-xs border border-amber-400/30 text-xs font-bold uppercase tracking-wider text-amber-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Financials & Collections Workspace
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Barangay Treasury & Asset Operations
          </h1>
          <p className="text-amber-100 text-sm max-w-2xl leading-relaxed">
            Manage certificate fees, official receipt issuance, barangay revenue records, and property inventory assets.
          </p>

          {/* Quick Actions Bar */}
          <div className="pt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<Receipt className="w-4 h-4" />}
              onClick={() => navigate(ROUTES.COLLECTIONS)}
              className="bg-white text-amber-950 hover:bg-amber-50 font-bold"
            >
              Financial Collections
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Boxes className="w-4 h-4" />}
              onClick={() => navigate(ROUTES.INVENTORY)}
              className="bg-amber-800/60 border-amber-400/40 text-white hover:bg-amber-700/80 font-medium"
            >
              Barangay Asset Inventory
            </Button>
          </div>
        </div>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Collections */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Revenue Collected</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {loadingCerts ? (
              <Skeleton className="h-8 w-28 rounded-lg" />
            ) : (
              `₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">From {paidCerts.length} paid certificate requests</p>
        </div>

        {/* Card 2: Pending Fee Payments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Fee Payments</span>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight">
            {loadingCerts ? (
              <Skeleton className="h-8 w-28 rounded-lg" />
            ) : (
              `₱${pendingRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">{unpaidCerts.length} requests awaiting collection/OR</p>
        </div>

        {/* Card 3: Paid vs Waived Requests */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Processed Clearance Requests</span>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {loadingCerts ? (
              <Skeleton className="h-8 w-16 rounded-lg" />
            ) : (
              paidCerts.length + waivedCerts.length
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {paidCerts.length} Paid • {waivedCerts.length} Indigent/Waived
          </p>
        </div>

        {/* Card 4: Inventory Asset Valuation */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Barangay Assets Valuation</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {loadingInventory ? (
              <Skeleton className="h-8 w-28 rounded-lg" />
            ) : (
              `₱${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {totalAssetsCount} Total Items • {borrowedAssetsCount} Currently Borrowed
          </p>
        </div>
      </div>

      {/* Secondary Row: Inventory Summary Banner & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Barangay Property & Inventory Summary</h2>
              <p className="text-xs text-slate-500">Asset tracking under Treasury and Barangay Secretariat oversight</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              onClick={() => navigate(ROUTES.INVENTORY)}
            >
              Open Full Inventory
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-800 rounded-xl">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Asset Records</p>
                <p className="text-xl font-bold text-slate-900">
                  {loadingInventory ? '...' : inventoryItems.length} items
                </p>
                <p className="text-[11px] text-slate-400">Total count: {totalAssetsCount} units</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
                <PackageCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Available in Storage</p>
                <p className="text-xl font-bold text-emerald-700">
                  {loadingInventory
                    ? '...'
                    : inventoryItems.reduce((acc, curr) => acc + (curr.availableQuantity || 0), 0)}{' '}
                  units
                </p>
                <p className="text-[11px] text-slate-400">Ready for community deployment</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Currently Borrowed</p>
                <p className="text-xl font-bold text-amber-700">{loadingInventory ? '...' : borrowedAssetsCount} units</p>
                <p className="text-[11px] text-slate-400">Active community loans</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fee Collections & Official Receipt Verification Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Certificate Fee Collections & OR Ledger</h2>
              <p className="text-xs text-slate-500">
                Monitor fee payments, verify indigent fee waivers, and check official receipts
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Receipt className="w-4 h-4" />}
              onClick={() => navigate(ROUTES.CERTIFICATES)}
              className="bg-amber-700 hover:bg-amber-800 text-white font-bold"
            >
              Go to Certificate Processing
            </Button>
          </div>

          {/* Filter and Search Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
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

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resident, OR #, request #..."
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Certificate Collections Table */}
        <div className="overflow-x-auto">
          {loadingCerts ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : filteredCerts.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<Receipt className="w-10 h-10 text-slate-300" />}
                title="No Certificate Records Found"
                description={
                  searchQuery
                    ? 'No requests matched your search query.'
                    : 'No requests match the selected payment filter.'
                }
              />
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Request #</th>
                  <th className="py-3.5 px-4">Resident Name</th>
                  <th className="py-3.5 px-4">Document Type</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Payment Status</th>
                  <th className="py-3.5 px-4">OR Number</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCerts.slice(0, 10).map((cert) => (
                  <tr key={cert.certificateId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {cert.controlNumber || cert.requestNumber || cert.certificateId.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{cert.fullName}</td>
                    <td className="py-3.5 px-4 text-slate-600 capitalize">
                      {cert.certificateType.replace(/([A-Z])/g, ' $1').trim()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      ₱{(cert.amount || 0).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">{getPaymentBadge(cert.paymentStatus)}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {cert.orNumber ? (
                        <span className="font-semibold text-slate-900">{cert.orNumber}</span>
                      ) : (
                        <span className="text-slate-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(cert.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Receipt className="w-3.5 h-3.5 text-amber-700" />}
                        onClick={() => navigate(ROUTES.COLLECTIONS)}
                      >
                        Process
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredCerts.length > 10 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(ROUTES.COLLECTIONS)}
              className="text-xs font-semibold"
            >
              View all {filteredCerts.length} records in Collections Ledger
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
