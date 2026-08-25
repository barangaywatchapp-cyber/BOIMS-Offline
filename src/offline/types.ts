/**
 * BOIMS Offline Architecture
 * Phase 1 — Core Offline Types
 *
 * These types define the contract for the new offline layer.
 * Existing services are not modified yet.
 */

import type { SyncQueueItem, User } from '../types';

export type OfflineOperation = 'create' | 'update' | 'delete';

export type OfflineItemStatus =
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'resolved';

export interface OfflineQueueItem {
  queueId: string;

  operation: OfflineOperation;

  collectionName: string;

  recordId: string;

  payload: unknown;

  createdAt: string;

  updatedAt: string;

  retryCount: number;

  status: OfflineItemStatus;

  lastError?: string;

  lastErrorCode?: string;

  /** Authoritative remote or cached updatedAt when mutation was authored */
  baseUpdatedAt?: string;

  /** UID of the user who authored the mutation */
  userId?: string;

  /** Role of the user who authored the mutation */
  userRole?: string;
}

export interface OfflineSyncResult {
  processed: number;

  failed: number;

  remaining: number;
}

export interface OfflineStorageMetadata {
  schemaVersion: number;

  lastUpdatedAt: string;

  deviceId?: string;
}

// =========================================================================
// Phase 6 & Phase 7 — Dead Letter Queue (DLQ) & Failure Management Contracts
// =========================================================================

export type DLQFailureReason =
  | 'max_retries_exceeded'
  | 'permanent_error'
  | 'security_rejection'
  | 'structural_validation_failed'
  | 'authentication_required'
  | 'manual_quarantine'
  | 'conflict_remote_newer'
  | 'conflict_remote_deleted'
  | 'conflict_create_collision'
  | 'conflict_stale_delete';

export const DLQ_SCHEMA_VERSION = 1;
export const MAX_SYNC_RETRIES = 3;

/**
 * Standard Dead Letter Queue Record.
 * Retains complete diagnostic, failure, and payload context for inspection
 * and authorized manual recovery without storing credentials or secrets.
 */
export interface DeadLetterItem<T = unknown> {
  /** Unique DLQ identifier (e.g., DLQ-1724490000000-abcde) */
  dlqId: string;

  /** Original queueId from OfflineQueueItem / OfflineMutation */
  originalQueueId: string;

  /** Target mutation operation */
  operation: OfflineOperation;

  /** Target Firestore collection name */
  collectionName: OfflineMutableCollection;

  /** Target document / record identifier */
  recordId: string;

  /** Mutation payload */
  payload: T;

  /** ISO creation timestamp when the mutation was originally created */
  originalCreatedAt: string;

  /** ISO timestamp when the mutation was moved to the DLQ */
  failedAt: string;

  /** Total retry attempts made before quarantine */
  retryCount: number;

  /** Human-readable error message */
  lastError?: string;

  /** Machine-readable error code */
  lastErrorCode?: string;

  /** Categorized failure reason */
  failureReason: DLQFailureReason;

  /** UID of the originating author */
  originatingUserId?: string;

  /** Role of the originating author */
  originatingUserRole?: string;

  /** Schema version */
  schemaVersion: number;

  /** Authoritative remote or cached updatedAt when mutation was authored */
  baseUpdatedAt?: string;

  /** Detailed diagnostic conflict snapshot if quarantine was triggered by conflict */
  conflictDetails?: {
    remoteExists: boolean;
    remoteUpdatedAt?: string;
    remoteIsDeleted?: boolean;
    detectedAt: string;
    reason: string;
  };
}

export interface DLQStats {
  totalFailed: number;
  lastFailedAt: string | null;
  byCollection: Record<string, number>;
  byReason: Record<DLQFailureReason, number>;
}

export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
};

/**
 * Calculates exponential backoff delay with jitter to prevent retry storms.
 * delay = min(maxDelay, baseDelay * 2^(retryCount - 1)) * (1 +/- jitter)
 */
export function calculateBackoffDelay(
  retryCount: number,
  config: Partial<BackoffConfig> = {}
): number {
  const merged: BackoffConfig = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  if (retryCount <= 0) {
    return 0;
  }

  const exponential = merged.baseDelayMs * Math.pow(2, Math.min(retryCount - 1, 6));
  const bounded = Math.min(exponential, merged.maxDelayMs);
  const jitterRange = bounded * merged.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  return Math.max(0, Math.round(bounded + jitter));
}

/**
 * Classifies whether an error is non-retryable / permanent.
 */
export function isPermanentError(error: any): boolean {
  if (!error) return false;
  const code = (error?.code || '').toLowerCase();
  const msg = (error?.message || String(error)).toLowerCase();

  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'invalid-argument' ||
    code === 'not-found' ||
    code === 'already-exists' ||
    code === 'failed-precondition' ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('invalid recordid') ||
    msg.includes('invalid argument')
  );
}

/**
 * Classifies whether an error is transient / retryable.
 */
export function isTransientError(error: any): boolean {
  if (!error) return false;
  if (isPermanentError(error)) return false;

  const code = (error?.code || '').toLowerCase();
  const msg = (error?.message || String(error)).toLowerCase();

  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    code === 'network-error' ||
    code === 'aborted' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('unavailable') ||
    msg.includes('offline')
  );
}

/**
 * Phase 2 — Generic Cache Data Contract
 * Encapsulates cached documents for offline reads.
 */
export interface CachedEntity<T = unknown> {
  /** Unique key: `${collectionName}:${recordId}` */
  id: string;

  /** Name of the entity/collection (e.g., 'reports', 'announcements') */
  collectionName: string;

  /** Unique document ID */
  recordId: string;

  /** Stored document data */
  data: T;

  /** ISO timestamp when the record was cached locally */
  cachedAt: string;

  /** ISO timestamp when the record was created/updated remotely (if known) */
  updatedAt?: string;

  /** Optional version or checksum */
  version?: number | string;
}

/**
 * Phase 3 — Offline Session Persistence Contract
 */
export type OfflineSessionState =
  | 'online_authenticated'
  | 'offline_available'
  | 'expired';

export const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
export const OFFLINE_SESSION_SCHEMA_VERSION = 1;

export interface OfflineSessionRecord {
  /** Firebase User UID */
  uid: string;

  /** Sanitized User profile projection */
  user: User;

  /** Current session state */
  sessionState: OfflineSessionState;

  /** ISO timestamp of last successful online authentication */
  authenticatedAt: string;

  /** ISO timestamp of last active user interaction */
  lastActiveAt: string;

  /** ISO timestamp when this offline session expires */
  expiresAt: string;

  /** Schema version */
  schemaVersion: number;
}

/**
 * Strips any sensitive data, secrets, or large blobs before offline persistence.
 */
export function sanitizeUserForOfflineSession(user: User): User {
  return {
    uid: user.uid,
    boimsId: user.boimsId,
    householdId: user.householdId,
    householdNumber: user.householdNumber,
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    suffix: user.suffix,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    address: user.address,
    purok: user.purok,
    jurisdiction: user.jurisdiction,
    barangay: user.barangay,
    municipality: user.municipality,
    province: user.province,
    postalCode: user.postalCode,
    birthDate: user.birthDate,
    gender: user.gender,
    civilStatus: user.civilStatus,
    occupation: user.occupation,
    voterStatus: user.voterStatus,
    role: user.role,
    dutyStatus: user.dutyStatus,
    dutyMode: user.dutyMode,
    presence: user.presence,
    status: user.status,
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    isDeleted: user.isDeleted,
    deletedAt: user.deletedAt,
  };
}

