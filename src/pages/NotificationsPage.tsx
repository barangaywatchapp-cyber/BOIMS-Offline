/**
 * Page: NotificationsPage (Module 5)
 * Real-time Notification Center, Dispatch Alerts, and Activity Notification History.
 * Aligned with Module 5 SRS specifications and UDS design tokens.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../services/notificationService';
import { Notification, NotificationType, ReportPriority } from '../types';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  FileBadge,
  FileText,
  Megaphone,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Loader2,
  Filter,
} from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const { user, role, isAuthInitialized } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'emergency' | 'reports' | 'certificates' | 'announcements'>('all');

  useEffect(() => {
    if (!isAuthInitialized || !user?.uid) {
      if (isAuthInitialized && !user?.uid) {
        setLoading(false);
      }
      return;
    }
    setLoading(true);

    let isMounted = true;

    // Direct query fallback timer to ensure loading state never stalls
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        notificationService.getUserNotifications(user.uid, role, user).then((data) => {
          if (isMounted) {
            setNotifications(data);
            setLoading(false);
          }
        });
      }
    }, 1200);

    const unsubscribe = notificationService.subscribeToUserNotifications(
      user.uid,
      role,
      user,
      (data) => {
        if (isMounted) {
          clearTimeout(fallbackTimer);
          setNotifications(data);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [isAuthInitialized, user?.uid, role, user?.dutyStatus, user?.dutyMode]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      console.warn('[NotificationsPage] Refusing to mark read for invalid notificationId:', notificationId);
      return;
    }
    try {
      await notificationService.markAsRead(notificationId);
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    try {
      await notificationService.markAllAsRead(user.uid, role);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      console.warn('[NotificationsPage] Refusing to delete notification for invalid notificationId:', notificationId);
      return;
    }
    try {
      await notificationService.deleteNotification(notificationId);
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'emergency') return n.type === 'emergency' || n.priority === 'critical';
    if (activeFilter === 'reports') return n.type.startsWith('report');
    if (activeFilter === 'certificates') return n.type.startsWith('certificate');
    if (activeFilter === 'announcements') return n.type === 'announcement';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getNotifIcon = (type: NotificationType, priority: ReportPriority) => {
    if (type === 'emergency' || priority === 'critical') {
      return <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />;
    }
    if (type.startsWith('certificate')) {
      return <FileBadge className="w-5 h-5 text-emerald-600" />;
    }
    if (type.startsWith('report')) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (type === 'announcement') {
      return <Megaphone className="w-5 h-5 text-amber-600" />;
    }
    if (type === 'household_number_conflict' || type === 'family_request' || type === 'household_invite') {
      return <Shield className="w-5 h-5 text-purple-600" />;
    }
    return <Bell className="w-5 h-5 text-slate-600" />;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-800 rounded-2xl relative">
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white font-black text-[10px] rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Notification & Alert Center
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Real-time activity logs, incident dispatch updates, and emergency broadcasts.
              </p>
            </div>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all cursor-pointer self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4 text-blue-700" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none bg-white p-3 rounded-2xl border border-slate-200/80">
        {[
          { id: 'all', label: 'All Notifications', count: notifications.length },
          { id: 'emergency', label: '🚨 Emergency Alerts', count: notifications.filter((n) => n.type === 'emergency' || n.priority === 'critical').length },
          { id: 'reports', label: '📋 Incident Reports', count: notifications.filter((n) => n.type.startsWith('report')).length },
          { id: 'certificates', label: '📜 Certificates', count: notifications.filter((n) => n.type.startsWith('certificate')).length },
          { id: 'announcements', label: '📢 Announcements', count: notifications.filter((n) => n.type === 'announcement').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeFilter === tab.id
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200/80">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-500">Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 space-y-3">
          <Bell className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Notifications Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You currently have no notification messages matching the selected filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => {
            const notifId = notif.notificationId || (notif as any).id;
            const isUnread = !notif.isRead;
            const isEmergency = notif.type === 'emergency' || notif.priority === 'critical';

            return (
              <div
                key={notifId || Math.random()}
                className={`p-4 sm:p-5 rounded-3xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isUnread
                    ? 'bg-white border-blue-300 shadow-2xs ring-1 ring-blue-100'
                    : 'bg-slate-50/60 border-slate-200/80'
                } ${isEmergency ? 'border-red-300 bg-red-50/30' : ''}`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-3 rounded-2xl shrink-0 ${
                      isEmergency
                        ? 'bg-red-100 text-red-700'
                        : isUnread
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {getNotifIcon(notif.type, notif.priority)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={`text-sm ${isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                        {notif.title}
                      </h4>

                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600" title="Unread" />
                      )}

                      {isEmergency && (
                        <span className="px-2 py-0.5 bg-red-600 text-white font-extrabold text-[9px] rounded-full uppercase">
                          CRITICAL
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {notif.message}
                    </p>

                    <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 pt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {notif.link && (
                    <button
                      onClick={() => {
                        if (isUnread) handleMarkAsRead(notifId);
                        navigate(notif.link!);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isUnread && (
                    <button
                      onClick={() => handleMarkAsRead(notifId)}
                      className="p-2 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                      title="Mark as Read"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(notifId)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                    title="Delete Notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
