/**
 * Custom Hook: useSyncQueue
 * Connects components to the SyncService to track pending offline changes
 */

import { useState, useEffect, useCallback } from 'react';
import { syncService } from '../services/SyncService';
import { SyncQueueItem, User } from '../types';
import { DeadLetterItem, DLQStats } from '../offline/types';

export function useSyncQueue() {
  const [queue, setQueue] = useState<SyncQueueItem[]>(syncService.getQueue());
  const [dlqItems, setDlqItems] = useState<DeadLetterItem[]>([]);
  const [dlqStats, setDlqStats] = useState<DLQStats | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshDLQ = useCallback(async () => {
    try {
      const items = await syncService.getDLQ();
      const stats = await syncService.getDLQStats();
      setDlqItems(items);
      setDlqStats(stats);
    } catch {
      // safe fallback
    }
  }, []);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
      refreshDLQ();
    });
    refreshDLQ();
    return () => unsubscribe();
  }, [refreshDLQ]);

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncService.processQueue();
      await refreshDLQ();
      return res;
    } finally {
      setIsSyncing(false);
    }
  };

  const clearQueue = () => {
    syncService.clearQueue();
  };

  const removeItem = (queueId: string) => {
    syncService.removeItem(queueId);
  };

  const retryDLQItem = async (dlqId: string, contextUser?: User | null) => {
    const success = await syncService.retryDLQItem(dlqId, contextUser);
    await refreshDLQ();
    return success;
  };

  const deleteDLQItem = async (dlqId: string) => {
    await syncService.deleteDLQItem(dlqId);
    await refreshDLQ();
  };

  const clearDLQ = async () => {
    await syncService.clearDLQ();
    await refreshDLQ();
  };

  return {
    queue,
    pendingCount: queue.filter((item) => item.status === 'pending' || item.status === 'syncing').length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
    dlqItems,
    dlqStats,
    dlqCount: dlqItems.length,
    isSyncing,
    triggerSync,
    clearQueue,
    removeItem,
    retryDLQItem,
    deleteDLQItem,
    clearDLQ,
    refreshDLQ,
  };
}