/**
 * Validates an offline session record against structural, validity, and expiration rules.
 */
export function isOfflineSessionValid(
  session: OfflineSessionRecord | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!session || typeof session !== 'object') {
    return false;
  }

  if (
    !session.uid ||
    typeof session.uid !== 'string' ||
    session.uid.trim() === ''
  ) {
    return false;
  }

  if (!session.user || typeof session.user !== 'object' || !session.user.role) {
    return false;
  }

  if (session.sessionState === 'expired') {
    return false;
  }

  if (!session.expiresAt) {
    return false;
  }

  const expiresTime = new Date(session.expiresAt).getTime();
  if (isNaN(expiresTime) || expiresTime <= nowMs) {
    return false;
  }

  return true;
}

/**
 * Adapter converting legacy SyncQueueItem to standard OfflineQueueItem.
 * Preserves existing properties without modifying legacy SyncService.
 */
export function toOfflineQueueItem(legacy: SyncQueueItem): OfflineQueueItem {
  return {
    queueId: legacy.queueId,
    operation: legacy.operationType,
    collectionName: legacy.collectionName,
    recordId: legacy.recordId,
    payload: legacy.payload,
    createdAt: legacy.timestamp,
    updatedAt: legacy.timestamp,
    retryCount: legacy.retryCount,
    status: legacy.status,
    lastError: legacy.errorMessage,
    lastErrorCode: legacy.errorCode,
  };
}

/**
 * Adapter converting standard OfflineQueueItem to legacy SyncQueueItem.
 * Preserves backward compatibility with legacy consumers.
 */
export function toSyncQueueItem(item: OfflineQueueItem): SyncQueueItem {
  return {
    queueId: item.queueId,
    operationType: item.operation,
    collectionName: item.collectionName,
    recordId: item.recordId,
    payload: item.payload,
    timestamp: item.createdAt,
    retryCount: item.retryCount,
    status: item.status,
    errorMessage: item.lastError,
    errorCode: item.lastErrorCode,
  };
}

// =========================================================================
// Phase 4 — Offline CRUD & Mutation Queue Contracts
// =========================================================================

/**
 * Collections audited and verified as safe for offline mutations.
 */
export const OFFLINE_MUTABLE_COLLECTIONS = [
  'reports',
  'announcements',
  'certificates',
  'certificateRequests',
  'blotterCases',
  'inventory',
] as const;

export type OfflineMutableCollection =
  | (typeof OFFLINE_MUTABLE_COLLECTIONS)[number]
  | string;

/**
 * Standard Phase 4 Offline Mutation Contract.
 * Extends standard OfflineQueueItem with user context, client-generated tracking,
 * optimistic flags, and idempotency key.
 */
export interface OfflineMutation<T = unknown> {
  /** Unique queue mutation identifier (e.g., MUT-1724490000000-abcde) */
  queueId: string;

  /** Mutation operation */
  operation: OfflineOperation;

  /** Target Firestore collection name */
  collectionName: OfflineMutableCollection;

  /** Target document / record identifier */
  recordId: string;

  /** Data payload for the mutation */
  payload: T;

  /** ISO creation timestamp */
  createdAt: string;

  /** ISO last updated timestamp */
  updatedAt: string;

  /** Number of retry attempts (0 initially) */
  retryCount: number;

  /** Processing status */
  status: OfflineItemStatus;

  /** UID of the user who authored the mutation */
  userId?: string;

  /** Role of the user who authored the mutation */
  userRole?: string;

  /** Whether the mutation ID was generated client-side */
  clientGeneratedId?: boolean;

  /** Idempotency key to avoid duplicate submissions */
  idempotencyKey?: string;

  /** Flag indicating local optimistic cache application */
  optimistic?: boolean;

  /** Last error message if failed */
  lastError?: string;

  /** Last error code if failed */
  lastErrorCode?: string;

  /** Authoritative remote or cached updatedAt when mutation was authored */
  baseUpdatedAt?: string;
}

/**
 * Input parameters to enqueue an offline mutation.
 */
export interface CreateMutationParams<T = unknown> {
  operation: OfflineOperation;
  collectionName: OfflineMutableCollection;
  recordId: string;
  payload: T;
  userId?: string;
  userRole?: string;
  clientGeneratedId?: boolean;
  idempotencyKey?: string;
  applyOptimistic?: boolean;
  baseUpdatedAt?: string;
}

/**
 * Validates the structural integrity of an offline mutation.
 */
export function validateOfflineMutation(
  mutation: Partial<OfflineMutation>
): { valid: boolean; error?: string } {
  if (!mutation || typeof mutation !== 'object') {
    return { valid: false, error: 'Mutation must be a non-null object.' };
  }

  if (!mutation.queueId || typeof mutation.queueId !== 'string' || mutation.queueId.trim() === '') {
    return { valid: false, error: 'Mutation queueId is required.' };
  }

  if (
    !mutation.operation ||
    !['create', 'update', 'delete'].includes(mutation.operation)
  ) {
    return {
      valid: false,
      error: `Invalid mutation operation: ${mutation.operation}. Must be create, update, or delete.`,
    };
  }

  if (
    !mutation.collectionName ||
    typeof mutation.collectionName !== 'string' ||
    mutation.collectionName.trim() === ''
  ) {
    return { valid: false, error: 'Mutation collectionName is required.' };
  }

  if (
    !mutation.recordId ||
    typeof mutation.recordId !== 'string' ||
    mutation.recordId.trim() === '' ||
    mutation.recordId === 'undefined' ||
    mutation.recordId === 'null'
  ) {
    return { valid: false, error: 'Mutation recordId must be a valid, non-empty identifier.' };
  }

  if (mutation.operation !== 'delete' && (mutation.payload === undefined || mutation.payload === null)) {
    return { valid: false, error: 'Mutation payload is required for create and update operations.' };
  }

  if (!mutation.createdAt || isNaN(new Date(mutation.createdAt).getTime())) {
    return { valid: false, error: 'Mutation createdAt must be a valid ISO date string.' };
  }

  return { valid: true };
}

/**
 * Validates whether the given user has authorization to perform the specified offline mutation.
 * Enforces strict role-based access control matching BOIMS security rules.
 */
export function isMutationAuthorized(
  mutation: Partial<CreateMutationParams>,
  user: User | null
): boolean {
  if (!user || !user.role || user.isDeleted || user.status === 'suspended') {
    return false;
  }

  const role = user.role;
  const isPrivilegedAdmin =
    role === 'admin' ||
    role === 'superAdmin' ||
    role === 'chairman' ||
    role === 'developer';

  if (isPrivilegedAdmin) {
    return true;
  }

  const collection = mutation.collectionName;
  const operation = mutation.operation;

  switch (collection) {
    case 'reports':
      // Any authenticated active resident or official can create and update reports
      if (operation === 'create') return true;
      if (operation === 'update') return true;
      if (operation === 'delete') return role === 'secretary';
      return false;

    case 'announcements':
      // Only authorized officials can create, update, or delete announcements
      return role === 'secretary';

    case 'certificates':
    case 'certificateRequests':
      // Residents can request (create), secretary can update/process/delete
      if (operation === 'create') return true;
      if (operation === 'update') return role === 'secretary';
      if (operation === 'delete') return role === 'secretary';
      return false;

    case 'blotterCases':
      // Barangay officials and tanods can create/update blotters
      if (operation === 'create' || operation === 'update') {
        return role === 'purokOfficial' || role === 'secretary';
      }
      return role === 'secretary';

    case 'inventory':
      return role === 'secretary';

    default:
      return false;
  }
}

