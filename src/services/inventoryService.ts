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
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { syncService } from './SyncService';
import { adminService } from './adminService';
import {
  InventoryItem,
  InventoryBorrowRecord,
  AssetCondition,
  AssetStatus,
} from '../types';

const INVENTORY_COLLECTION = 'inventory';
const LOCAL_STORAGE_KEY = 'boims_offline_inventory_v1';

class InventoryService {
  private memoryCache: InventoryItem[] = [];

  private getLocalCache(): InventoryItem[] {
    return this.memoryCache;
  }

  private setLocalCache(data: InventoryItem[]): void {
    this.memoryCache = data;
  }

  /**
   * Fetch non-deleted inventory items with optional pagination
   */
  async getInventoryItems(options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null }): Promise<InventoryItem[]> {
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
   * Get single inventory item by assetId or assetCode or qrCode
   */
  async getInventoryById(idOrCode: string): Promise<InventoryItem | null> {
    const items = await this.getInventoryItems();
    return (
      items.find(
        (item) =>
          (item.assetId === idOrCode ||
            item.assetCode === idOrCode ||
            item.qrCode === idOrCode ||
            item.barcode === idOrCode) &&
          !item.isDeleted
      ) || null
    );
  }

  /**
   * Create a new inventory item
   */
  async createInventoryItem(
    data: Omit<InventoryItem, 'assetId' | 'assetCode' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'createdBy'>,
    createdBy: string
  ): Promise<InventoryItem> {
    const existing = await this.getInventoryItems();
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

    const cache = this.getLocalCache();
    cache.unshift(newItem);
    this.setLocalCache(cache);

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_CREATED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: createdBy,
        performerRole: 'admin',
        newValues: { assetName: newItem.assetName, category: newItem.category, quantity: newItem.quantity },
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await setDoc(docRef, newItem);
    } catch (error) {
      console.warn('[InventoryService] Firestore setDoc failed, queuing for offline sync:', error);
      syncService.enqueue('create', INVENTORY_COLLECTION, assetId, newItem);
    }

    return newItem;
  }

  /**
   * Update Inventory Item
   */
  async updateInventoryItem(
    assetId: string,
    updates: Partial<InventoryItem>,
    updatedBy: string
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

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_UPDATED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: updatedBy,
        performerRole: 'admin',
        newValues: updates,
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await updateDoc(docRef, { ...updates, updatedAt: now, updatedBy });
    } catch (error) {
      console.warn('[InventoryService] Firestore updateDoc failed, queuing for offline sync:', error);
      syncService.enqueue('update', INVENTORY_COLLECTION, assetId, { ...updates, updatedAt: now, updatedBy });
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
  async deleteInventoryItem(assetId: string, deletedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const cache = this.getLocalCache();
    const index = cache.findIndex((item) => item.assetId === assetId);

    if (index !== -1) {
      cache[index].isDeleted = true;
      cache[index].deletedAt = now;
      cache[index].deletedBy = deletedBy;
      this.setLocalCache(cache);
    }

    adminService
      .logAuditEvent({
        action: 'INVENTORY_ITEM_DELETED',
        module: 'Inventory',
        targetId: assetId,
        targetType: 'InventoryItem',
        performedBy: deletedBy,
        performerRole: 'admin',
      })
      .catch((err) => console.warn('[InventoryService] Audit log error:', err));

    try {
      const docRef = doc(db, INVENTORY_COLLECTION, assetId);
      await updateDoc(docRef, { isDeleted: true, deletedAt: now, deletedBy });
    } catch (error) {
      console.warn('[InventoryService] Firestore delete failed, queuing for offline sync:', error);
      syncService.enqueue('delete', INVENTORY_COLLECTION, assetId, { isDeleted: true, deletedAt: now, deletedBy });
    }
  }
}

export const inventoryService = new InventoryService();
