/**
 * Service: InventoryService (Module 7)
 * Handles Barangay Asset & Inventory Management System, Borrowing Workflow,
 * Barcode / QR Code Tagging, Maintenance Schedule Tracking, and Stock Levels.
 * Supports Firestore primary storage with SyncService offline queueing fallback.
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
  limit,
  startAfter,
  onSnapshot,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { isAppOnline } from '../offline/networkManager';
import { syncService } from './SyncService';
import { offlineStorage } from '../offline/storage';
import { adminService } from './adminService';
import {
  InventoryItem,
  InventoryBorrowRecord,
  AssetCondition,
  AssetStatus,
  User,
} from '../types';

const INVENTORY_COLLECTION = 'inventory';
const LOCAL_STORAGE_KEY = 'boims_offline_inventory_v1';

class InventoryService {
  private memoryCache: InventoryItem[] = [];

  constructor() {
    this.initCache();
  }

  private initCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        this.memoryCache = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[InventoryService] Error reading inventory from localStorage:', e);
    }

    // Async hydration from IndexedDB offlineEntities
    offlineStorage
      .getCachedEntities<InventoryItem>(INVENTORY_COLLECTION)
      .then((entities) => {
        if (entities && entities.length > 0) {
          const idbItems = entities
            .map((e) => e.data)
            .filter((item): item is InventoryItem => Boolean(item && !item.isDeleted));
          if (idbItems.length > 0) {
            const map = new Map<string, InventoryItem>();
            for (const item of this.memoryCache) {
              map.set(item.assetId, item);
            }
            for (const item of idbItems) {
              map.set(item.assetId, item);
            }
            this.memoryCache = Array.from(map.values());
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.memoryCache));
            } catch {}
          }
        }
      })
      .catch((err) => {
        console.warn('[InventoryService] Hydration from IndexedDB error:', err);
      });
  }

  private getLocalCache(): InventoryItem[] {
    if (this.memoryCache.length === 0 && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          this.memoryCache = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('[InventoryService] Error parsing localStorage:', e);
      }
    }
    return this.memoryCache;
  }

  private setLocalCache(data: InventoryItem[]): void {
    const previous = this.memoryCache;
    this.memoryCache = data;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('[InventoryService] Error saving to localStorage:', e);
      }
    }

    // Prune removed items from IndexedDB offlineEntities
    if (previous && previous.length > 0) {
      const activeIds = new Set(data.map((item) => item.assetId));
      previous.forEach((prevItem) => {
        if (!activeIds.has(prevItem.assetId)) {
          offlineStorage.deleteCachedEntity(INVENTORY_COLLECTION, prevItem.assetId).catch(() => {});
        }
      });
    }

    // Asynchronously update / refresh retained entities in IndexedDB
    data.forEach((item) => {
      offlineStorage.putCachedEntity(INVENTORY_COLLECTION, item.assetId, item).catch(() => {});
    });
  }

  /**
   * Fetch non-deleted inventory items with optional pagination
   */
  async getInventoryItems(options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null }): Promise<InventoryItem[]> {
    // If cache is empty, hydrate from IndexedDB first (essential for cold-offline boot)
    if (this.memoryCache.length === 0) {
      try {
        const entities = await offlineStorage.getCachedEntities<InventoryItem>(INVENTORY_COLLECTION);
        if (entities && entities.length > 0) {
          const idbItems = entities
            .map((e) => e.data)
            .filter((item): item is InventoryItem => Boolean(item && !item.isDeleted));
          if (idbItems.length > 0) {
            this.memoryCache = idbItems;
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(idbItems));
            } catch {}
          }
        }
      } catch (err) {
        console.warn('[InventoryService] Error loading cached entities from IndexedDB:', err);
      }
    }

    // If offline, return immediately from local cache without attempting network
    if (!isAppOnline()) {
      return this.getLocalCache().filter((item) => !item.isDeleted);
    }

    try {
      const constraints: QueryConstraint[] = [where('isDeleted', '==', false)];

      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      if (options?.limitCount && options.limitCount > 0) {
        constraints.push(limit(options.limitCount));
      }

      let snapshot;
      try {
        const q = query(collection(db, INVENTORY_COLLECTION), ...constraints);
        snapshot = await getDocs(q);
      } catch (indexErr) {
        console.warn('[InventoryService] Constrained query failed, using basic query:', indexErr);
        const fallbackQ = query(collection(db, INVENTORY_COLLECTION), where('isDeleted', '==', false));
        snapshot = await getDocs(fallbackQ);
      }

      if (!snapshot.empty) {
        const items: InventoryItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as InventoryItem;
          if (!data.isDeleted) {
            items.push(data);
          }
        });

        if (items.length > 0) {
          this.setLocalCache(items);
          return items;
        }
      }
    } catch (error) {
      console.warn('[InventoryService] Firestore fetch failed or offline, using cache fallback:', error);
    }

    return this.getLocalCache().filter((item) => !item.isDeleted);
  }

  /**
   * Subscribes to real-time updates for non-deleted inventory items.
   * Leverages Firestore onSnapshot with optimistic local cache merging and offline fallback.
   */
  subscribeToInventory(callback: (items: InventoryItem[]) => void): () => void {
    // If unauthenticated or completely offline at subscription start, provide local cache immediately
    if (!auth.currentUser || !isAppOnline()) {
      callback(this.getLocalCache().filter((item) => !item.isDeleted));
      return () => {};
    }

    const q = query(
      collection(db, INVENTORY_COLLECTION),
      where('isDeleted', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const remoteItems: InventoryItem[] = [];
        snapshot.forEach((docSnap) => {
          const item = docSnap.data() as InventoryItem;
          if (!item.isDeleted) {
            remoteItems.push(item);
          }
        });

        // Reconcile with local cache:
        // Firestore snapshot is authoritative for all existing documents.
        // If a local record is missing from Firestore, only retain it if there is a
        // legitimate active pending inventory mutation in SyncService for this exact assetId.
        const pendingQueue = syncService
          .getQueue()
          .filter(
            (q) =>
              (q.collectionName === INVENTORY_COLLECTION || q.collectionName === 'inventory') &&
              (q.status === 'pending' || q.status === 'syncing')
          );

        const mergedMap = new Map<string, InventoryItem>();
        // 1. Authoritative Firestore records
        remoteItems.forEach((r) => {
          if (r.assetId) mergedMap.set(r.assetId, r);
        });

        // 2. Legitimate pending local creations
        const local = this.getLocalCache();
        local.forEach((localItem) => {
          if (!localItem || !localItem.assetId || localItem.isDeleted) return;

          // If already in Firestore, the authoritative remote record is preserved
          if (mergedMap.has(localItem.assetId)) return;

          // Only retain if there is an active pending creation mutation in the queue
          const isPendingCreation = pendingQueue.some(
            (q) => q.recordId === localItem.assetId && q.operationType === 'create'
          );

          if (isPendingCreation) {
            mergedMap.set(localItem.assetId, localItem);
          }
        });

        const merged = Array.from(mergedMap.values());

        // Sort consistently by createdAt (newest first)
        merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        // Reconcile local memory, localStorage, and IndexedDB caches with the authoritative set
        this.setLocalCache(merged);

        // Notify subscriber
        callback(merged);
      },
      (error) => {
        console.warn('[InventoryService] onSnapshot subscription error, falling back to cache:', error);
        callback(this.getLocalCache().filter((item) => !item.isDeleted));
      }
    );

    return unsubscribe;
  }

  /**
   * Get single inventory item by assetId or assetCode or qrCode
   */
  async getInventoryById(idOrCode: string): Promise<InventoryItem | null> {
    const cached = this.getLocalCache().find(
      (item) =>
        (item.assetId === idOrCode ||
          item.assetCode === idOrCode ||
          item.qrCode === idOrCode ||
          item.barcode === idOrCode) &&
        !item.isDeleted
    );
    if (cached) return cached;

    // Check IndexedDB
    try {
      const idbEntity = await offlineStorage.getCachedEntity<InventoryItem>(INVENTORY_COLLECTION, idOrCode);
      if (idbEntity?.data && !idbEntity.data.isDeleted) {
        return idbEntity.data;
      }
    } catch {}

    if (isAppOnline()) {
      try {
        const docSnap = await getDoc(doc(db, INVENTORY_COLLECTION, idOrCode));
        if (docSnap.exists()) {
          const data = docSnap.data() as InventoryItem;
          if (!data.isDeleted) {
            this.setLocalCache([data, ...this.getLocalCache().filter((i) => i.assetId !== data.assetId)]);
            return data;
          }
        }
      } catch (err) {
        console.warn('[InventoryService] Remote getDoc failed, item not found:', err);
      }
    }

    return null;
  }

  /**
   * Create a new inventory item
   */
  async createInventoryItem(
    data: Omit<InventoryItem, 'assetId' | 'assetCode' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'createdBy'>,
    createdBy: string,
    authorUserContext?: User | null
  ): Promise<InventoryItem> {
    // 1. Local Validation
    if (!data.assetName || !data.assetName.trim()) {
      throw new Error('Asset Name is required.');
    }
    if (!data.location || !data.location.trim()) {
      throw new Error('Storage Location is required.');
    }
    if (!data.quantity || data.quantity < 1) {
      throw new Error('Quantity must be at least 1.');
    }
    if (!data.unit || !data.unit.trim()) {
      throw new Error('Unit is required.');
    }

    // 2. Determine sequential code from local cache (offline-safe, collision-resilient)
    const existing = this.getLocalCache();
    const year = new Date().getFullYear();
    const prefix = `AST-${year}-`;

    let maxSeq = 0;
    existing.forEach((item) => {
      if (item.assetCode && item.assetCode.startsWith(prefix)) {
        const seqNum = parseInt(item.assetCode.replace(prefix, ''), 10);
        if (!isNaN(seqNum) && seqNum > maxSeq) {
          maxSeq = seqNum;
        }
      }
    });

    const nextSeqStr = (maxSeq + 1).toString().padStart(4, '0');
    const assetId = `${prefix}${nextSeqStr}`;
    const assetCode = assetId;
    const qrCode = `BRGY-${assetId}`;
    const barcode = `48012345${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const newItem: InventoryItem = {
      ...data,
      assetId,
      assetCode,
      qrCode,
      barcode,
      availableQuantity: data.availableQuantity ?? data.quantity,
      borrowingHistory: [],
      imageUrls: data.imageUrls || [],
      createdAt: now,
      updatedAt: now,
      createdBy,
      isDeleted: false,
    };

    // 3. Update local state and memory cache
    const cache = this.getLocalCache();
    cache.unshift(newItem);
    this.setLocalCache(cache);

    // 4. Persist to IndexedDB immediately
    await offlineStorage.putCachedEntity(INVENTORY_COLLECTION, assetId, newItem, { updatedAt: now }).catch(() => {});

    // 5. Resolve author user context for queue authorization
    let resolvedAuthor: User | null = authorUserContext || null;
    if (!resolvedAuthor && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('boims_active_user');
        if (stored) resolvedAuthor = JSON.parse(stored);
      } catch {}
    }
    if (!resolvedAuthor) {
      resolvedAuthor = { uid: createdBy, role: 'secretary', fullName: 'Barangay Officer' } as any;
    }

    // 6. Non-blocking audit trail logging
    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_CREATED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: createdBy,
        performerRole: resolvedAuthor.role || 'secretary',
        newValues: { assetName: newItem.assetName, category: newItem.category, quantity: newItem.quantity },
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    // 7. Standard BOIMS Online/Offline Synchronization Pattern:
    // When offline: Enqueue legitimate CREATE mutation to SyncService for replay upon reconnect.
    // When online: Write directly to Firestore. Only enqueue if direct write fails due to network/unavailable conditions.
    if (!isAppOnline()) {
      console.info(`[InventoryService] Offline mode: Enqueueing inventory create mutation for ${assetId}`);
      syncService.enqueue('create', INVENTORY_COLLECTION, assetId, newItem, resolvedAuthor);
      return newItem;
    }

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await setDoc(docRef, newItem);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (isPermissionError) {
        throw error;
      }

      console.warn('[InventoryService] Direct Firestore setDoc failed, enqueuing for offline sync:', error);
      syncService.enqueue('create', INVENTORY_COLLECTION, assetId, newItem, resolvedAuthor);
    }

    // 8. Return immediately
    return newItem;
  }

  /**
   * Update Inventory Item
   */
  async updateInventoryItem(
    assetId: string,
    updates: Partial<InventoryItem>,
    updatedBy: string,
    authorUserContext?: User | null
  ): Promise<InventoryItem> {
    const now = new Date().toISOString();
    const cache = this.getLocalCache();
    const index = cache.findIndex((item) => item.assetId === assetId);

    if (index === -1) {
      throw new Error(`Inventory item ${assetId} not found.`);
    }

    const updatedItem: InventoryItem = {
      ...cache[index],
      ...updates,
      updatedAt: now,
      updatedBy,
    };

    cache[index] = updatedItem;
    this.setLocalCache(cache);

    // Persist to IndexedDB immediately
    await offlineStorage.putCachedEntity(INVENTORY_COLLECTION, assetId, updatedItem, { updatedAt: now }).catch(() => {});

    // Resolve author user context
    let resolvedAuthor: User | null = authorUserContext || null;
    if (!resolvedAuthor && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('boims_active_user');
        if (stored) resolvedAuthor = JSON.parse(stored);
      } catch {}
    }
    if (!resolvedAuthor) {
      resolvedAuthor = { uid: updatedBy, role: 'secretary', fullName: 'Barangay Officer' } as any;
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_UPDATED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: updatedBy,
        performerRole: resolvedAuthor.role || 'secretary',
        newValues: updates,
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    const updatePayload = { ...updates, updatedAt: now, updatedBy };

    // Standard BOIMS Online/Offline Synchronization Pattern:
    // When offline: Enqueue UPDATE mutation to SyncService for replay upon reconnect.
    // When online: Write directly to Firestore. Only enqueue if direct write fails due to network/unavailable conditions.
    if (!isAppOnline()) {
      console.info(`[InventoryService] Offline mode: Enqueueing inventory update mutation for ${assetId}`);
      syncService.enqueue('update', INVENTORY_COLLECTION, assetId, updatePayload, resolvedAuthor);
      return updatedItem;
    }

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await updateDoc(docRef, updatePayload);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (isPermissionError) {
        throw error;
      }

      console.warn('[InventoryService] Direct Firestore updateDoc failed, enqueuing for offline sync:', error);
      syncService.enqueue('update', INVENTORY_COLLECTION, assetId, updatePayload, resolvedAuthor);
    }

    return updatedItem;
  }

  /**
   * Issue / Borrow Inventory Asset
   */
  async issueBorrowItem(
    assetId: string,
    borrowData: Omit<InventoryBorrowRecord, 'borrowId' | 'borrowedAt' | 'status' | 'issuedBy'>,
    issuedBy: string
  ): Promise<InventoryItem> {
    const current = await this.getInventoryById(assetId);
    if (!current) {
      throw new Error(`Inventory asset ${assetId} not found.`);
    }

    if (current.availableQuantity < borrowData.quantity) {
      throw new Error(`Insufficient available quantity. Available: ${current.availableQuantity}, requested: ${borrowData.quantity}`);
    }

    const borrowId = `BRW-${Date.now().toString().slice(-6)}`;
    const newRecord: InventoryBorrowRecord = {
      ...borrowData,
      borrowId,
      borrowedAt: new Date().toISOString(),
      status: 'active',
      issuedBy,
    };

    const updatedHistory = [newRecord, ...(current.borrowingHistory || [])];
    const newAvailableQuantity = current.availableQuantity - borrowData.quantity;
    const newStatus: AssetStatus = newAvailableQuantity === 0 ? 'borrowed' : current.status;

    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_ISSUED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: issuedBy,
        performerRole: 'admin',
        newValues: { borrowerName: borrowData.borrowerName, quantity: borrowData.quantity, purpose: borrowData.purpose },
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    return this.updateInventoryItem(
      assetId,
      {
        borrowingHistory: updatedHistory,
        availableQuantity: newAvailableQuantity,
        status: newStatus,
      },
      issuedBy
    );
  }

  /**
   * Return Borrowed Inventory Asset
   */
  async returnBorrowedItem(
    assetId: string,
    borrowId: string,
    remarks: string,
    receivedBy: string
  ): Promise<InventoryItem> {
    const current = await this.getInventoryById(assetId);
    if (!current) {
      throw new Error(`Inventory asset ${assetId} not found.`);
    }

    const history = current.borrowingHistory || [];
    const recordIndex = history.findIndex((r) => r.borrowId === borrowId && r.status === 'active');

    if (recordIndex === -1) {
      throw new Error(`Active borrow record ${borrowId} not found.`);
    }

    const targetRecord = history[recordIndex];
    const now = new Date().toISOString();

    const updatedRecord: InventoryBorrowRecord = {
      ...targetRecord,
      returnedAt: now,
      status: 'returned',
      returnReceivedBy: receivedBy,
      remarks,
    };

    const updatedHistory = [...history];
    updatedHistory[recordIndex] = updatedRecord;

    const newAvailableQuantity = Math.min(current.quantity, current.availableQuantity + targetRecord.quantity);
    const newStatus: AssetStatus = newAvailableQuantity > 0 ? 'available' : current.status;

    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_RETURNED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: receivedBy,
        performerRole: 'admin',
        newValues: { borrowId, remarks },
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    return this.updateInventoryItem(
      assetId,
      {
        borrowingHistory: updatedHistory,
        availableQuantity: newAvailableQuantity,
        status: newStatus,
      },
      receivedBy
    );
  }

  /**
   * Update Condition & Maintenance
   */
  async updateMaintenanceStatus(
    assetId: string,
    condition: AssetCondition,
    status: AssetStatus,
    remarks: string,
    updatedBy: string
  ): Promise<InventoryItem> {
    const now = new Date().toISOString();

    adminService
      .logAuditEvent({
        action: 'INVENTORY_MAINTENANCE_UPDATED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: updatedBy,
        performerRole: 'admin',
        newValues: { condition, status, remarks },
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    return this.updateInventoryItem(
      assetId,
      {
        condition,
        status,
        remarks,
        lastMaintenanceAt: status === 'maintenance' ? now : undefined,
      },
      updatedBy
    );
  }

  /**
   * Soft Delete Asset
   */
  async deleteInventoryItem(assetId: string, deletedBy: string, authorUserContext?: User | null): Promise<void> {
    const now = new Date().toISOString();
    const cache = this.getLocalCache();
    const index = cache.findIndex((item) => item.assetId === assetId);

    if (index !== -1) {
      cache[index].isDeleted = true;
      cache[index].deletedAt = now;
      cache[index].deletedBy = deletedBy;
      this.setLocalCache(cache);
      await offlineStorage.putCachedEntity(INVENTORY_COLLECTION, assetId, cache[index], { updatedAt: now }).catch(() => {});
    }

    // Resolve author user context
    let resolvedAuthor: User | null = authorUserContext || null;
    if (!resolvedAuthor && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('boims_active_user');
        if (stored) resolvedAuthor = JSON.parse(stored);
      } catch {}
    }
    if (!resolvedAuthor) {
      resolvedAuthor = { uid: deletedBy, role: 'secretary', fullName: 'Barangay Officer' } as any;
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_DELETED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: deletedBy,
        performerRole: resolvedAuthor.role || 'secretary',
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    const deletePayload = { isDeleted: true, deletedAt: now, deletedBy };

    // Standard BOIMS Online/Offline Synchronization Pattern:
    // When offline: Enqueue DELETE mutation to SyncService for replay upon reconnect.
    // When online: Write directly to Firestore. Only enqueue if direct write fails due to network/unavailable conditions.
    if (!isAppOnline()) {
      console.info(`[InventoryService] Offline mode: Enqueueing inventory delete mutation for ${assetId}`);
      syncService.enqueue('delete', INVENTORY_COLLECTION, assetId, deletePayload, resolvedAuthor);
      return;
    }

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await updateDoc(docRef, deletePayload);
    } catch (error: any) {
      const isPermissionError =
        error?.code === 'permission-denied' ||
        error?.message?.includes('Missing or insufficient permissions') ||
        error?.message?.includes('permission-denied');

      if (isPermissionError) {
        throw error;
      }

      console.warn('[InventoryService] Direct Firestore delete failed, enqueuing for offline sync:', error);
      syncService.enqueue('delete', INVENTORY_COLLECTION, assetId, deletePayload, resolvedAuthor);
    }
  }
}

export const inventoryService = new InventoryService();