// =========================================================================
// Phase 7 — Conflict Detection & Resolution Contracts
// =========================================================================

export interface ConflictDetectionResult {
  hasConflict: boolean;
  reason?: DLQFailureReason;
  errorMessage?: string;
  remoteUpdatedAt?: string;
  remoteIsDeleted?: boolean;
  remoteExists: boolean;
}

/**
 * Deterministic Conflict Detection Helper for Offline Mutations replayed against Firestore.
 *
 * Evaluation Rules:
 * 1. CREATE:
 *    - If remote document exists and is NOT marked deleted: conflict_create_collision
 *    - If remote document does not exist or is marked deleted: no conflict
 * 2. UPDATE:
 *    - If remote document does NOT exist: conflict_remote_deleted
 *    - If remote document exists and is marked isDeleted: conflict_remote_deleted
 *    - If remote updatedAt is newer than local baseUpdatedAt: conflict_remote_newer
 *    - Otherwise: no conflict
 * 3. DELETE:
 *    - If remote document does NOT exist or is already marked isDeleted: no conflict (idempotent success)
 *    - If remote updatedAt is newer than local baseUpdatedAt: conflict_stale_delete
 *    - Otherwise: no conflict
 *
 * Safety Invariants:
 * - If baseUpdatedAt or remote updatedAt is unavailable or malformed, no synthetic timestamp is fabricated.
 * - Non-conflicting operations proceed safely to standard replay.
 */
export function detectMutationConflict(
  mutation: {
    operation: OfflineOperation;
    baseUpdatedAt?: string;
    createdAt?: string;
    payload?: unknown;
  },
  remoteData: Record<string, any> | null | undefined,
  remoteExists: boolean
): ConflictDetectionResult {
  const isRemoteDeleted = Boolean(
    remoteData &&
      (remoteData.isDeleted === true || remoteData.status === 'deleted' || remoteData.deleted === true)
  );

  const remoteUpdatedAt =
    remoteData && typeof remoteData.updatedAt === 'string'
      ? remoteData.updatedAt
      : remoteData && typeof remoteData.createdAt === 'string'
      ? remoteData.createdAt
      : undefined;

  // 1. CREATE Operation
  if (mutation.operation === 'create') {
    if (remoteExists && !isRemoteDeleted) {
      return {
        hasConflict: true,
        reason: 'conflict_create_collision',
        errorMessage: 'CREATE collision: Target document already exists on remote server and is active.',
        remoteUpdatedAt,
        remoteIsDeleted: false,
        remoteExists: true,
      };
    }
    return {
      hasConflict: false,
      remoteUpdatedAt,
      remoteIsDeleted: isRemoteDeleted,
      remoteExists,
    };
  }

  // 2. UPDATE Operation
  if (mutation.operation === 'update') {
    if (!remoteExists) {
      return {
        hasConflict: true,
        reason: 'conflict_remote_deleted',
        errorMessage: 'UPDATE conflict: Remote target document does not exist or has been deleted.',
        remoteUpdatedAt: undefined,
        remoteIsDeleted: true,
        remoteExists: false,
      };
    }

    if (isRemoteDeleted) {
      return {
        hasConflict: true,
        reason: 'conflict_remote_deleted',
        errorMessage: 'UPDATE conflict: Remote target document is marked as deleted.',
        remoteUpdatedAt,
        remoteIsDeleted: true,
        remoteExists: true,
      };
    }

    // Check timestamp freshness if baseUpdatedAt and remoteUpdatedAt are both present and valid
    if (mutation.baseUpdatedAt && remoteUpdatedAt) {
      const baseTime = new Date(mutation.baseUpdatedAt).getTime();
      const remoteTime = new Date(remoteUpdatedAt).getTime();

      if (!isNaN(baseTime) && !isNaN(remoteTime) && remoteTime > baseTime) {
        return {
          hasConflict: true,
          reason: 'conflict_remote_newer',
          errorMessage: `UPDATE conflict: Remote document was modified (${remoteUpdatedAt}) after local baseline (${mutation.baseUpdatedAt}).`,
          remoteUpdatedAt,
          remoteIsDeleted: false,
          remoteExists: true,
        };
      }
    }

    return {
      hasConflict: false,
      remoteUpdatedAt,
      remoteIsDeleted: false,
      remoteExists: true,
    };
  }

  // 3. DELETE Operation
  if (mutation.operation === 'delete') {
    // If target document is already deleted or absent, treat as idempotent success (no conflict)
    if (!remoteExists || isRemoteDeleted) {
      return {
        hasConflict: false,
        remoteUpdatedAt,
        remoteIsDeleted: true,
        remoteExists,
      };
    }

    // If remote was updated after local deletion intent was authored
    if (mutation.baseUpdatedAt && remoteUpdatedAt) {
      const baseTime = new Date(mutation.baseUpdatedAt).getTime();
      const remoteTime = new Date(remoteUpdatedAt).getTime();

      if (!isNaN(baseTime) && !isNaN(remoteTime) && remoteTime > baseTime) {
        return {
          hasConflict: true,
          reason: 'conflict_stale_delete',
          errorMessage: `DELETE conflict: Remote document was updated (${remoteUpdatedAt}) after local deletion intent (${mutation.baseUpdatedAt}).`,
          remoteUpdatedAt,
          remoteIsDeleted: false,
          remoteExists: true,
        };
      }
    }

    return {
      hasConflict: false,
      remoteUpdatedAt,
      remoteIsDeleted: false,
      remoteExists: true,
    };
  }

  return {
    hasConflict: false,
    remoteUpdatedAt,
    remoteIsDeleted: isRemoteDeleted,
    remoteExists,
  };
}

// =========================================================================
// Phase 8 — Multi-Tab Coordination & Cross-Tab Mutation Safety Contracts
// =========================================================================

export const COORDINATION_LEASE_KEY = 'replay_coordination_lease';
export const DEFAULT_LEASE_DURATION_MS = 10000; // 10 seconds lease TTL
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 3000; // 3 seconds heartbeat renewal
export const COORDINATION_SCHEMA_VERSION = 1;

/**
 * Durable Replay Coordination Lease record stored in IndexedDB 'offlineMetadata'.
 * Authoritative single source of truth for replay ownership across browser tabs.
 */
export interface ReplayCoordinationLease {
  /** Fixed key: 'replay_coordination_lease' */
  key: string;

  /** Unique identifier of the tab holding the active lease */
  tabId: string;

  /** ISO timestamp when the lease was originally acquired */
  acquiredAt: string;

  /** ISO timestamp of the last successful heartbeat renewal */
  renewedAt: string;

  /** ISO timestamp when the current lease expires if not renewed */
  expiresAt: string;

  /** Lease validity duration in milliseconds */
  leaseDurationMs: number;

  /** Schema version */
  schemaVersion: number;
}

export type CoordinationSignalType =
  | 'lease_acquired'
  | 'lease_released'
  | 'lease_renewed'
  | 'lease_lost'
  | 'queue_changed'
  | 'notification_state_changed';

/**
 * Non-durable BroadcastChannel message format for real-time tab notification.
 * BroadcastChannel is solely a signaling optimization; IndexedDB remains authoritative.
 */
