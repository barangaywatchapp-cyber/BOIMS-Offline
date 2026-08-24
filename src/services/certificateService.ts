/**
 * Certificate Service
 * Handles Barangay Document & Certification Issuance System logic:
 * - Firestore integration with offline queuing
 * - Sequential Request Number generation (DOC-2026-XXXX)
 * - Verification QR Token creation and lookups
 * - Fee management and Official Receipt (OR) updates
 * - Approval & Release Workflows
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { CertificateRequest, CertificateType, CertificateStatus, PaymentStatus, User, UserRole, PublicVerificationRecord } from '../types';
import { CERTIFICATE_TYPES } from '../constants';
import { filterCertificatesByAccess } from '../utils/jurisdictionUtils';
import { syncService } from './SyncService';
import { storageService } from './storageService';
import { adminService } from './adminService';

// In-memory cache for offline storage and instant UI updates
let localCertificatesStore: CertificateRequest[] = [];

export class CertificateService {
  /**
   * Clears the in-memory certificate cache (used on logout/account switch)
   */
  clearLocalCache(): void {
    localCertificatesStore = [];
  }
  /**
   * Generates next sequential Request Number: DOC-YYYY-0001
   */
  private generateNextRequestNumber(existing: CertificateRequest[]): string {
    const year = new Date().getFullYear();
    const prefix = `DOC-${year}-`;
    
    let maxSeq = 0;
    existing.forEach((cert) => {
      if (cert.requestNumber && cert.requestNumber.startsWith(prefix)) {
        const seqStr = cert.requestNumber.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
    return `${prefix}${nextSeq}`;
  }

  /**
   * Generates next sequential Control Number: CTRL-BC-YYYY-0001
   */
  private generateNextControlNumber(existing: CertificateRequest[]): string {
    const year = new Date().getFullYear();
    const prefix = `CTRL-BC-${year}-`;
    
    let maxSeq = 0;
    existing.forEach((cert) => {
      if (cert.controlNumber && cert.controlNumber.startsWith(prefix)) {
        const seqStr = cert.controlNumber.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });

    const nextSeq = (maxSeq + 101).toString().padStart(4, '0');
    return `${prefix}${nextSeq}`;
  }

  /**
   * Generates a cryptographically secure 128-bit QR Verification Token for public authenticity verification.
   * Uses Web Crypto API (crypto.getRandomValues) to ensure 128 bits of cryptographic entropy.
   * Throws an error if a cryptographically secure RNG is unavailable.
   */
  private generateVerificationToken(): string {
    const bytes = new Uint8Array(16); // 16 bytes = 128 bits of entropy
    const cryptoObj =
      typeof window !== 'undefined' && window.crypto
        ? window.crypto
        : typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : null;

    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(bytes);
    } else {
      throw new Error('Cryptographically secure RNG unavailable in execution environment');
    }

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `BRGY-CERT-VERIFY-${hex}`;
  }

  /**
   * Synchronizes a clean public verification projection record (publicVerifications collection)
   * containing ONLY non-sensitive public verification fields.
   */
  async syncPublicVerificationProjection(cert: CertificateRequest): Promise<void> {
    if (!cert.qrVerificationToken) return;
    const token = cert.qrVerificationToken.trim().toUpperCase();

    const certTypeMeta = CERTIFICATE_TYPES.find((ct) => ct.id === cert.certificateType);
    const certificateTypeLabel = certTypeMeta ? certTypeMeta.label : cert.certificateType;

    const isAuthentic =
      !cert.isDeleted &&
      cert.status !== 'rejected' &&
      cert.status !== 'cancelled' &&
      cert.status !== 'expired';

    const publicPayload: PublicVerificationRecord = {
      qrVerificationToken: token,
      certificateNumber: cert.controlNumber || cert.requestNumber || cert.certificateId,
      certificateType: certificateTypeLabel,
      status: cert.status,
      recipientName: cert.fullName,
      issuedAt: cert.issuedAt || cert.approvedAt || cert.createdAt,
      validUntil: cert.expiresAt || null,
      issuingBarangay: 'Barangay San Jose',
      isAuthentic,
      purpose: cert.purpose || '',
      rejectionReason: cert.rejectionReason || undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (navigator.onLine) {
        const publicRef = doc(db, 'publicVerifications', token);
        await setDoc(publicRef, JSON.parse(JSON.stringify(publicPayload)), { merge: true });
      }
    } catch (err) {
      console.warn('[CertificateService] Public verification projection update deferred:', err);
    }
  }

  /**
   * Reads public verification projection directly from publicVerifications/{token}
   * Safe for unauthenticated public QR scanning without exposing private certificateRequests
   */
  async getPublicVerification(token: string, currentUser?: User | null): Promise<PublicVerificationRecord | null> {
    const cleanToken = token.trim().toUpperCase();
    try {
      const docRef = doc(db, 'publicVerifications', cleanToken);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as PublicVerificationRecord;
      }
    } catch (err) {
      console.warn('[CertificateService] Public verification lookup error:', err);
    }

    // Determine current user auth state and role to prevent unauthorized queries on private certificateRequests
    if (!auth.currentUser) {
      // Unauthenticated users are strictly barred from querying private certificateRequests collection
      return null;
    }

    // Determine user role from parameter or cached active user session
    let userRole: string | null = currentUser?.role || null;
    if (!userRole) {
      try {
        const cachedUser = localStorage.getItem('boims_active_user');
        if (cachedUser) {
          const parsed = JSON.parse(cachedUser);
          userRole = parsed?.role || null;
        }
      } catch (e) {
        // Ignore cache parsing error
      }
    }

    const staffRoles = [
      'secretary',
      'treasurer',
      'executiveOfficer',
      'admin',
      'chairman',
      'developer',
      'verificationOfficer',
      'purokLeader',
      'purokOfficial',
      'verifier',
      'superAdmin',
    ];

    // Only allow fallback lookup if current user is an authorized staff/admin role
    if (!userRole || !staffRoles.includes(userRole)) {
      // Non-staff roles (such as Resident) must not execute queries against private certificateRequests
      return null;
    }

    // Fallback lookup via getCertificateByVerificationToken for authorized staff/admin users
    const cert = await this.getCertificateByVerificationToken(cleanToken);
    if (cert) {
      const certTypeMeta = CERTIFICATE_TYPES.find((ct) => ct.id === cert.certificateType);
      return {
        qrVerificationToken: cleanToken,
        certificateNumber: cert.controlNumber || cert.requestNumber || cert.certificateId,
        certificateType: certTypeMeta ? certTypeMeta.label : cert.certificateType,
        status: cert.status,
        recipientName: cert.fullName,
        issuedAt: cert.issuedAt || cert.approvedAt || cert.createdAt,
        validUntil: cert.expiresAt || null,
        issuingBarangay: 'Barangay San Jose',
        isAuthentic: !cert.isDeleted && cert.status !== 'rejected' && cert.status !== 'cancelled' && cert.status !== 'expired',
        purpose: cert.purpose || '',
        rejectionReason: cert.rejectionReason || undefined,
        updatedAt: cert.updatedAt || new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Fetches all certificate requests from Firestore with local cache fallback and jurisdiction authorization
   */
  async getCertificates(currentUser?: User | null): Promise<CertificateRequest[]> {
    let result: CertificateRequest[] = [];

    if (!currentUser || !auth.currentUser) {
      return localCertificatesStore.filter((cert) => !cert.isDeleted).map((c) => {
        if ((c.status as string) === 'released' || (c.status as string) === 'releasedToResident') {
          return { ...c, status: 'claimed' as CertificateStatus };
        }
        return c;
      });
    }

    const staffRoles = [
      'secretary',
      'treasurer',
      'executiveOfficer',
      'admin',
      'chairman',
      'developer',
      'verificationOfficer',
      'purokLeader',
      'purokOfficial',
    ];
    const isStaffUser = currentUser && staffRoles.includes(currentUser.role);

    try {
      let snapshot;

      if (currentUser && !isStaffUser) {
        // Resident Account: Query Firestore with where("userId", "==", currentUser.uid) to satisfy Firestore Security Rules
        try {
          const residentQuery = query(
            collection(db, 'certificateRequests'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
          );
          snapshot = await getDocs(residentQuery);
        } catch (indexErr: any) {
          console.warn('[CertificateService] Composite index query failed (or building). Falling back to un-ordered query:', indexErr);
          const fallbackQuery = query(
            collection(db, 'certificateRequests'),
            where('userId', '==', currentUser.uid)
          );
          snapshot = await getDocs(fallbackQuery);
        }
      } else {
        // Staff Account: Collection-wide query constrained to non-deleted records
        const staffQuery = query(
          collection(db, 'certificateRequests'),
          where('isDeleted', '==', false)
        );
        snapshot = await getDocs(staffQuery);
      }

      if (snapshot && !snapshot.empty) {
        const firestoreCertificates: CertificateRequest[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as CertificateRequest;
          if (!data.isDeleted) {
            // Map legacy status 'released' or 'releasedToResident' to 'claimed' for Firestore compatibility
            if ((data.status as string) === 'released' || (data.status as string) === 'releasedToResident') {
              data.status = 'claimed';
            }
            firestoreCertificates.push(data);
          }
        });

        // Merge with local store for newly created offline items
        const merged = [...firestoreCertificates];
        localCertificatesStore.forEach((local) => {
          if (!merged.some((m) => m.certificateId === local.certificateId) && !local.isDeleted) {
            if ((local.status as string) === 'released' || (local.status as string) === 'releasedToResident') {
              local.status = 'claimed';
            }
            merged.push(local);
          }
        });

        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        localCertificatesStore = merged;
        result = merged;
      } else {
        result = localCertificatesStore.filter((cert) => !cert.isDeleted).map((c) => {
          if ((c.status as string) === 'released' || (c.status as string) === 'releasedToResident') {
            return { ...c, status: 'claimed' as CertificateStatus };
          }
          return c;
        });
      }
    } catch (error) {
      console.warn('[CertificateService] Firestore offline or error. Using local store cache:', error);
      result = localCertificatesStore.filter((cert) => !cert.isDeleted).map((c) => {
        if ((c.status as string) === 'released' || (c.status as string) === 'releasedToResident') {
          return { ...c, status: 'claimed' as CertificateStatus };
        }
        return c;
      });
    }

    if (currentUser) {
      result = filterCertificatesByAccess(result, currentUser);
    }

    return result;
  }

  /**
   * Subscribes to real-time updates for certificate requests
   */
  subscribeToCertificates(
    currentUser: User | null | undefined,
    callback: (certs: CertificateRequest[]) => void
  ): () => void {
    if (!currentUser || !auth.currentUser) {
      callback(localCertificatesStore.filter((c) => !c.isDeleted));
      return () => {};
    }

    const staffRoles = [
      'secretary',
      'treasurer',
      'executiveOfficer',
      'admin',
      'chairman',
      'developer',
      'verificationOfficer',
      'purokLeader',
      'purokOfficial',
    ];
    const isStaffUser = currentUser && staffRoles.includes(currentUser.role);

    const processSnapshot = (docs: any[]) => {
      const firestoreCertificates: CertificateRequest[] = [];
      docs.forEach((docSnap) => {
        const data = docSnap.data() as CertificateRequest;
        if (!data.isDeleted) {
          if ((data.status as string) === 'released' || (data.status as string) === 'releasedToResident') {
            data.status = 'claimed';
          }
          firestoreCertificates.push(data);
        }
      });

      const merged = [...firestoreCertificates];
      localCertificatesStore.forEach((local) => {
        if (!merged.some((m) => m.certificateId === local.certificateId) && !local.isDeleted) {
          if ((local.status as string) === 'released' || (local.status as string) === 'releasedToResident') {
            local.status = 'claimed';
          }
          merged.push(local);
        }
      });

      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      localCertificatesStore = merged;

      let result = merged;
      if (currentUser) {
        result = filterCertificatesByAccess(result, currentUser);
      }
      callback(result);
    };

    let unsub: (() => void) | null = null;

    if (currentUser && !isStaffUser) {
      try {
        const residentQuery = query(
          collection(db, 'certificateRequests'),
          where('userId', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        unsub = onSnapshot(
          residentQuery,
          (snapshot) => processSnapshot(snapshot.docs),
          (error) => {
            console.warn('[CertificateService] Realtime query building/failed, using fallback:', error);
            const fallbackQuery = query(
              collection(db, 'certificateRequests'),
              where('userId', '==', currentUser.uid)
            );
            unsub = onSnapshot(
              fallbackQuery,
              (snapshot) => processSnapshot(snapshot.docs),
              (err2) => {
                console.error('[CertificateService] Realtime fallback listener error:', err2);
                this.getCertificates(currentUser).then(callback);
              }
            );
          }
        );
      } catch (err) {
        console.warn('[CertificateService] Realtime listener setup failed:', err);
        this.getCertificates(currentUser).then(callback);
        return () => {};
      }
    } else {
      try {
        const staffQuery = query(
          collection(db, 'certificateRequests'),
          where('isDeleted', '==', false)
        );
        unsub = onSnapshot(
          staffQuery,
          (snapshot) => processSnapshot(snapshot.docs),
          (error) => {
            console.warn('[CertificateService] Realtime staff query error, using un-ordered query:', error);
            const fallbackStaffQuery = query(collection(db, 'certificateRequests'));
            unsub = onSnapshot(
              fallbackStaffQuery,
              (snapshot) => processSnapshot(snapshot.docs),
              (err2) => {
                console.error('[CertificateService] Realtime staff fallback listener error:', err2);
                this.getCertificates(currentUser).then(callback);
              }
            );
          }
        );
      } catch (err) {
        console.warn('[CertificateService] Realtime staff listener setup failed:', err);
        this.getCertificates(currentUser).then(callback);
        return () => {};
      }
    }

    return () => {
      if (unsub) unsub();
    };
  }

  /**
   * Fetches a single certificate request by ID or request number
   */
  async getCertificateById(id: string): Promise<CertificateRequest | null> {
    const all = await this.getCertificates();
    const found = all.find(
      (c) => c.certificateId === id || c.requestNumber === id
    );
    if (found) return found;

    try {
      const docRef = doc(db, 'certificateRequests', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as CertificateRequest;
        if (!data.isDeleted) return data;
      }
    } catch (err) {
      console.warn('[CertificateService] Error fetching single cert doc:', err);
    }

    return null;
  }

  /**
   * Looks up a certificate by its public QR verification token
   */
  async getCertificateByVerificationToken(token: string): Promise<CertificateRequest | null> {
    const cleanToken = token.trim().toUpperCase();
    const all = await this.getCertificates();
    const found = all.find((c) => c.qrVerificationToken?.toUpperCase() === cleanToken);
    if (found) return found;

    try {
      const q = query(
        collection(db, 'certificateRequests'),
        where('qrVerificationToken', '==', cleanToken)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs[0].data() as CertificateRequest;
      }
    } catch (err) {
      console.warn('[CertificateService] Token lookup error:', err);
    }

    return null;
  }

  /**
   * Creates a new Certificate Request with automatic sequential numbering
   */
  async createCertificateRequest(params: {
    userId: string;
    performerUserId?: string;
    performerName?: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    purok?: string;
    civilStatus?: string;
    yearsOfResidency?: number;
    businessName?: string;
    certificateType: CertificateType;
    purpose: string;
    remarks?: string;
    supportingDocuments: string[];
    paymentMethod?: string;
    performerRole?: UserRole;
    status?: CertificateStatus;
    paymentStatus?: PaymentStatus;
    amount?: number;
    orNumber?: string;
  }): Promise<CertificateRequest> {
    const existing = await this.getCertificates();
    const requestNumber = this.generateNextRequestNumber(existing);
    const controlNumber = this.generateNextControlNumber(existing);
    const qrVerificationToken = this.generateVerificationToken();

    // Determine default fee
    const certTypeMeta = CERTIFICATE_TYPES.find((ct) => ct.id === params.certificateType);
    let defaultFee = certTypeMeta ? certTypeMeta.defaultFee : 50;
    let initialPaymentStatus: PaymentStatus = 'unpaid';

    if (params.certificateType === 'certificateOfIndigency') {
      defaultFee = 0;
      initialPaymentStatus = 'waived';
    }

    const certificateId = `cert-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const now = new Date().toISOString();

    const finalAmount = params.amount !== undefined ? params.amount : defaultFee;
    const finalPaymentStatus = params.paymentStatus || initialPaymentStatus;
    const finalStatus = params.status || 'submitted';

    const newCert: CertificateRequest = {
      certificateId,
      requestNumber,
      userId: params.userId,
      fullName: params.fullName,
      email: params.email,
      phoneNumber: params.phoneNumber,
      purok: params.purok || 'Purok 1',
      civilStatus: params.civilStatus || 'Single',
      yearsOfResidency: params.yearsOfResidency || 1,
      businessName: params.businessName || '',
      certificateType: params.certificateType,
      purpose: params.purpose,
      remarks: params.remarks || '',
      supportingDocuments: params.supportingDocuments || [],
      status: finalStatus,
      paymentStatus: finalPaymentStatus,
      amount: finalAmount,
      orNumber: params.orNumber || undefined,
      controlNumber,
      qrVerificationToken,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'CERTIFICATE_REQUEST_CREATED',
        module: 'Certificates',
        targetId: certificateId,
        targetType: 'CertificateRequest',
        performedBy: params.performerUserId || params.userId,
        performerName: params.performerName || params.fullName,
        performerRole: params.performerRole || 'secretary',
        newValues: { certificateType: params.certificateType, requestNumber, purpose: params.purpose, status: finalStatus },
      })
      .catch((err) => console.warn('[CertificateService] Audit log error:', err));

    // Persist to Firestore (online) or Queue for Sync (offline)
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'certificateRequests', certificateId);
        // Build payload strictly matching Firestore rules allow create specifications
        const cleanPayload: Record<string, any> = {
          certificateId: newCert.certificateId,
          requestNumber: newCert.requestNumber,
          userId: newCert.userId,
          fullName: newCert.fullName,
          email: newCert.email,
          phoneNumber: newCert.phoneNumber,
          purok: newCert.purok,
          civilStatus: newCert.civilStatus,
          yearsOfResidency: newCert.yearsOfResidency,
          businessName: newCert.businessName,
          certificateType: newCert.certificateType,
          purpose: newCert.purpose,
          remarks: newCert.remarks,
          supportingDocuments: newCert.supportingDocuments,
          status: newCert.status,
          paymentStatus: newCert.paymentStatus,
          amount: newCert.amount,
          controlNumber: newCert.controlNumber,
          qrVerificationToken: newCert.qrVerificationToken,
          createdAt: newCert.createdAt,
          updatedAt: newCert.updatedAt,
          isDeleted: false,
        };
        if (params.orNumber) {
          cleanPayload.orNumber = params.orNumber;
        }
        await setDoc(docRef, cleanPayload);
        // Add to local cache only after successful server persistence
        localCertificatesStore.unshift(newCert);
      } catch (error: any) {
        console.error('[CertificateService] Failed direct write to Firestore:', error);
        if (error.code === 'unavailable' || error.message?.includes('network') || error.message?.includes('offline')) {
          syncService.enqueue('create', 'certificateRequests', certificateId, newCert);
          localCertificatesStore.unshift(newCert);
        } else {
          // Re-throw server permission or validation errors so the UI displays the true server state
          throw error;
        }
      }
    } else {
      syncService.enqueue('create', 'certificateRequests', certificateId, newCert);
      localCertificatesStore.unshift(newCert);
    }

    // Synchronize public verification record (isolated non-blocking projection)
    this.syncPublicVerificationProjection(newCert).catch((err) => {
      console.warn('[CertificateService] Public verification projection skipped:', err);
    });

    return newCert;
  }

  /**
   * Updates certificate status, payment details, or official issuance numbers
   */
  async updateCertificateStatus(
    certificateId: string,
    updates: {
      status?: CertificateStatus;
      paymentStatus?: PaymentStatus;
      orNumber?: string;
      rejectionReason?: string;
      remarks?: string;
      claimMethod?: string;
      actorUserId: string;
      actorUserName: string;
    }
  ): Promise<CertificateRequest> {
    const cert = await this.getCertificateById(certificateId);
    if (!cert) {
      throw new Error(`Certificate request with ID ${certificateId} not found.`);
    }

    // Claimed Lock: Once a certificate reaches claimed (or legacy released), status changes are permanently disabled
    if (cert.status === 'claimed' || cert.status === 'released') {
      throw new Error('This certificate has already been claimed. Further status changes are disabled.');
    }

    const now = new Date().toISOString();
    const updatedCert: CertificateRequest = {
      ...cert,
      updatedAt: now,
    };

    if (updates.status) {
      updatedCert.status = updates.status;

      if (updates.status === 'approved' || updates.status === 'approvedUnderProcess' || updates.status === 'processing') {
        updatedCert.approvedBy = updates.actorUserId;
        updatedCert.approvedAt = now;
      } else if (updates.status === 'rejected') {
        updatedCert.rejectedBy = updates.actorUserId;
        updatedCert.rejectedAt = now;
        if (updates.rejectionReason) {
          updatedCert.rejectionReason = updates.rejectionReason;
        }
      } else if (updates.status === 'readyForRelease') {
        updatedCert.issuedBy = updates.actorUserId;
        updatedCert.issuedByName = updates.actorUserName;
        updatedCert.issuedAt = cert.issuedAt || now;
        
        // Expiry calculation: 1 year from issue date
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 1);
        updatedCert.expiresAt = cert.expiresAt || exp.toISOString();
      } else if (updates.status === 'claimed' || updates.status === 'released') {
        updatedCert.status = 'claimed';
        updatedCert.claimedAt = now;
        updatedCert.releasedBy = updates.actorUserId;
        updatedCert.releasedAt = cert.releasedAt || now;
        if (updates.claimMethod) {
          updatedCert.claimMethod = updates.claimMethod;
        }
      } else if (updates.status === 'expired') {
        updatedCert.status = 'expired';
      }
    }

    if (updates.paymentStatus) {
      updatedCert.paymentStatus = updates.paymentStatus;
    }

    // Auto Payment Rule: When certificate status becomes "claimed" (or "released"),
    // if paymentStatus is "unpaid", automatically update paymentStatus to "paid".
    // If paymentStatus is already "paid" or "waived", do not modify it.
    if (updates.status === 'claimed' || updates.status === 'released') {
      if (updatedCert.paymentStatus === 'unpaid') {
        updatedCert.paymentStatus = 'paid';
      }
    }

    if (updates.orNumber) {
      updatedCert.orNumber = updates.orNumber;
    }

    if (updates.remarks) {
      updatedCert.remarks = updates.remarks;
    }

    // Update local store
    const idx = localCertificatesStore.findIndex((c) => c.certificateId === certificateId);
    if (idx !== -1) {
      localCertificatesStore[idx] = updatedCert;
    }

    // Audit trail logging (non-blocking)
    let actionName = 'CERTIFICATE_STATUS_UPDATED';
    if (updates.status === 'approved' || updates.status === 'approvedUnderProcess' || updates.status === 'processing') {
      actionName = 'CERTIFICATE_APPROVED';
    } else if (updates.status === 'rejected') {
      actionName = 'CERTIFICATE_REJECTED';
    } else if (updates.status === 'readyForRelease') {
      actionName = 'CERTIFICATE_ISSUED';
    } else if (updates.status === 'claimed' || updates.status === 'released') {
      actionName = 'CERTIFICATE_CLAIMED';
    }

    adminService
      .logAuditEvent({
        action: actionName,
        module: 'Certificates',
        targetId: certificateId,
        targetType: 'CertificateRequest',
        performedBy: updates.actorUserId,
        performerName: updates.actorUserName,
        performerRole: 'secretary',
        previousValues: { status: cert.status, paymentStatus: cert.paymentStatus },
        newValues: { status: updatedCert.status, paymentStatus: updatedCert.paymentStatus, orNumber: updatedCert.orNumber },
      })
      .catch((err) => console.warn('[CertificateService] Audit log error:', err));

    // Update Firestore or Queue offline
    try {
      if (navigator.onLine) {
        const docRef = doc(db, 'certificateRequests', certificateId);
        const cleanPayload = JSON.parse(JSON.stringify(updatedCert));
        await updateDoc(docRef, cleanPayload);
      } else {
        syncService.enqueue('update', 'certificateRequests', certificateId, updatedCert);
      }
    } catch (err) {
      console.warn('[CertificateService] Offline update enqueued:', err);
      syncService.enqueue('update', 'certificateRequests', certificateId, updatedCert);
    }

    // Synchronize public verification projection
    await this.syncPublicVerificationProjection(updatedCert);

    return updatedCert;
  }

  /**
   * Soft deletes a certificate request and cleans up associated storage images
   */
  async deleteCertificate(certificateId: string, deletedBy: string): Promise<void> {
    const cert = await this.getCertificateById(certificateId);
    if (!cert) return;

    const now = new Date().toISOString();
    cert.isDeleted = true;
    cert.deletedAt = now;
    cert.deletedBy = deletedBy;

    if (cert.supportingDocuments && cert.supportingDocuments.length > 0) {
      storageService.deleteReportImages(cert.supportingDocuments).catch((err) => {
        console.warn('[CertificateService] Failed to clean document images:', err);
      });
    }

    // Update local cache
    const idx = localCertificatesStore.findIndex((c) => c.certificateId === certificateId);
    if (idx !== -1) {
      localCertificatesStore[idx] = cert;
    }

    // Audit trail logging (non-blocking)
    adminService
      .logAuditEvent({
        action: 'CERTIFICATE_DELETED',
        module: 'Certificates',
        targetId: certificateId,
        targetType: 'CertificateRequest',
        performedBy: deletedBy,
        performerRole: 'admin',
      })
      .catch((err) => console.warn('[CertificateService] Audit log error:', err));

    const payload = { isDeleted: true, deletedAt: now, deletedBy };

    try {
      if (navigator.onLine) {
        const docRef = doc(db, 'certificateRequests', certificateId);
        await updateDoc(docRef, payload);
      } else {
        syncService.enqueue('update', 'certificateRequests', certificateId, payload);
      }
    } catch (err) {
      syncService.enqueue('update', 'certificateRequests', certificateId, payload);
    }

    // Synchronize public verification projection
    await this.syncPublicVerificationProjection(cert);
  }
}

export const certificateService = new CertificateService();
