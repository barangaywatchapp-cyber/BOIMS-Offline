/**
 * Barangay Operations & Information Management System (BOIMS)
 * Core Domain Type Definitions
 * Aligned with Firestore Schemas (DDD Volume 5) and SRS specifications
 */

export type UserRole =
  | 'resident'
  | 'purokOfficial'
  | 'verifier'
  | 'secretary'
  | 'admin'
  | 'chairman'
  | 'superAdmin'
  | 'developer';

export type RegistrationType = 'resident' | 'purokOfficial';

export type AccountStatus = 'pending' | 'active' | 'suspended';

export type RegistrationStatus =
  | 'pending'
  | 'under_review'
  | 'needs_additional_docs'
  | 'approved'
  | 'rejected';

export type VerificationMethod = 'governmentId' | 'supportingDocument';

export interface RegistrationApplication {
  registrationId: string;
  uid: string;
  registrationType: RegistrationType;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  civilStatus: string;
  occupation?: string;
  address: string;
  purok: string;
  barangay: string;
  municipality: string;
  province: string;
  postalCode?: string;
  requestedRole: UserRole;
  sectors: ResidentSector[];
  voterStatus: VoterStatus;
  
  // Verification Method (Option 1: Govt ID, Option 2: Supporting Doc)
  verificationMethod?: VerificationMethod;
  idType?: string;
  idNumber?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
  selfieUrl?: string;
  supportingDocType?: string;
  supportingDocUrl?: string;
  residencyProofUrl?: string;
  appointmentProofUrl?: string;
  documentRefs?: Record<string, string>;
  
  emailVerified?: boolean;
  status: RegistrationStatus;
  submittedAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string | null;
  assignedVerifier?: string;
  assignedVerifierName?: string;
  rejectionReason?: string;
  additionalDocsRemarks?: string;
  linkedResidentId?: string;
  notes?: string;
}

export type DutyStatus = 'onDuty' | 'offDuty';
export type DutyMode = 'dispatcher' | 'responder' | 'offDuty';

export type PresenceStatus = 'online' | 'idle' | 'offline';
export type PresenceHealth = 'healthy' | 'warning' | 'dead';

export interface UserPresence {
  status: PresenceStatus;
  lastSeen: string;
}

