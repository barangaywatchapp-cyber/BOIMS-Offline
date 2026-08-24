/**
 * Page: DemographicsAnalyticsPage (Module 6)
 * Interactive Barangay Demographics, Sectoral Distribution Analytics, and Population Mapping.
 * Aligned with Module 6 SRS specifications and UDS design tokens.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { residentService } from '../services/residentService';
import { DemographicSummary } from '../types';
import {
  BarChart3,
  Users,
  Home,
  CheckCircle2,
  Vote,
  Baby,
  UserCheck,
  Building2,
  Droplet,
  Heart,
  Briefcase,
  Globe,
  Loader2,
  Sparkles,
  PieChart as PieIcon,
  ShieldAlert,
} from 'lucide-react';

export const DemographicsAnalyticsPage: React.FC = () => {
  const { user, isAuthInitialized } = useAuth();
  const [analytics, setAnalytics] = useState<DemographicSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await residentService.getDemographicAnalytics(user);
      setAnalytics(data);
    } catch (err) {
      console.error('Error computing demographic analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchAnalytics();
  }, [isAuthInitialized, user?.uid, user?.role]);

  if (loading || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/80 max-w-7xl mx-auto">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-3" />
        <p className="text-xs font-bold text-slate-500">Computing demographic metrics & sector aggregations...</p>
      </div>
    );
  }

  const malePercent = analytics.totalPopulation
    ? Math.round((analytics.byGender.male / analytics.totalPopulation) * 100)
    : 0;
  const femalePercent = analytics.totalPopulation
    ? Math.round((analytics.byGender.female / analytics.totalPopulation) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-800 rounded-2xl">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Demographics & Sectoral Analytics
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Barangay population structure, sector distributions, age groups, and household statistics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-blue-700" />
            <span>Refresh Metrics</span>
          </button>
        </div>
      </div>

      {/* Primary Population KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Population</span>
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{analytics.totalPopulation.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-slate-400">Registered barangay residents</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Households</span>
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Home className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{analytics.totalHouseholds.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-slate-400">Mapped family structures</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Registered Voters</span>
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <Vote className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{analytics.registeredVoters.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-emerald-700">
            {analytics.totalPopulation > 0
              ? `${Math.round((analytics.registeredVoters / analytics.totalPopulation) * 100)}% voting capacity`
              : '0%'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Verified IDs</span>
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{analytics.verifiedResidents.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-indigo-700">
            {analytics.unverifiedResidents} unverified pending review
          </p>
        </div>
      </div>

      {/* Age Group Distribution & Gender Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Age Pyramid / Distribution */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700" />
              <h3 className="text-base font-extrabold text-slate-900">Age Group Distribution</h3>
            </div>
            <span className="text-xs font-bold text-slate-400">Demographic Breakdown</span>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Infants (0-2 yrs)', count: analytics.byAgeGroup.infants, color: 'bg-pink-500' },
              { label: 'Children (3-12 yrs)', count: analytics.byAgeGroup.children, color: 'bg-amber-500' },
              { label: 'Youth (13-24 yrs)', count: analytics.byAgeGroup.youth, color: 'bg-emerald-500' },
              { label: 'Working Adults (25-59 yrs)', count: analytics.byAgeGroup.adults, color: 'bg-blue-600' },
              { label: 'Senior Citizens (60+ yrs)', count: analytics.byAgeGroup.seniors, color: 'bg-purple-600' },
            ].map((group) => {
              const percentage = analytics.totalPopulation
                ? Math.round((group.count / analytics.totalPopulation) * 100)
                : 0;
              return (
                <div key={group.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{group.label}</span>
                    <span>
                      {group.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${group.color} transition-all duration-300`}
                      style={{ width: `${Math.max(percentage, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gender Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900">Gender Ratio</h3>
            <p className="text-xs text-slate-400 font-medium">Community population split</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-blue-900">Male Population</p>
                <p className="text-2xl font-black text-blue-800">{analytics.byGender.male}</p>
              </div>
              <span className="text-lg font-black text-blue-700">{malePercent}%</span>
            </div>

            <div className="p-4 bg-pink-50/60 rounded-2xl border border-pink-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-pink-900">Female Population</p>
                <p className="text-2xl font-black text-pink-800">{analytics.byGender.female}</p>
              </div>
              <span className="text-lg font-black text-pink-700">{femalePercent}%</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-medium text-center">
            Updated based on verified citizen directory entries.
          </p>
        </div>
      </div>

      {/* Sectoral Classification Totals Grid */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900">Sectoral Memberships Summary</h3>
          <p className="text-xs text-slate-500 font-medium">
            Beneficiary sectors, vulnerability tracking, and special advocacy classifications.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 space-y-1">
            <span className="text-[11px] font-bold text-purple-700 uppercase">👴 Senior Citizens</span>
            <p className="text-xl font-black text-purple-900">{analytics.bySector.senior}</p>
          </div>

          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-1">
            <span className="text-[11px] font-bold text-indigo-700 uppercase">♿ PWDs</span>
            <p className="text-xl font-black text-indigo-900">{analytics.bySector.pwd}</p>
          </div>

          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 space-y-1">
            <span className="text-[11px] font-bold text-rose-700 uppercase">👩‍👦 Solo Parents</span>
            <p className="text-xl font-black text-rose-900">{analytics.bySector.soloParent}</p>
          </div>

          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-1">
            <span className="text-[11px] font-bold text-amber-700 uppercase">🎗️ 4Ps Beneficiaries</span>
            <p className="text-xl font-black text-amber-900">{analytics.bySector.fourPs}</p>
          </div>

          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 uppercase">🎓 Youth / SK</span>
            <p className="text-xl font-black text-emerald-900">{analytics.bySector.youth}</p>
          </div>

          <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 space-y-1">
            <span className="text-[11px] font-bold text-sky-700 uppercase">🗳️ Voters</span>
            <p className="text-xl font-black text-sky-900">{analytics.bySector.voter}</p>
          </div>

          <div className="p-4 bg-cyan-50 rounded-2xl border border-cyan-100 space-y-1">
            <span className="text-[11px] font-bold text-cyan-700 uppercase">✈️ OFWs</span>
            <p className="text-xl font-black text-cyan-900">{analytics.bySector.ofw}</p>
          </div>

          <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100 space-y-1">
            <span className="text-[11px] font-bold text-teal-700 uppercase">🌿 Indigenous</span>
            <p className="text-xl font-black text-teal-900">{analytics.bySector.indigenous}</p>
          </div>
        </div>
      </div>

      {/* Geographic Purok Distribution */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900">Geographic Population by Purok / Sitio</h3>
          <p className="text-xs text-slate-500 font-medium">Resident counts across barangay zones</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(analytics.byPurok).map(([purok, count]) => (
            <div key={purok} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-center">
              <span className="text-xs font-extrabold text-slate-700 block">{purok}</span>
              <p className="text-lg font-black text-blue-700">{count}</p>
              <span className="text-[10px] text-slate-400 font-semibold block">Residents</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
