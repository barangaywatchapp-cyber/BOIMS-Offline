import { useEffect, useState } from 'react';
import { offlineBootstrap } from './bootstrap';
import { OfflineBootstrapResult } from './bootstrap';

interface OfflineBootstrapState {
  isInitializing: boolean;
  result: OfflineBootstrapResult | null;
}

export function useOfflineBootstrap(): OfflineBootstrapState {
  const [state, setState] = useState<OfflineBootstrapState>({
    isInitializing: true,
    result: null,
  });

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const result = await offlineBootstrap.initialize();

        if (!cancelled) {
          setState({
            isInitializing: false,
            result,
          });
        }
      } catch (error) {
        console.error('[OfflineBootstrap] Initialization failed:', error);

        if (!cancelled) {
          setState({
            isInitializing: false,
            result: {
              available: false,
              recovered: [],
              recoveredCount: 0,
              failedCount: 1,
            },
          });
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}