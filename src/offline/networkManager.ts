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

  constructor() {
    this.simulatedOffline = this.readStoredSimulationState();
    this.setupEventListeners();
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
    window.addEventListener('online', () => this.handleNetworkEvent());
    window.addEventListener('offline', () => this.handleNetworkEvent());

    // Cross-tab synchronization via localStorage
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === SIMULATED_OFFLINE_KEY) {
        this.simulatedOffline = e.newValue === 'true';
        this.notifyListeners();
      }
    });

    // Same-tab custom event
    window.addEventListener(NETWORK_CHANGE_EVENT, (e: any) => {
      if (e.detail && typeof e.detail.isSimulatedOffline === 'boolean') {
        this.simulatedOffline = e.detail.isSimulatedOffline;
        this.notifyListeners();
      }
    });
  }

  private handleNetworkEvent(): void {
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
   * Persists to localStorage and notifies all components and services.
   */
  public setSimulatedOffline(simulated: boolean): void {
    this.simulatedOffline = simulated;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SIMULATED_OFFLINE_KEY, simulated ? 'true' : 'false');
      } catch (err) {
        console.warn('[NetworkManager] Failed to persist simulated offline state to localStorage:', err);
      }
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
    this.setSimulatedOffline(nextState);
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
