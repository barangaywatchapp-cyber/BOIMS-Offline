/**
 * Service: NotificationService
 * Manages user notifications, unread alert counters, emergency notifications,
 * and dispatch notifications with Firestore persistence and offline sync.
 * Aligned with Module 5 SRS specifications.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { Notification, NotificationType, ReportPriority, UserRole, User } from '../types';
import { syncService } from './SyncService';
import { filterNotificationsByAccess } from '../utils/jurisdictionUtils';

const COLLECTION_NAME = 'notifications';

export const BROADCAST_TARGETS = ['all_residents', 'all', 'all_staff', 'staff_secretary'];

interface UserNotifOverlayItem {
  isRead?: boolean;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

type UserNotifOverlay = Record<string, UserNotifOverlayItem>;

function getUserOverlayKey(uid: string): string {
  return `boims_notif_user_state_${uid}`;
}

function loadUserOverlay(uid: string): UserNotifOverlay {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(getUserOverlayKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUserOverlay(uid: string, overlay: UserNotifOverlay): void {
  if (!uid) return;
  try {
    localStorage.setItem(getUserOverlayKey(uid), JSON.stringify(overlay));
  } catch (e) {
    console.warn('[NotificationService] Failed to save notification overlay:', e);
  }
}

function updateUserOverlay(uid: string, notificationId: string, updates: UserNotifOverlayItem): void {
  if (!uid) return;
  const overlay = loadUserOverlay(uid);
  overlay[notificationId] = {
    ...overlay[notificationId],
    ...updates,
  };
  saveUserOverlay(uid, overlay);
}

function getCurrentSessionUser(): { uid: string; role: UserRole } | null {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser) return null;

  let role: UserRole = 'resident';
  try {
    const cached = localStorage.getItem('boims_active_user');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.role) {
        role = parsed.role;
      }
    }
  } catch {
    // fallback
  }

  return { uid: currentAuthUser.uid, role };
}

function isAuthorizedOfficial(role: UserRole): boolean {
  return ['admin', 'chairman', 'secretary', 'purokOfficial', 'verifier', 'superAdmin'].includes(role);
}

function mapDocToNotification(docSnap: any): Notification {
  const data = docSnap.data() || {};
  const notifId = data.notificationId || data.id || docSnap.id;
  return {
    ...data,
    id: notifId,
    notificationId: notifId,
  } as Notification;
}

export const SEED_NOTIFICATIONS: Notification[] = [];

class NotificationService {
  private localNotifications: Notification[] = [];

  /**
   * Clear volatile RAM notification state (e.g. on user logout)
   */
  clearMemoryCache(): void {
    this.localNotifications = [];
  }

  /**
   * Applies current user's local read/delete overlay to notification documents
   */
  private applyUserOverlay(rawDocs: Notification[], uid?: string): Notification[] {
    const currentUid = uid || auth.currentUser?.uid || getCurrentSessionUser()?.uid;
    if (!currentUid) return rawDocs;

    const overlay = loadUserOverlay(currentUid);
    if (!overlay || Object.keys(overlay).length === 0) return rawDocs;

    return rawDocs.map((docItem) => {
      const userState = overlay[docItem.notificationId];
      if (!userState) return docItem;

      return {
        ...docItem,
        isRead: userState.isRead !== undefined ? userState.isRead : docItem.isRead,
        readAt: userState.readAt !== undefined ? userState.readAt : docItem.readAt,
        isDeleted: userState.isDeleted !== undefined ? userState.isDeleted : docItem.isDeleted,
        deletedAt: userState.deletedAt !== undefined ? userState.deletedAt : docItem.deletedAt,
      };
    });
  }

  /**
   * Initializes seed notifications into Firestore if collection is empty
   * Note: Client-side cross-user seeding into Firestore is bypassed to comply with Firestore security rules.
   */
  async initializeSeedNotifications(): Promise<void> {
    // No-op for client sessions to prevent cross-user permission errors.
    return;
  }

  /**
   * Get notifications for a user or broadcast role with jurisdiction filtering
   */
  async getUserNotifications(userId: string, userRole?: UserRole, currentUser?: User | null): Promise<Notification[]> {
    const currentUid = auth.currentUser?.uid || userId || currentUser?.uid;

    if (!auth.currentUser || (!userId && !currentUser)) {
      const filtered = this.applyUserOverlay(this.localNotifications, currentUid).filter((n) => !n.isDeleted);
      return filtered;
    }
    let list: Notification[] = [];
    const isExecutive = userRole && isAuthorizedOfficial(userRole);

    try {
      const colRef = collection(db, COLLECTION_NAME);
      let snapshotDocs: Notification[] = [];

      if (isExecutive) {
        try {
          const snapshot = await getDocs(colRef);
          if (!snapshot.empty) {
            snapshotDocs = snapshot.docs.map((docSnap) => mapDocToNotification(docSnap));
          }
        } catch {
          if (userId) {
            const targetIds = Array.from(new Set([userId, ...BROADCAST_TARGETS]));
            const userQ = query(colRef, where('userId', 'in', targetIds));
            const userSnap = await getDocs(userQ);
            snapshotDocs = userSnap.docs.map((docSnap) => mapDocToNotification(docSnap));
          }
        }
      } else if (userId) {
        try {
          const targetIds = Array.from(new Set([userId, ...BROADCAST_TARGETS]));
          const userQ = query(colRef, where('userId', 'in', targetIds));
          const userSnap = await getDocs(userQ);
          snapshotDocs = userSnap.docs.map((docSnap) => mapDocToNotification(docSnap));
        } catch {
          // Fallback to separate queries if 'in' query fails
          const userQ = query(colRef, where('userId', '==', userId));
          const userSnap = await getDocs(userQ);
          const userDocs = userSnap.docs.map((docSnap) => mapDocToNotification(docSnap));

          let broadcastDocs: Notification[] = [];
          try {
            const broadcastQ = query(colRef, where('userId', '==', 'all_residents'));
            const broadcastSnap = await getDocs(broadcastQ);
            broadcastDocs = broadcastSnap.docs.map((docSnap) => mapDocToNotification(docSnap));
          } catch {
            // Fallback
          }

          const map = new Map<string, Notification>();
          userDocs.forEach((d) => map.set(d.notificationId, d));
          broadcastDocs.forEach((d) => map.set(d.notificationId, d));
          snapshotDocs = Array.from(map.values());
        }
      }

      if (snapshotDocs.length > 0) {
        list = snapshotDocs;
      } else {
        list = [...this.localNotifications];
      }
    } catch (error) {
      console.warn('[NotificationService] Using cached notifications:', error);
      list = [...this.localNotifications];
    }

    // Apply user-scoped overlay
    list = this.applyUserOverlay(list, currentUid);

    // Filter non-deleted and relevant to user
    list = list.filter((n) => !n.isDeleted);

    if (currentUser) {
      list = filterNotificationsByAccess(list, currentUser);
    } else {
      list = list.filter(
        (n) =>
          n.userId === userId ||
          BROADCAST_TARGETS.includes(n.userId) ||
          n.type === 'emergency' ||
          n.type === 'announcement' ||
          n.type === 'household_number_conflict'
      );
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.localNotifications = list;
    return list;
  }

  /**
   * Subscribes to real-time updates for user notifications
   */
  subscribeToUserNotifications(
    userId: string,
    userRole: UserRole | undefined,
    currentUser: User | null | undefined,
    callback: (notifications: Notification[]) => void
  ): () => void {
    const currentUid = auth.currentUser?.uid || userId || currentUser?.uid;

    if (!auth.currentUser || (!userId && !currentUser)) {
      const filtered = this.applyUserOverlay(this.localNotifications, currentUid).filter((n) => !n.isDeleted);
      callback(filtered);
      return () => {};
    }
    const colRef = collection(db, COLLECTION_NAME);

    const processDocs = (rawDocs: Notification[]) => {
      const docsWithOverlay = this.applyUserOverlay(rawDocs, currentUid);
      let list = docsWithOverlay.filter((n) => !n.isDeleted);

      if (currentUser) {
        list = filterNotificationsByAccess(list, currentUser);
      } else {
        list = list.filter(
          (n) =>
            n.userId === userId ||
            BROADCAST_TARGETS.includes(n.userId) ||
            n.type === 'emergency' ||
            n.type === 'announcement' ||
            n.type === 'household_number_conflict'
        );
      }

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.localNotifications = list;
      return list;
    };

    try {
      const isExecutive = userRole && isAuthorizedOfficial(userRole);
      let q = colRef;
      if (!isExecutive && userId) {
        const targetIds = Array.from(new Set([userId, ...BROADCAST_TARGETS]));
        q = query(colRef, where('userId', 'in', targetIds)) as any;
      }

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((docSnap) => mapDocToNotification(docSnap));
          callback(processDocs(docs));
        },
        (error) => {
          console.warn('[NotificationService] Realtime listener error, fallback to user query:', error);
          this.getUserNotifications(userId, userRole, currentUser).then(callback);
        }
      );
      return unsub;
    } catch (err) {
      console.warn('[NotificationService] Listener setup error:', err);
      this.getUserNotifications(userId, userRole, currentUser).then(callback);
      return () => {};
    }
  }

  /**
   * Get unread notification count for badge
   */
  async getUnreadCount(userId: string, userRole?: UserRole): Promise<number> {
    const notifications = await this.getUserNotifications(userId, userRole);
    return notifications.filter((n) => !n.isRead).length;
  }

  /**
   * Create a new notification
   */
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: NotificationType;
    priority: ReportPriority;
    link?: string;
    reportId?: string;
    certificateId?: string;
    announcementId?: string;
    createdBy?: string;
    metadata?: Record<string, any>;
  }): Promise<Notification> {
    const id = `notif-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const newNotif: Notification = {
      notificationId: id,
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type,
      priority: data.priority,
      isRead: false,
      link: data.link || '',
      reportId: data.reportId,
      certificateId: data.certificateId,
      announcementId: data.announcementId,
      createdBy: data.createdBy || 'system',
      metadata: data.metadata || {},
      createdAt: now,
      isDeleted: false,
    };

    this.localNotifications.unshift(newNotif);

    const session = getCurrentSessionUser();
    const isPermitted =
      session &&
      (data.userId === session.uid ||
        isAuthorizedOfficial(session.role) ||
        (data.type === 'family_request' && data.createdBy === session.uid && Boolean(data.metadata?.inviteId)) ||
        (data.type === 'household_number_conflict' &&
          data.createdBy === session.uid &&
          Boolean(data.metadata?.requestId) &&
          Boolean(data.metadata?.householdId) &&
          ['all_staff', 'staff_secretary'].includes(data.userId)));

    if (!isPermitted) {
      console.info('[NotificationService] Client session not authorized for Firestore notification write. Retaining local notification.');
      return newNotif;
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, newNotif);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[NotificationService] Queueing offline create:', error);
        syncService.enqueue('create', COLLECTION_NAME, id, newNotif);
      } else {
        console.warn('[NotificationService] Firestore write permission denied; local copy retained.');
      }
    }

    // Trigger asynchronous server-side FCM Push delivery pipeline (non-blocking, fails gracefully)
    this.dispatchServerFcmPush(newNotif).catch((err) => {
      console.warn('[NotificationService] Server FCM push dispatch error:', err);
    });

    return newNotif;
  }

  /**
   * Dispatches server-side FCM push request to /api/fcm/send-push
   * Non-blocking, preserves Firestore notification regardless of network/FCM status
   */
  private async dispatchServerFcmPush(notification: Notification): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine) return;

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;

      await fetch('/api/fcm/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          notificationId: notification.notificationId,
          targetRecipient: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          link: notification.link,
          reportId: notification.reportId,
          certificateId: notification.certificateId,
          announcementId: notification.announcementId,
          createdBy: notification.createdBy,
          metadata: notification.metadata,
        }),
      }).catch((e) => {
        console.info('[NotificationService] FCM push request bypassed or server offline:', e?.message || e);
      });
    } catch (err) {
      // Non-blocking
    }
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      console.warn('[NotificationService] Refusing markAsRead on invalid notificationId:', notificationId);
      return;
    }

    const now = new Date().toISOString();
    const updatePayload = { isRead: true, readAt: now };

    const session = getCurrentSessionUser();
    const uid = session?.uid || auth.currentUser?.uid;

    let item = this.localNotifications.find((n) => n.notificationId === notificationId);

    if (uid) {
      updateUserOverlay(uid, notificationId, { isRead: true, readAt: now });
    }

    if (item) {
      item.isRead = true;
      item.readAt = now;
    }

    let targetUserId = item?.userId;
    if (!targetUserId) {
      try {
        const docSnap = await getDoc(doc(db, COLLECTION_NAME, notificationId));
        if (docSnap.exists()) {
          const data = docSnap.data() as Notification;
          targetUserId = data.userId;
        }
      } catch {
        // Fallback
      }
    }

    if (targetUserId && BROADCAST_TARGETS.includes(targetUserId)) {
      // Broadcast notification: user state saved in user overlay, do not mutate shared Firestore document globally.
      return;
    }

    const isPermitted = session && (targetUserId === session.uid || isAuthorizedOfficial(session.role));
    if (!isPermitted) {
      return;
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, notificationId);
      await updateDoc(docRef, updatePayload);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[NotificationService] Queueing offline update:', error);
        syncService.enqueue('update', COLLECTION_NAME, notificationId, updatePayload);
      } else {
        console.warn('[NotificationService] Permission denied marking notification read.');
      }
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, userRole?: UserRole): Promise<void> {
    const userNotifs = await this.getUserNotifications(userId, userRole);
    const unread = userNotifs.filter((n) => !n.isRead);

    for (const notif of unread) {
      await this.markAsRead(notif.notificationId);
    }
  }

  /**
   * Delete single notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      console.warn('[NotificationService] Refusing deleteNotification on invalid notificationId:', notificationId);
      return;
    }

    const now = new Date().toISOString();
    const deletePayload = { isDeleted: true, deletedAt: now };

    const session = getCurrentSessionUser();
    const uid = session?.uid || auth.currentUser?.uid;

    let item = this.localNotifications.find((n) => n.notificationId === notificationId);

    if (uid) {
      updateUserOverlay(uid, notificationId, { isDeleted: true, deletedAt: now });
    }

    if (item) {
      item.isDeleted = true;
      item.deletedAt = now;
    }

    let targetUserId = item?.userId;
    if (!targetUserId) {
      try {
        const docSnap = await getDoc(doc(db, COLLECTION_NAME, notificationId));
        if (docSnap.exists()) {
          const data = docSnap.data() as Notification;
          targetUserId = data.userId;
        }
      } catch {
        // Fallback
      }
    }

    if (targetUserId && BROADCAST_TARGETS.includes(targetUserId)) {
      // Broadcast notification: user state saved in user overlay, do not mutate shared Firestore document globally.
      return;
    }

    const isPermitted = session && (targetUserId === session.uid || isAuthorizedOfficial(session.role));
    if (!isPermitted) {
      return;
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, notificationId);
      await updateDoc(docRef, deletePayload);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[NotificationService] Queueing offline delete:', error);
        syncService.enqueue('delete', COLLECTION_NAME, notificationId, deletePayload);
      } else {
        console.warn('[NotificationService] Permission denied deleting notification.');
      }
    }
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllNotifications(userId: string, userRole?: UserRole): Promise<void> {
    const userNotifs = await this.getUserNotifications(userId, userRole);
    for (const notif of userNotifs) {
      await this.deleteNotification(notif.notificationId);
    }
  }
}

export const notificationService = new NotificationService();
