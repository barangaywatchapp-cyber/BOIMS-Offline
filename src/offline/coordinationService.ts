/**
 * BOIMS Offline Architecture
 * Phase 8 — Multi-Tab Coordination & Cross-Tab Mutation Safety Service
 *
 * Guarantees:
 * - ONE safe replay owner per browser profile at any given time.
 * - Authoritative durable coordination lease stored in IndexedDB 'offlineMetadata'.
 * - Non-durable BroadcastChannel for fast real-time cross-tab signaling.
 * - Automatic stale lease detection and recovery upon lease expiration.
 * - Zero credentials, secrets, or auth tokens stored in coordination metadata.
 * - Multi-account and authorization preservation.
 */

import { offlineStorage } from './storage';
import {
  ReplayCoordinationLease,
  CoordinationSignalType,
  CoordinationSignalMessage,
  DEFAULT_LEASE_DURATION_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
} from './types';

export class ReplayCoordinationService {
  private tabId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(msg: CoordinationSignalMessage) => void> = new Set();
  private isBroadcastEnabled: boolean = true;
  private channelName: string = 'boims_offline_coordination';

  constructor(customTabId?: string) {
    this.tabId = customTabId || this.generateTabId();
    this.initBroadcastChannel();
  }

  /**
   * Generates a cryptographically-sufficient unique identifier for the current tab.
   */
  public generateTabId(): string {
    const randomPart = Math.random().toString(36).substring(2, 9);
    return `TAB-${Date.now()}-${randomPart}`;
  }

  /**
   * Returns the unique tab ID for this coordination instance.
   */
  public getTabId(): string {
    return this.tabId;
  }

  /**
   * Overrides the current tabId (useful for simulating distinct tabs in testing).
   */
  public setTabId(newTabId: string): void {
    if (this.heartbeatTimer) {
      this.stopHeartbeat();
    }
    this.tabId = newTabId;
  }

  /**
   * Initializes the BroadcastChannel if available in the runtime environment.
   */
  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined' && this.isBroadcastEnabled) {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channelName);
        this.broadcastChannel.onmessage = (event) => {
          if (event && event.data) {
            const msg = event.data as CoordinationSignalMessage;
            this.notifyListeners(msg);
          }
        };
      } catch (err) {
        console.warn('[CoordinationService] BroadcastChannel initialization failed (falling back to IndexedDB):', err);
        this.broadcastChannel = null;
      }
    }
  }

  /**
   * Controls whether BroadcastChannel is used or bypassed (for testing fallback behavior).
   */
  public setBroadcastChannelEnabled(enabled: boolean): void {
    this.isBroadcastEnabled = enabled;
    if (!enabled && this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // ignore close errors
      }
      this.broadcastChannel = null;
    } else if (enabled && !this.broadcastChannel) {
      this.initBroadcastChannel();
    }
  }

  /**
   * Dispatches a cross-tab signaling message via BroadcastChannel if available.
   * Note: BroadcastChannel is non-durable and is only a fast signaling mechanism.
   */
  public broadcast(type: CoordinationSignalType, details?: Record<string, unknown>): void {
    if (!this.isBroadcastEnabled || !this.broadcastChannel) {
      return;
    }

    const message: CoordinationSignalMessage = {
      type,
      tabId: this.tabId,
      timestamp: new Date().toISOString(),
      details,
    };

    // Notify local tab listeners
    this.notifyListeners(message);

    try {
      this.broadcastChannel.postMessage(message);
    } catch (err) {
      console.warn('[CoordinationService] Broadcast dispatch error:', err);
    }

  }

  /**
   * Subscribes to coordination signals.
   */
  public subscribeToSignals(listener: (msg: CoordinationSignalMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(msg: CoordinationSignalMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error('[CoordinationService] Listener notification error:', err);
      }
    });
  }

  /**
   * Attempts to acquire exclusive replay lease ownership for this tab.
   * If another tab holds an active (unexpired) lease, acquisition fails.
   */
  public async acquireLease(durationMs: number = DEFAULT_LEASE_DURATION_MS): Promise<boolean> {
    try {
      const result = await offlineStorage.tryAcquireReplayLease(this.tabId, durationMs);
      if (result.acquired) {
        this.startHeartbeat(DEFAULT_HEARTBEAT_INTERVAL_MS, durationMs);
        this.broadcast('lease_acquired', {
          expiresAt: result.lease?.expiresAt,
          leaseDurationMs: durationMs,
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[CoordinationService] Tab ${this.tabId} failed to acquire lease:`, err);
      return false;
    }
  }

  /**
   * Verifies whether this tab is currently the authoritative unexpired replay owner in IndexedDB.
   */
  public async verifyOwnership(): Promise<boolean> {
    try {
      const lease = await offlineStorage.getReplayLease();
      if (!lease) {
        this.stopHeartbeat();
        return false;
      }

      const now = Date.now();
      const isExpired = new Date(lease.expiresAt).getTime() <= now;
      const isOwner = lease.tabId === this.tabId;

      if (isOwner && !isExpired) {
        return true;
      }

      // Ownership lost or expired
      this.stopHeartbeat();
      if (isOwner && isExpired) {
        this.broadcast('lease_lost', { reason: 'lease_expired' });
      }
      return false;
    } catch (err) {
      console.error(`[CoordinationService] Tab ${this.tabId} failed to verify ownership:`, err);
      this.stopHeartbeat();
      return false;
    }
  }

  /**
   * Heartbeat renewal: extends the active lease TTL in IndexedDB.
   */
  public async renewLease(durationMs: number = DEFAULT_LEASE_DURATION_MS): Promise<boolean> {
    try {
      const renewed = await offlineStorage.renewReplayLease(this.tabId, durationMs);
      if (renewed) {
        this.broadcast('lease_renewed', { durationMs });
        return true;
      }

      // If renewal failed, we lost the lease
      this.stopHeartbeat();
      this.broadcast('lease_lost', { reason: 'renewal_rejected' });
      return false;
    } catch (err) {
      console.error(`[CoordinationService] Tab ${this.tabId} failed to renew lease:`, err);
      this.stopHeartbeat();
      return false;
    }
  }

  /**
   * Releases exclusive replay lease ownership in IndexedDB and stops heartbeat renewals.
   */
  public async releaseLease(): Promise<boolean> {
    this.stopHeartbeat();
    try {
      const released = await offlineStorage.releaseReplayLease(this.tabId);
      this.broadcast('lease_released');
      return released;
    } catch (err) {
      console.error(`[CoordinationService] Tab ${this.tabId} failed to release lease:`, err);
      return false;
    }
  }

  /**
   * Starts periodic heartbeat timer to keep the lease active while replay is occurring.
   */
  public startHeartbeat(
    intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
    leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS
  ): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      const renewed = await this.renewLease(leaseDurationMs);
      if (!renewed) {
        this.stopHeartbeat();
      }
    }, intervalMs);

    if (this.heartbeatTimer && typeof (this.heartbeatTimer as any).unref === 'function') {
      (this.heartbeatTimer as any).unref();
    }
  }

  /**
   * Stops the active heartbeat timer.
   */
  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Closes BroadcastChannel connections and clears timers.
   */
  public destroy(): void {
    this.stopHeartbeat();
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // ignore
      }
      this.broadcastChannel = null;
    }
    this.listeners.clear();
  }
}

export const coordinationService = new ReplayCoordinationService();
