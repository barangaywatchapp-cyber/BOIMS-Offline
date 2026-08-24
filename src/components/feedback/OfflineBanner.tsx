/**
 * Feedback Component: OfflineBanner
 * Displays critical operational alerts, offline mode status, and pending synchronization queue badge
 */

import React, { useEffect, useState } from 'react';
import { useOffline } from '../../contexts/OfflineContext';
import { useAuth } from '../../contexts/AuthContext';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOnline, pendingCount, failedCount, dlqCount, isSyncing, triggerSync } = useOffline();
  const { user, hasActiveDispatcher } = useAuth();
  const [hasDispatcherOnDuty, setHasDispatcherOnDuty] = useState<boolean>(true);

  const isFieldResponder =
    user?.role === 'purokOfficial' &&
    user?.dutyStatus === 'onDuty' &&
    user?.dutyMode === 'responder';

  useEffect(() => {
    let isMounted = true;
    const checkDispatcher = async () => {
      if (isFieldResponder) {
        try {
          const activeExists = await hasActiveDispatcher();
          if (isMounted) setHasDispatcherOnDuty(activeExists);
        } catch {
          if (isMounted) setHasDispatcherOnDuty(true);
        }
      } else {
        if (isMounted) setHasDispatcherOnDuty(true);
      }
    };

    checkDispatcher();
    const interval = setInterval(checkDispatcher, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.uid, user?.role, isFieldResponder, hasActiveDispatcher]);

  const showNoDispatcherAlert = isFieldResponder && !hasDispatcherOnDuty;

  // Priority 1: Critical Operational Alerts
  // Priority 2: Warning Alerts / Offline / Sync Attention / DLQ
  if (!showNoDispatcherAlert && isOnline && pendingCount === 0 && failedCount === 0 && dlqCount === 0) {
    return null;
  }

  return (
    <div
      className={`w-full px-4 py-2.5 text-xs font-semibold text-white flex flex-wrap items-center justify-between gap-3 shadow-md transition-colors ${
        showNoDispatcherAlert
          ? 'bg-red-900 border-b border-red-800'
          : !isOnline
          ? 'bg-slate-800 border-b border-slate-700'
          : dlqCount > 0 || failedCount > 0
          ? 'bg-amber-900 border-b border-amber-800'
          : 'bg-blue-800 border-b border-blue-700'
      }`}
    >
      <div className="flex items-center gap-2">
        {showNoDispatcherAlert ? (
          <>
            <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 animate-pulse" />
            <span>
              <strong>🚨 NO ACTIVE DISPATCHER ON DUTY:</strong> No Dispatcher is currently on duty. Pending reports cannot be dispatched until an active Dispatcher becomes available.
            </span>
          </>
        ) : !isOnline ? (
          <>
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>
              <strong>Offline Mode:</strong> Changes are saved locally and queued for automatic synchronization when connected.
            </span>
          </>
        ) : dlqCount > 0 ? (
          <>
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Dead Letter Queue Alert:</strong> {dlqCount} change(s) reached max retries or permanent rejection and are quarantined.
            </span>
          </>
        ) : failedCount > 0 ? (
          <>
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Sync Attention Needed:</strong> {failedCount} item(s) failed to sync. Review sync log or retry.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Network Restored:</strong> {pendingCount} item(s) queued for synchronization.
            </span>
          </>
        )}
      </div>

      {(pendingCount > 0 || dlqCount > 0) && (
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-bold">
              {pendingCount} Pending
            </span>
          )}
          {dlqCount > 0 && (
            <span className="bg-red-500/80 px-2 py-0.5 rounded-full text-[11px] font-bold">
              {dlqCount} Quarantined
            </span>
          )}
          {isOnline && pendingCount > 0 && (
            <button
              onClick={triggerSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-slate-900 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