export interface User {
  uid: string;
  boimsId?: string;
  householdId?: string;
  householdNumber?: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  fullName: string;
  phoneNumber: string;
  address: string;
  purok: string;
  jurisdiction?: string;
  barangay: string;
  municipality: string;
  province: string;
  postalCode?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  civilStatus?: string;
  occupation?: string;
  voterStatus?: VoterStatus;
  profilePicture?: string;
  role: UserRole;
  dutyStatus?: DutyStatus;
  dutyMode?: DutyMode;
  presence?: UserPresence;
  status: AccountStatus;
  emailVerified: boolean;
  mustChangePassword?: boolean;
  isActive: boolean;
  createdAt: string; // ISO String or Firestore Timestamp string
  updatedAt: string;
  lastLoginAt?: string | null;
  createdBy?: string;
  updatedBy?: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export type IncidentCategory =
  | 'garbage'
  | 'road'
  | 'drainage'
  | 'streetlight'
  | 'noise'
  | 'crime'
  | 'fire'
  | 'flood'
  | 'animal'
  | 'neighborhood_dispute'
  | 'others';

export type ReportPriority = 'low' | 'medium' | 'high' | 'critical';

export type ReportStatus =
  | 'pending'
  | 'assigned'
  | 'inProgress'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'escalated';

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

export interface ReportTimelineEvent {
  eventId: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  performedByRole?: UserRole;
  remarks: string;
  createdAt: string;
  attachments?: string[];
}

export interface AssignedResponder {
  uid: string;
  name: string;
  assignedAt?: string | null;
  role?: string;
}

export function getReportResponders(rep: Partial<Report> | null | undefined): AssignedResponder[] {
  if (!rep) return [];
  if (Array.isArray(rep.assignedResponders) && rep.assignedResponders.length > 0) {
    return rep.assignedResponders.map((r: any) => {
      if (typeof r === 'string') return { uid: r, name: r };
      return {
        uid: r.uid || r.id || r.name,
        name: r.name || r.fullName || r.uid || 'Field Responder',
        role: r.role || 'Field Responder',
        assignedAt: r.assignedAt,
      };
    });
  }
  if (rep.assignedTo || rep.assignedToName) {
    return [
      {
        uid: rep.assignedTo || 'unassigned',
        name: rep.assignedToName || rep.assignedTo || 'Unassigned',
        role: 'Field Responder',
        assignedAt: rep.assignedAt,
      },
    ];
  }
  return [];
}

export interface Report {
  reportId: string;
  reportNumber: string;
  title: string;
  description: string;
  category: IncidentCategory;
  priority: ReportPriority;
  status: ReportStatus;
  isAnonymous: boolean;
  location: LocationData;
  imageUrls: string[];
  purok?: string;
  jurisdiction?: string;
  assignedTo?: string; // UID of assigned Tanod / Responder
  assignedToName?: string;
  assignedResponders?: AssignedResponder[]; // Future multi-responder support
  assignedBy?: string; // UID of dispatch / executive officer / admin
  assignedAt?: string | null;
  resolvedBy?: string;
  resolvedAt?: string | null;
  resolutionRemarks?: string;
  escalatedBy?: string;
  escalatedByName?: string;
  escalatedAt?: string | null;
  escalationRemarks?: string;
  blotterCaseId?: string;
  userId: string;
  reportedBy?: string;
  createdBy?: string;
  userName?: string;
  userEmail?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
  timeline?: ReportTimelineEvent[];
}

export type CertificateType =
  | 'barangayClearance'
  | 'certificateOfResidency'
  | 'certificateOfIndigency'
  | 'businessClearance'
  | 'certificateOfGoodMoral'
  | 'other';

export type CertificateStatus =
  | 'submitted'
  | 'underReview'
  | 'approved'
  | 'approvedUnderProcess'
  | 'processing'
  | 'readyForRelease'
  | 'released'
  | 'claimed'
  | 'expired'
  | 'rejected'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'waived';

export interface CertificateRequest {
  certificateId: string;
  requestNumber: string;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  purok?: string;
  civilStatus?: string;
  yearsOfResidency?: number;
  businessName?: string;
  certificateType: CertificateType;
  purpose: string;
  remarks?: string;
  supportingDocuments: string[];
  status: CertificateStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  orNumber?: string;
  controlNumber?: string;
  qrVerificationToken?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  issuedBy?: string;
  issuedByName?: string;
  approvedBy?: string;
  approvedAt?: string | null;
  rejectedBy?: string;
  rejectedAt?: string | null;
  rejectionReason?: string;
  releasedBy?: string;
  releasedAt?: string | null;
  claimedAt?: string | null;
  claimMethod?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export interface PublicVerificationRecord {
  qrVerificationToken: string;
  certificateNumber: string;
  certificateType: string;
  status: CertificateStatus;
  recipientName: string;
  issuedAt?: string | null;
  validUntil?: string | null;
  issuingBarangay: string;
  isAuthentic: boolean;
  purpose?: string;
  rejectionReason?: string;
  updatedAt: string;
}

export type AssetCategory =
  | 'furniture'
  | 'electronics'
  | 'officeEquipment'
  | 'medicalEquipment'
  | 'cleaningEquipment'
  | 'constructionTools'
  | 'emergencyEquipment'
  | 'vehicles'
  | 'documents'
  | 'others';

export type AssetCondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'damaged'
  | 'condemned';

export type AssetStatus =
  | 'available'
  | 'borrowed'
  | 'reserved'
  | 'maintenance'
  | 'disposed'
  | 'lost';

export interface InventoryItem {
  assetId: string;
  assetCode: string;
  assetName: string;
  category: AssetCategory;
  description?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  qrCode?: string;
  barcode?: string;
  quantity: number;
  availableQuantity: number;
  unit: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  supplier?: string;
  fundingSource?: string;
  location: string;
  assignedTo?: string;
  condition: AssetCondition;
  status: AssetStatus;
  maintenanceSchedule?: string;
  lastMaintenanceAt?: string | null;
  nextMaintenanceAt?: string | null;
  remarks?: string;
  borrowingHistory?: InventoryBorrowRecord[];
  imageUrls: string[];
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export type AnnouncementCategory =
  | 'general'
  | 'event'
  | 'advisory'
  | 'health'
  | 'education'
  | 'environment'
  | 'publicSafety'
  | 'emergency'
  | 'ordinance'
  | 'program';

export type AnnouncementAudience =
  | 'all'
  | 'residents'
  | 'admin'
  | 'barangayOfficials'
  | 'tanod'
  | 'staff';

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'expired' | 'archived';

export interface Announcement {
  announcementId: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  priority: ReportPriority;
  coverImage?: string;
  attachments?: string[];
  isPinned: boolean;
  status: AnnouncementStatus;
  publishAt: string;
  expiresAt?: string | null;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export type NotificationType =
  | 'reportSubmitted'
  | 'reportAssigned'
  | 'reportInProgress'
  | 'reportResolved'
  | 'reportRejected'
  | 'reportClosed'
  | 'reportEscalated'
  | 'certificateSubmitted'
  | 'certificateApproved'
  | 'certificateRejected'
  | 'certificateReady'
  | 'announcement'
  | 'inventoryBorrowed'
  | 'inventoryReturned'
  | 'inventoryMaintenance'
  | 'system'
  | 'emergency'
  | 'family_request'
  | 'household_invite'
  | 'household_number_conflict';

export interface Notification {
  notificationId: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: ReportPriority;
  isRead: boolean;
  link?: string;
  reportId?: string;
  certificateId?: string;
  announcementId?: string;
  inventoryId?: string;
  icon?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  readAt?: string | null;
  expiresAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export type DevicePlatform = 'web' | 'android' | 'ios';

export interface DeviceTokenRecord {
  tokenId: string; // SHA-256 hash or sanitised key of token
  token: string; // The FCM Registration Token
  userId: string; // Authenticated Firebase UID
  userRole?: UserRole;
  platform: DevicePlatform;
  userAgent?: string;
  deviceId?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export interface FcmPushDeliveryResult {
  success: boolean;
  totalTokens: number;
  successCount: number;
  failureCount: number;
  invalidTokensPurged: number;
  messageIds?: string[];
  errors?: string[];
}

export type BlotterStatus =
  | 'open'
  | 'underInvestigation'
  | 'scheduled'
  | 'resolved'
  | 'closed'
  | 'archived';

export interface HearingRecord {
  hearingId: string;
  hearingNumber: number; // 1st, 2nd, 3rd mediation
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  venue: string;
  presidingOfficer: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'reset';
  outcome?: string;
  createdAt: string;
  createdBy: string;
}

export interface BlotterCase {
  caseId: string;
  caseNumber: string;
  complainantName: string;
  complainantId?: string;
  complainantContact?: string;
  complainantAddress?: string;
  respondentName: string;
  respondentId?: string;
  respondentContact?: string;
  respondentAddress?: string;
  incidentType: string;
  incidentDate: string;
  incidentLocation: string;
  purok?: string;
  narrative: string;
  status: BlotterStatus;
  hearingSchedule?: string | null;
  hearings?: HearingRecord[];
  assignedOfficer?: string;
  assignedOfficerName?: string;
  resolutionSummary?: string;
  cfaIssued?: boolean;
  cfaIssuedAt?: string | null;
  cfaControlNumber?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string;
}

export interface InventoryBorrowRecord {
  borrowId: string;
  borrowerName: string;
  borrowerContact: string;
  borrowerAddress?: string;
  borrowerRole: string; // e.g. Resident, Tanod, Official
  quantity: number;
  purpose: string;
  borrowedAt: string; // ISO date
  expectedReturnDate: string; // YYYY-MM-DD
  returnedAt?: string | null;
  status: 'active' | 'returned' | 'overdue' | 'damaged_on_return';
  issuedBy: string;
  issuedByName?: string;
  returnReceivedBy?: string;
  remarks?: string;
}

export type ResidentSector =
  | 'senior'
  | 'pwd'
  | 'soloParent'
  | 'fourPs'
  | 'youth'
  | 'voter'
  | 'ofw'
  | 'indigenous';

export type ResidentVerificationStatus = 'verified' | 'unverified' | 'rejected' | 'pending';

export type VoterStatus = 'registered' | 'unregistered' | 'transferred';

export type ResidencyStatus = 'active' | 'deceased' | 'relocated' | 'archived';

export interface ResidentProfile {
  residentId: string;
  userId?: string; // Optional linkage to user account UID
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  fullName: string;
  gender: 'male' | 'female' | 'other';
  birthDate: string; // ISO format YYYY-MM-DD
  age: number;
  civilStatus: 'single' | 'married' | 'widowed' | 'divorced' | 'separated';
  citizenship: string;
  occupation?: string;
  monthlyIncome?: number;
  contactNumber: string;
  email?: string;
  address: string;
  purok: string;
  barangay: string;
  municipality: string;
  province: string;
  