export interface CoordinationSignalMessage {
  type: CoordinationSignalType;
  tabId: string;
  timestamp: string;
  expiresAt?: string;
  details?: Record<string, unknown>;
}

// =========================================================================
// Phase 9 — Offline Notifications, Cross-Tab Notification State & Delivery Reconciliation
// =========================================================================

export const OFFLINE_NOTIFICATIONS_COLLECTION = 'notifications';
export const NOTIFICATION_SCHEMA_VERSION = 1;

export type NotificationSyncState =
  | 'synced'
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete';

/**
 * Offline notification record stored in 'offlineEntities' IndexedDB store.
 * Strictly free of credentials, tokens, passwords, and private keys.
 */
export interface OfflineNotificationRecord {
  /** Stable notification identifier */
  notificationId: string;

  /** Target user identifier or broadcast audience */
  userId: string;

  /** Notification title */
  title: string;

  /** Notification body text */
  message: string;

  /** Notification category/type */
  type: string;

  /** Priority level */
  priority: string;

  /** Read status */
  isRead: boolean;

  /** ISO timestamp when marked as read */
  readAt?: string | null;

  /** Deep link route */
  link?: string;

  /** Associated report ID if applicable */
  reportId?: string;

  /** Associated certificate request ID if applicable */
  certificateId?: string;

  /** Associated announcement ID if applicable */
  announcementId?: string;

  /** Associated inventory ID if applicable */
  inventoryId?: string;

  /** Icon descriptor */
  icon?: string;

  /** UID of creator or system */
  createdBy?: string;

  /** Target jurisdiction or purok for role-based routing */
  targetJurisdiction?: string;
  purok?: string;

  /** Optional metadata payload (non-sensitive) */
  metadata?: Record<string, unknown>;

  /** ISO creation timestamp */
  createdAt: string;

  /** ISO update timestamp */
  updatedAt?: string;

  /** Soft-delete flag */
  isDeleted: boolean;

  /** ISO deletion timestamp */
  deletedAt?: string | null;

  /** Synchronization state */
  syncState?: NotificationSyncState;

  /** Schema version */
  schemaVersion: number;
}

export interface UserNotificationOverlayItem {
  isRead?: boolean;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export type UserNotificationOverlay = Record<string, UserNotificationOverlayItem>;

export interface NotificationReconciliationResult {
  reconciled: OfflineNotificationRecord[];
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
}

/**
 * Reconciles local cached notifications with authoritative remote notifications.
 * Preserves user read/deleted overlay, avoids duplicates by notificationId,
 * and maintains newest-first chronological ordering.
 */
export function reconcileOfflineNotifications(
  localCached: OfflineNotificationRecord[],
  remoteNotifications: OfflineNotificationRecord[],
  userOverlay: UserNotificationOverlay = {}
): NotificationReconciliationResult {
  const notificationMap = new Map<string, OfflineNotificationRecord>();
  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  // 1. Populate map with local cached notifications
  for (const local of localCached) {
    if (local && local.notificationId) {
      notificationMap.set(local.notificationId, { ...local });
    }
  }

  // 2. Reconcile with remote notifications (remote is authoritative for server data)
  for (const remote of remoteNotifications) {
    if (!remote || !remote.notificationId) continue;

    const existing = notificationMap.get(remote.notificationId);
    if (!existing) {
      // New remote notification
      notificationMap.set(remote.notificationId, { ...remote });
      addedCount++;
    } else {
      // Update existing if remote is newer or has updated state
      const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();

      // Check if remote is deleted
      if (remote.isDeleted && !existing.isDeleted) {
        existing.isDeleted = true;
        existing.deletedAt = remote.deletedAt || new Date().toISOString();
        deletedCount++;
      } else if (remoteTime >= existingTime) {
        // Apply remote fields while preserving local overlay if newer
        notificationMap.set(remote.notificationId, {
          ...existing,
          ...remote,
        });
        updatedCount++;
      }
    }
  }

  // 3. Apply user-specific read/delete overlay (for broadcast & user state)
  const resultList: OfflineNotificationRecord[] = [];
  for (const notif of notificationMap.values()) {
    const overlay = userOverlay[notif.notificationId];
    const merged: OfflineNotificationRecord = {
      ...notif,
      isRead: overlay?.isRead !== undefined ? overlay.isRead : notif.isRead,
      readAt: overlay?.readAt !== undefined ? overlay.readAt : notif.readAt,
      isDeleted: overlay?.isDeleted !== undefined ? overlay.isDeleted : notif.isDeleted,
      deletedAt: overlay?.deletedAt !== undefined ? overlay.deletedAt : notif.deletedAt,
    };

    if (!merged.isDeleted) {
      resultList.push(merged);
    }
  }

  // 4. Sort chronological: newest first
  resultList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    reconciled: resultList,
    addedCount,
    updatedCount,
    deletedCount,
  };
}

/**
 * Deduplicates notification array by stable notificationId.
 */
export function deduplicateNotifications<T extends { notificationId?: string; id?: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const item of items) {
    const id = item.notificationId || item.id;
    if (id && !seen.has(id)) {
      seen.add(id);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

/**
 * Sorts notifications in descending chronological order (newest first).
 */
export function sortNotificationsChronological<T extends { createdAt: string }>(
  items: T[]
): T[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Verifies that a notification record contains no sensitive credentials or tokens.
 */
export function auditNotificationForSecrets(record: unknown): boolean {
  if (!record || typeof record !== 'object') return true;
  const sensitiveKeys = [
    'password',
    'token',
    'idToken',
    'refreshToken',
    'fcmToken',
    'registrationToken',
    'apiKey',
    'secret',
    'privateKey',
    'credential',
  ];

  const check = (obj: any): boolean => {
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey === s.toLowerCase() || lowerKey.includes('secret') || lowerKey.includes('token') && !lowerKey.includes('report') && !lowerKey.includes('announcement'))) {
        return false;
      }
      if (obj[key] && typeof obj[key] === 'object') {
        if (!check(obj[key])) return false;
      }
    }
    return true;
  };

  return check(record);
}

// =========================================================================
// Phase 10 — Offline Data Freshness, Reconciliation & Stale-Cache Management
// =========================================================================

export type CacheFreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'expired'
  | 'missing'
  | 'refreshing';

export interface CollectionFreshnessPolicy {
  collectionName: string;
  freshnessTtlMs: number;
  maxRetentionTtlMs: number;
  allowOfflineUsageWhenStale: boolean;
  allowOfflineUsageWhenExpired: boolean;
  autoRefreshOnStale: boolean;
}

