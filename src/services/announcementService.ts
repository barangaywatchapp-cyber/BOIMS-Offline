/**
 * Service: AnnouncementService
 * Handles CRUD operations, status transitions, emergency broadcast pinning,
 * audience filtering, and offline sync for Community Announcements & Emergency Alerts.
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
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementAudience,
  AnnouncementStatus,
  ReportPriority,
  UserRole,
  User,
} from '../types';
import { syncService } from './SyncService';
import { notificationService } from './notificationService';
import { adminService } from './adminService';
import { APP_METADATA } from '../constants';
import { isResidentMode, canCreateAnnouncements } from '../utils/permissions';

const COLLECTION_NAME = 'announcements';

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
  return canCreateAnnouncements(role);
}

export const SEED_ANNOUNCEMENTS: Announcement[] = [];

class AnnouncementService {
  private localAnnouncements: Announcement[] = [];

  /**
   * Initializes seed announcements into Firestore if collection is empty
   * Note: Client-side automatic seeding is bypassed to comply with Firestore security rules.
   */
  async initializeSeedAnnouncements(): Promise<void> {
    // No-op for client sessions to prevent permission errors.
    return;
  }

  /**
   * Fetch announcements with optional category, audience, and status filters
   */
  async getAnnouncements(params?: {
    category?: AnnouncementCategory | 'all';
    audience?: AnnouncementAudience | 'all';
    status?: AnnouncementStatus | 'all';
    userRole?: UserRole;
    user?: User | null;
    searchQuery?: string;
  }): Promise<Announcement[]> {
    let list: Announcement[] = [];

    try {
      const colRef = collection(db, COLLECTION_NAME);
      const q = query(colRef, where('isDeleted', '==', false));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        list = snapshot.docs.map((doc) => doc.data() as Announcement);
        // Merge with local announcements
        const map = new Map<string, Announcement>();
        this.localAnnouncements.forEach((a) => map.set(a.announcementId, a));
        list.forEach((a) => map.set(a.announcementId, a));
        this.localAnnouncements = Array.from(map.values());
      } else {
        list = [...this.localAnnouncements];
      }
    } catch (error) {
      console.warn('[AnnouncementService] Using cached local announcements:', error);
      list = [...this.localAnnouncements];
    }

    // Filter non-deleted
    list = list.filter((a) => !a.isDeleted);

    // Filter by role / audience visibility
    if (params?.userRole) {
      const role = params.userRole;
      list = list.filter((a) => {
        if (a.audience === 'all') return true;
        if (role === 'admin' || role === 'chairman' || role === 'superAdmin' || role === 'developer') return true;
        if (a.audience === 'residents' && (role === 'resident' || role === 'purokOfficial')) return true;
        if (a.audience === 'tanod' && role === 'purokOfficial') return true;
        if (a.audience === 'staff' && role === 'secretary') return true;
        if (a.audience === 'barangayOfficials' && role !== 'resident') return true;
        return false;
      });
    }

    // Filter by category
    if (params?.category && params.category !== 'all') {
      list = list.filter((a) => a.category === params.category);
    }

    // Filter by audience
    if (params?.audience && params.audience !== 'all') {
      list = list.filter((a) => a.audience === params.audience);
    }

    // Filter by status (Default to published for residents)
    if (params?.status && params.status !== 'all') {
      list = list.filter((a) => a.status === params.status);
    } else if (!params?.userRole || params.userRole === 'resident' || isResidentMode(params?.user, params?.userRole)) {
      list = list.filter((a) => a.status === 'published');
    }

    // Search query
    if (params?.searchQuery && params.searchQuery.trim() !== '') {
      const queryStr = params.searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(queryStr) ||
          a.content.toLowerCase().includes(queryStr) ||
          a.category.toLowerCase().includes(queryStr)
      );
    }

    // Sort pinned first, then by priority (critical > high > medium > low), then created date
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const priorityWeight: Record<ReportPriority, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }

  /**
   * Subscribes to real-time updates for announcements
   */
  subscribeToAnnouncements(
    callback: (announcements: Announcement[]) => void,
    params?: {
      category?: AnnouncementCategory | 'all';
      audience?: AnnouncementAudience | 'all';
      status?: AnnouncementStatus | 'all';
      userRole?: UserRole;
      user?: User | null;
      searchQuery?: string;
    }
  ): () => void {
    const colRef = collection(db, COLLECTION_NAME);

    const filterList = (rawDocs: Announcement[]) => {
      let list = [...rawDocs];
      const map = new Map<string, Announcement>();
      this.localAnnouncements.forEach((a) => map.set(a.announcementId, a));
      list.forEach((a) => map.set(a.announcementId, a));
      this.localAnnouncements = Array.from(map.values());

      list = Array.from(map.values()).filter((a) => !a.isDeleted);

      if (params?.userRole) {
        const role = params.userRole;
        list = list.filter((a) => {
          if (a.audience === 'all') return true;
          if (role === 'admin' || role === 'chairman' || role === 'superAdmin' || role === 'developer') return true;
          if (a.audience === 'residents' && (role === 'resident' || role === 'purokOfficial')) return true;
          if (a.audience === 'tanod' && role === 'purokOfficial') return true;
          if (a.audience === 'staff' && role === 'secretary') return true;
          if (a.audience === 'barangayOfficials' && role !== 'resident') return true;
          return false;
        });
      }

      if (params?.category && params.category !== 'all') {
        list = list.filter((a) => a.category === params.category);
      }

      if (params?.audience && params.audience !== 'all') {
        list = list.filter((a) => a.audience === params.audience);
      }

      if (params?.status && params.status !== 'all') {
        list = list.filter((a) => a.status === params.status);
      } else if (!params?.userRole || params.userRole === 'resident' || isResidentMode(params?.user, params?.userRole)) {
        list = list.filter((a) => a.status === 'published');
      }

      if (params?.searchQuery && params.searchQuery.trim() !== '') {
        const queryStr = params.searchQuery.toLowerCase();
        list = list.filter(
          (a) =>
            a.title.toLowerCase().includes(queryStr) ||
            a.content.toLowerCase().includes(queryStr) ||
            a.category.toLowerCase().includes(queryStr)
        );
      }

      list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const priorityWeight: Record<ReportPriority, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return list;
    };

    try {
      const q = query(colRef, where('isDeleted', '==', false));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((docSnap) => docSnap.data() as Announcement);
          callback(filterList(docs));
        },
        (error) => {
          console.warn('[AnnouncementService] Realtime subscription error, using static fallback:', error);
          this.getAnnouncements(params).then(callback);
        }
      );
      return unsub;
    } catch (err) {
      console.warn('[AnnouncementService] Failed to set up realtime listener:', err);
      this.getAnnouncements(params).then(callback);
      return () => {};
    }
  }

  /**
   * Get single announcement by ID
   */
  async getAnnouncementById(announcementId: string): Promise<Announcement | null> {
    try {
      const docRef = doc(db, COLLECTION_NAME, announcementId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as Announcement;
      }
    } catch (error) {
      console.warn('[AnnouncementService] Error fetching single announcement:', error);
    }
    return this.localAnnouncements.find((a) => a.announcementId === announcementId) || null;
  }

  /**
   * Create or broadcast a new announcement
   */
  async createAnnouncement(data: {
    title: string;
    content: string;
    category: AnnouncementCategory;
    audience: AnnouncementAudience;
    priority: ReportPriority;
    coverImage?: string;
    attachments?: string[];
    isPinned?: boolean;
    status?: AnnouncementStatus;
    expiresAt?: string | null;
    createdBy: string;
  }): Promise<Announcement> {
    const session = getCurrentSessionUser();
    const isAuthorized = session && isAuthorizedOfficial(session.role);

    if (!isAuthorized) {
      console.warn('[AnnouncementService] Unauthorized attempt to create announcement.');
      throw new Error('Unauthorized: Only Barangay Chairman and Secretary are authorized to post announcements.');
    }

    const id = `ann-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newAnnouncement: Announcement = {
      announcementId: id,
      title: data.title,
      content: data.content,
      category: data.category,
      audience: data.audience,
      priority: data.priority,
      coverImage: data.coverImage || '',
      attachments: data.attachments || [],
      isPinned: data.isPinned || false,
      status: data.status || 'published',
      publishAt: now,
      expiresAt: data.expiresAt || null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    // Save to Firestore & Offline Queue
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, newAnnouncement);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[AnnouncementService] Saving to offline sync queue:', error);
        syncService.enqueue('create', COLLECTION_NAME, id, newAnnouncement);
      } else {
        console.warn('[AnnouncementService] Permission denied creating announcement.');
        throw new Error('Permission denied creating announcement in Firestore.');
      }
    }

    // Update local cache
    this.localAnnouncements.unshift(newAnnouncement);

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'ANNOUNCEMENT_CREATED',
        module: 'Announcements',
        targetId: id,
        targetType: 'Announcement',
        performedBy: data.createdBy,
        performerRole: session?.role || 'secretary',
        newValues: { title: data.title, category: data.category, priority: data.priority },
      })
      .catch((err) => console.warn('[AnnouncementService] Audit log error:', err));

    // Automatically generate notification broadcast for published announcements
    if (newAnnouncement.status === 'published') {
      try {
        const notifTitle =
          newAnnouncement.priority === 'critical' || newAnnouncement.category === 'emergency'
            ? `🚨 EMERGENCY BROADCAST: ${newAnnouncement.title}`
            : `📢 ANNOUNCEMENT: ${newAnnouncement.title}`;

        await notificationService.createNotification({
          userId: 'all_residents',
          title: notifTitle,
          message:
            newAnnouncement.content.length > 150
              ? newAnnouncement.content.substring(0, 150) + '...'
              : newAnnouncement.content,
          type:
            newAnnouncement.priority === 'critical' || newAnnouncement.category === 'emergency'
              ? 'emergency'
              : 'announcement',
          priority: newAnnouncement.priority,
          link: '/announcements',
          announcementId: newAnnouncement.announcementId,
          createdBy: newAnnouncement.createdBy,
        });
      } catch (err) {
        console.warn('[AnnouncementService] Error creating notification for announcement:', err);
      }
    }

    return newAnnouncement;
  }

  /**
   * Update existing announcement
   */
  async updateAnnouncement(
    announcementId: string,
    updates: Partial<Announcement>,
    updatedBy: string
  ): Promise<Announcement> {
    const session = getCurrentSessionUser();
    const isAuthorized = session && isAuthorizedOfficial(session.role);

    if (!isAuthorized) {
      console.warn('[AnnouncementService] Unauthorized attempt to update announcement.');
      throw new Error('Unauthorized: Only Barangay Chairman and Secretary are authorized to update announcements.');
    }

    const now = new Date().toISOString();
    const updatedData = { ...updates, updatedAt: now, updatedBy };

    try {
      const docRef = doc(db, COLLECTION_NAME, announcementId);
      await updateDoc(docRef, updatedData);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[AnnouncementService] Queueing offline update:', error);
        syncService.enqueue('update', COLLECTION_NAME, announcementId, updatedData);
      } else {
        console.warn('[AnnouncementService] Permission denied updating announcement.');
        throw new Error('Permission denied updating announcement in Firestore.');
      }
    }

    // Update local cache
    const index = this.localAnnouncements.findIndex((a) => a.announcementId === announcementId);
    if (index !== -1) {
      this.localAnnouncements[index] = { ...this.localAnnouncements[index], ...updatedData };
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'ANNOUNCEMENT_UPDATED',
        module: 'Announcements',
        targetId: announcementId,
        targetType: 'Announcement',
        performedBy: updatedBy,
        performerRole: session?.role || 'secretary',
        newValues: updates,
      })
      .catch((err) => console.warn('[AnnouncementService] Audit log error:', err));

    const result = await this.getAnnouncementById(announcementId);
    return result || (this.localAnnouncements[index] as Announcement);
  }

  /**
   * Toggle pinned status for an announcement
   */
  async togglePinAnnouncement(announcementId: string, isPinned: boolean, updatedBy: string): Promise<void> {
    await this.updateAnnouncement(announcementId, { isPinned }, updatedBy);
  }

  /**
   * Soft-delete announcement
   */
  async deleteAnnouncement(announcementId: string, deletedBy: string): Promise<void> {
    const session = getCurrentSessionUser();
    const isAuthorized = session && isAuthorizedOfficial(session.role);

    if (!isAuthorized) {
      console.warn('[AnnouncementService] Unauthorized attempt to delete announcement.');
      throw new Error('Unauthorized: Only Barangay Chairman and Secretary are authorized to delete announcements.');
    }

    const now = new Date().toISOString();
    const deletePayload = { isDeleted: true, deletedAt: now, deletedBy };

    try {
      const docRef = doc(db, COLLECTION_NAME, announcementId);
      await updateDoc(docRef, deletePayload);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (!isPermissionError) {
        console.warn('[AnnouncementService] Queueing offline delete:', error);
        syncService.enqueue('delete', COLLECTION_NAME, announcementId, deletePayload);
      } else {
        console.warn('[AnnouncementService] Permission denied deleting announcement.');
        throw new Error('Permission denied deleting announcement in Firestore.');
      }
    }

    const index = this.localAnnouncements.findIndex((a) => a.announcementId === announcementId);
    if (index !== -1) {
      this.localAnnouncements[index].isDeleted = true;
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'ANNOUNCEMENT_DELETED',
        module: 'Announcements',
        targetId: announcementId,
        targetType: 'Announcement',
        performedBy: deletedBy,
        performerRole: session?.role || 'secretary',
      })
      .catch((err) => console.warn('[AnnouncementService] Audit log error:', err));
  }
}

export const announcementService = new AnnouncementService();