  // ID Verification
  idType?: string;
  idNumber?: string;
  idFrontImage?: string;
  verificationStatus: ResidentVerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string | null;
  rejectionReason?: string;

  // Voter & Sector Information
  voterStatus: VoterStatus;
  voterPrecinctNo?: string;
  sectors: ResidentSector[];

  // Household linkage
  householdId?: string;
  householdNumber?: string;
  isHouseholdHead: boolean;

  // Emergency Contact
  emergencyContactName?: string;
  emergencyContactNumber?: string;

  // Residency Status
  residencyStatus: ResidencyStatus;
  
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  isDeleted: boolean;
}

export type HouseOwnership = 'owned' | 'rented' | 'livingWithRelatives' | 'informalSettler' | 'caretaker' | 'other';
export type BuildingType = 'concrete' | 'semiConcrete' | 'makeshift' | 'wood' | 'commercial' | 'other';
export type SanitationFacility = 'waterSealed' | 'openPit' | 'shared' | 'none';
export type WaterSource = 'piped' | 'well' | 'station' | 'others';
export type ElectricityAvailability = 'grid' | 'solar' | 'generator' | 'none';
export type InternetAvailability = 'fiber' | 'broadband' | 'mobile' | 'none';
export type HouseholdVerificationStatus = 'draft' | 'pending_verification' | 'approved' | 'changes_requested' | 'rejected';

export interface HouseholdMember {
  id: string;
  fullName: string;
  birthdate?: string; // YYYY-MM-DD
  age: number;
  gender: 'male' | 'female' | 'other';
  civilStatus?: 'single' | 'married' | 'widowed' | 'separated' | 'divorced';
  relationshipToHead: string;
  occupation?: string;
  educationalAttainment?: 'elementary' | 'highSchool' | 'seniorHigh' | 'vocational' | 'college' | 'postGraduate' | 'none';
  isVoter?: boolean;
  isPwd?: boolean;
  isSenior?: boolean;
  isSoloParent?: boolean;
  is4Ps?: boolean;
  isYouth?: boolean;
  philHealth?: string;
  contactNumber?: string;
  isHouseholdHead?: boolean;
  residentId?: string;
  boimsId?: string;
}

export interface HouseholdInvite {
  inviteId: string;
  householdId: string;
  fromUid: string;
  fromBoimsId: string;
  fromName: string;
  toUid: string;
  toBoimsId: string;
  toName: string;
  proposedRole: string;
  occupation?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  respondedAt?: string | null;
}

export interface PendingHouseholdChangeRequest {
  requestId: string;
  submittedAt: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNotes?: string;
  proposedChanges: Partial<Household>;
}

export type HouseholdNumberChangeRequestStatus = 'pending_review' | 'approved' | 'rejected' | 'cancelled';

export interface HouseholdNumberChangeRequest {
  requestId: string;
  householdId: string;
  requesterUid: string;
  requestedByName: string;
  currentHouseholdNumber: string;
  requestedHouseholdNumber: string;
  conflictingHouseholdId: string;
  conflictingHouseholdNumber: string;
  reason: string;
  evidencePath?: string;
  evidenceUrl?: string;
  evidenceFileName?: string;
  status: HouseholdNumberChangeRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewNotes?: string;
}

export interface Household {
  householdId: string;
  householdNumber: string;
  householdHeadId: string;
  householdHeadName: string;
  address: string;
  purok: string;
  barangay: string;
  municipality: string;
  province: string;
  membersCount: number;
  memberResidentIds: string[];
  members?: HouseholdMember[];

