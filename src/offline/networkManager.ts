/**
 * BOIMS Offline Architecture
 * Network State Manager & Application-Level Offline Simulator
 *
 * Implements the formula:
 * effectiveOffline = simulatedOffline || actualBrowserOffline
 * effectiveOnline  = !simulatedOffline && actualBrowserOnline
 *
 * Guarantees:
 * - Persistent across page reloads and tab navigations via localStorage.
 * - Reactive cross-tab and cross-component updates via CustomEvent and storage events.
 * - Central authoritative source for all synchronization and service offline decisions.
 * - Zero interference with Firebase Auth or session credentials.
 */

import { db } from '../firebase/config';
import { disableNetwork, enableNetwork } from 'firebase/firestore';

const SIMULATED_OFFLINE_KEY = 'boims_simulated_offline';
const NETWORK_CHANGE_EVENT = 'boims:network-status-changed';

export interface NetworkStatus {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  actualBrowserOnline: boolean;
}

type NetworkListener = (status: NetworkStatus) => void;

class NetworkManager {
  private listeners: Set<NetworkListener> = new Set();
  private simulatedOffline: boolean = false;
  private initPromise: Promise<void>;

  constructor() {
    this.simulatedOffline = this.readStoredSimulationState();
    if (this.simulatedOffline && db) {
      this.initPromise = disableNetwork(db)
        .then(() => {
          console.info('[NetworkManager] Startup: Firestore transport isolated via disableNetwork(db).');
        })
        .catch((err) => {
          console.warn('[NetworkManager] Failed to disable network at startup:', err);
        });
    } else {
      this.initPromise = Promise.resolve();
    }
    this.setupEventListeners();
  }

  /**
   * Startup readiness barrier. Ensures that any persisted simulated-offline
   * transport state has finalized before realtime listeners attach.
   */
  public async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private readStoredSimulationState(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Physical browser online/offline events
    window.addEventListener('online', () => this.handleNetworkEvent('online'));
    window.addEventListener('offline', () => this.handleNetworkEvent('offline'));

    // Cross-tab synchronization via localStorage
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === SIMULATED_OFFLINE_KEY) {
        const nextState = e.newValue === 'true';
        if (nextState !== this.simulatedOffline) {
          void this.setSimulatedOffline(nextState);
        }
      }
    });

    // Same-tab custom event
    window.addEventListener(NETWORK_CHANGE_EVENT, (e: any) => {
      if (e.detail && typeof e.detail.isSimulatedOffline === 'boolean') {
        const nextState = e.detail.isSimulatedOffline;
        if (nextState !== this.simulatedOffline) {
          void this.setSimulatedOffline(nextState);
        }
      }
    });
  }

  private handleNetworkEvent(type: 'online' | 'offline'): void {
    if (type === 'online') {
      if (this.simulatedOffline && db) {
        // Enforce isolation even if physical network returns
        void disableNetwork(db).catch((err) => console.warn('[NetworkManager] disableNetwork error on online event:', err));
      } else if (!this.simulatedOffline && db) {
        void enableNetwork(db).catch((err) => console.warn('[NetworkManager] enableNetwork error on online event:', err));
      }
    }
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getNetworkStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('[NetworkManager] Error in network listener:', err);
      }
    });
  }

  /**
   * Returns true if the browser has actual physical internet connectivity.
   */
  public getActualBrowserOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Returns true if application-level simulated offline mode is currently ON.
   */
  public isSimulatedOffline(): boolean {
    return this.simulatedOffline;
  }

  /**
   * Returns the authoritative effective online state.
   * effectiveOnline = !simulatedOffline && actualBrowserOnline
   */
  public isAppOnline(): boolean {
    return !this.simulatedOffline && this.getActualBrowserOnline();
  }

  /**
   * Returns the complete network status snapshot.
   */
  public getNetworkStatus(): NetworkStatus {
    const actualBrowserOnline = this.getActualBrowserOnline();
    const isSimulated = this.simulatedOffline;
    const isOnline = !isSimulated && actualBrowserOnline;

    return {
      isOnline,
      isSimulatedOffline: isSimulated,
      actualBrowserOnline,
    };
  }

  /**
   * Sets the application-level simulated offline state.
   * Persists to localStorage, isolates or restores Firestore transport,
   * and notifies all components and services.
   */
  public async setSimulatedOffline(simulated: boolean): Promise<void> {
    this.simulatedOffline = simulated;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SIMULATED_OFFLINE_KEY, simulated ? 'true' : 'false');
      } catch (err) {
        console.warn('[NetworkManager] Failed to persist simulated offline state to localStorage:', err);
      }
    }

    // PRIMARY SIMULATION MECHANISM: Transport-level isolation via Firebase Firestore SDK
    try {
      if (simulated && db) {
        await disableNetwork(db);
        console.info('[NetworkManager] Firestore transport isolated: disableNetwork(db) complete.');
      } else if (!simulated && db && this.getActualBrowserOnline()) {
        await enableNetwork(db);
        console.info('[NetworkManager] Firestore transport restored: enableNetwork(db) complete.');
      }
    } catch (netErr) {
      console.warn('[NetworkManager] Error toggling Firestore network transport:', netErr);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(NETWORK_CHANGE_EVENT, {
          detail: {
            isSimulatedOffline: simulated,
            isOnline: this.isAppOnline(),
          },
        })
      );
    }

    this.notifyListeners();
  }

  /**
   * Toggles the simulated offline mode.
   */
  public toggleSimulatedOffline(): boolean {
    const nextState = !this.simulatedOffline;
    void this.setSimulatedOffline(nextState);
    return nextState;
  }

  /**
   * Subscribes to network status changes (both real and simulated).
   */
  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Initial call with current status
    listener(this.getNetworkStatus());

    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const networkManager = new NetworkManager();

/**
 * Convenience helper to determine if the application is online
 * taking into account both physical connectivity and simulated offline mode.
 */
export function isAppOnline(): boolean {
  return networkManager.isAppOnline();
}
