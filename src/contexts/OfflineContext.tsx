/**
 * Offline Context
 * Provides global online/offline status, queue count, and triggerSync function
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { SyncQueueItem } from '../types';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  queue: SyncQueueItem[];
  isSyncing: boolean;
  triggerSync: () => Promise<{ processed: number; failed: number }>;
  clearQueue: () => void;
  removeItem: (queueId: string) => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const { queue, pendingCount, failedCount, isSyncing, triggerSync, clearQueue, removeItem } =
    useSyncQueue();

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        pendingCount,
        failedCount,
        queue,
        isSyncing,
        triggerSync,
        clearQueue,
        removeItem,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextType {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