export const COLLECTION_FRESHNESS_POLICIES: Record<string, CollectionFreshnessPolicy> = {
  reports: {
    collectionName: 'reports',
    freshnessTtlMs: 5 * 60 * 1000, // 5 minutes
    maxRetentionTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  announcements: {
    collectionName: 'announcements',
    freshnessTtlMs: 15 * 60 * 1000, // 15 minutes
    maxRetentionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  certificateRequests: {
    collectionName: 'certificateRequests',
    freshnessTtlMs: 10 * 60 * 1000, // 10 minutes
    maxRetentionTtlMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  certificates: {
    collectionName: 'certificates',
    freshnessTtlMs: 10 * 60 * 1000, // 10 minutes
    maxRetentionTtlMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  blotterCases: {
    collectionName: 'blotterCases',
    freshnessTtlMs: 15 * 60 * 1000, // 15 minutes
    maxRetentionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  inventory: {
    collectionName: 'inventory',
    freshnessTtlMs: 10 * 60 * 1000, // 10 minutes
    maxRetentionTtlMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  residents: {
    collectionName: 'residents',
    freshnessTtlMs: 30 * 60 * 1000, // 30 minutes
    maxRetentionTtlMs: 14 * 24 * 60 * 60 * 1000, // 14 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  households: {
    collectionName: 'households',
    freshnessTtlMs: 30 * 60 * 1000, // 30 minutes
    maxRetentionTtlMs: 14 * 24 * 60 * 60 * 1000, // 14 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  householdInvites: {
    collectionName: 'householdInvites',
    freshnessTtlMs: 10 * 60 * 1000, // 10 minutes
    maxRetentionTtlMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
  notifications: {
    collectionName: 'notifications',
    freshnessTtlMs: 2 * 60 * 1000, // 2 minutes
    maxRetentionTtlMs: 48 * 60 * 60 * 1000, // 48 hours
    allowOfflineUsageWhenStale: true,
    allowOfflineUsageWhenExpired: false,
    autoRefreshOnStale: true,
  },
};

export const DEFAULT_COLLECTION_FRESHNESS_POLICY: CollectionFreshnessPolicy = {
  collectionName: 'default',
  freshnessTtlMs: 15 * 60 * 1000, // 15 minutes
  maxRetentionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  allowOfflineUsageWhenStale: true,
  allowOfflineUsageWhenExpired: false,
  autoRefreshOnStale: true,
};

export function getFreshnessPolicyForCollection(collectionName: string): CollectionFreshnessPolicy {
  if (COLLECTION_FRESHNESS_POLICIES[collectionName]) {
    return COLLECTION_FRESHNESS_POLICIES[collectionName];
  }
  return {
    ...DEFAULT_COLLECTION_FRESHNESS_POLICY,
    collectionName,
  };
}

export interface FreshnessEvaluationResult {
  status: CacheFreshnessStatus;
  collectionName: string;
  recordId: string;
  ageMs: number;
  cachedAt: string | null;
  updatedAt: string | null;
  staleAt: string | null;
  expiresAt: string | null;
  shouldRefresh: boolean;
  isUsableOffline: boolean;
  policy: CollectionFreshnessPolicy;
}

export interface CollectionFreshnessSummary {
  collectionName: string;
  total: number;
  freshCount: number;
  staleCount: number;
  expiredCount: number;
  overallStatus: 'fresh' | 'stale' | 'expired' | 'empty';
  oldestAgeMs: number;
  newestAgeMs: number;
  shouldRefresh: boolean;
  policy: CollectionFreshnessPolicy;
}

/**
 * Deterministic, side-effect free evaluation of cached entity freshness.
 */
export function evaluateCacheFreshness(
  entity: CachedEntity | null | undefined,
  collectionName: string,
  options?: {
    recordId?: string;
    now?: number | string;
    isRefreshing?: boolean;
    customPolicy?: Partial<CollectionFreshnessPolicy>;
  }
): FreshnessEvaluationResult {
  const basePolicy = getFreshnessPolicyForCollection(collectionName);
  const policy: CollectionFreshnessPolicy = {
    ...basePolicy,
    ...(options?.customPolicy || {}),
  };

  const recordId = entity?.recordId || options?.recordId || 'unknown';

  if (!entity) {
    return {
      status: 'missing',
      collectionName,
      recordId,
      ageMs: -1,
      cachedAt: null,
      updatedAt: null,
      staleAt: null,
      expiresAt: null,
      shouldRefresh: true,
      isUsableOffline: false,
      policy,
    };
  }

  const nowMs =
    options?.now !== undefined
      ? typeof options.now === 'number'
        ? options.now
        : new Date(options.now).getTime()
      : Date.now();

  const timestampStr = entity.cachedAt || entity.updatedAt;
  const timestampMs = timestampStr ? new Date(timestampStr).getTime() : NaN;

  if (isNaN(timestampMs)) {
    // If timestamp cannot be parsed, treat as expired
    return {
      status: 'expired',
      collectionName,
      recordId,
      ageMs: Infinity,
      cachedAt: entity.cachedAt || null,
      updatedAt: entity.updatedAt || null,
      staleAt: null,
      expiresAt: null,
      shouldRefresh: true,
      isUsableOffline: policy.allowOfflineUsageWhenExpired,
      policy,
    };
  }

  // Calculate age clamped to non-negative (handling small clock skew safely)
  const ageMs = Math.max(0, nowMs - timestampMs);

  const staleAt = new Date(timestampMs + policy.freshnessTtlMs).toISOString();
  const expiresAt = new Date(timestampMs + policy.maxRetentionTtlMs).toISOString();

  if (options?.isRefreshing) {
    const isWithinRetention = ageMs <= policy.maxRetentionTtlMs;
    return {
      status: 'refreshing',
      collectionName,
      recordId,
      ageMs,
      cachedAt: entity.cachedAt || null,
      updatedAt: entity.updatedAt || null,
      staleAt,
      expiresAt,
      shouldRefresh: false,
      isUsableOffline: isWithinRetention || policy.allowOfflineUsageWhenExpired,
      policy,
    };
  }

  if (ageMs <= policy.freshnessTtlMs) {
    return {
      status: 'fresh',
      collectionName,
      recordId,
      ageMs,
      cachedAt: entity.cachedAt || null,
      updatedAt: entity.updatedAt || null,
      staleAt,
      expiresAt,
      shouldRefresh: false,
      isUsableOffline: true,
      policy,
    };
  }

  if (ageMs <= policy.maxRetentionTtlMs) {
    return {
      status: 'stale',
      collectionName,
      recordId,
      ageMs,
      cachedAt: entity.cachedAt || null,
      updatedAt: entity.updatedAt || null,
      staleAt,
      expiresAt,
      shouldRefresh: policy.autoRefreshOnStale,
      isUsableOffline: policy.allowOfflineUsageWhenStale,
      policy,
    };
  }

  return {
    status: 'expired',
    collectionName,
    recordId,
    ageMs,
    cachedAt: entity.cachedAt || null,
    updatedAt: entity.updatedAt || null,
    staleAt,
    expiresAt,
    shouldRefresh: true,
    isUsableOffline: policy.allowOfflineUsageWhenExpired,
    policy,
  };
}

/**
 * Evaluates collection-level freshness across an array of cached entities.
 */
export function evaluateCollectionFreshness(
  entities: CachedEntity[],
  collectionName: string,
  options?: {
    now?: number | string;
    isRefreshing?: boolean;
    customPolicy?: Partial<CollectionFreshnessPolicy>;
  }
): CollectionFreshnessSummary {
  const policy = {
    ...getFreshnessPolicyForCollection(collectionName),
    ...(options?.customPolicy || {}),
  };

  if (!entities || entities.length === 0) {
    return {
      collectionName,
      total: 0,
      freshCount: 0,
      staleCount: 0,
      expiredCount: 0,
      overallStatus: 'empty',
      oldestAgeMs: -1,
      newestAgeMs: -1,
      shouldRefresh: true,
      policy,
    };
  }

  let freshCount = 0;
  let staleCount = 0;
  let expiredCount = 0;
  let oldestAgeMs = 0;
  let newestAgeMs = Infinity;

  for (const entity of entities) {
    const evalRes = evaluateCacheFreshness(entity, collectionName, options);
    if (evalRes.status === 'fresh' || evalRes.status === 'refreshing') {
      freshCount++;
    } else if (evalRes.status === 'stale') {
      staleCount++;
    } else {
      expiredCount++;
    }

    if (evalRes.ageMs >= 0) {
      if (evalRes.ageMs > oldestAgeMs) oldestAgeMs = evalRes.ageMs;
      if (evalRes.ageMs < newestAgeMs) newestAgeMs = evalRes.ageMs;
    }
  }

  if (newestAgeMs === Infinity) newestAgeMs = 0;

  let overallStatus: 'fresh' | 'stale' | 'expired' | 'empty' = 'fresh';
  if (expiredCount > 0) {
    overallStatus = 'expired';
  } else if (staleCount > 0) {
    overallStatus = 'stale';
  }

  const shouldRefresh = expiredCount > 0 || staleCount > 0;

  return {
    collectionName,
    total: entities.length,
    freshCount,
    staleCount,
    expiredCount,
    overallStatus,
    oldestAgeMs,
    newestAgeMs,
    shouldRefresh,
    policy,
  };
}

/**
 * Audits freshness metadata and evaluation results for absence of secrets or sensitive tokens.
 */
export function auditFreshnessMetadataForSecrets(evaluation: unknown): boolean {
  if (!evaluation || typeof evaluation !== 'object') return true;
  const sensitiveKeys = [
    'password',
    'token',
    'idToken',
    'refreshToken',
    'apiKey',
    'secret',
    'privateKey',
    'credential',
    'fcmToken',
  ];

  const check = (obj: any): boolean => {
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey === s.toLowerCase() || lowerKey.includes('secret') || lowerKey.includes('token') && !lowerKey.includes('report') && !lowerKey.includes('announcement'))) {
        return false;
      }
      if (obj[key] && typeof obj[key] === 'object') {
        if (!check(obj[key])) return false;
      }
    }
    return true;
  };

  return check(evaluation);
}

// =========================================================================
// Phase 11 — Offline Data Integrity, Recovery & Corruption Resilience Contracts
// =========================================================================

export type CorruptionClassification =
  | 'valid'
  | 'malformed'
  | 'missing_required_field'
  | 'invalid_timestamp'
  | 'invalid_enum'
  | 'invalid_identifier'
  | 'invalid_schema_version'
  | 'invalid_payload'
  | 'expired'
  | 'orphaned'
  | 'inconsistent_state'
  | 'contains_forbidden_credentials';

export const STORAGE_SCHEMA_VERSION = 3;
export const MAX_SUPPORTED_SCHEMA_VERSION = 5;

export interface IntegrityValidationResult<T = unknown> {
  valid: boolean;
  classification: CorruptionClassification;
  error?: string;
  normalized?: T;
  details?: Record<string, unknown>;
}

export interface StorageIntegrityAuditResult {
  auditedAt: string;
  isClean: boolean;
  queue: {
    total: number;
    valid: number;
    corrupt: number;
    quarantined: number;
  };
  cache: {
    total: number;
    valid: number;
    corrupt: number;
    pruned: number;
  };
  dlq: {
    total: number;
    valid: number;
    corrupt: number;
    unsupportedVersion: number;
  };
  session: {
    status: 'valid' | 'expired' | 'corrupt' | 'missing';
    uid?: string;
  };
  lease: {
    status: 'active' | 'expired' | 'corrupt' | 'none';
    tabId?: string;
  };
  issues: Array<{
    store: 'offlineQueue' | 'offlineEntities' | 'offlineDLQ' | 'offlineMetadata';
    id: string;
    classification: CorruptionClassification;
    message: string;
  }>;
}

/**
 * Scans a record recursively for forbidden authentication credentials,
 * secrets, private keys, or session tokens.
 */
export function auditRecordForForbiddenCredentials(record: unknown): {
  containsSecrets: boolean;
  forbiddenKeys: string[];
} {
  if (!record || typeof record !== 'object') {
    return { containsSecrets: false, forbiddenKeys: [] };
  }

  const forbiddenKeyPatterns = [
    'password',
    'idtoken',
    'refreshtoken',
    'fcmtoken',
    'registrationtoken',
    'apikey',
    'privatekey',
    'credential',
    'authheader',
    'clientsecret',
    'serviceaccount',
  ];

  const foundKeys: string[] = [];

  const inspect = (obj: any, path: string = ''): void => {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;

      const isForbidden = forbiddenKeyPatterns.some((pattern) => {
        if (lowerKey === pattern) return true;
        if (lowerKey.includes('secret') && !lowerKey.includes('secretary')) return true;
        if (lowerKey.includes('password') && !lowerKey.includes('mustchangepassword') && !lowerKey.includes('must_change_password')) return true;
        if (lowerKey.includes('privatekey')) return true;
        if (
          lowerKey.includes('token') &&
          !lowerKey.includes('report') &&
          !lowerKey.includes('announcement') &&
          !lowerKey.includes('certificate') &&
          !lowerKey.includes('tokenize')
        ) {
          return true;
        }
        return false;
      });

      if (isForbidden) {
        foundKeys.push(currentPath);
      }

      if (obj[key] && typeof obj[key] === 'object') {
        inspect(obj[key], currentPath);
      }
    }
  };

  inspect(record);

  return {
    containsSecrets: foundKeys.length > 0,
    forbiddenKeys: foundKeys,
  };
}

/**
 * Validates the structural and logical integrity of a CachedEntity record.
 */
export function validateCachedEntityIntegrity(
  record: unknown
): IntegrityValidationResult<CachedEntity> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'Cached entity record must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  // Check forbidden credentials
  const secretsAudit = auditRecordForForbiddenCredentials(r);
  if (secretsAudit.containsSecrets) {
    return {
      valid: false,
      classification: 'contains_forbidden_credentials',
      error: `Cached entity contains forbidden credential keys: ${secretsAudit.forbiddenKeys.join(', ')}`,
    };
  }

  // Required field: collectionName
  if (!r.collectionName || typeof r.collectionName !== 'string' || r.collectionName.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Cached entity collectionName is required.',
    };
  }

  // Required field: recordId
  if (
    !r.recordId ||
    typeof r.recordId !== 'string' ||
    r.recordId.trim() === '' ||
    r.recordId === 'undefined' ||
    r.recordId === 'null'
  ) {
    return {
      valid: false,
      classification: 'invalid_identifier',
      error: 'Cached entity recordId is missing or invalid.',
    };
  }

  // Required field: data
  if (r.data === undefined) {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Cached entity data payload is required.',
    };
  }

  // Required field: cachedAt
  if (!r.cachedAt || typeof r.cachedAt !== 'string') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Cached entity cachedAt timestamp is required.',
    };
  }

  if (isNaN(new Date(r.cachedAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Cached entity cachedAt '${r.cachedAt}' is not a valid ISO date.`,
    };
  }

  // Optional: updatedAt
  if (r.updatedAt !== undefined && (typeof r.updatedAt !== 'string' || isNaN(new Date(r.updatedAt).getTime()))) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Cached entity updatedAt '${r.updatedAt}' is not a valid ISO date.`,
    };
  }

  // Schema version check
  if (r.version !== undefined) {
    if (typeof r.version === 'number' && (r.version < 0 || r.version > MAX_SUPPORTED_SCHEMA_VERSION)) {
      return {
        valid: false,
        classification: 'invalid_schema_version',
        error: `Cached entity version '${r.version}' exceeds maximum supported version.`,
      };
    }
  }

  const compoundId = `${r.collectionName}:${r.recordId}`;
  const normalized: CachedEntity = {
    id: r.id && typeof r.id === 'string' ? r.id : compoundId,
    collectionName: r.collectionName,
    recordId: r.recordId,
    data: r.data,
    cachedAt: r.cachedAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };

  return {
    valid: true,
    classification: 'valid',
    normalized,
  };
}

