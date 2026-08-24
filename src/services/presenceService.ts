/**
 * PresenceService
 * Dedicated service for managing real-time presence state (Online, Idle, Offline)
 * for Barangay Officials, independent of Duty Mode.
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserPresence, PresenceStatus, PresenceHealth, UserRole } from '../types';

export const OFFICIAL_ROLES: UserRole[] = [
  'purokOfficial',
  'verifier',
  'secretary',
  'admin',
  'chairman',
  'superAdmin',
];

export class PresenceService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentHeartbeatUserId: string | null = null;
  private currentRole: UserRole | null = null;

  // Internal Heartbeat State Exposure for future Offline Detection
  private heartbeatStatus: 'active' | 'paused' | 'stopped' = 'stopped';
  private lastSuccessfulHeartbeat: string | null = null;

  // Presence Health Evaluation
  private readonly HEARTBEAT_TIMEOUT_MS: number = 9 * 60 * 1000; // 9 minutes (3 missed cycles)
  private isCleaningUpDead: boolean = false;

  // Idle & Activity Detection
  private currentStatus: PresenceStatus = 'offline';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onPresenceChangeCallback: ((presence: UserPresence) => void) | null = null;
  private activityListenersAttached: boolean = false;
  private lastActivityTimestamp: number = 0;
  private readonly IDLE_TIMEOUT_MS: number = 2 * 60 * 1000; // 2 minutes

  /**
   * Checks whether a role is a Barangay Official role
   */
  public isOfficial(role?: UserRole | null): boolean {
    if (!role) return false;
    return OFFICIAL_ROLES.includes(role);
  }

  /**
   * Exposes current internal heartbeat state for future Offline Detection modules
   */
  public getHeartbeatState(): {
    status: 'active' | 'paused' | 'stopped';
    lastSuccessfulHeartbeat: string | null;
  } {
    return {
      status: this.heartbeatStatus,
      lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat,
    };
  }

  /**
   * Evaluates and returns the overall connection health of an official's presence
   */
  public getPresenceHealth(userId?: string, presence?: UserPresence | null): PresenceHealth {
    if (presence) {
      return this.evaluatePresenceHealth(presence);
    }

    const targetUserId = userId || this.currentHeartbeatUserId;

    if (!targetUserId || !this.currentHeartbeatUserId || targetUserId !== this.currentHeartbeatUserId) {
      if (this.currentStatus === 'offline' && this.heartbeatStatus === 'stopped') {
        return 'dead';
      }
    }

    if (!this.currentHeartbeatUserId || this.currentStatus === 'offline') {
      return 'dead';
    }

    const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const now = Date.now();
    const lastHeartbeatMs = this.lastSuccessfulHeartbeat
      ? new Date(this.lastSuccessfulHeartbeat).getTime()
      : null;

    const isHeartbeatExpired = lastHeartbeatMs !== null
      ? (now - lastHeartbeatMs > this.HEARTBEAT_TIMEOUT_MS)
      : false;

    // DEAD conditions
    if (this.heartbeatStatus === 'stopped' || isHeartbeatExpired) {
      this.triggerDeadCleanup();
      return 'dead';
    }

    // WARNING conditions
    if (
      this.heartbeatStatus === 'paused' ||
      !isBrowserOnline ||
      this.currentStatus === 'idle'
    ) {
      return 'warning';
    }

    // HEALTHY conditions
    if (
      this.heartbeatStatus === 'active' &&
      isBrowserOnline &&
      this.currentStatus === 'online'
    ) {
      return 'healthy';
    }

    return 'warning';
  }

  public evaluatePresenceHealth(presence?: UserPresence | null): PresenceHealth {
    if (!presence || presence.status === 'offline' || !presence.lastSeen) {
      return 'dead';
    }

    const now = Date.now();
    const lastSeenMs = new Date(presence.lastSeen).getTime();
    if (isNaN(lastSeenMs) || now - lastSeenMs > this.HEARTBEAT_TIMEOUT_MS) {
      return 'dead';
    }

    if (presence.status === 'idle') {
      return 'warning';
    }

    if (presence.status === 'online') {
      return 'healthy';
    }

    return 'warning';
  }

  public isHealthy(userId?: string): boolean {
    return this.getPresenceHealth(userId) === 'healthy';
  }

  public isWarning(userId?: string): boolean {
    return this.getPresenceHealth(userId) === 'warning';
  }

  public isDead(userId?: string): boolean {
    return this.getPresenceHealth(userId) === 'dead';
  }

  private async triggerDeadCleanup(): Promise<void> {
    if (this.isCleaningUpDead) return;
    this.isCleaningUpDead = true;

    if (this.currentHeartbeatUserId) {
      const activeUserId = this.currentHeartbeatUserId;
      const activeRole = this.currentRole;

      this.currentStatus = 'offline';
      this.stopHeartbeat();
      const presence = await this.updatePresence(activeUserId, 'offline', activeRole);
      if (presence && this.onPresenceChangeCallback) {
        this.onPresenceChangeCallback(presence);
      }
    } else {
      this.stopHeartbeat();
    }

    this.isCleaningUpDead = false;
  }

  /**
   * Update presence status in Firestore for an official user
   */
  async updatePresence(userId: string, status: PresenceStatus, role?: UserRole | null): Promise<UserPresence | null> {
    if (!userId || !this.isOfficial(role)) {
      return null;
    }

    this.currentStatus = status;
    const now = new Date().toISOString();
    const presenceData: UserPresence = {
      status,
      lastSeen: now,
    };

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        presence: presenceData,
        updatedAt: now,
      });
      return presenceData;
    } catch (error) {
      console.warn(`[PresenceService] Could not update presence (${status}) to Firestore for ${userId}:`, error);
      return presenceData;
    }
  }

  /**
   * Set presence status to "online"
   */
  async setOnline(userId: string, role?: UserRole | null): Promise<UserPresence | null> {
    this.currentStatus = 'online';
    return this.updatePresence(userId, 'online', role);
  }

  /**
   * Set presence status to "offline"
   */
  async setOffline(userId: string, role?: UserRole | null): Promise<UserPresence | null> {
    this.currentStatus = 'offline';
    this.stopHeartbeat();
    return this.updatePresence(userId, 'offline', role);
  }

  /**
   * Starts heartbeat interval (every 3 minutes) for an official user
   */
  public startHeartbeat(
    userId: string,
    role?: UserRole | null,
    onPresenceChange?: (presence: UserPresence) => void
  ): void {
    if (!userId || !this.isOfficial(role)) {
      this.stopHeartbeat();
      return;
    }

    if (onPresenceChange) {
      this.onPresenceChangeCallback = onPresenceChange;
    }

    // Avoid duplicate intervals for the same user
    if (this.heartbeatTimer && this.currentHeartbeatUserId === userId) {
      return;
    }

    // Stop existing timer and listeners if switching users or restarting
    this.stopHeartbeat();

    this.currentHeartbeatUserId = userId;
    this.currentRole = role ?? null;
    this.currentStatus = 'online';
    this.heartbeatStatus = 'active';
    this.lastSuccessfulHeartbeat = new Date().toISOString();

    // Start activity monitoring & idle timer
    this.startActivityMonitoring();

    this.heartbeatTimer = setInterval(async () => {
      const health = this.getPresenceHealth();
      if (health === 'dead') {
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.heartbeatStatus = 'paused';
        return;
      }

      if (!this.currentHeartbeatUserId) return;

      const presence = await this.updatePresence(
        this.currentHeartbeatUserId,
        this.currentStatus,
        this.currentRole
      );
      if (presence) {
        this.heartbeatStatus = 'active';
        this.lastSuccessfulHeartbeat = presence.lastSeen;
        if (this.onPresenceChangeCallback) {
          this.onPresenceChangeCallback(presence);
        }
      }
    }, 180000);
  }

  /**
   * Stops heartbeat interval & activity monitoring
   */
  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.stopActivityMonitoring();
    this.heartbeatStatus = 'stopped';
    this.currentHeartbeatUserId = null;
    this.currentRole = null;
  }

  /**
   * Activity & Idle Detection
   */
  private startActivityMonitoring(): void {
    this.stopActivityMonitoring();

    if (typeof window === 'undefined') return;

    const events = ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => {
      window.addEventListener(evt, this.handleActivityEvent, { passive: true });
    });

    this.activityListenersAttached = true;
    this.resetIdleTimer();
  }

  private stopActivityMonitoring(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.activityListenersAttached && typeof window !== 'undefined') {
      const events = ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'];
      events.forEach((evt) => {
        window.removeEventListener(evt, this.handleActivityEvent);
      });
      this.activityListenersAttached = false;
    }
  }

  private handleActivityEvent = (): void => {
    const now = Date.now();
    // Throttle activity processing to at most once per 1 second unless currently idle
    if (this.currentStatus !== 'idle' && now - this.lastActivityTimestamp < 1000) {
      return;
    }
    this.lastActivityTimestamp = now;

    if (this.currentStatus === 'idle') {
      this.currentStatus = 'online';
      if (this.onPresenceChangeCallback) {
        this.onPresenceChangeCallback({
          status: 'online',
          lastSeen: new Date().toISOString(),
        });
      }
    }

    this.resetIdleTimer();
  };

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.transitionToIdle();
    }, this.IDLE_TIMEOUT_MS);
  }

  private transitionToIdle(): void {
    if (this.currentStatus === 'online' && this.currentHeartbeatUserId) {
      this.currentStatus = 'idle';
      if (this.onPresenceChangeCallback) {
        this.onPresenceChangeCallback({
          status: 'idle',
          lastSeen: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Sets up browser lifecycle listeners to manage presence transitions automatically.
   * Handles pagehide, beforeunload, online, offline, and visibilitychange.
   */
  public setupLifecycleListeners(
    userId: string,
    role?: UserRole | null,
    onPresenceChange?: (presence: UserPresence) => void
  ): () => void {
    if (!userId || !this.isOfficial(role)) {
      return () => {};
    }

    const handleUnloadOrHide = () => {
      this.stopHeartbeat();
      this.setOffline(userId, role);
    };

    const handleOffline = async () => {
      this.stopHeartbeat();
      const presence = await this.setOffline(userId, role);
      if (presence && onPresenceChange) {
        onPresenceChange(presence);
      }
    };

    const handleOnline = async () => {
      const presence = await this.setOnline(userId, role);
      if (presence && onPresenceChange) {
        onPresenceChange(presence);
      }
      this.startHeartbeat(userId, role, onPresenceChange);
    };

    const handleVisibilityChange = () => {
      // Prepare lifecycle handling when hidden, but do NOT automatically mark offline.
    };

    window.addEventListener('beforeunload', handleUnloadOrHide);
    window.addEventListener('pagehide', handleUnloadOrHide);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnloadOrHide);
      window.removeEventListener('pagehide', handleUnloadOrHide);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }
}

export const presenceService = new PresenceService();

export function formatPresenceDisplay(status?: PresenceStatus): string {
  switch (status) {
    case 'online':
      return '🟢 Online';
    case 'idle':
      return '🟡 Idle';
    case 'offline':
    default:
      return '⚫ Offline';
  }
}

export function getPresenceRank(status?: PresenceStatus): number {
  switch (status) {
    case 'online':
      return 1;
    case 'idle':
      return 2;
    case 'offline':
    default:
      return 3;
  }
}

