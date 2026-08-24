/**
 * Page: HouseholdsDirectoryPage (Module 6)
 * Barangay Household Registry, Family Links, Structural & Utilities Assessment.
 * Features Resident Self-Service Household Portal, Real-time Synchronization, Member Validation,
 * Completion Progress Tracking, Change Request Workflows, and Staff Review/Verification.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isResidentMode } from '../utils/permissions';
import { residentService } from '../services/residentService';
import { householdInviteService } from '../services/householdInviteService';
import { HouseholdStatusBadge } from '../components/households/HouseholdStatusBadge';
import { storageService } from '../services/storageService';
import {
  Household,
  HouseholdMember,
  HouseholdInvite,
  User,
  HouseOwnership,
  BuildingType,
  SanitationFacility,
  WaterSource,
  ElectricityAvailability,
  InternetAvailability,
  HouseholdVerificationStatus,
  HouseholdNumberChangeRequest,
} from '../types';
import {
  Home,
  Users,
  Search,
  Plus,
  MapPin,
  X,
  Loader2,
  Droplet,
  Trash2,
  Check,
  Building2,
  DollarSign,
  ShieldCheck,
  Eye,
  Edit3,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserPlus,
  Zap,
  Wifi,
  FileText,
  Filter,
  UserCheck,
  ArrowRight,
  RefreshCw,
  Award,
  AlertTriangle,
  Upload,
  ExternalLink,
  FileCheck,
} from 'lucide-react';

const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6'];

const HOUSE_OWNERSHIP_OPTIONS: { value: HouseOwnership; label: string }[] = [
  { value: 'owned', label: 'Owned / Titled' },
  { value: 'rented', label: 'Rented' },
  { value: 'livingWithRelatives', label: 'Living with Relatives' },
  { value: 'informalSettler', label: 'Informal Settler' },
  { value: 'caretaker', label: 'Caretaker' },
  { value: 'other', label: 'Other' },
];

const BUILDING_TYPE_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'semiConcrete', label: 'Semi-Concrete' },
  { value: 'wood', label: 'Wood / Timber' },
  { value: 'makeshift', label: 'Makeshift / Salvaged' },
  { value: 'commercial', label: 'Commercial Building' },
  { value: 'other', label: 'Other' },
];

const SANITATION_OPTIONS: { value: SanitationFacility; label: string }[] = [
  { value: 'waterSealed', label: 'Water-Sealed Flush Toilet' },
  { value: 'shared', label: 'Shared Toilet Facility' },
  { value: 'openPit', label: 'Open Pit / Latrine' },
  { value: 'none', label: 'No Toilet Facility' },
];

const WATER_SOURCE_OPTIONS: { value: WaterSource; label: string }[] = [
  { value: 'piped', label: 'Level III Piped Tap Water' },
  { value: 'well', label: 'Deep Well / Pump' },
  { value: 'station', label: 'Commercial Water Station' },
  { value: 'others', label: 'Spring / River / Others' },
];

const ELECTRICITY_OPTIONS: { value: ElectricityAvailability; label: string }[] = [
  { value: 'grid', label: 'Electric Power Grid Connection' },
  { value: 'solar', label: 'Solar Power System' },
  { value: 'generator', label: 'Generator' },
  { value: 'none', label: 'No Electricity' },
];

const INTERNET_OPTIONS: { value: InternetAvailability; label: string }[] = [
  { value: 'fiber', label: 'Fiber Optic Broadband' },
  { value: 'broadband', label: 'Wireless Broadband / DSL' },
  { value: 'mobile', label: 'Mobile Cellular Data' },
  { value: 'none', label: 'No Internet Service' },
];

const INCOME_BRACKETS = [
  'Under ₱10,000 / month',
  '₱10,000 - ₱20,000 / month',
  '₱20,001 - ₱40,000 / month',
  '₱40,001 - ₱70,000 / month',
  'Above ₱70,000 / month',
];

const RELATIONSHIP_OPTIONS = [
  'Head of Household',
  'Spouse',
  'Child',
  'Parent',
  'Sibling',
  'Grandparent',
  'Grandchild',
  'Relative',
  'Non-Relative',
  'Other',
];

const EDUCATIONAL_OPTIONS = [
  { value: 'elementary', label: 'Elementary' },
  { value: 'highSchool', label: 'High School' },
  { value: 'seniorHigh', label: 'Senior High School' },
  { value: 'vocational', label: 'Vocational / Technical' },
  { value: 'college', label: 'College / University' },
  { value: 'postGraduate', label: 'Post-Graduate' },
  { value: 'none', label: 'None / Preschool' },
];

export interface HouseholdsDirectoryPageProps {
  embedded?: boolean;
  householdsData?: Household[];
  loadingHouseholds?: boolean;
}

export const HouseholdsDirectoryPage: React.FC<HouseholdsDirectoryPageProps> = ({
  embedded = false,
  householdsData,
  loadingHouseholds = false,
}) => {
  const { user, role, isAuthInitialized } = useAuth();
  const isResident = isResidentMode(user, role);
  const isStaff = !isResident && ['admin', 'chairman', 'secretary', 'developer', 'purokOfficial', 'superAdmin', 'verifier'].includes(
    role || ''
  );

  const [searchParams] = useSearchParams();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPurok, setSelectedPurok] = useState<string>('all');
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>(embedded ? 'number_requests' : 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (
        tabParam === 'registry' ||
        tabParam === 'household_registry' ||
        tabParam === 'number_requests'
      ) {
        setSelectedStatusTab('number_requests');
      } else {
        setSelectedStatusTab(tabParam);
      }
    } else if (embedded) {
      setSelectedStatusTab('number_requests');
    }
  }, [searchParams, embedded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Active Modals State
  const [showHouseholdModal, setShowHouseholdModal] = useState<boolean>(false);
  const [isEditingHousehold, setIsEditingHousehold] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showMemberModal, setShowMemberModal] = useState<boolean>(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [showChangeHeadModal, setShowChangeHeadModal] = useState<boolean>(false);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);

  // Add Family Member via BOIMS ID State
  const [showAddFamilyMemberModal, setShowAddFamilyMemberModal] = useState<boolean>(false);
  const [boimsIdInput, setBoimsIdInput] = useState<string>('');
  const [proposedRole, setProposedRole] = useState<string>('Father');
  const [familyOccupation, setFamilyOccupation] = useState<string>('');
  const [verifyingBoimsId, setVerifyingBoimsId] = useState<boolean>(false);
  const [foundResidentPreview, setFoundResidentPreview] = useState<User | null>(null);
  const [boimsIdLookupError, setBoimsIdLookupError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState<boolean>(false);

  // Invites state
  const [incomingInvites, setIncomingInvites] = useState<HouseholdInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<HouseholdInvite[]>([]);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  // Map of linked user profiles for real-time Name/Age sync
  const [linkedProfilesMap, setLinkedProfilesMap] = useState<Record<string, User>>({});

  // Household Form State
  const [householdHeadName, setHouseholdHeadName] = useState('');
  const [address, setAddress] = useState('');
  const [purok, setPurok] = useState('Purok 1');
  const [houseOwnership, setHouseOwnership] = useState<HouseOwnership>('owned');
  const [buildingType, setBuildingType] = useState<BuildingType>('concrete');
  const [sanitationFacility, setSanitationFacility] = useState<SanitationFacility>('waterSealed');
  const [waterSource, setWaterSource] = useState<WaterSource>('piped');
  const [electricityAvailability, setElectricityAvailability] = useState<ElectricityAvailability>('grid');
  const [internetAvailability, setInternetAvailability] = useState<InternetAvailability>('fiber');
  const [monthlyIncomeBracket, setMonthlyIncomeBracket] = useState(INCOME_BRACKETS[1]);
  const [saveAsDraft, setSaveAsDraft] = useState<boolean>(false);

  // Member Form State
  const [memberFullName, setMemberFullName] = useState('');
  const [memberBirthdate, setMemberBirthdate] = useState('');
  const [memberGender, setMemberGender] = useState<'male' | 'female' | 'other'>('male');
  const [memberCivilStatus, setMemberCivilStatus] = useState<'single' | 'married' | 'widowed' | 'separated' | 'divorced'>('single');
  const [memberRelationship, setMemberRelationship] = useState('Spouse');
  const [memberOccupation, setMemberOccupation] = useState('');
  const [memberEducation, setMemberEducation] = useState<string>('highSchool');
  const [memberIsHead, setMemberIsHead] = useState(false);
  const [memberIsVoter, setMemberIsVoter] = useState(false);
  const [memberIsPwd, setMemberIsPwd] = useState(false);
  const [memberIsSenior, setMemberIsSenior] = useState(false);
  const [memberIsSoloParent, setMemberIsSoloParent] = useState(false);
  const [memberIs4Ps, setMemberIs4Ps] = useState(false);
  const [memberIsYouth, setMemberIsYouth] = useState(false);
  const [memberPhilHealth, setMemberPhilHealth] = useState('');
  const [memberContactNumber, setMemberContactNumber] = useState('');

  // Change Head Selection
  const [selectedNewHeadId, setSelectedNewHeadId] = useState('');

  // Staff Review Notes
  const [reviewNotes, setReviewNotes] = useState('');

  // Household Number Editing & Conflict State
  const [editableHouseholdNumber, setEditableHouseholdNumber] = useState('');
  const [numberCheckStatus, setNumberCheckStatus] = useState<'idle' | 'checking' | 'available' | 'conflict'>('idle');
  const [conflictingHousehold, setConflictingHousehold] = useState<Household | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [conflictReason, setConflictReason] = useState('');
  const [numberChangeRequests, setNumberChangeRequests] = useState<HouseholdNumberChangeRequest[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // Load Household Number Change Requests for Staff/Secretary
  const loadNumberChangeRequests = async () => {
    if (!isStaff) return;
    try {
      const list = await residentService.getHouseholdNumberChangeRequests();
      setNumberChangeRequests(list);
    } catch (err) {
      console.warn('Error loading number change requests:', err);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    if (isStaff) {
      const unsubscribe = residentService.subscribeToHouseholdNumberChangeRequests((list) => {
        setNumberChangeRequests(list);
      });
      return () => unsubscribe();
    }
  }, [isAuthInitialized, isStaff]);

  // UI Processing states
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Realtime Data Subscription
  useEffect(() => {
    if (!isAuthInitialized) return;
    if (embedded && householdsData !== undefined) {
      setHouseholds(householdsData);
      setLoading(loadingHouseholds);
      return;
    }

    setLoading(true);
    const unsubscribe = residentService.subscribeToHouseholds(
      user,
      (data) => {
        setHouseholds(data);
        setLoading(false);
      },
      { purok: selectedPurok, searchQuery: debouncedSearchQuery }
    );

    return () => unsubscribe();
  }, [isAuthInitialized, user?.uid, user?.role, selectedPurok, debouncedSearchQuery, embedded, householdsData, loadingHouseholds]);

  // Find Resident's Household
  const myHousehold = households.find(
    (h) =>
      h.createdBy === user?.uid ||
      h.householdHeadId === user?.uid ||
      h.memberResidentIds?.includes(user?.uid || '') ||
      h.members?.some((m) => m.residentId === user?.uid)
  );

  // Subscribe to Realtime Household Invites
  useEffect(() => {
    if (!isAuthInitialized || !user?.uid) return;
    const unsubscribe = householdInviteService.subscribeToUserInvites(user.uid, (data) => {
      setIncomingInvites(data.incoming);
      setOutgoingInvites(data.outgoing);
    });
    return () => unsubscribe();
  }, [isAuthInitialized, user?.uid]);

  // Verify BOIMS ID
  const handleVerifyBoimsId = async () => {
    if (!boimsIdInput.trim()) {
      setBoimsIdLookupError('Please enter a BOIMS Identification Number.');
      setFoundResidentPreview(null);
      return;
    }
    setVerifyingBoimsId(true);
    setBoimsIdLookupError(null);
    setFoundResidentPreview(null);

    try {
      const targetUser = await householdInviteService.lookupUserByBoimsId(boimsIdInput, user?.uid || '');
      setFoundResidentPreview(targetUser);
    } catch (err: any) {
      setBoimsIdLookupError(err.message || 'Error looking up BOIMS ID.');
    } finally {
      setVerifyingBoimsId(false);
    }
  };

  // Send Family Request
  const handleSendFamilyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!foundResidentPreview) {
      await handleVerifyBoimsId();
      return;
    }

    setSendingRequest(true);
    setBoimsIdLookupError(null);

    try {
      await householdInviteService.sendHouseholdInvite({
        requester: user,
        householdId: myHousehold?.householdId || '',
        targetBoimsId: boimsIdInput,
        proposedRole,
        occupation: familyOccupation,
      });

      setSuccessMessage(`Family member request sent to ${foundResidentPreview.fullName} (${foundResidentPreview.boimsId || boimsIdInput}).`);
      setShowAddFamilyMemberModal(false);
      setBoimsIdInput('');
      setFoundResidentPreview(null);
      setFamilyOccupation('');
    } catch (err: any) {
      setBoimsIdLookupError(err.message || 'Failed to send family member request.');
    } finally {
      setSendingRequest(false);
    }
  };

  // Accept Request
  const handleAcceptInvite = async (inviteId: string) => {
    if (!user?.uid) return;
    setProcessingInviteId(inviteId);
    try {
      await householdInviteService.acceptHouseholdInvite(inviteId, user.uid);
      setSuccessMessage('You have accepted the household invitation! Your household profile has been updated.');
      // Reload households
      const updated = await residentService.getHouseholdByUserId(user.uid);
      if (updated) {
        setHouseholds((prev) => {
          const idx = prev.findIndex((h) => h.householdId === updated.householdId);
          if (idx >= 0) {
            const list = [...prev];
            list[idx] = updated;
            return list;
          }
          return [updated, ...prev];
        });
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to accept invitation.');
    } finally {
      setProcessingInviteId(null);
    }
  };

  // Reject Request
  const handleRejectInvite = async (inviteId: string) => {
    if (!user?.uid) return;
    setProcessingInviteId(inviteId);
    try {
      await householdInviteService.rejectHouseholdInvite(inviteId, user.uid);
      setSuccessMessage('You have declined the household invitation.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to decline invitation.');
    } finally {
      setProcessingInviteId(null);
    }
  };

  // Sorted Household Members
  const sortedMyHouseholdMembers = myHousehold?.members
    ? householdInviteService.sortHouseholdMembers(myHousehold.members, linkedProfilesMap)
    : [];

  // Filtered Households for Staff Directory View
  const filteredHouseholds = households.filter((h) => {
    if (selectedPurok !== 'all' && h.purok !== selectedPurok) {
      return false;
    }
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase().trim();
      const matchHead = h.householdHeadName?.toLowerCase().includes(q);
      const matchNumber = h.householdNumber?.toLowerCase().includes(q);
      const matchAddress = h.address?.toLowerCase().includes(q);
      const matchMember = h.members?.some((m) => m.fullName?.toLowerCase().includes(q));
      if (!matchHead && !matchNumber && !matchAddress && !matchMember) {
        return false;
      }
    }
    if (selectedStatusTab === 'pending_verification') {
      const hasNumber = Boolean(h.householdNumber && h.householdNumber.trim() && h.householdNumber !== 'HH-PENDING');
      return h.verificationStatus === 'pending_verification' && !hasNumber;
    }
    if (selectedStatusTab === 'verified') {
      const hasNumber = Boolean(h.householdNumber && h.householdNumber.trim() && h.householdNumber !== 'HH-PENDING');
      return (
        h.isVerified ||
        h.verificationStatus === 'approved' ||
        (hasNumber &&
          h.verificationStatus !== 'draft' &&
          h.verificationStatus !== 'changes_requested' &&
          h.verificationStatus !== 'rejected')
      );
    }
    if (selectedStatusTab === 'changes_requested') {
      return h.verificationStatus === 'changes_requested';
    }
    if (selectedStatusTab === 'rejected') {
      return h.verificationStatus === 'rejected';
    }
    if (selectedStatusTab === 'pending_change_request') {
      return h.pendingChangeRequest && h.pendingChangeRequest.status === 'pending';
    }
    if (selectedStatusTab === 'registry' || selectedStatusTab === 'household_registry' || selectedStatusTab === 'number_requests') {
      const activeConflictHouseholdIds = new Set(
        numberChangeRequests
          .filter((r) => r.status === 'pending_review')
          .flatMap((r) => [r.householdId, r.conflictingHouseholdId].filter(Boolean))
      );
      return activeConflictHouseholdIds.has(h.householdId);
    }
    return true;
  });

  const pendingVerificationCount = households.filter(
    (h) =>
      h.verificationStatus === 'pending_verification' &&
      (!h.householdNumber || !h.householdNumber.trim() || h.householdNumber === 'HH-PENDING')
  ).length;

  const pendingNumberRequestsCount = numberChangeRequests.filter((r) => r.status === 'pending_review').length;

  const filteredNumberChangeRequests = numberChangeRequests.filter((req) => {
    if (selectedStatusTab === 'verified') {
      if (req.status !== 'approved') return false;
    } else if (selectedStatusTab === 'rejected') {
      if (req.status !== 'rejected') return false;
    } else {
      if (req.status !== 'pending_review') return false;
    }

    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase().trim();
      const matchName = req.requestedByName?.toLowerCase().includes(q);
      const matchReqNum = req.requestedHouseholdNumber?.toLowerCase().includes(q);
      const matchCurrNum = req.currentHouseholdNumber?.toLowerCase().includes(q);
      const matchConfNum = req.conflictingHouseholdNumber?.toLowerCase().includes(q);
      const matchReason = req.reason?.toLowerCase().includes(q);
      const matchId = req.requestId?.toLowerCase().includes(q);
      const matchNotes = req.reviewNotes?.toLowerCase().includes(q);
      if (!matchName && !matchReqNum && !matchCurrNum && !matchConfNum && !matchReason && !matchId && !matchNotes) {
        return false;
      }
    }

    return true;
  });

  // Household Number Availability Live Checker
  const handleHouseholdNumberChange = async (newVal: string) => {
    setEditableHouseholdNumber(newVal);
    const norm = residentService.normalizeHouseholdNumber(newVal);
    const currentNorm = selectedHousehold ? residentService.normalizeHouseholdNumber(selectedHousehold.householdNumber) : '';

    if (!norm || norm === currentNorm) {
      setNumberCheckStatus('idle');
      setConflictingHousehold(null);
      return;
    }

    setNumberCheckStatus('checking');
    const check = await residentService.checkHouseholdNumberAvailability(
      norm,
      selectedHousehold?.householdId
    );

    if (check.error) {
      setNumberCheckStatus('conflict');
      setFormError(check.error);
      setConflictingHousehold(null);
    } else if (check.available) {
      setNumberCheckStatus('available');
      setFormError(null);
      setConflictingHousehold(null);
    } else {
      setNumberCheckStatus('conflict');
      setFormError(null);
      setConflictingHousehold(check.conflictingHousehold || null);
    }
  };

  // Open Create/Edit Household Modal
  const handleOpenHouseholdModal = (targetHH?: Household | null) => {
    setFormError(null);
    setEvidenceFile(null);
    setConflictReason('');
    setNumberCheckStatus('idle');
    setConflictingHousehold(null);

    if (targetHH) {
      setIsEditingHousehold(true);
      setSelectedHousehold(targetHH);
      setHouseholdHeadName(targetHH.householdHeadName || '');
      setEditableHouseholdNumber(targetHH.householdNumber || '');
      setAddress(targetHH.address || '');
      setPurok(targetHH.purok || 'Purok 1');
      setHouseOwnership(targetHH.houseOwnership || 'owned');
      setBuildingType(targetHH.buildingType || 'concrete');
      setSanitationFacility(targetHH.sanitationFacility || 'waterSealed');
      setWaterSource(targetHH.waterSource || 'piped');
      setElectricityAvailability(targetHH.electricityAvailability || 'grid');
      setInternetAvailability(targetHH.internetAvailability || 'fiber');
      setMonthlyIncomeBracket(targetHH.monthlyIncomeBracket || INCOME_BRACKETS[1]);
      setSaveAsDraft(targetHH.verificationStatus === 'draft');
    } else {
      setIsEditingHousehold(false);
      setSelectedHousehold(null);
      setHouseholdHeadName(user?.fullName || '');
      setEditableHouseholdNumber('');
      setAddress('');
      setPurok('Purok 1');
      setHouseOwnership('owned');
      setBuildingType('concrete');
      setSanitationFacility('waterSealed');
      setWaterSource('piped');
      setElectricityAvailability('grid');
      setInternetAvailability('fiber');
      setMonthlyIncomeBracket(INCOME_BRACKETS[1]);
      setSaveAsDraft(false);
    }
    setShowHouseholdModal(true);
  };

  // Submit Household Profile (Create or Update)
  const handleSaveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdHeadName.trim()) {
      setFormError('Household Head Name is required.');
      return;
    }
    if (!address.trim()) {
      setFormError('Complete address is required.');
      return;
    }

    const normRequested = residentService.normalizeHouseholdNumber(editableHouseholdNumber);
    const normCurrent = selectedHousehold ? residentService.normalizeHouseholdNumber(selectedHousehold.householdNumber) : '';
    const isNumberChanged = isEditingHousehold && selectedHousehold && normRequested && normRequested !== normCurrent;

    const payloadData: any = {
      householdHeadName: householdHeadName.trim(),
      householdHeadId: isEditingHousehold && selectedHousehold ? selectedHousehold.householdHeadId : user?.uid || 'res-id',
      address: address.trim(),
      purok,
      barangay: 'Barangay Central',
      municipality: 'City',
      province: 'Province',
      houseOwnership,
      buildingType,
      sanitationFacility,
      waterSource,
      electricityAvailability,
      internetAvailability,
      monthlyIncomeBracket,
      membersCount: isEditingHousehold && selectedHousehold ? selectedHousehold.membersCount : 1,
      memberResidentIds: isEditingHousehold && selectedHousehold ? selectedHousehold.memberResidentIds : [user?.uid || 'res-id'],
      members: isEditingHousehold && selectedHousehold && selectedHousehold.members
        ? selectedHousehold.members
        : [
            {
              id: `MEM-${Date.now().toString().slice(-6)}`,
              fullName: householdHeadName.trim(),
              age: 30,
              gender: 'male',
              relationshipToHead: 'Head of Household',
              isHouseholdHead: true,
              residentId: user?.uid,
            },
          ],
    };

    // If household number changed, perform authoritative availability re-check before saving
    let activeStatus = numberCheckStatus;
    let activeConflict = conflictingHousehold;

    if (isNumberChanged) {
      const checkResult = await residentService.checkHouseholdNumberAvailability(
        normRequested,
        selectedHousehold.householdId
      );
      if (checkResult.error) {
        setFormError(checkResult.error);
        return;
      }
      if (!checkResult.available) {
        activeStatus = 'conflict';
        activeConflict = checkResult.conflictingHousehold || null;
        setNumberCheckStatus('conflict');
        setConflictingHousehold(activeConflict);
      } else {
        activeStatus = 'available';
        setNumberCheckStatus('available');
      }
    }

    // If household number changed and conflicts with another household
    if (isNumberChanged && activeStatus === 'conflict') {
      if (!evidenceFile) {
        setFormError('Supporting evidence document (census sticker, barangay certificate, or utility bill) is required for duplicate household number reassignment.');
        return;
      }
      if (!conflictReason.trim()) {
        setFormError('Please provide a brief explanation for requesting this household number.');
        return;
      }

      setSubmitting(true);
      setFormError(null);

      try {
        const uploadRes = await storageService.uploadHouseholdNumberEvidence(
          `HNR-PENDING-${selectedHousehold.householdId}`,
          evidenceFile
        );

        await residentService.createHouseholdNumberChangeRequest({
          householdId: selectedHousehold.householdId,
          requesterUid: user?.uid || 'user',
          requestedByName: user?.fullName || householdHeadName.trim(),
          currentHouseholdNumber: selectedHousehold.householdNumber,
          requestedHouseholdNumber: normRequested,
          conflictingHouseholdId: activeConflict?.householdId || '',
          conflictingHouseholdNumber: activeConflict?.householdNumber || normRequested,
          reason: conflictReason.trim(),
          evidencePath: uploadRes.path,
          evidenceUrl: uploadRes.url,
          evidenceFileName: evidenceFile.name,
        });

        await residentService.updateHousehold(
          selectedHousehold.householdId,
          payloadData,
          user?.uid || 'user',
          isResident,
          role,
          user?.fullName
        );

        setSuccessMessage('Household Number Conflict Request submitted to the Barangay Secretary for evidence review.');
        setShowHouseholdModal(false);
        if (isStaff) loadNumberChangeRequests();
        setTimeout(() => setSuccessMessage(null), 5000);
      } catch (err: any) {
        console.error('Error submitting number change request:', err);
        setFormError(err.message || 'Failed to submit household number change request.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // If household number changed and is available
    if (isNumberChanged && numberCheckStatus === 'available') {
      payloadData.householdNumber = normRequested;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (isEditingHousehold && selectedHousehold) {
        await residentService.updateHousehold(
          selectedHousehold.householdId,
          saveAsDraft ? { ...payloadData, verificationStatus: 'draft' } : payloadData,
          user?.uid || 'user',
          isResident,
          role,
          user?.fullName
        );
        setSuccessMessage(
          isResident && selectedHousehold.isVerified
            ? 'Household profile updated successfully.'
            : 'Household profile updated successfully.'
        );
      } else {
        await residentService.createHousehold(
          payloadData,
          user?.uid || 'user',
          isResident,
          saveAsDraft,
          role,
          user?.fullName
        );
        setSuccessMessage(saveAsDraft ? 'Household draft saved.' : 'Household registered and submitted for verification.');
      }

      setShowHouseholdModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving household:', err);
      setFormError(err.message || 'Failed to save household record.');
    } finally {
      setSubmitting(false);
    }
  };

  // Staff Review Action: Approve Household Number Change Request
  const handleApproveNumberRequest = async (req: HouseholdNumberChangeRequest) => {
    if (!user?.uid) return;
    setProcessingRequestId(req.requestId);
    setFormError(null);
    try {
      const res = await residentService.approveHouseholdNumberChangeRequest(
        req.requestId,
        user.uid,
        role || 'secretary',
        user.fullName || 'Secretary',
        reviewNotes
      );
      setSuccessMessage(
        `Approved! Household Number ${req.requestedHouseholdNumber} assigned to ${req.requestedByName}. Conflicting household reassigned to ${res.displacedNewNumber}.`
      );
      setReviewNotes('');
      await loadNumberChangeRequests();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error approving number request:', err);
      setFormError(err.message || 'Failed to approve request.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Staff Review Action: Reject Household Number Change Request
  const handleRejectNumberRequest = async (req: HouseholdNumberChangeRequest) => {
    if (!user?.uid) return;
    if (!reviewNotes.trim()) {
      setFormError('Please provide review notes / reason for rejecting the change request.');
      return;
    }
    setProcessingRequestId(req.requestId);
    setFormError(null);
    try {
      await residentService.rejectHouseholdNumberChangeRequest(
        req.requestId,
        user.uid,
        role || 'secretary',
        user.fullName || 'Secretary',
        reviewNotes
      );
      setSuccessMessage(`Request ${req.requestId} rejected successfully.`);
      setReviewNotes('');
      await loadNumberChangeRequests();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error rejecting number request:', err);
      setFormError(err.message || 'Failed to reject request.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Submit Household for Official Verification
  const handleSubmitForVerification = async (householdId: string) => {
    setSubmitting(true);
    try {
      await residentService.submitHouseholdForVerification(householdId, user?.uid || 'user', role, user?.fullName);
      setSuccessMessage('Household submitted for official verification.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error submitting household:', err);
      alert('Failed to submit household for verification.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Add/Edit Member Modal
  const handleOpenMemberModal = (memberToEdit?: HouseholdMember) => {
    setFormError(null);
    const currentHH = isResident ? myHousehold : selectedHousehold;
    if (!currentHH) return;

    if (memberToEdit) {
      setEditingMemberId(memberToEdit.id);
      setMemberFullName(memberToEdit.fullName);
      setMemberBirthdate(memberToEdit.birthdate || '');
      setMemberGender(memberToEdit.gender);
      setMemberCivilStatus(memberToEdit.civilStatus || 'single');
      setMemberRelationship(memberToEdit.relationshipToHead);
      setMemberOccupation(memberToEdit.occupation || '');
      setMemberEducation(memberToEdit.educationalAttainment || 'highSchool');
      setMemberIsHead(!!memberToEdit.isHouseholdHead);
      setMemberIsVoter(!!memberToEdit.isVoter);
      setMemberIsPwd(!!memberToEdit.isPwd);
      setMemberIsSenior(!!memberToEdit.isSenior);
      setMemberIsSoloParent(!!memberToEdit.isSoloParent);
      setMemberIs4Ps(!!memberToEdit.is4Ps);
      setMemberIsYouth(!!memberToEdit.isYouth);
      setMemberPhilHealth(memberToEdit.philHealth || '');
      setMemberContactNumber(memberToEdit.contactNumber || '');
    } else {
      setEditingMemberId(null);
      setMemberFullName('');
      setMemberBirthdate('');
      setMemberGender('male');
      setMemberCivilStatus('single');
      setMemberRelationship('Child');
      setMemberOccupation('');
      setMemberEducation('highSchool');
      setMemberIsHead(false);
      setMemberIsVoter(false);
      setMemberIsPwd(false);
      setMemberIsSenior(false);
      setMemberIsSoloParent(false);
      setMemberIs4Ps(false);
      setMemberIsYouth(false);
      setMemberPhilHealth('');
      setMemberContactNumber('');
    }
    setShowMemberModal(true);
  };

  // Save Household Member
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentHH = isResident ? myHousehold : selectedHousehold;
    if (!currentHH) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const memberPayload = {
        fullName: memberFullName.trim(),
        birthdate: memberBirthdate,
        gender: memberGender,
        civilStatus: memberCivilStatus,
        relationshipToHead: memberRelationship,
        occupation: memberOccupation.trim() || undefined,
        educationalAttainment: memberEducation as any,
        isHouseholdHead: memberIsHead,
        isVoter: memberIsVoter,
        isPwd: memberIsPwd,
        isSenior: memberIsSenior,
        isSoloParent: memberIsSoloParent,
        is4Ps: memberIs4Ps,
        isYouth: memberIsYouth,
        philHealth: memberPhilHealth.trim() || undefined,
        contactNumber: memberContactNumber.trim() || undefined,
      };

      if (editingMemberId) {
        await residentService.updateHouseholdMember(
          currentHH.householdId,
          editingMemberId,
          memberPayload,
          user?.uid || 'user',
          isResident,
          role,
          user?.fullName
        );
        setSuccessMessage('Household member updated successfully.');
      } else {
        await residentService.addHouseholdMember(
          currentHH.householdId,
          memberPayload,
          user?.uid || 'user',
          isResident,
          role,
          user?.fullName
        );
        setSuccessMessage('Household member added successfully.');
      }

      setShowMemberModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving member:', err);
      setFormError(err.message || 'Failed to save household member.');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove Household Member
  const handleRemoveMember = async (memberId: string) => {
    const currentHH = isResident ? myHousehold : selectedHousehold;
    if (!currentHH) return;

    if (!confirm('Are you sure you want to remove this member from the household?')) return;

    setSubmitting(true);
    try {
      await residentService.removeHouseholdMember(
        currentHH.householdId,
        memberId,
        user?.uid || 'user',
        isResident,
        role,
        user?.fullName
      );
      setSuccessMessage('Household member removed.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    } finally {
      setSubmitting(false);
    }
  };

  // Change Household Head
  const handleChangeHead = async () => {
    const currentHH = isResident ? myHousehold : selectedHousehold;
    if (!currentHH || !selectedNewHeadId) return;

    setSubmitting(true);
    try {
      await residentService.changeHouseholdHead(
        currentHH.householdId,
        selectedNewHeadId,
        user?.uid || 'user',
        isResident,
        role,
        user?.fullName
      );
      setSuccessMessage('Household Head updated successfully.');
      setShowChangeHeadModal(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to change household head.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (
    status?: HouseholdVerificationStatus,
    isVerified?: boolean,
    pendingReq?: any,
    householdNumber?: string
  ) => {
    return (
      <HouseholdStatusBadge
        status={status}
        isVerified={isVerified}
        pendingChangeRequest={pendingReq}
        householdNumber={householdNumber}
      />
    );
  };

  const mainContent = (
    <div className="space-y-6">
      {/* Top Banner & Header (Standalone Mode) */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Home className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {isResident ? 'My Household Self-Service Portal' : 'Barangay Household Registry'}
                </h1>
                <p className="text-sm text-slate-500">
                  {isResident
                    ? 'Manage your family members, structural details, and utilities assessment.'
                    : 'Master registry, structural audit, and resident verification workflows.'}
                </p>
              </div>
            </div>
          </div>

          {/* Global Action Buttons */}
          <div className="flex items-center gap-3">
            {isResident ? (
              !myHousehold ? (
                <button
                  onClick={() => handleOpenHouseholdModal(null)}
                  className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm transition-all text-sm gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Register My Household
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenHouseholdModal(myHousehold)}
                    className="inline-flex items-center px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all text-sm gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Profile
                  </button>
                  <button
                    onClick={() => {
                      if (isResident) {
                        setShowAddFamilyMemberModal(true);
                      } else {
                        handleOpenMemberModal();
                      }
                    }}
                    className="inline-flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all text-sm gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> Add Family Member
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => handleOpenHouseholdModal(null)}
                className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm transition-all text-sm gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Register New Household
              </button>
            )}
          </div>
        </div>
      )}

      {/* Embedded Mode Action Toolbar */}
      {embedded && (
        <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Building2 className="w-5 h-5 text-blue-600" />
            <span>{isResident ? 'My Household Self-Service Portal' : 'Barangay Household Operations'}</span>
          </div>

          <div className="flex items-center gap-3">
            {isResident ? (
              !myHousehold ? (
                <button
                  onClick={() => handleOpenHouseholdModal(null)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all text-xs gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Register My Household
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenHouseholdModal(myHousehold)}
                    className="inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all text-xs gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                  </button>
                  <button
                    onClick={() => {
                      if (isResident) {
                        setShowAddFamilyMemberModal(true);
                      } else {
                        handleOpenMemberModal();
                      }
                    }}
                    className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all text-xs gap-1 cursor-pointer shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add Family Member
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => handleOpenHouseholdModal(null)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all text-xs gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" /> Register New Household
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION A: RESIDENT SELF-SERVICE PORTAL VIEW               */}
      {/* ========================================================= */}
      {isResident && (
        <div className="space-y-6">
          {/* Pending Incoming Household Invites Banner */}
          {incomingInvites.some((i) => i.status === 'pending') && (
            <div className="space-y-3">
              {incomingInvites
                .filter((i) => i.status === 'pending')
                .map((invite) => (
                  <div
                    key={invite.inviteId}
                    className="p-5 bg-blue-50/90 border-2 border-blue-300 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                        <UserPlus className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Family Member Request Received</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        <span className="font-bold text-slate-900">{invite.fromName}</span> (
                        <span className="font-mono text-slate-800">{invite.fromBoimsId}</span>) wants to add you to their household as{' '}
                        <span className="font-bold text-blue-700">{invite.proposedRole}</span>.
                      </p>
                      <p className="text-[10px] text-slate-400">Received on {new Date(invite.createdAt).toLocaleString()}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRejectInvite(invite.inviteId)}
                        disabled={processingInviteId === invite.inviteId}
                        className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleAcceptInvite(invite.inviteId)}
                        disabled={processingInviteId === invite.inviteId}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {processingInviteId === invite.inviteId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Accept Request
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {!myHousehold ? (
            <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-4 max-w-2xl mx-auto my-12">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <Home className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">No Household Profile Registered Yet</h2>
              <p className="text-slate-600 text-sm max-w-md mx-auto">
                Create your household profile to record your family members, complete address, building structure, water
                source, and utilities for official Barangay certification and assistance programs.
              </p>
              <button
                onClick={() => handleOpenHouseholdModal(null)}
                className="inline-flex items-center px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md transition-all gap-2 text-sm"
              >
                <Plus className="w-5 h-5" /> Register My Household Now
              </button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Household Status & Completion Indicator Banner */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-slate-900">{myHousehold.householdNumber}</span>
                      {renderStatusBadge(myHousehold.verificationStatus, myHousehold.isVerified, myHousehold.pendingChangeRequest, myHousehold.householdNumber)}
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-slate-400" /> {myHousehold.address}, {myHousehold.purok}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {(myHousehold.verificationStatus === 'draft' || myHousehold.verificationStatus === 'changes_requested') && (
                      <button
                        onClick={() => handleSubmitForVerification(myHousehold.householdId)}
                        disabled={submitting}
                        className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-all gap-2 shadow-sm disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" /> Submit for Verification
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenHouseholdModal(myHousehold)}
                      className="inline-flex items-center px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm transition-all gap-1.5"
                    >
                      <Edit3 className="w-4 h-4" /> Edit Details
                    </button>
                  </div>
                </div>

                {/* Profile Completion Score Bar */}
                {(() => {
                  const pct = residentService.getHouseholdCompletionPercentage(myHousehold);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-blue-600" /> Household Profile Completion Indicator
                        </span>
                        <span className="font-bold text-blue-600">{pct}% Complete</span>
                      </div>
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {pct < 100 && (
                        <p className="text-xs text-slate-500">
                          Complete all utility and structural details to reach 100% completion for faster clearance processing.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Staff Review Notes Warning if Changes Requested */}
                {myHousehold.verificationStatus === 'changes_requested' && myHousehold.reviewNotes && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> Barangay Secretary Review Notes:
                    </p>
                    <p className="text-xs text-amber-800">{myHousehold.reviewNotes}</p>
                  </div>
                )}

                {/* Notice for Pending Change Requests */}
                {myHousehold.pendingChangeRequest && myHousehold.pendingChangeRequest.status === 'pending' && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-sm space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" /> Pending Change Request Submitted
                    </p>
                    <p className="text-xs text-indigo-800">
                      You have submitted updates to your verified household record on{' '}
                      {new Date(myHousehold.pendingChangeRequest.submittedAt).toLocaleDateString()}. Your changes are awaiting review
                      by the Barangay Secretary.
                    </p>
                  </div>
                )}
              </div>

              {/* Household Structural & Utilities Details Grid */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" /> Structural & Household Utilities Assessment
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">House Ownership</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5">
                      {HOUSE_OWNERSHIP_OPTIONS.find((o) => o.value === myHousehold.houseOwnership)?.label ||
                        myHousehold.houseOwnership ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">Building Type</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5">
                      {BUILDING_TYPE_OPTIONS.find((o) => o.value === myHousehold.buildingType)?.label ||
                        myHousehold.buildingType ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">Water Source</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5 flex items-center gap-1">
                      <Droplet className="w-3.5 h-3.5 text-blue-500" />
                      {WATER_SOURCE_OPTIONS.find((o) => o.value === myHousehold.waterSource)?.label ||
                        myHousehold.waterSource ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">Sanitation / Toilet</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5">
                      {SANITATION_OPTIONS.find((o) => o.value === myHousehold.sanitationFacility)?.label ||
                        myHousehold.sanitationFacility ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">Electricity Supply</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      {ELECTRICITY_OPTIONS.find((o) => o.value === myHousehold.electricityAvailability)?.label ||
                        myHousehold.electricityAvailability ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-medium text-slate-500">Internet Access</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5 flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5 text-indigo-500" />
                      {INTERNET_OPTIONS.find((o) => o.value === myHousehold.internetAvailability)?.label ||
                        myHousehold.internetAvailability ||
                        'Not specified'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-500">Monthly Income Bracket</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      {myHousehold.monthlyIncomeBracket || 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Household Members List */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" /> Family Members ({myHousehold.members?.length || 0})
                    </h3>
                    <p className="text-xs text-slate-500">Registered residents living in this household</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {myHousehold.members && myHousehold.members.length > 1 && (
                      <button
                        onClick={() => {
                          setSelectedHousehold(myHousehold);
                          setSelectedNewHeadId(myHousehold.members?.find((m) => m.isHouseholdHead)?.id || '');
                          setShowChangeHeadModal(true);
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
                      >
                        Change Head
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (isResident) {
                          setShowAddFamilyMemberModal(true);
                        } else {
                          handleOpenMemberModal();
                        }
                      }}
                      className="inline-flex items-center px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold gap-1 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Family Member
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                      <tr>
                        <th className="p-3.5 w-10 text-center">#</th>
                        <th className="p-3.5">NAME</th>
                        <th className="p-3.5">ROLE</th>
                        <th className="p-3.5">AGE</th>
                        <th className="p-3.5">OCCUPATION</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedMyHouseholdMembers.map((member, idx) => (
                        <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 text-center font-bold text-slate-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="p-3.5 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{member.fullName}</span>
                              {member.isHouseholdHead && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                                  Head
                                </span>
                              )}
                              {member.boimsId && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-600 rounded">
                                  {member.boimsId}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-700 font-medium">{member.relationshipToHead}</td>
                          <td className="p-3.5 text-slate-600">{member.age} yrs</td>
                          <td className="p-3.5 text-slate-600">{member.occupation || '—'}</td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenMemberModal(member)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                                title="Edit Member"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {!member.isHouseholdHead && (
                                <button
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                                  title="Remove Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sent Family Requests Pending Acceptance */}
                {outgoingInvites.some((i) => i.status === 'pending') && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-4">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Sent Family Requests Pending Acceptance ({outgoingInvites.filter((i) => i.status === 'pending').length})
                    </h4>
                    <div className="space-y-1.5">
                      {outgoingInvites
                        .filter((i) => i.status === 'pending')
                        .map((inv) => (
                          <div
                            key={inv.inviteId}
                            className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{inv.toName}</span>{' '}
                              <span className="font-mono text-slate-500">({inv.toBoimsId})</span>
                              <span className="text-slate-500 ml-2">
                                Proposed Role: <strong className="text-slate-700">{inv.proposedRole}</strong>
                              </span>
                            </div>
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                              Pending Acceptance
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION B: STAFF MASTER HOUSEHOLD DIRECTORY VIEW          */}
      {/* ========================================================= */}
      {isStaff && (
        <div className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              {(embedded
                ? [
                    {
                      id: 'number_requests',
                      label: 'HH Number Conflicts',
                      badge: pendingNumberRequestsCount > 0 ? pendingNumberRequestsCount : undefined,
                    },
                    { id: 'verified', label: 'Verified / Approved' },
                    { id: 'rejected', label: 'Rejected' },
                  ]
                : [
                    {
                      id: 'number_requests',
                      label: 'HH Number Conflicts',
                      badge: pendingNumberRequestsCount > 0 ? pendingNumberRequestsCount : undefined,
                    },
                    { id: 'all', label: 'All Households' },
                    {
                      id: 'pending_verification',
                      label: 'Pending Verification',
                      badge: pendingVerificationCount > 0 ? pendingVerificationCount : undefined,
                    },
                    { id: 'verified', label: 'Verified / Approved' },
                    { id: 'changes_requested', label: 'Changes Requested' },
                    { id: 'rejected', label: 'Rejected' },
                  ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatusTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    selectedStatusTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search & Purok Selector */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search head, address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <select
                value={selectedPurok}
                onChange={(e) => setSelectedPurok(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Puroks</option>
                {PUROK_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Directory Household Cards or Household Number Conflict Requests */}
          {embedded || selectedStatusTab === 'number_requests' || selectedStatusTab === 'registry' || selectedStatusTab === 'household_registry' ? (
            <div className="space-y-4">
              {(selectedStatusTab === 'number_requests' || selectedStatusTab === 'registry' || selectedStatusTab === 'household_registry') && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-1">
                    <p className="font-bold text-sm text-amber-950">Household Number Duplicate Conflict & Reassignment Reviews</p>
                    <p>
                      When a resident requests a Household Number currently assigned to another active household, their submission is routed here with official census evidence attached. Upon Secretary approval, the requested number is assigned to the requesting household and the conflicting household is automatically allocated the next available official Household Number in an atomic transaction.
                    </p>
                  </div>
                </div>
              )}

              {filteredNumberChangeRequests.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <FileCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">
                    {selectedStatusTab === 'verified'
                      ? 'No Approved Household Number Requests'
                      : selectedStatusTab === 'rejected'
                      ? 'No Rejected Household Number Requests'
                      : 'No Household Number Conflict Requests'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedStatusTab === 'verified'
                      ? 'There are no approved household number change requests found.'
                      : selectedStatusTab === 'rejected'
                      ? 'There are no rejected household number change requests found.'
                      : 'There are no pending household number conflict or change requests to review.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredNumberChangeRequests.map((req) => (
                    <div
                      key={req.requestId}
                      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-amber-100 text-amber-800 rounded-lg">
                              Request #{req.requestId}
                            </span>
                            <span
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize ${
                                req.status === 'pending_review'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : req.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {req.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Submitted: {new Date(req.createdAt).toLocaleString()}</p>
                        </div>

                        <div className="text-xs text-slate-600 font-medium">
                          Requester: <span className="font-bold text-slate-900">{req.requestedByName}</span>
                        </div>
                      </div>

                      {/* Conflict Comparison Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Requesting Household</span>
                          <p className="text-sm font-bold text-slate-900">{req.requestedByName}</p>
                          <p className="text-xs text-slate-600">Current Household #: <span className="font-mono font-bold">{req.currentHouseholdNumber}</span></p>
                          <p className="text-xs text-slate-600">Requested Household #: <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{req.requestedHouseholdNumber}</span></p>
                        </div>

                        <div className="p-4 bg-rose-50/50 border border-rose-200/80 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Currently Assigned Household (Conflict)</span>
                          <p className="text-sm font-bold text-slate-900">Assigned Household ID: {req.conflictingHouseholdId}</p>
                          <p className="text-xs text-slate-600">Conflicting Household #: <span className="font-mono font-bold text-rose-700">{req.conflictingHouseholdNumber}</span></p>
                          <p className="text-[11px] text-rose-700 italic">Action on Approval: Will be automatically reassigned to next available HH Number.</p>
                        </div>
                      </div>

                      {/* Reason & Evidence Document */}
                      <div className="space-y-2 pt-2">
                        <div className="text-xs">
                          <span className="font-semibold text-slate-700">Reason Provided: </span>
                          <span className="text-slate-600">{req.reason || 'No explanation provided.'}</span>
                        </div>

                        {req.evidenceUrl && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-blue-900">
                              <FileText className="w-4 h-4 text-blue-600" />
                              <span className="font-medium truncate max-w-xs">{req.evidenceFileName || 'Supporting Evidence Document'}</span>
                            </div>
                            <a
                              href={req.evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> View / Download Evidence
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Review Actions for Secretary */}
                      {req.status === 'pending_review' && (
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Secretary Review Notes / Remarks</label>
                            <input
                              type="text"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              placeholder="Enter audit remarks or approval justification..."
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-3 pt-1">
                            <button
                              onClick={() => handleRejectNumberRequest(req)}
                              disabled={processingRequestId === req.requestId}
                              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 transition-colors disabled:opacity-50"
                            >
                              Reject Request
                            </button>
                            <button
                              onClick={() => handleApproveNumberRequest(req)}
                              disabled={processingRequestId === req.requestId}
                              className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
                            >
                              {processingRequestId === req.requestId ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Approve & Atomically Reassign
                            </button>
                          </div>
                        </div>
                      )}

                      {req.status !== 'pending_review' && (
                        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 flex items-center justify-between">
                          <span>Reviewed by <strong className="text-slate-800">{req.reviewerName || 'Secretary'}</strong> on {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : ''}</span>
                          {req.reviewNotes && <span className="italic text-slate-500">"{req.reviewNotes}"</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mr-3" />
              <span className="text-sm font-medium text-slate-600">Loading households directory...</span>
            </div>
          ) : filteredHouseholds.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No Household Records Found</h3>
              <p className="text-xs text-slate-500 mt-1">Try adjusting search filters or status tab selection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHouseholds.map((hh) => (
                <div
                  key={hh.householdId}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-blue-600">{hh.householdNumber}</span>
                        <h4 className="text-base font-bold text-slate-900 mt-0.5">{hh.householdHeadName}</h4>
                      </div>
                      {renderStatusBadge(hh.verificationStatus, hh.isVerified, hh.pendingChangeRequest, hh.householdNumber)}
                    </div>

                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> {hh.address}, {hh.purok}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Building</span>
                        <span className="font-semibold text-slate-700 capitalize">{hh.buildingType || 'N/A'}</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">Members</span>
                        <span className="font-semibold text-slate-700">{hh.members?.length || hh.membersCount || 1} Persons</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Added: {new Date(hh.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedHousehold(hh);
                        setShowDetailModal(true);
                      }}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: CREATE / EDIT HOUSEHOLD PROFILE FORM             */}
      {/* ========================================================= */}
      {showHouseholdModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Home className="w-5 h-5 text-blue-400" />
                {isEditingHousehold ? 'Edit Household Profile' : 'Register New Household'}
              </h3>
              <button onClick={() => setShowHouseholdModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHousehold} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
                  {formError}
                </div>
              )}

              {isResident && isEditingHousehold && selectedHousehold?.isVerified && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" /> Notice for Verified Households:
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Your household is already verified. Updating your details will submit a Pending Change Request to the Barangay
                    Secretary for review without overwriting your official record immediately.
                  </p>
                </div>
              )}

              {/* Household Number & Head Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {isEditingHousehold && (
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-semibold text-slate-700">Household Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editableHouseholdNumber}
                        onChange={(e) => handleHouseholdNumberChange(e.target.value)}
                        placeholder={`e.g., HH-${new Date().getFullYear()}-101`}
                        className={`w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 ${
                          numberCheckStatus === 'available'
                            ? 'border-emerald-500 focus:ring-emerald-500 text-emerald-950'
                            : numberCheckStatus === 'conflict'
                            ? 'border-rose-500 focus:ring-rose-500 text-rose-950'
                            : 'border-slate-200 focus:ring-blue-500 text-slate-900'
                        }`}
                      />
                      {numberCheckStatus === 'checking' && (
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-3" />
                      )}
                    </div>
                  </div>
                )}

                <div className={`space-y-1.5 ${isEditingHousehold ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                  <label className="text-xs font-semibold text-slate-700">Household Head Full Name *</label>
                  <input
                    type="text"
                    required
                    value={householdHeadName}
                    onChange={(e) => setHouseholdHeadName(e.target.value)}
                    placeholder="e.g., Juan Dela Cruz"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Household Number Check Feedback */}
              {numberCheckStatus === 'available' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Household Number <strong>{editableHouseholdNumber}</strong> is available and will be assigned immediately upon saving.</span>
                </div>
              )}

              {numberCheckStatus === 'conflict' && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3 text-xs text-amber-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm text-amber-900">Household Number Conflict Detected</p>
                      <p className="mt-0.5">
                        Household Number <strong className="font-mono">{editableHouseholdNumber}</strong> is currently assigned to{' '}
                        <strong>{conflictingHousehold?.householdHeadName || 'another registered household'}</strong> ({conflictingHousehold?.address || 'Barangay Central'}).
                      </p>
                      <p className="mt-1 text-amber-800 font-medium">
                        To claim this Household Number, you must submit a Conflict & Reassignment Request with official supporting evidence for Secretary review.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-amber-200">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-800 flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5 text-blue-600" /> Upload Official Census Evidence Document *
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Attach a photo or PDF of your Census Sticker, Barangay Certificate of Residency, or Utility Bill clearly displaying this Household Number.
                      </p>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-600 bg-white p-2 border border-slate-300 rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {evidenceFile && (
                        <p className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selected: {evidenceFile.name} ({(evidenceFile.size / 1024).toFixed(1)} KB)
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-800">Reason / Details for Request *</label>
                      <textarea
                        rows={2}
                        value={conflictReason}
                        onChange={(e) => setConflictReason(e.target.value)}
                        placeholder="Explain why your household claims this household number (e.g. Correct census sticker number issued during 2026 barangay survey)..."
                        className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Address & Purok */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Complete Street Address *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House No., Street Name"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Purok / Zone *</label>
                  <select
                    value={purok}
                    onChange={(e) => setPurok(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PUROK_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* House Ownership & Building Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">House Ownership Status</label>
                  <select
                    value={houseOwnership}
                    onChange={(e) => setHouseOwnership(e.target.value as HouseOwnership)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {HOUSE_OWNERSHIP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Building Classification</label>
                  <select
                    value={buildingType}
                    onChange={(e) => setBuildingType(e.target.value as BuildingType)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {BUILDING_TYPE_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Water & Sanitation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Water Source</label>
                  <select
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value as WaterSource)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {WATER_SOURCE_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Sanitation / Toilet Facility</label>
                  <select
                    value={sanitationFacility}
                    onChange={(e) => setSanitationFacility(e.target.value as SanitationFacility)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SANITATION_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Electricity & Internet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Electricity Connection</label>
                  <select
                    value={electricityAvailability}
                    onChange={(e) => setElectricityAvailability(e.target.value as ElectricityAvailability)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ELECTRICITY_OPTIONS.map((el) => (
                      <option key={el.value} value={el.value}>
                        {el.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Internet Access</label>
                  <select
                    value={internetAvailability}
                    onChange={(e) => setInternetAvailability(e.target.value as InternetAvailability)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {INTERNET_OPTIONS.map((net) => (
                      <option key={net.value} value={net.value}>
                        {net.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Income Bracket */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Estimated Monthly Household Income</label>
                <select
                  value={monthlyIncomeBracket}
                  onChange={(e) => setMonthlyIncomeBracket(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {INCOME_BRACKETS.map((inc) => (
                    <option key={inc} value={inc}>
                      {inc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Selection for Resident */}
              {isResident && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={saveAsDraft}
                      onChange={(e) => setSaveAsDraft(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span>Save as Draft (Do not submit for verification yet)</span>
                  </label>
                </div>
              )}

              {/* Form Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHouseholdModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditingHousehold
                    ? isResident && selectedHousehold?.isVerified
                      ? 'Submit Change Request'
                      : 'Update Household'
                    : saveAsDraft
                    ? 'Save Draft'
                    : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: ADD / EDIT HOUSEHOLD MEMBER FORM                 */}
      {/* ========================================================= */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden my-8">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                {editingMemberId ? 'Edit Household Member' : 'Add Household Member'}
              </h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Member Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  required
                  value={memberFullName}
                  onChange={(e) => setMemberFullName(e.target.value)}
                  placeholder="First Name, Middle Name, Last Name"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Birthdate & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Birthdate *</label>
                  <input
                    type="date"
                    required
                    value={memberBirthdate}
                    onChange={(e) => setMemberBirthdate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {memberBirthdate && (
                    <p className="text-[11px] text-blue-600 font-medium">
                      Calculated Age: {residentService.computeAgeFromBirthdate(memberBirthdate)} years old
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Gender *</label>
                  <select
                    value={memberGender}
                    onChange={(e) => setMemberGender(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Relationship to Head & Civil Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Relationship to Household Head *</label>
                  <select
                    value={memberRelationship}
                    onChange={(e) => setMemberRelationship(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RELATIONSHIP_OPTIONS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Civil Status</label>
                  <select
                    value={memberCivilStatus}
                    onChange={(e) => setMemberCivilStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                  >
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="widowed">Widowed</option>
                    <option value="separated">Separated</option>
                    <option value="divorced">Divorced</option>
                  </select>
                </div>
              </div>

              {/* Occupation & Education */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Occupation / Source of Livelihood</label>
                  <input
                    type="text"
                    value={memberOccupation}
                    onChange={(e) => setMemberOccupation(e.target.value)}
                    placeholder="e.g. Teacher, Farmer, Student"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Educational Attainment</label>
                  <select
                    value={memberEducation}
                    onChange={(e) => setMemberEducation(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {EDUCATIONAL_OPTIONS.map((ed) => (
                      <option key={ed.value} value={ed.value}>
                        {ed.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sectors Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">Sectors & Target Demographic Classifications</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIsVoter}
                      onChange={(e) => setMemberIsVoter(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Registered Voter</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIsPwd}
                      onChange={(e) => setMemberIsPwd(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>PWD</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIsSenior}
                      onChange={(e) => setMemberIsSenior(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Senior Citizen</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIsSoloParent}
                      onChange={(e) => setMemberIsSoloParent(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Solo Parent</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIs4Ps}
                      onChange={(e) => setMemberIs4Ps(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>4Ps Beneficiary</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIsYouth}
                      onChange={(e) => setMemberIsYouth(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>SK / Youth (13-24)</span>
                  </label>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingMemberId ? 'Update Member' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: STAFF HOUSEHOLD REVIEW & DETAIL MODAL            */}
      {/* ========================================================= */}
      {showDetailModal && selectedHousehold && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden my-8">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-blue-400">{selectedHousehold.householdNumber}</span>
                <h3 className="text-lg font-bold">Household Review: {selectedHousehold.householdHeadName}</h3>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-slate-800">
              {/* Proposed Change Request Comparison View if present */}
              {selectedHousehold.pendingChangeRequest && selectedHousehold.pendingChangeRequest.status === 'pending' && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" /> Proposed Resident Change Request
                    </h4>
                    <span className="text-xs text-indigo-700">
                      Submitted: {new Date(selectedHousehold.pendingChangeRequest.submittedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-xs text-indigo-800">
                    The resident has requested the following updates to this verified household record:
                  </p>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-indigo-100">
                    <div>
                      <p className="font-bold text-slate-500 uppercase text-[10px]">Current Verified Value</p>
                      <p className="mt-1 font-semibold text-slate-800">{selectedHousehold.address}</p>
                      <p className="text-slate-600">{selectedHousehold.purok}</p>
                    </div>
                    <div>
                      <p className="font-bold text-indigo-600 uppercase text-[10px]">Proposed New Value</p>
                      <p className="mt-1 font-bold text-indigo-900">
                        {selectedHousehold.pendingChangeRequest.proposedChanges.address || selectedHousehold.address}
                      </p>
                      <p className="text-indigo-800">
                        {selectedHousehold.pendingChangeRequest.proposedChanges.purok || selectedHousehold.purok}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status & Structural Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400">Verification Status</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {renderStatusBadge(selectedHousehold.verificationStatus, selectedHousehold.isVerified, selectedHousehold.pendingChangeRequest, selectedHousehold.householdNumber)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400">Purok</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedHousehold.purok}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400">Building Type</p>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{selectedHousehold.buildingType || 'N/A'}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-400">Ownership</p>
                  <p className="font-semibold text-slate-800 mt-0.5 capitalize">{selectedHousehold.houseOwnership || 'N/A'}</p>
                </div>
              </div>

              {/* Utilities Breakdown */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-slate-700">Household Utilities Assessment</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-slate-400 block">Water Source:</span>
                    <span className="font-semibold text-slate-800 capitalize">{selectedHousehold.waterSource || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Sanitation:</span>
                    <span className="font-semibold text-slate-800 capitalize">{selectedHousehold.sanitationFacility || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Electricity:</span>
                    <span className="font-semibold text-slate-800 capitalize">{selectedHousehold.electricityAvailability || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Income:</span>
                    <span className="font-semibold text-slate-800">{selectedHousehold.monthlyIncomeBracket || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Members List Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Household Members ({selectedHousehold.members?.length || selectedHousehold.membersCount || 0})
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Name</th>
                        <th className="p-3">Relationship</th>
                        <th className="p-3">Age / Gender</th>
                        <th className="p-3">Civil Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedHousehold.members?.map((m) => (
                        <tr key={m.id}>
                          <td className="p-3 font-medium text-slate-900">
                            {m.fullName} {m.isHouseholdHead && <span className="text-[10px] text-blue-600 font-bold">(Head)</span>}
                          </td>
                          <td className="p-3 text-slate-600">{m.relationshipToHead}</td>
                          <td className="p-3 text-slate-600">
                            {m.age} yrs • <span className="capitalize">{m.gender}</span>
                          </td>
                          <td className="p-3 text-slate-600 capitalize">{m.civilStatus || 'Single'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end border-t border-slate-100">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: CHANGE HOUSEHOLD HEAD DESIGNATION MODAL          */}
      {/* ========================================================= */}
      {showChangeHeadModal && selectedHousehold && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Designate New Head of Household</h3>
            <p className="text-xs text-slate-500">
              Select an existing household member to become the primary Household Head.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedHousehold.members?.map((member) => (
                <label
                  key={member.id}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer text-xs transition-colors ${
                    selectedNewHeadId === member.id
                      ? 'bg-blue-50 border-blue-500 text-blue-900 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="newHead"
                      value={member.id}
                      checked={selectedNewHeadId === member.id}
                      onChange={() => setSelectedNewHeadId(member.id)}
                      className="text-blue-600"
                    />
                    <span>{member.fullName}</span>
                  </div>
                  <span className="text-slate-400 capitalize">{member.relationshipToHead}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowChangeHeadModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeHead}
                disabled={submitting || !selectedNewHeadId}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                Confirm Head Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: ADD FAMILY MEMBER VIA BOIMS ID MODAL             */}
      {/* ========================================================= */}
      {showAddFamilyMemberModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                Add Family Member via BOIMS ID
              </h3>
              <button
                onClick={() => {
                  setShowAddFamilyMemberModal(false);
                  setBoimsIdLookupError(null);
                  setFoundResidentPreview(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendFamilyRequest} className="p-6 space-y-4">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs leading-relaxed">
                <p className="font-semibold text-blue-900 mb-0.5">Family Member Linking System</p>
                Enter the resident's official BOIMS Identification Number to invite them to your household. A request will be sent to their profile for verification.
              </div>

              {boimsIdLookupError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{boimsIdLookupError}</span>
                </div>
              )}

              {/* BOIMS Identification Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  BOIMS Identification Number *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={boimsIdInput}
                    onChange={(e) => {
                      setBoimsIdInput(e.target.value);
                      setFoundResidentPreview(null);
                      setBoimsIdLookupError(null);
                    }}
                    placeholder="BOIMS-1234-5678"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyBoimsId}
                    disabled={verifyingBoimsId || !boimsIdInput.trim()}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {verifyingBoimsId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Verify
                  </button>
                </div>
              </div>

              {/* Verified Resident Preview Box */}
              {foundResidentPreview && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Resident Verified
                    </span>
                    <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded text-emerald-900">
                      {foundResidentPreview.boimsId || boimsIdInput}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 pt-1 border-t border-emerald-200/60">
                    <p className="font-bold text-slate-900 text-sm">{foundResidentPreview.fullName}</p>
                    <p className="text-slate-600">
                      Age:{' '}
                      <span className="font-semibold text-slate-800">
                        {foundResidentPreview.birthDate || (foundResidentPreview as any).birthdate
                          ? residentService.computeAgeFromBirthdate(foundResidentPreview.birthDate || (foundResidentPreview as any).birthdate)
                          : 'Not specified'} yrs
                      </span>
                    </p>
                    {foundResidentPreview.purok && (
                      <p className="text-slate-500 text-[11px]">Address: {foundResidentPreview.purok}, {foundResidentPreview.address || 'Barangay Central'}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Relationship / Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Relationship / Role *
                </label>
                <select
                  value={proposedRole}
                  onChange={(e) => setProposedRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                  <option value="Brother">Brother</option>
                  <option value="Sister">Sister</option>
                  <option value="Grandfather">Grandfather</option>
                  <option value="Grandmother">Grandmother</option>
                  <option value="Grandson">Grandson</option>
                  <option value="Granddaughter">Granddaughter</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Occupation */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Occupation (Optional)
                </label>
                <input
                  type="text"
                  value={familyOccupation}
                  onChange={(e) => setFamilyOccupation(e.target.value)}
                  placeholder="e.g. Driver, Vendor, Student, Engineer"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFamilyMemberModal(false);
                    setBoimsIdLookupError(null);
                    setFoundResidentPreview(null);
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingRequest || verifyingBoimsId}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {sendingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return mainContent;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
      {mainContent}
    </div>
  );
};
