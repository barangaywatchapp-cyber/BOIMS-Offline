/**
 * Custom Hook: useSyncQueue
 * Connects components to the SyncService to track pending offline changes
 */

import { useState, useEffect } from 'react';
import { syncService } from '../services/SyncService';
import { SyncQueueItem } from '../types';

export function useSyncQueue() {
  const [queue, setQueue] = useState<SyncQueueItem[]>(syncService.getQueue());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
    });
    return () => unsubscribe();
  }, []);

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      return await syncService.processQueue();
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

  return {
    queue,
    pendingCount: queue.filter((item) => item.status === 'pending' || item.status === 'syncing').length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
    isSyncing,
    triggerSync,
    clearQueue,
    removeItem,
  };
}
