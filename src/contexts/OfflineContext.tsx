/**
 * Offline Context
 * Provides global online/offline status, queue count, and triggerSync function
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { useOfflineBootstrap } from '../offline/useOfflineBootstrap';
import { OfflineBootstrapResult } from '../offline/bootstrap';
import { SyncQueueItem, User } from '../types';
import { DeadLetterItem, DLQStats } from '../offline/types';

export interface OfflineContextType {
  isOnline: boolean;
  isInitializing: boolean;
  bootstrapResult: OfflineBootstrapResult | null;
  storageAvailable: boolean;
  recoveredCount: number;
  pendingCount: number;
  failedCount: number;
  queue: SyncQueueItem[];
  dlqItems: DeadLetterItem[];
  dlqStats: DLQStats | null;
  dlqCount: number;
  isSyncing: boolean;
  triggerSync: () => Promise<{ processed: number; failed: number }>;
  clearQueue: () => void;
  removeItem: (queueId: string) => void;
  retryDLQItem: (dlqId: string, contextUser?: User | null) => Promise<boolean>;
  deleteDLQItem: (dlqId: string) => Promise<void>;
  clearDLQ: () => Promise<void>;
  refreshDLQ: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const { isInitializing, result: bootstrapResult } = useOfflineBootstrap();
  const {
    queue,
    pendingCount,
    failedCount,
    dlqItems,
    dlqStats,
    dlqCount,
    isSyncing,
    triggerSync,
    clearQueue,
    removeItem,
    retryDLQItem,
    deleteDLQItem,
    clearDLQ,
    refreshDLQ,
  } = useSyncQueue();

  const storageAvailable = bootstrapResult?.available ?? true;
  const recoveredCount = bootstrapResult?.recoveredCount ?? 0;

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isInitializing,
        bootstrapResult,
        storageAvailable,
        recoveredCount,
        pendingCount,
        failedCount,
        queue,
        dlqItems,
        dlqStats,
        dlqCount,
        isSyncing,
        triggerSync,
        clearQueue,
        removeItem,
        retryDLQItem,
        deleteDLQItem,
        clearDLQ,
        refreshDLQ,
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
