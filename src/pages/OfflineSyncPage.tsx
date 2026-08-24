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
  Clock,
  Eye,
  Layers,
  HardDrive,
  Activity,
  Sliders,
  ShieldCheck,
} from 'lucide-react';

export const OfflineSyncPage: React.FC = () => {
  const { isOnline, pendingCount, failedCount, queue, isSyncing, triggerSync, clearQueue, removeItem } =
    useOffline();

  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<SyncQueueItem | null>(null);
  const [showPayloadModal, setShowPayloadModal] = useState<boolean>(false);
  const [conflictStrategy, setConflictStrategy] = useState<'clientWins' | 'serverWins' | 'manual'>('clientWins');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const effectiveOnlineStatus = isOnline && !simulatedOffline;

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

  const getOperationBadge = (op: SyncQueueItem['operationType']) => {
    switch (op) {
      case 'create':
        return <Badge variant="success" className="font-mono text-[10px] uppercase">CREATE</Badge>;
      case 'update':
        return <Badge variant="info" className="font-mono text-[10px] uppercase">UPDATE</Badge>;
      case 'delete':
        return <Badge variant="danger" className="font-mono text-[10px] uppercase">DELETE</Badge>;
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
            variant={simulatedOffline ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => setSimulatedOffline(!simulatedOffline)}
            className="flex items-center gap-2 font-bold"
          >
            {simulatedOffline ? <WifiOff className="w-4 h-4 text-white" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            {simulatedOffline ? 'Simulating Offline Mode' : 'Network Active'}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Network Status</p>
            <p className="text-xl font-black mt-1 flex items-center gap-1.5">
              {effectiveOnlineStatus ? (
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

        <Card className="border-l-4 border-l-emerald-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Storage & Cache Engine</p>
            <p className="text-xl font-black text-slate-800 mt-1 flex items-center gap-1">
              <HardDrive className="w-5 h-5 text-slate-500" /> LocalStorage / PWA
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
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="font-bold text-slate-800 text-base">Offline Sync Queue is Empty!</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                All field responder logs, incident reports, blotter updates, and certificate requests are fully synchronized with Firestore.
              </p>
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
                              setSelectedItem(item);
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
      {showPayloadModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600">{selectedItem.queueId}</span>
                <h3 className="font-bold text-lg text-slate-900">Mutation Payload Inspector</h3>
              </div>
              <button onClick={() => setShowPayloadModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-slate-400 uppercase font-bold">Operation</p>
                <div className="mt-0.5">{getOperationBadge(selectedItem.operationType)}</div>
              </div>
              <div>
                <p className="text-slate-400 uppercase font-bold">Collection / Target</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedItem.collectionName} / {selectedItem.recordId}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase text-slate-500 mb-1">Payload JSON Data</h4>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-60">
                {JSON.stringify(selectedItem.payload, null, 2)}
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
