/**
 * Custom Hook: useOnlineStatus
 * Continuously monitors effective network connection taking into account
 * physical connectivity and application-level simulated offline mode.
 */

import { useState, useEffect } from 'react';
import { networkManager, NetworkStatus } from '../offline/networkManager';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => networkManager.isAppOnline());

  useEffect(() => {
    return networkManager.subscribe((status: NetworkStatus) => {
      setIsOnline(status.isOnline);
    });
  }, []);

  return isOnline;
}