  // Structure, Ownership & Utilities
  houseOwnership?: HouseOwnership;
  buildingType?: BuildingType;
  sanitationFacility?: SanitationFacility;
  waterSource?: WaterSource;
  electricityAvailability?: ElectricityAvailability;
  internetAvailability?: InternetAvailability;
  monthlyIncomeBracket?: string;

  // Verification Workflow
  verificationStatus?: HouseholdVerificationStatus;
  isVerified?: boolean;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  reviewNotes?: string;

  // Change Request Workflow for Verified Households
  pendingChangeRequest?: PendingHouseholdChangeRequest | null;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  isDeleted?: boolean;
}

export interface DemographicSummary {
  totalPopulation: number;
  totalHouseholds: number;
  verifiedResidents: number;
  unverifiedResidents: number;
  registeredVoters: number;
  byGender: { male: number; female: number; other: number };
  byAgeGroup: {
    infants: number; // 0-2
    children: number; // 3-12
    youth: number; // 13-24
    adults: number; // 25-59
    seniors: number; // 60+
  };
  bySector: {
    senior: number;
    pwd: number;
    soloParent: number;
    fourPs: number;
    youth: number;
    voter: number;
    ofw: number;
    indigenous: number;
  };
  byPurok: Record<string, number>;
  byHouseholdType: Record<string, number>;
  byIncomeBracket?: Record<string, number>;
  byBuildingClassification?: Record<string, number>;
}

export interface AuditLog {
  auditId: string;
  action: string;
  module: string;
  targetId: string;
  targetType: string;
  performedBy: string;
  performerName?: string;
  performerRole: UserRole;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  ipAddress?: string;
  device?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ActivityLog {
  activityId: string;
  userId: string;
  action: string;
  module: string;
  targetId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface BarangayProfileSettings {
  barangayName: string;
  municipality: string;
  province: string;
  region: string;
  address: string;
  contactNumber: string;
  email: string;
  logoUrl?: string;
  captainName: string;
  secretaryName: string;
  officeHours: string;
  emergencyHotlines: Array<{ name: string; number: string }>;
  updatedAt: string;
  updatedBy: string;
}

export interface AppSettings {
  appName: string;
  version: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  anonymousReporting: boolean;
  maxUploadSizeMB: number;
  supportedImageFormats: string[];
  updatedAt: string;
  updatedBy: string;
}

// Offline Sync Queue Types (MDG Volume 14)
export interface SyncQueueItem {
  queueId: string;
  operationType: 'create' | 'update' | 'delete';
  collectionName: string;
  recordId: string;
  payload: any;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'resolved';
  errorMessage?: string;
  errorCode?: string;
}
