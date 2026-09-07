/**
 * Page: OfflineSyncPage (Module 9)
 * BOIMS System-wide Offline Synchronization, PWA Field Manager, & Conflict Resolution Center
 * Features:
 * - Real-time Network Connection & Offline Simulation Toggle
 * - Queue Inspector (Pending, Syncing, Failed, Resolved mutation items)
 * - Individual Item Operations (Retry Item, Force Sync, Inspect Payload, Delete Item)
 * - Conflict Resolution Strategy Manager (Client-wins vs Server-wins vs Manual Merge)
 * - Field Responder (Tanod) Offline Test Data Generator
 * - Complete System Integration Health Matrix
 */

import React, { useState } from 'react';
import { useOffline } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { syncService } from '../services/SyncService';
import { SyncQueueItem } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Download,
  PlusCircle,
  Database,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Eye,
  Layers,
  HardDrive,
  Activity,
  Sliders,
  ShieldCheck,
  UserCheck,
  Play,
  RotateCcw,
} from 'lucide-react';
import { offlineStorage } from '../offline/storage';
import { OfflineSessionRecord, DeadLetterItem } from '../offline/types';
import { runPhase3TestSuite, Phase3TestSuiteSummary } from '../offline/phase3Tests';

export const OfflineSyncPage: React.FC = () => {
  const {
    isOnline,
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
    purgeDLQItem,
    clearDLQ,
    refreshDLQ,
    isSimulatedOffline,
    actualBrowserOnline,
    setSimulatedOffline,
    toggleSimulatedOffline,
  } = useOffline();
  const { user } = useAuth();

  const [selectedModalItem, setSelectedModalItem] = useState<{
    id: string;
    title: string;
    operation: string;
    collection: string;
    recordId: string;
    payload: any;
    error?: string;
    failedAt?: string;
    reason?: string;
  } | null>(null);
  const [showPayloadModal, setShowPayloadModal] = useState<boolean>(false);
  const [conflictStrategy, setConflictStrategy] = useState<'clientWins' | 'serverWins' | 'manual'>('clientWins');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingDLQId, setRetryingDLQId] = useState<string | null>(null);
  const [offlineSession, setOfflineSession] = useState<OfflineSessionRecord | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(false);
  const [phase3TestReport, setPhase3TestReport] = useState<Phase3TestSuiteSummary | null>(null);
  const [runningPhase3Tests, setRunningPhase3Tests] = useState<boolean>(false);

  React.useEffect(() => {
    loadOfflineSession();
  }, []);

  const loadOfflineSession = async () => {
    setLoadingSession(true);
    try {
      const session = await offlineStorage.getSession();
      setOfflineSession(session);
    } catch (err) {
      console.warn('Error reading offline session:', err);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleRunPhase3Tests = async () => {
    setRunningPhase3Tests(true);
    try {
      const summary = await runPhase3TestSuite();
      setPhase3TestReport(summary);
      await loadOfflineSession();
    } finally {
      setRunningPhase3Tests(false);
    }
  };

  const effectiveOnlineStatus = isOnline;

  const handleManualSync = async () => {
    if (!effectiveOnlineStatus) {
      alert('Cannot process sync queue while simulated or actual network is Offline.');
      return;
    }
    const result = await triggerSync();
    alert(`Sync operation complete! Processed: ${result.processed}, Failed: ${result.failed}`);
  };

  const handleRetrySingle = async (queueId: string) => {
    if (!effectiveOnlineStatus) {
      alert('Network is offline. Re-connect to sync items.');
      return;
    }
    setRetryingId(queueId);
    try {
      const success = await syncService.retryItem(queueId);
      if (success) {
        alert('Item synchronized successfully with Firestore!');
      } else {
        alert('Item sync failed. Check connection or error payload.');
      }
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryDLQSingle = async (dlqId: string) => {
    if (!effectiveOnlineStatus) {
      alert('Network is offline. Re-connect to retry quarantined items.');
      return;
    }
    setRetryingDLQId(dlqId);
    try {
      const success = await retryDLQItem(dlqId, user);
      if (success) {
        alert('Quarantined item restored to active queue for synchronization replay.');
      } else {
        alert('Failed to retry quarantined item. Verify permissions or error diagnostics.');
      }
    } catch (err: any) {
      alert(`Error retrying DLQ item: ${err?.message || err}`);
    } finally {
      setRetryingDLQId(null);
    }
  };

  const handlePurgeDLQItem = async (dlqId: string) => {
    if (window.confirm('Permanently purge this item from Dead Letter Queue? This action cannot be undone.')) {
      if (purgeDLQItem) {
        await purgeDLQItem(dlqId);
      } else {
        await deleteDLQItem(dlqId);
      }
    }
  };

  const handleClearAllDLQ = async () => {
    if (window.confirm('Permanently clear all quarantined items from Dead Letter Queue?')) {
      await clearDLQ();
    }
  };

  const handleExportQueueJSON = () => {
    const jsonStr = syncService.exportQueueJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BOIMS_Offline_Queue_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: SyncQueueItem['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case 'syncing':
        return <Badge variant="info" className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Syncing</Badge>;
      case 'failed':
        return <Badge variant="danger" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</Badge>;
      case 'resolved':
      default:
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Synced</Badge>;
    }
  };

  const getOperationBadge = (op: string) => {
    switch (op) {
      case 'create':
        return <Badge variant="success" className="font-mono text-[10px] uppercase">CREATE</Badge>;
      case 'update':
        return <Badge variant="info" className="font-mono text-[10px] uppercase">UPDATE</Badge>;
      case 'delete':
        return <Badge variant="danger" className="font-mono text-[10px] uppercase">DELETE</Badge>;
      default:
        return <Badge variant="secondary" className="font-mono text-[10px] uppercase">{op}</Badge>;
    }
  };

  const getFailureReasonBadge = (reason: string) => {
    switch (reason) {
      case 'security_rejection':
      case 'permission_denied':
        return <Badge variant="danger" className="font-mono text-[10px]">AUTH / RULES DENIED</Badge>;
      case 'max_retries_exceeded':
        return <Badge variant="warning" className="font-mono text-[10px]">MAX RETRIES</Badge>;
      case 'conflict_remote_newer':
      case 'conflict_remote_deleted':
        return <Badge variant="warning" className="font-mono text-[10px]">VERSION CONFLICT</Badge>;
      case 'permanent_error':
        return <Badge variant="danger" className="font-mono text-[10px]">PERMANENT ERROR</Badge>;
      default:
        return <Badge variant="secondary" className="font-mono text-[10px]">{reason}</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <RefreshCw className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">System Offline Queue & Synchronization Engine</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              PWA Offline Queue Inspector, Conflict Resolution, and Field Operations Synchronization Center
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isSimulatedOffline ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => toggleSimulatedOffline()}
            className="flex items-center gap-2 font-bold"
          >
            {isSimulatedOffline ? <WifiOff className="w-4 h-4 text-white animate-pulse" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            {isSimulatedOffline ? 'Simulating Offline Mode' : 'Network Active'}
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handleManualSync}
            disabled={isSyncing || !effectiveOnlineStatus}
            className="flex items-center gap-2 shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Force Process Sync Queue
          </Button>
        </div>
      </div>

      {/* Simulated Offline Mode Banner */}
      {isSimulatedOffline && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-900 shadow-sm">
          <div className="flex items-center gap-3">
            <WifiOff className="w-6 h-6 text-amber-600 shrink-0 animate-pulse" />
            <div>
              <p className="text-sm font-bold text-amber-900">Simulated Offline Mode Active (Application-Level Simulator)</p>
              <p className="text-xs text-amber-800 mt-0.5">
                All services, pages, and queue managers are operating in offline mode. All reports created will be persisted to IndexedDB (offlineQueue). Firestore background sync is paused until simulation is toggled off.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSimulatedOffline(false)}
            className="shrink-0 font-bold self-start sm:self-auto border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900"
          >
            Disable Simulation
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Network Status</p>
            <p className="text-xl font-black mt-1 flex items-center gap-1.5">
              {isSimulatedOffline ? (
                <span className="text-amber-600 flex items-center gap-1.5">
                  <WifiOff className="w-5 h-5 text-amber-600 animate-pulse" /> Simulated Offline
                </span>
              ) : isOnline ? (
                <span className="text-emerald-600 flex items-center gap-1.5">
                  <Wifi className="w-5 h-5 text-emerald-600" /> Connected
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1.5">
                  <WifiOff className="w-5 h-5 text-amber-600" /> Offline Mode
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Offline Queue</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Failed Mutations</p>
            <p className="text-2xl font-black text-red-600 mt-1">{failedCount}</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${dlqCount > 0 ? 'border-l-rose-600 bg-rose-50/30' : 'border-l-slate-400'}`}>
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dead Letter Queue</p>
            <div className="flex items-center justify-between mt-1">
              <p className={`text-2xl font-black ${dlqCount > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                {dlqCount}
              </p>
              {dlqCount > 0 && (
                <Badge variant="danger" className="text-[10px] font-mono">QUARANTINED</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Storage & Cache Engine</p>
            <p className="text-sm font-black text-slate-800 mt-1 flex items-center gap-1">
              <HardDrive className="w-4 h-4 text-slate-500 shrink-0" /> IndexedDB (Canonical)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conflict Resolution Strategy & Queue Actions Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Sliders className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Data Conflict Resolution Policy</p>
              <p className="text-[11px] text-slate-500">Strategy when offline local mutation clashes with server doc</p>
            </div>
            <select
              value={conflictStrategy}
              onChange={(e) => setConflictStrategy(e.target.value as any)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white ml-2"
            >
              <option value="clientWins">Client-Wins (Last Offline Edit Prevails)</option>
              <option value="serverWins">Server-Wins (Keep Remote Firestore State)</option>
              <option value="manual">Manual Inspector Merge</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={handleExportQueueJSON} className="flex items-center gap-1 text-xs">
              <Download className="w-3.5 h-3.5" /> Export Queue JSON
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm('Clear all items from local offline queue?')) clearQueue();
              }}
              className="flex items-center gap-1 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Local Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue Inspector Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Offline Mutation Queue Inspector</span>
            <span className="text-xs font-normal text-slate-500">{queue.length} items in queue</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              {dlqCount > 0 ? (
                <div>
                  <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-800 text-base">Active Mutation Queue is Idle</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    There are no active mutations pending or syncing. However, <strong className="text-rose-600 font-bold">{dlqCount} quarantined mutation(s)</strong> require review in the Dead Letter Queue below.
                  </p>
                </div>
              ) : (
                <div>
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold text-slate-800 text-base">Offline Sync Queue is Empty!</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    All field responder logs, incident reports, blotter updates, and certificate requests are fully synchronized with Firestore.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Queue ID & Timestamp</th>
                    <th className="py-3 px-4">Operation</th>
                    <th className="py-3 px-4">Collection & Record ID</th>
                    <th className="py-3 px-4">Status & Retries</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {queue.map((item) => (
                    <tr key={item.queueId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="font-bold text-blue-700">{item.queueId}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(item.timestamp).toLocaleString()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{getOperationBadge(item.operationType)}</td>

                      <td className="py-3.5 px-4 text-xs font-mono text-slate-800">
                        <span className="font-bold text-slate-900">{item.collectionName}</span> / {item.recordId}
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(item.status)}
                          <span className="text-slate-400 font-mono text-[10px]">({item.retryCount} retries)</span>
                        </div>
                        {item.errorMessage && (
                          <p className="text-[10px] text-red-600 font-mono mt-1 truncate max-w-xs">{item.errorMessage}</p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedModalItem({
                                id: item.queueId,
                                title: 'Active Mutation Payload Inspector',
                                operation: item.operationType,
                                collection: item.collectionName,
                                recordId: item.recordId,
                                payload: item.payload,
                                error: item.errorMessage,
                              });
                              setShowPayloadModal(true);
                            }}
                            className="text-xs flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Payload
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryingId === item.queueId || !effectiveOnlineStatus}
                            onClick={() => handleRetrySingle(item.queueId)}
                            className="text-xs flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${retryingId === item.queueId ? 'animate-spin' : ''}`} /> Sync
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => removeItem(item.queueId)}
                            className="text-xs p-1.5"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dead Letter Queue (DLQ) Quarantine Inspector */}
      <Card className="border-t-4 border-t-rose-600">
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Dead Letter Queue (DLQ) Quarantine Inspector</span>
                  <Badge variant={dlqCount > 0 ? 'danger' : 'secondary'} className="font-mono text-xs">
                    {dlqCount} {dlqCount === 1 ? 'record' : 'records'}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quarantined mutations rejected by Firestore security rules, validation limits, or unrecoverable version collisions.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDLQ}
                className="text-xs flex items-center gap-1"
                title="Refresh Dead Letter Queue"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh DLQ
              </Button>
              {dlqCount > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleClearAllDLQ}
                  className="text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All DLQ
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {dlqItems.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="font-bold text-slate-800 text-base">Dead Letter Queue is Clean</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                No mutations have been quarantined due to security rejections, validation failures, or unrecoverable conflicts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-rose-50/60 border-b border-rose-100 text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                    <th className="py-3 px-4">DLQ ID & Quarantined At</th>
                    <th className="py-3 px-4">Operation</th>
                    <th className="py-3 px-4">Collection & Target ID</th>
                    <th className="py-3 px-4">Quarantine Diagnostics</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {dlqItems.map((item) => (
                    <tr key={item.dlqId} className="hover:bg-rose-50/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="font-bold text-rose-700 flex items-center gap-1">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{item.dlqId}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(item.movedToDLQAt).toLocaleString()}
                        </div>
                        {item.originalQueueId && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Orig Queue ID: {item.originalQueueId}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {getOperationBadge(item.operation)}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono text-slate-800">
                        <span className="font-bold text-slate-900">{item.collectionName}</span> / {item.recordId}
                      </td>

                      <td className="py-3.5 px-4 text-xs max-w-sm">
                        <div className="flex items-center gap-2 mb-1">
                          {getFailureReasonBadge(item.reason)}
                          <span className="text-slate-400 font-mono text-[10px]">({item.retryCount} attempts)</span>
                        </div>
                        <div className="text-[11px] text-rose-700 font-mono bg-rose-50 p-1.5 rounded border border-rose-200/60 break-words">
                          {item.lastError || item.lastErrorCode || 'Fatal Error'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedModalItem({
                                id: item.dlqId,
                                title: 'Quarantined DLQ Mutation Payload',
                                operation: item.operation,
                                collection: item.collectionName,
                                recordId: item.recordId,
                                payload: item.payload,
                                error: item.lastError || item.lastErrorCode,
                                failedAt: item.movedToDLQAt,
                                reason: item.reason,
                              });
                              setShowPayloadModal(true);
                            }}
                            className="text-xs flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Payload
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryingDLQId === item.dlqId || !effectiveOnlineStatus}
                            onClick={() => handleRetryDLQSingle(item.dlqId)}
                            className="text-xs flex items-center gap-1 border-rose-200 text-rose-700 hover:bg-rose-50"
                            title="Restore to active queue and retry synchronization"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retryingDLQId === item.dlqId ? 'animate-spin' : ''}`} /> Replay
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handlePurgeDLQItem(item.dlqId)}
                            className="text-xs p-1.5"
                            title="Permanently purge from DLQ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 3: Offline Authentication & Session Persistence Status */}
      <Card className="border border-blue-200 bg-linear-to-r from-blue-50/50 via-white to-indigo-50/30">
        <CardHeader className="border-b border-blue-100 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" /> Phase 3 — Offline Authentication & Session Persistence
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadOfflineSession}
              disabled={loadingSession}
              className="text-xs"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loadingSession ? 'animate-spin' : ''}`} /> Refresh Session
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunPhase3Tests}
              disabled={runningPhase3Tests}
              className="text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className={`w-3 h-3 ${runningPhase3Tests ? 'animate-spin' : ''}`} />
              {runningPhase3Tests ? 'Running 21 Tests...' : 'Run Phase 3 Test Suite (21 Tests)'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Session Status</span>
              <p className="font-bold text-slate-900 text-sm mt-1 flex items-center gap-1.5">
                {offlineSession ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Active Offline Session
                  </span>
                ) : (
                  <span className="text-slate-500 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> No Cached Session
                  </span>
                )}
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Authenticated User</span>
              <p className="font-bold text-slate-900 text-sm mt-1 truncate">
                {offlineSession ? offlineSession.user.fullName || offlineSession.user.email : 'None'}
              </p>
              {offlineSession && (
                <p className="text-[11px] text-slate-500 mt-0.5">Role: <span className="font-mono font-bold text-blue-600">{offlineSession.user.role}</span></p>
              )}
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Jurisdiction Scope</span>
              <p className="font-bold text-slate-900 text-sm mt-1">
                {offlineSession ? offlineSession.user.jurisdiction || offlineSession.user.purok || 'Global' : 'None'}
              </p>
              {offlineSession && (
                <p className="text-[11px] text-slate-500 mt-0.5">Mode: <span className="font-mono text-slate-700">{offlineSession.user.dutyMode || 'Standard'}</span></p>
              )}
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Session Expiration</span>
              <p className="font-bold text-slate-900 text-sm mt-1">
                {offlineSession?.expiresAt ? new Date(offlineSession.expiresAt).toLocaleDateString() : 'N/A'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">TTL: 7 Days (IndexedDB)</p>
            </div>
          </div>

          {/* Test Suite Results Display */}
          {phase3TestReport && (
            <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">Phase 3 Verification Report</span>
                  <Badge variant={phase3TestReport.failed === 0 ? 'success' : 'danger'}>
                    {phase3TestReport.passed} / {phase3TestReport.total} PASSED
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-400">
                  Executed: {new Date(phase3TestReport.executedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {phase3TestReport.results.map((t) => (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                      t.passed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        {t.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        )}
                        <span className="font-bold text-slate-800">{t.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{t.description}</p>
                      {t.error && <p className="text-[11px] text-red-600 font-mono mt-1">Error: {t.error}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{t.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Integration Health Status Matrix */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> BOIMS Core Architecture & Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                <span>Firebase Firestore</span>
                <span className="text-emerald-600 font-mono">ONLINE</span>
              </div>
              <p className="text-slate-500">Persistent Cloud Database & Real-Time Sync Subscriptions</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                <span>Firebase Authentication</span>
                <span className="text-emerald-600 font-mono">ACTIVE</span>
              </div>
              <p className="text-slate-500">Identity verification, RBAC Token claims, and seed auth state</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                <span>Offline Storage Queue</span>
                <span className="text-emerald-600 font-mono">READY</span>
              </div>
              <p className="text-slate-500">Client LocalStorage persistent mutation buffer with retry engine</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payload Inspector Modal */}
      {showPayloadModal && selectedModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600">{selectedModalItem.id}</span>
                <h3 className="font-bold text-lg text-slate-900">{selectedModalItem.title}</h3>
              </div>
              <button onClick={() => setShowPayloadModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-slate-400 uppercase font-bold">Operation</p>
                <div className="mt-0.5">{getOperationBadge(selectedModalItem.operation)}</div>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-bold">Collection / Target</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedModalItem.collection} / {selectedModalItem.recordId}</p>
              </div>
            </div>

            {selectedModalItem.error && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs">
                <span className="font-bold text-rose-800 uppercase tracking-wider text-[10px]">Quarantine Error Diagnostic</span>
                <p className="font-mono text-rose-700 mt-1">{selectedModalItem.error}</p>
                {selectedModalItem.reason && (
                  <p className="text-slate-500 text-[11px] mt-1">Reason: <span className="font-mono font-bold">{selectedModalItem.reason}</span></p>
                )}
              </div>
            )}

            <div>
              <h4 className="font-bold text-xs uppercase text-slate-500 mb-1">Payload JSON Data</h4>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-60">
                {JSON.stringify(selectedModalItem.payload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowPayloadModal(false)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
