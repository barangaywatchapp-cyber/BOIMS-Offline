/**
 * Page: ResidentsDirectoryPage (Module 6)
 * Barangay Master Resident Directory, ID Verification Workflow, and Profile Management.
 * Aligned with Module 6 SRS specifications and UDS design tokens.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/foundation/Avatar';
import { residentService } from '../services/residentService';
import { HouseholdsDirectoryPage } from './HouseholdsDirectoryPage';
import { HouseholdStatusBadge } from '../components/households/HouseholdStatusBadge';
import {
  ResidentProfile,
  ResidentSector,
  ResidentVerificationStatus,
  VoterStatus,
  ResidencyStatus,
  Household,
  HouseholdVerificationStatus,
} from '../types';
import {
  Users,
  Search,
  Filter,
  Plus,
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Shield,
  Eye,
  Edit,
  Trash2,
  X,
  Loader2,
  FileBadge,
  UserX,
  Sparkles,
  ChevronRight,
  AlertCircle,
  BadgeCheck,
  Home,
  Building,
  Building2,
  FileText,
  Check,
} from 'lucide-react';

const SECTOR_OPTIONS: { id: ResidentSector; label: string; icon: string }[] = [
  { id: 'senior', label: 'Senior Citizen', icon: '👴' },
  { id: 'pwd', label: 'PWD (Person with Disability)', icon: '♿' },
  { id: 'soloParent', label: 'Solo Parent', icon: '👩‍👦' },
  { id: 'fourPs', label: '4Ps Beneficiary', icon: '🎗️' },
  { id: 'youth', label: 'Youth / SK Member', icon: '🎓' },
  { id: 'voter', label: 'Registered Voter', icon: '🗳️' },
  { id: 'ofw', label: 'Overseas Filipino Worker', icon: '✈️' },
  { id: 'indigenous', label: 'Indigenous Person', icon: '🌿' },
];

const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6'];

export const ResidentsDirectoryPage: React.FC = () => {
  const { user, role, isAuthInitialized } = useAuth();

  const [residents, setResidents] = useState<ResidentProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [selectedPurok, setSelectedPurok] = useState<string>('all');
  const [selectedSector, setSelectedSector] = useState<ResidentSector | 'all'>('all');
  const [selectedVoter, setSelectedVoter] = useState<VoterStatus | 'all'>('all');
  const [selectedVerification, setSelectedVerification] = useState<ResidentVerificationStatus | 'all'>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Modal & Drawer State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [selectedResident, setSelectedResident] = useState<ResidentProfile | null>(null);

  const [searchParams] = useSearchParams();

  // Navigation Tabs: 'residents' | 'households' | 'registry'
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<'residents' | 'households' | 'registry'>('residents');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (tabParam === 'residents') {
        setActiveDirectoryTab('residents');
      } else if (tabParam === 'households') {
        setActiveDirectoryTab('households');
      } else if (
        tabParam === 'registry' ||
        tabParam === 'household_registry' ||
        tabParam === 'number_requests' ||
        tabParam === 'pending_verification' ||
        tabParam === 'changes_requested' ||
        tabParam === 'pending_change_request' ||
        tabParam === 'verified'
      ) {
        setActiveDirectoryTab('registry');
      }
    }
  }, [searchParams]);

  // Household Registry State
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loadingHouseholds, setLoadingHouseholds] = useState<boolean>(true);
  const [householdSearchQuery, setHouseholdSearchQuery] = useState<string>('');
  const [householdStatusFilter, setHouseholdStatusFilter] = useState<'all' | 'pending_verification' | 'approved' | 'changes_requested' | 'rejected' | 'draft'>('all');
  const [householdPurokFilter, setHouseholdPurokFilter] = useState<string>('all');
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [showHouseholdModal, setShowHouseholdModal] = useState<boolean>(false);

  // Realtime Subscription to Households for Authorized Users / Officials
  useEffect(() => {
    if (!isAuthInitialized || !user) return;
    setLoadingHouseholds(true);
    const unsubscribe = residentService.subscribeToHouseholds(user, (data) => {
      setHouseholds(data);
      setLoadingHouseholds(false);
    });
    return () => unsubscribe();
  }, [isAuthInitialized, user]);

  const renderHouseholdStatusBadge = (
    status?: HouseholdVerificationStatus,
    isVerified?: boolean,
    pendingChangeRequest?: any,
    householdNumber?: string
  ) => {
    return (
      <HouseholdStatusBadge
        status={status}
        isVerified={isVerified}
        pendingChangeRequest={pendingChangeRequest}
        householdNumber={householdNumber}
      />
    );
  };

  const filteredHouseholds = households.filter((h) => {
    const q = householdSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (h.householdNumber && h.householdNumber.toLowerCase().includes(q)) ||
      (h.headFullName && h.headFullName.toLowerCase().includes(q)) ||
      (h.address && h.address.toLowerCase().includes(q)) ||
      (h.purok && h.purok.toLowerCase().includes(q));

    let matchesStatus = true;
    const hasNumber = Boolean(h.householdNumber && h.householdNumber.trim() && h.householdNumber !== 'HH-PENDING');
    if (householdStatusFilter === 'approved') {
      matchesStatus =
        h.isVerified ||
        h.verificationStatus === 'approved' ||
        (hasNumber &&
          h.verificationStatus !== 'draft' &&
          h.verificationStatus !== 'changes_requested' &&
          h.verificationStatus !== 'rejected');
    } else if (householdStatusFilter === 'pending_verification') {
      matchesStatus = h.verificationStatus === 'pending_verification' && !hasNumber;
    } else if (householdStatusFilter === 'changes_requested') {
      matchesStatus = h.verificationStatus === 'changes_requested';
    } else if (householdStatusFilter === 'rejected') {
      matchesStatus = h.verificationStatus === 'rejected';
    } else if (householdStatusFilter === 'draft') {
      matchesStatus = h.verificationStatus === 'draft';
    }

    const matchesPurok = householdPurokFilter === 'all' || h.purok === householdPurokFilter;

    return matchesSearch && matchesStatus && matchesPurok;
  });

  // Form State for Resident Creation
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [civilStatus, setCivilStatus] = useState<'single' | 'married' | 'widowed' | 'divorced' | 'separated'>('single');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<number>(15000);
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [purok, setPurok] = useState('Purok 1');
  const [idType, setIdType] = useState('PHILSYS_ID');
  const [idNumber, setIdNumber] = useState('');
  const [voterStatus, setVoterStatus] = useState<VoterStatus>('registered');
  const [voterPrecinctNo, setVoterPrecinctNo] = useState('');
  const [sectors, setSectors] = useState<ResidentSector[]>([]);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canManageResidents = ['admin', 'chairman', 'secretary'].includes(role || '');

  const fetchResidents = async () => {
    setLoading(true);
    try {
      const data = await residentService.getResidents({
        purok: selectedPurok,
        sector: selectedSector,
        voterStatus: selectedVoter,
        verificationStatus: selectedVerification,
        searchQuery: debouncedSearchQuery,
        currentUser: user,
      });
      setResidents(data);
    } catch (err) {
      console.error('Error fetching residents directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchResidents();
  }, [isAuthInitialized, selectedPurok, selectedSector, selectedVoter, selectedVerification, debouncedSearchQuery, user?.uid, user?.role]);

  const handleToggleSector = (sec: ResidentSector) => {
    if (sectors.includes(sec)) {
      setSectors(sectors.filter((s) => s !== sec));
    } else {
      setSectors([...sectors, sec]);
    }
  };

  const calculateAge = (bDate: string) => {
    if (!bDate) return 0;
    const diff = Date.now() - new Date(bDate).getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const handleCreateResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !contactNumber.trim() || !address.trim()) {
      setFormError('Please complete all required fields (*).');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const computedAge = calculateAge(birthDate);

      await residentService.createResident(
        {
          firstName,
          middleName,
          lastName,
          suffix,
          fullName: `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`,
          gender,
          birthDate,
          age: computedAge,
          civilStatus,
          citizenship: 'Filipino',
          occupation,
          monthlyIncome: Number(monthlyIncome),
          contactNumber,
          email,
          address,
          purok,
          barangay: 'Barangay Central',
          municipality: 'Baras',
          province: 'Rizal',
          idType,
          idNumber,
          verificationStatus: canManageResidents ? 'verified' : 'unverified',
          voterStatus,
          voterPrecinctNo,
          sectors,
          isHouseholdHead: false,
          emergencyContactName,
          emergencyContactNumber,
          residencyStatus: 'active',
        },
        user?.uid || 'system'
      );

      // Reset Form
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setSuffix('');
      setContactNumber('');
      setEmail('');
      setAddress('');
      setIdNumber('');
      setVoterPrecinctNo('');
      setSectors([]);
      setShowCreateModal(false);

      await fetchResidents();
    } catch (err: any) {
      console.error('Error creating resident profile:', err);
      setFormError(err.message || 'Failed to register resident. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyResident = async (residentId: string, status: 'verified' | 'rejected') => {
    try {
      await residentService.verifyResidentStatus(residentId, status, user?.uid || 'system');
      await fetchResidents();
      if (selectedResident && selectedResident.residentId === residentId) {
        const updated = await residentService.getResidentById(residentId);
        setSelectedResident(updated);
      }
    } catch (err) {
      console.error('Error updating resident verification status:', err);
    }
  };

  const handleDeleteResident = async (residentId: string) => {
    if (!window.confirm('Are you sure you want to soft delete this resident record?')) return;
    try {
      await residentService.deleteResident(residentId, user?.uid || 'system');
      await fetchResidents();
      setShowDetailModal(false);
    } catch (err) {
      console.error('Error deleting resident:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-800 rounded-2xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Master Resident Directory
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Official citizen registry, identity verification, and sectoral demographics database.
              </p>
            </div>
          </div>
        </div>

        {canManageResidents && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Resident</span>
          </button>
        )}
      </div>

      {/* Directory Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveDirectoryTab('residents')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeDirectoryTab === 'residents'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Residents ({residents.length})</span>
        </button>

        <button
          onClick={() => setActiveDirectoryTab('households')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeDirectoryTab === 'households'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Households ({households.length})</span>
        </button>

        <button
          onClick={() => setActiveDirectoryTab('registry')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeDirectoryTab === 'registry'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Household Registry</span>
        </button>
      </div>

      {/* TAB 1: MASTER RESIDENT REGISTRY */}
      {activeDirectoryTab === 'residents' && (
        <div className="space-y-6">
          {/* Filter and Search Section */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by full name, resident ID, ID number, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Quick Filter Selects */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <select
              value={selectedPurok}
              onChange={(e) => setSelectedPurok(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Puroks</option>
              {PUROK_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={selectedVoter}
              onChange={(e) => setSelectedVoter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Voter Status</option>
              <option value="registered">Registered Voter</option>
              <option value="unregistered">Unregistered</option>
            </select>

            <select
              value={selectedVerification}
              onChange={(e) => setSelectedVerification(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Verification</option>
              <option value="verified">Verified IDs</option>
              <option value="unverified">Unverified IDs</option>
            </select>
          </div>
        </div>

        {/* Sector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSector('all')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
              selectedSector === 'all'
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            👥 All Sectors
          </button>
          {SECTOR_OPTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSelectedSector(sec.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                selectedSector === sec.id
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>{sec.icon}</span>
              <span>{sec.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Directory Table / Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200/80">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-500">Loading resident directory...</p>
        </div>
      ) : residents.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Resident Profiles Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            There are no resident records matching your filter parameters.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4">Resident Name & ID</th>
                  <th className="p-4">Purok & Address</th>
                  <th className="p-4">Age / Gender</th>
                  <th className="p-4">Voter & Sectors</th>
                  <th className="p-4">ID Verification</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {residents.map((res) => {
                  const isVerified = res.verificationStatus === 'verified';
                  return (
                    <tr key={res.residentId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4 space-y-0.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={res.fullName} src={res.profilePicture} size="sm" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900 text-sm">{res.fullName}</span>
                              {isVerified && <BadgeCheck className="w-4 h-4 text-blue-600" title="Verified Resident" />}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                              ID: {res.residentId} • {res.contactNumber}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 space-y-0.5">
                        <div className="flex items-center gap-1 font-bold text-slate-800">
                          <MapPin className="w-3.5 h-3.5 text-blue-700" />
                          <span>{res.purok}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{res.address}</p>
                      </td>

                      <td className="p-4 space-y-0.5">
                        <p className="font-bold text-slate-800">{res.age} yrs old</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">{res.gender} • {res.civilStatus}</p>
                      </td>

                      <td className="p-4 space-y-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              res.voterStatus === 'registered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {res.voterStatus === 'registered' ? 'VOTER' : 'NON-VOTER'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {res.sectors?.map((sec) => (
                            <span key={sec} className="px-1.5 py-0.2 bg-blue-50 text-blue-800 rounded text-[9px] font-extrabold uppercase">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            isVerified
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{res.verificationStatus}</span>
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedResident(res);
                            setShowDetailModal(true);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* TAB 2: HOUSEHOLD REGISTRY & VERIFICATION */}
      {activeDirectoryTab === 'households' && (
        <div className="space-y-6">
          {/* Household Filter and Search Controls */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by Household No., Head Name, Address, or Purok..."
                  value={householdSearchQuery}
                  onChange={(e) => setHouseholdSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Quick Filter Selects */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <select
                  value={householdPurokFilter}
                  onChange={(e) => setHouseholdPurokFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Puroks</option>
                  {PUROK_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  value={householdStatusFilter}
                  onChange={(e) => setHouseholdStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="approved">Verified / Registered</option>
                  <option value="pending_verification">Pending Verification</option>
                  <option value="changes_requested">Changes Requested</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
          </div>

          {/* Household Grid / Table */}
          {loadingHouseholds ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200/80">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-500">Loading household registry...</p>
            </div>
          ) : filteredHouseholds.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 space-y-3">
              <Home className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No Household Records Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                There are no registered households matching your selected search or filter criteria.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">Household No. & Status</th>
                      <th className="p-4">Household Head</th>
                      <th className="p-4">Purok & Address</th>
                      <th className="p-4">Members</th>
                      <th className="p-4">Registration Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {filteredHouseholds.map((hh) => (
                      <tr key={hh.householdId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4 space-y-1">
                          <span className="font-extrabold text-slate-900 text-sm font-mono block">
                            {hh.householdNumber || 'HH-PENDING'}
                          </span>
                          <div>{renderHouseholdStatusBadge(hh.verificationStatus, hh.isVerified, hh.pendingChangeRequest, hh.householdNumber)}</div>
                        </td>

                        <td className="p-4">
                          <div className="font-bold text-slate-900 text-sm">{hh.headFullName || 'N/A'}</div>
                          <p className="text-[10px] text-slate-400 font-medium">Head of Household</p>
                        </td>

                        <td className="p-4 space-y-0.5">
                          <div className="flex items-center gap-1 font-bold text-slate-800">
                            <MapPin className="w-3.5 h-3.5 text-blue-700" />
                            <span>{hh.purok}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1">{hh.address}</p>
                        </td>

                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg font-bold text-xs">
                            👥 {hh.members?.length || hh.membersCount || 0} Members
                          </span>
                        </td>

                        <td className="p-4 text-slate-500 text-xs font-medium">
                          {hh.createdAt ? new Date(hh.createdAt).toLocaleDateString() : 'N/A'}
                        </td>

                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedHousehold(hh);
                              setShowHouseholdModal(true);
                            }}
                            className="px-3 py-1.5 font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-all cursor-pointer"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BARANGAY HOUSEHOLD REGISTRY */}
      {activeDirectoryTab === 'registry' && (
        <HouseholdsDirectoryPage
          embedded={true}
          householdsData={households}
          loadingHouseholds={loadingHouseholds}
        />
      )}

      {/* HOUSEHOLD DETAILS MODAL */}
      {showHouseholdModal && selectedHousehold && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-200 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                    {selectedHousehold.householdNumber || 'HH-REGISTERED'}
                  </span>
                  {renderHouseholdStatusBadge(selectedHousehold.verificationStatus, selectedHousehold.isVerified, selectedHousehold.pendingChangeRequest, selectedHousehold.householdNumber)}
                </div>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Household Profile — {selectedHousehold.headFullName}
                </h3>
              </div>
              <button
                onClick={() => setShowHouseholdModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Address & Geographic Verification Primary Card */}
              <div className="p-4 bg-blue-50/50 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-blue-900 font-extrabold text-xs uppercase tracking-wider">
                  <MapPin className="w-4 h-4 text-blue-700" />
                  <span>Address & Location Details</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Purok / Zone</span>
                    <span className="font-extrabold text-slate-900 text-sm">{selectedHousehold.purok}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">House No. & Street</span>
                    <span className="font-bold text-slate-800">{selectedHousehold.houseNumber || ''} {selectedHousehold.street || selectedHousehold.address}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Barangay</span>
                    <span className="font-bold text-slate-800">{selectedHousehold.barangay || 'Central'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Municipality / City</span>
                    <span className="font-bold text-slate-800">{selectedHousehold.municipality || 'City'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Province</span>
                    <span className="font-bold text-slate-800">{selectedHousehold.province || 'Province'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Registration Date</span>
                    <span className="font-bold text-slate-800">{selectedHousehold.createdAt ? new Date(selectedHousehold.createdAt).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Status & Structural Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400 font-bold text-[10px] uppercase">Head of Household</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedHousehold.headFullName}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400 font-bold text-[10px] uppercase">Building Type</p>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{selectedHousehold.buildingType || 'N/A'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400 font-bold text-[10px] uppercase">Ownership</p>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{selectedHousehold.houseOwnership || 'N/A'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400 font-bold text-[10px] uppercase">Monthly Income</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedHousehold.monthlyIncomeBracket || 'N/A'}</p>
                </div>
              </div>

              {/* Family Members Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900">
                  Family Members ({selectedHousehold.members?.length || selectedHousehold.membersCount || 0})
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-2xl text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3">Name</th>
                        <th className="p-3">Relationship</th>
                        <th className="p-3">Age / Gender</th>
                        <th className="p-3">Civil Status</th>
                        <th className="p-3">BOIMS ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {selectedHousehold.members?.map((m) => (
                        <tr key={m.id}>
                          <td className="p-3 font-bold text-slate-900">
                            {m.fullName} {m.isHouseholdHead && <span className="text-[10px] text-blue-600 font-black ml-1">(Head)</span>}
                          </td>
                          <td className="p-3 text-slate-600">{m.relationshipToHead}</td>
                          <td className="p-3 text-slate-600">
                            {m.age ? `${m.age} yrs` : 'N/A'} • <span className="capitalize">{m.gender}</span>
                          </td>
                          <td className="p-3 text-slate-600 capitalize">{m.civilStatus || 'Single'}</td>
                          <td className="p-3 font-mono text-slate-700 text-[11px]">{m.boimsId || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setShowHouseholdModal(false)}
                className="px-5 py-2 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resident Detail Profile Modal */}
      {showDetailModal && selectedResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-bold rounded-full uppercase">
                    {selectedResident.residentId}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      selectedResident.verificationStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedResident.verificationStatus}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900">{selectedResident.fullName}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedResident.address} ({selectedResident.purok})
                </p>
              </div>

              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 font-bold block">Contact Number</span>
                <span className="text-slate-900 font-bold">{selectedResident.contactNumber}</span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Email Address</span>
                <span className="text-slate-900 font-bold">{selectedResident.email || 'N/A'}</span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Age & Birthdate</span>
                <span className="text-slate-900 font-bold">
                  {selectedResident.age} yrs old ({selectedResident.birthDate})
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Civil Status & Gender</span>
                <span className="text-slate-900 font-bold capitalize">
                  {selectedResident.civilStatus} • {selectedResident.gender}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Occupation & Monthly Income</span>
                <span className="text-slate-900 font-bold">
                  {selectedResident.occupation || 'N/A'} (₱{selectedResident.monthlyIncome?.toLocaleString() || '0'})
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Voter Registration</span>
                <span className="text-slate-900 font-bold">
                  {selectedResident.voterStatus === 'registered'
                    ? `Registered (Precinct ${selectedResident.voterPrecinctNo || 'N/A'})`
                    : 'Unregistered'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">ID Type & Number</span>
                <span className="text-slate-900 font-bold">
                  {selectedResident.idType || 'N/A'} - {selectedResident.idNumber || 'N/A'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-bold block">Household Number</span>
                <span className="text-slate-900 font-bold">
                  {selectedResident.householdNumber || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* Sectors */}
            <div>
              <span className="text-slate-500 font-bold text-xs block mb-2">Registered Sectoral Classifications</span>
              <div className="flex flex-wrap gap-2">
                {selectedResident.sectors?.length > 0 ? (
                  selectedResident.sectors.map((sec) => (
                    <span
                      key={sec}
                      className="px-3 py-1 bg-blue-100 text-blue-900 text-xs font-bold rounded-xl uppercase"
                    >
                      {sec}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-xs italic">No specific sector classification</span>
                )}
              </div>
            </div>

            {/* Actions for Staff */}
            {canManageResidents && (
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {selectedResident.verificationStatus !== 'verified' && (
                    <button
                      onClick={() => handleVerifyResident(selectedResident.residentId, 'verified')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                    >
                      Approve ID Verification
                    </button>
                  )}

                  {selectedResident.verificationStatus !== 'rejected' && (
                    <button
                      onClick={() => handleVerifyResident(selectedResident.residentId, 'rejected')}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Reject Verification
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteResident(selectedResident.residentId)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Delete Resident
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Register Resident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Register Resident Profile</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Add a new resident to the Barangay Master Directory.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateResident} className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Juan"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Middle Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Santos"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dela Cruz"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Birth Date</label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Civil Status</label>
                  <select
                    value={civilStatus}
                    onChange={(e) => setCivilStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="widowed">Widowed</option>
                    <option value="separated">Separated</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="09171234567"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Purok / Sitio</label>
                  <select
                    value={purok}
                    onChange={(e) => setPurok(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PUROK_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Full Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="House No., Street, Purok, Barangay Central"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Sectors */}
              <div>
                <label className="block text-slate-700 font-bold mb-2">Sectoral Memberships</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SECTOR_OPTIONS.map((sec) => (
                    <label
                      key={sec.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer ${
                        sectors.includes(sec.id)
                          ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sectors.includes(sec.id)}
                        onChange={() => handleToggleSector(sec.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>{sec.icon}</span>
                      <span className="text-[11px] truncate">{sec.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Register Resident</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