/**
 * Validates the structural and logical integrity of an OfflineMutation / OfflineQueueItem record.
 */
export function validateMutationIntegrity(
  record: unknown
): IntegrityValidationResult<OfflineMutation> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'Mutation record must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  // Check forbidden credentials
  const secretsAudit = auditRecordForForbiddenCredentials(r);
  if (secretsAudit.containsSecrets) {
    return {
      valid: false,
      classification: 'contains_forbidden_credentials',
      error: `Mutation record contains forbidden credential keys: ${secretsAudit.forbiddenKeys.join(', ')}`,
    };
  }

  // Required: queueId
  if (!r.queueId || typeof r.queueId !== 'string' || r.queueId.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Mutation queueId is required.',
    };
  }

  // Required: operation
  if (!r.operation || typeof r.operation !== 'string') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Mutation operation is required.',
    };
  }

  if (!['create', 'update', 'delete'].includes(r.operation)) {
    return {
      valid: false,
      classification: 'invalid_enum',
      error: `Invalid mutation operation: '${r.operation}'. Must be create, update, or delete.`,
    };
  }

  // Required: collectionName
  if (!r.collectionName || typeof r.collectionName !== 'string' || r.collectionName.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Mutation collectionName is required.',
    };
  }

  // Required: recordId
  if (
    !r.recordId ||
    typeof r.recordId !== 'string' ||
    r.recordId.trim() === '' ||
    r.recordId === 'undefined' ||
    r.recordId === 'null'
  ) {
    return {
      valid: false,
      classification: 'invalid_identifier',
      error: 'Mutation recordId is missing or invalid.',
    };
  }

  // Required payload for create/update
  if (r.operation !== 'delete' && (r.payload === undefined || r.payload === null)) {
    return {
      valid: false,
      classification: 'invalid_payload',
      error: `Mutation payload is required for operation '${r.operation}'.`,
    };
  }

  // Required: createdAt
  if (!r.createdAt || typeof r.createdAt !== 'string') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Mutation createdAt is required.',
    };
  }

  if (isNaN(new Date(r.createdAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Mutation createdAt '${r.createdAt}' is not a valid ISO date.`,
    };
  }

  // Optional: updatedAt
  if (r.updatedAt !== undefined && (typeof r.updatedAt !== 'string' || isNaN(new Date(r.updatedAt).getTime()))) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Mutation updatedAt '${r.updatedAt}' is not a valid ISO date.`,
    };
  }

  // Status check
  if (r.status !== undefined && !['pending', 'syncing', 'failed', 'resolved'].includes(r.status)) {
    return {
      valid: false,
      classification: 'invalid_enum',
      error: `Invalid mutation status: '${r.status}'.`,
    };
  }

  // Schema version check
  if (r.schemaVersion !== undefined && (typeof r.schemaVersion !== 'number' || r.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
    return {
      valid: false,
      classification: 'invalid_schema_version',
      error: `Mutation schemaVersion '${r.schemaVersion}' exceeds supported versions.`,
    };
  }

  const normalized: OfflineMutation = {
    queueId: r.queueId,
    operation: r.operation as OfflineOperation,
    collectionName: r.collectionName,
    recordId: r.recordId,
    payload: r.payload,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt || r.createdAt,
    retryCount: typeof r.retryCount === 'number' && r.retryCount >= 0 ? r.retryCount : 0,
    status: r.status === 'syncing' ? 'pending' : (r.status || 'pending'),
    userId: r.userId,
    userRole: r.userRole,
    clientGeneratedId: r.clientGeneratedId,
    idempotencyKey: r.idempotencyKey,
    optimistic: r.optimistic,
    lastError: r.lastError,
    lastErrorCode: r.lastErrorCode,
    baseUpdatedAt: r.baseUpdatedAt,
  };

  return {
    valid: true,
    classification: 'valid',
    normalized,
  };
}

/**
 * Validates the structural and logical integrity of a DeadLetterItem record.
 */
export function validateDLQItemIntegrity(
  record: unknown
): IntegrityValidationResult<DeadLetterItem> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'DLQ item must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  // Check forbidden credentials
  const secretsAudit = auditRecordForForbiddenCredentials(r);
  if (secretsAudit.containsSecrets) {
    return {
      valid: false,
      classification: 'contains_forbidden_credentials',
      error: `DLQ item contains forbidden credential keys: ${secretsAudit.forbiddenKeys.join(', ')}`,
    };
  }

  // Required: dlqId
  if (!r.dlqId || typeof r.dlqId !== 'string' || r.dlqId.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'DLQ dlqId is required.',
    };
  }

  // Required: originalQueueId (orphaned if missing)
  if (!r.originalQueueId || typeof r.originalQueueId !== 'string' || r.originalQueueId.trim() === '') {
    return {
      valid: false,
      classification: 'orphaned',
      error: 'DLQ item is missing its originalQueueId reference.',
    };
  }

  // Required: operation
  if (!r.operation || !['create', 'update', 'delete'].includes(r.operation)) {
    return {
      valid: false,
      classification: 'invalid_enum',
      error: `Invalid DLQ operation: '${r.operation}'.`,
    };
  }

  // Required: collectionName
  if (!r.collectionName || typeof r.collectionName !== 'string' || r.collectionName.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'DLQ collectionName is required.',
    };
  }

  // Required: recordId
  if (!r.recordId || typeof r.recordId !== 'string' || r.recordId.trim() === '') {
    return {
      valid: false,
      classification: 'invalid_identifier',
      error: 'DLQ recordId is missing or invalid.',
    };
  }

  // Required: failureReason
  const validReasons: DLQFailureReason[] = [
    'max_retries_exceeded',
    'permanent_error',
    'security_rejection',
    'structural_validation_failed',
    'authentication_required',
    'manual_quarantine',
    'conflict_remote_newer',
    'conflict_remote_deleted',
    'conflict_create_collision',
    'conflict_stale_delete',
  ];

  if (!r.failureReason || typeof r.failureReason !== 'string') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'DLQ failureReason is required.',
    };
  }

  if (!validReasons.includes(r.failureReason as DLQFailureReason)) {
    return {
      valid: false,
      classification: 'invalid_enum',
      error: `Invalid DLQ failureReason: '${r.failureReason}'.`,
    };
  }

  // Required timestamps
  if (!r.failedAt || isNaN(new Date(r.failedAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `DLQ failedAt '${r.failedAt}' is not a valid ISO date.`,
    };
  }

  // Schema version check
  if (r.schemaVersion !== undefined && (typeof r.schemaVersion !== 'number' || r.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
    return {
      valid: false,
      classification: 'invalid_schema_version',
      error: `DLQ schemaVersion '${r.schemaVersion}' exceeds supported versions.`,
    };
  }

  const normalized: DeadLetterItem = {
    dlqId: r.dlqId,
    originalQueueId: r.originalQueueId,
    operation: r.operation as OfflineOperation,
    collectionName: r.collectionName,
    recordId: r.recordId,
    payload: r.payload,
    originalCreatedAt: r.originalCreatedAt || r.failedAt,
    failedAt: r.failedAt,
    retryCount: typeof r.retryCount === 'number' ? r.retryCount : 0,
    lastError: r.lastError,
    lastErrorCode: r.lastErrorCode,
    failureReason: r.failureReason as DLQFailureReason,
    originatingUserId: r.originatingUserId,
    originatingUserRole: r.originatingUserRole,
    schemaVersion: r.schemaVersion || DLQ_SCHEMA_VERSION,
    baseUpdatedAt: r.baseUpdatedAt,
    conflictDetails: r.conflictDetails,
  };

  return {
    valid: true,
    classification: 'valid',
    normalized,
  };
}

/**
 * Validates the structural and logical integrity of an OfflineSessionRecord.
 */
export function validateSessionIntegrity(
  record: unknown,
  nowMs: number = Date.now()
): IntegrityValidationResult<OfflineSessionRecord> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'Offline session record must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  // Check forbidden credentials
  const secretsAudit = auditRecordForForbiddenCredentials(r);
  if (secretsAudit.containsSecrets) {
    return {
      valid: false,
      classification: 'contains_forbidden_credentials',
      error: `Session contains forbidden credentials: ${secretsAudit.forbiddenKeys.join(', ')}`,
    };
  }

  // Required: uid
  if (!r.uid || typeof r.uid !== 'string' || r.uid.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Session uid is required.',
    };
  }

  // Required: user object with role
  if (!r.user || typeof r.user !== 'object' || !r.user.role) {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Session user object with role is required.',
    };
  }

  // Status check
  if (
    r.sessionState !== undefined &&
    !['online_authenticated', 'offline_available', 'expired'].includes(r.sessionState)
  ) {
    return {
      valid: false,
      classification: 'invalid_enum',
      error: `Invalid sessionState: '${r.sessionState}'.`,
    };
  }

  // Timestamps check
  if (!r.expiresAt || isNaN(new Date(r.expiresAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Session expiresAt '${r.expiresAt}' is not a valid ISO date.`,
    };
  }

  // Schema version check
  if (r.schemaVersion !== undefined && (typeof r.schemaVersion !== 'number' || r.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
    return {
      valid: false,
      classification: 'invalid_schema_version',
      error: `Session schemaVersion '${r.schemaVersion}' exceeds supported versions.`,
    };
  }

  // Expiration check
  const expiresMs = new Date(r.expiresAt).getTime();
  if (expiresMs <= nowMs || r.sessionState === 'expired') {
    return {
      valid: false,
      classification: 'expired',
      error: `Session expired at ${r.expiresAt}.`,
    };
  }

  const normalized: OfflineSessionRecord = {
    uid: r.uid,
    user: r.user,
    sessionState: r.sessionState || 'online_authenticated',
    authenticatedAt: r.authenticatedAt || new Date(nowMs).toISOString(),
    lastActiveAt: r.lastActiveAt || new Date(nowMs).toISOString(),
    expiresAt: r.expiresAt,
    schemaVersion: r.schemaVersion || OFFLINE_SESSION_SCHEMA_VERSION,
  };

  return {
    valid: true,
    classification: 'valid',
    normalized,
  };
}

/**
 * Validates the structural and logical integrity of a ReplayCoordinationLease.
 */
export function validateReplayLeaseIntegrity(
  record: unknown,
  _nowMs: number = Date.now()
): IntegrityValidationResult<ReplayCoordinationLease> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'Replay lease record must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  if (r.key !== COORDINATION_LEASE_KEY) {
    return {
      valid: false,
      classification: 'invalid_identifier',
      error: `Invalid lease key: '${r.key}'. Expected '${COORDINATION_LEASE_KEY}'.`,
    };
  }

  if (!r.tabId || typeof r.tabId !== 'string' || r.tabId.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Lease tabId is required.',
    };
  }

  if (!r.expiresAt || isNaN(new Date(r.expiresAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Lease expiresAt '${r.expiresAt}' is not a valid ISO date.`,
    };
  }

  // Check impossible timestamp (e.g., year < 2020)
  const expYear = new Date(r.expiresAt).getFullYear();
  if (expYear < 2020) {
    return {
      valid: false,
      classification: 'inconsistent_state',
      error: `Lease expiresAt '${r.expiresAt}' is impossible (year < 2020).`,
    };
  }

  if (r.schemaVersion !== undefined && (typeof r.schemaVersion !== 'number' || r.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
    return {
      valid: false,
      classification: 'invalid_schema_version',
      error: `Lease schemaVersion '${r.schemaVersion}' exceeds supported versions.`,
    };
  }

  return {
    valid: true,
    classification: 'valid',
    normalized: r as ReplayCoordinationLease,
  };
}

/**
 * Validates the structural and logical integrity of an OfflineNotificationRecord.
 */
export function validateNotificationIntegrity(
  record: unknown
): IntegrityValidationResult<OfflineNotificationRecord> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      valid: false,
      classification: 'malformed',
      error: 'Notification record must be a non-null object.',
    };
  }

  const r = record as Record<string, any>;

  // Check forbidden credentials
  const secretsAudit = auditRecordForForbiddenCredentials(r);
  if (secretsAudit.containsSecrets) {
    return {
      valid: false,
      classification: 'contains_forbidden_credentials',
      error: `Notification contains forbidden credential keys: ${secretsAudit.forbiddenKeys.join(', ')}`,
    };
  }

  if (!r.notificationId || typeof r.notificationId !== 'string' || r.notificationId.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Notification notificationId is required.',
    };
  }

  // User partition check (orphaned if missing)
  if (!r.userId || typeof r.userId !== 'string' || r.userId.trim() === '') {
    return {
      valid: false,
      classification: 'orphaned',
      error: 'Notification is missing its userId partition.',
    };
  }

  if (!r.title || typeof r.title !== 'string' || r.title.trim() === '') {
    return {
      valid: false,
      classification: 'missing_required_field',
      error: 'Notification title is required.',
    };
  }

  if (!r.createdAt || isNaN(new Date(r.createdAt).getTime())) {
    return {
      valid: false,
      classification: 'invalid_timestamp',
      error: `Notification createdAt '${r.createdAt}' is not a valid ISO date.`,
    };
  }

  if (r.schemaVersion !== undefined && (typeof r.schemaVersion !== 'number' || r.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
    return {
      valid: false,
      classification: 'invalid_schema_version',
      error: `Notification schemaVersion '${r.schemaVersion}' exceeds supported versions.`,
    };
  }

  const normalized: OfflineNotificationRecord = {
    notificationId: r.notificationId,
    userId: r.userId,
    title: r.title,
    message: r.message || '',
    type: r.type || 'general',
    priority: r.priority || 'medium',
    isRead: Boolean(r.isRead),
    readAt: r.readAt,
    link: r.link,
    reportId: r.reportId,
    certificateId: r.certificateId,
    announcementId: r.announcementId,
    inventoryId: r.inventoryId,
    icon: r.icon,
    createdBy: r.createdBy,
    targetJurisdiction: r.targetJurisdiction,
    purok: r.purok,
    metadata: r.metadata,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    isDeleted: Boolean(r.isDeleted),
    deletedAt: r.deletedAt,
    syncState: r.syncState || 'synced',
    schemaVersion: r.schemaVersion || NOTIFICATION_SCHEMA_VERSION,
  };

  return {
    valid: true,
    classification: 'valid',
    normalized,
  };
}



