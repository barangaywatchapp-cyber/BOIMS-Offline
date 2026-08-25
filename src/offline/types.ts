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


