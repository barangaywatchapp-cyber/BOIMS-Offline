/**
 * Page: LandingPage (Public Module 1)
 * Introduces BOIMS branding, barangay info, emergency hotlines, and auth CTAs
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { APP_METADATA, DEFAULT_EMERGENCY_HOTLINES, ROUTES } from '../constants';
import { Button } from '../components/foundation/Button';
import {
  Shield,
  FileText,
  FileBadge,
  PhoneCall,
  Megaphone,
  CheckCircle2,
  ArrowRight,
  LogIn,
  Users,
  Activity,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shadow-xs">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight block leading-tight">
                {APP_METADATA.shortName}
              </span>
              <span className="text-[10px] text-blue-700 font-bold tracking-wider uppercase block">
                {APP_METADATA.defaultBarangay}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NavLink to={ROUTES.LOGIN}>
              <Button
                variant="outline"
                size="sm"
                icon={<LogIn className="w-4 h-4 text-blue-700" />}
                className="bg-white hover:bg-blue-50 text-blue-700 border-blue-600 font-bold shadow-2xs hover:border-blue-700 transition-colors"
              >
                Sign In
              </Button>
            </NavLink>
            <NavLink to={ROUTES.REGISTER}>
              <Button variant="primary" size="sm" className="font-bold">
                Get Started
              </Button>
            </NavLink>
          </div>
        </div>
      </header>

      {/* Hero Section - Clean Light Canvas with Navy Accents */}
      <section className="bg-white border-b border-slate-200/80 py-16 lg:py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Subtle decorative background gradients */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-blue-50/80 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-indigo-50/60 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 text-blue-800 rounded-full text-xs font-bold border border-blue-200/80 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Official Digital Governance & Citizen Portal</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-slate-900">
              Barangay Operations & <br className="hidden sm:inline" />
              <span className="text-blue-700">Information Management</span> System
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
              Modernizing community governance through secure digital incident reporting, online certificate processing, emergency communications, and real-time operational coordination.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <NavLink to={ROUTES.LOGIN}>
                <Button variant="primary" size="lg" icon={<ArrowRight className="w-5 h-5" />} iconPosition="right" className="font-bold shadow-md hover:shadow-lg">
                  Access Portal
                </Button>
              </NavLink>
              <a href="#hotlines">
                <Button variant="secondary" size="lg" icon={<PhoneCall className="w-5 h-5 text-blue-700" />} className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold">
                  Emergency Hotlines
                </Button>
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Real-time Dispatching
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> QR-Verified Clearances
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 24/7 Mobile Ready
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Key Citizen Services</h3>
                <p className="text-xs text-slate-500">Accessible 24/7 online & mobile</p>
              </div>
            </div>

            <ul className="space-y-4 text-sm text-slate-700">
              <li className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-100/80 hover:bg-blue-50/50 hover:border-blue-100 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block text-slate-900">Digital Incident Reporting</span>
                  <span className="text-xs text-slate-500 leading-normal">File community concerns, attach photos & track live response timeline.</span>
                </div>
              </li>

              <li className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-100/80 hover:bg-emerald-50/50 hover:border-emerald-100 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <FileBadge className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block text-slate-900">Online Certificate Requests</span>
                  <span className="text-xs text-slate-500 leading-normal">Apply for clearances, residency certifications & track approval status.</span>
                </div>
              </li>

              <li className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-100/80 hover:bg-amber-50/50 hover:border-amber-100 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block text-slate-900">Barangay Announcements</span>
                  <span className="text-xs text-slate-500 leading-normal">Stay updated on official notices, advisories & public programs.</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Emergency Hotlines Section - Bright, Clean White Card Deck */}
      <section id="hotlines" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-200/80 mb-3">
            <PhoneCall className="w-3.5 h-3.5 text-red-600" />
            <span>24/7 Emergency Support</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Emergency Hotlines</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            Important contact numbers for immediate emergency assistance within {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {DEFAULT_EMERGENCY_HOTLINES.map((hotline, idx) => (
            <div
              key={idx}
              className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-200 transition-all flex items-start gap-4"
            >
              <div className="p-3 bg-red-50 text-red-600 rounded-xl shrink-0 border border-red-100">
                <PhoneCall className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-slate-900 text-sm truncate">{hotline.name}</h4>
                <p className="text-sm font-extrabold text-blue-700 mt-1 font-mono tracking-tight">{hotline.number}</p>
                <span className="inline-block mt-2 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Available 24/7
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer - Professional Dark Navy Structure */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 px-4 text-center text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-center gap-2 text-white font-bold text-sm">
            <Shield className="w-4 h-4 text-blue-400" />
            <span>{APP_METADATA.shortName}</span>
          </div>
          <p className="font-medium text-slate-300">
            &copy; 2026 {APP_METADATA.name} ({APP_METADATA.shortName}). All rights reserved.
          </p>
          <p className="text-[11px] text-slate-500">
            {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality}, {APP_METADATA.defaultProvince}
          </p>
        </div>
      </footer>
    </div>
  );
};

