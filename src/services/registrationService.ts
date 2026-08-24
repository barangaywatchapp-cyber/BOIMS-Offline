/**
 * Service: RegistrationService
 * Handles online self-registration, ID/supporting verification document uploads,
 * email verification triggering, administrative approval/rejection/review workflows
 * with Firestore Transactions (concurrency protection), audit logging, user notification dispatch,
 * and resident directory linking.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
  DocumentSnapshot,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import {
  RegistrationApplication,
  RegistrationStatus,
  User,
  UserRole,
  ResidentProfile,
  ResidentSector,
  VoterStatus,
  VerificationMethod,
} from '../types';
import { storageService } from './storageService';
import { adminService } from './adminService';
import { notificationService } from './notificationService';
import { filterApplicationsByAccess } from '../utils/jurisdictionUtils';
import { claimUniqueBoimsId, syncBoimsIndexMetadata } from '../utils/boimsIdUtils';

export interface SubmitRegistrationDTO {
  registrationType: 'resident' | 'purokOfficial';
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  phoneNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  civilStatus: string;
  occupation?: string;
  address: string;
  purok: string;
  barangay: string;
  municipality: string;
  province: string;
  postalCode?: string;
  requestedRole?: UserRole;
  sectors: ResidentSector[];
  voterStatus: VoterStatus;

  // Identity Verification Choice
  verificationMethod: VerificationMethod;
  idType?: string;
  idNumber?: string;
  idFrontFile?: File | null;
  idBackFile?: File | null;
  selfieFile?: File | null;

  supportingDocType?: string;
  supportingDocFile?: File | null;

  // Official Registration Documents
  residencyProofFile?: File | null;
  appointmentProofFile?: File | null;
}

export class RegistrationService {
  /**
   * Persists a newly created registration application directly to /registrations/{uid}.
   * Executed client-side after successful Firebase Auth creation.
   */
  async createRegistrationApplication(appData: RegistrationApplication): Promise<void> {
    try {
      const regDocRef = doc(db, 'registrations', appData.uid);
      await setDoc(regDocRef, appData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `registrations/${appData.uid}`);
    }
  }

  /**
   * Submits a new online registration request with identity metadata to the server.
   * Server-authoritative: Creates pending registration and dispatches single-use verification link.
   * Document binaries are uploaded securely to Firebase Storage after email verification and sign-in.
   * Firebase Auth credentials are created ONLY AFTER the user validates email ownership.
   */
  async submitRegistration(dto: SubmitRegistrationDTO): Promise<RegistrationApplication> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const fullName = [dto.firstName, dto.middleName, dto.lastName, dto.suffix]
      .filter(Boolean)
      .join(' ')
      .trim();

    const targetRole: UserRole = dto.registrationType === 'purokOfficial' ? 'purokOfficial' : 'resident';

    // Call server registration endpoint to create pending registration and send single-use verification link
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationType: dto.registrationType,
          email: cleanEmail,
          password: dto.password,
          firstName: dto.firstName.trim(),
          middleName: dto.middleName?.trim() || '',
          lastName: dto.lastName.trim(),
          suffix: dto.suffix?.trim() || '',
          phoneNumber: dto.phoneNumber.trim(),
          birthDate: dto.birthDate,
          gender: dto.gender,
          civilStatus: dto.civilStatus,
          occupation: dto.occupation?.trim() || '',
          address: dto.address.trim(),
          purok: dto.purok,
          barangay: dto.barangay || 'Barangay Central',
          municipality: dto.municipality || 'Baras',
          province: dto.province || 'Rizal',
          postalCode: dto.postalCode || '1970',
          requestedRole: targetRole,
          sectors: dto.sectors || [],
          voterStatus: dto.voterStatus || 'registered',
          verificationMethod: dto.verificationMethod,
          idType: dto.idType || '',
          idNumber: dto.idNumber || '',
          idFrontUrl: '',
          idBackUrl: '',
          selfieUrl: '',
          supportingDocType: dto.supportingDocType || '',
          supportingDocUrl: '',
          residencyProofUrl: '',
          appointmentProofUrl: '',
          documentRefs: {},
        }),
      });

      let data: any = {};
      try {
        const text = await response.text();
        if (text && text.trim().length > 0) {
          data = JSON.parse(text);
        }
      } catch (parseErr) {
        console.warn('[RegistrationService] Failed to parse JSON response:', parseErr);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Registration submission failed (Status: ${response.status}).`);
      }

      const timestamp = new Date().toISOString();

      return {
        registrationId: data.pendingId || `pending_${Date.now()}`,
        uid: '',
        registrationType: dto.registrationType,
        firstName: dto.firstName.trim(),
        middleName: dto.middleName?.trim() || '',
        lastName: dto.lastName.trim(),
        suffix: dto.suffix?.trim() || '',
        fullName,
        email: cleanEmail,
        phoneNumber: dto.phoneNumber.trim(),
        birthDate: dto.birthDate,
        gender: dto.gender,
        civilStatus: dto.civilStatus,
        occupation: dto.occupation?.trim() || '',
        address: dto.address.trim(),
        purok: dto.purok,
        barangay: dto.barangay || 'Barangay Central',
        municipality: dto.municipality || 'Baras',
        province: dto.province || 'Rizal',
        postalCode: dto.postalCode || '1970',
        requestedRole: targetRole,
        sectors: dto.sectors || [],
        voterStatus: dto.voterStatus || 'registered',
        verificationMethod: dto.verificationMethod,
        idType: dto.idType || '',
        idNumber: dto.idNumber || '',
        idFrontUrl: '',
        idBackUrl: '',
        selfieUrl: '',
        supportingDocType: dto.supportingDocType || '',
        supportingDocUrl: '',
        residencyProofUrl: '',
        appointmentProofUrl: '',
        documentRefs: {},
        emailVerified: false,
        status: 'pending',
        submittedAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (apiErr: any) {
      console.error('[RegistrationService] /api/register call failed:', apiErr);
      throw new Error(apiErr.message || 'Failed to submit registration application.');
    }
  }

  /**
   * Verifies an email verification token against the server.
   * Provisions Firebase Auth account and promotes pending registration to official application.
   */
  async verifyRegistrationEmail(token: string): Promise<{
    success: boolean;
    alreadyVerified?: boolean;
    message?: string;
    uid?: string;
    email?: string;
    fullName?: string;
    status?: string;
  }> {
    try {
      const response = await fetch('/api/verify-registration-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      let data: any = {};
      try {
        const text = await response.text();
        if (text && text.trim().length > 0) {
          data = JSON.parse(text);
        }
      } catch (parseErr) {
        console.warn('[RegistrationService] Failed to parse JSON response:', parseErr);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Email verification failed (Status: ${response.status}).`);
      }
      return data;
    } catch (err: any) {
      console.error('[RegistrationService] verifyRegistrationEmail error:', err);
      throw err;
    }
  }

  /**
   * Requests a fresh verification link for a pending registration.
   */
  async resendVerificationEmail(email: string): Promise<{
    success: boolean;
    alreadyApproved?: boolean;
    alreadyVerified?: boolean;
    message?: string;
    email?: string;
    expiresAt?: string;
    verificationLink?: string;
  }> {
    try {
      const response = await fetch('/api/resend-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      let data: any = {};
      try {
        const text = await response.text();
        if (text && text.trim().length > 0) {
          data = JSON.parse(text);
        }
      } catch (parseErr) {
        console.warn('[RegistrationService] Failed to parse JSON response:', parseErr);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Failed to resend verification email (Status: ${response.status}).`);
      }
      return data;
    } catch (err: any) {
      console.error('[RegistrationService] resendVerificationEmail error:', err);
      throw err;
    }
  }

  /**
   * Fetches pending registration applications
   */
  async getPendingRegistrations(currentUser?: User | null): Promise<RegistrationApplication[]> {
    return this.getAllRegistrations('pending', 'all', currentUser);
  }

  /**
   * Fetches all registration applications with filter options and jurisdiction authorization
   */
  async getAllRegistrations(
    statusFilter?: RegistrationStatus | 'all',
    purokFilter?: string,
    currentUser?: User | null,
    options?: { limitCount?: number; lastDoc?: DocumentSnapshot | null }
  ): Promise<RegistrationApplication[]> {
    try {
      const regRef = collection(db, 'registrations');
      const constraints: QueryConstraint[] = [];

      if (statusFilter && statusFilter !== 'all') {
        constraints.push(where('status', '==', statusFilter));
      }
      if (purokFilter && purokFilter !== 'all') {
        constraints.push(where('purok', '==', purokFilter));
      }
      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      if (options?.limitCount && options.limitCount > 0) {
        constraints.push(limit(options.limitCount));
      }

      let snapshot;
      try {
        const q = query(regRef, ...constraints);
        snapshot = await getDocs(q);
      } catch (indexErr) {
        console.warn('[RegistrationService] Constrained query failed, falling back to basic query:', indexErr);
        snapshot = await getDocs(regRef);
      }

      if (snapshot.empty) {
        return [];
      }

      let items = snapshot.docs.map((d) => d.data() as RegistrationApplication);

      if (currentUser) {
        items = filterApplicationsByAccess(items, currentUser);
      }

      if (statusFilter && statusFilter !== 'all') {
        items = items.filter((item) => item.status === statusFilter);
      }

      if (purokFilter && purokFilter !== 'all') {
        items = items.filter((item) => item.purok === purokFilter);
      }

      // Sort newest submission first
      items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      return items;
    } catch (err) {
      console.warn('[RegistrationService] Firestore getAllRegistrations failed:', err);
      return [];
    }
  }

  /**
   * Fetches single registration record by ID or UID
   */
  async getRegistrationById(registrationIdOrUid: string): Promise<RegistrationApplication | null> {
    try {
      // First try fetching directly by doc ID
      const docRef = doc(db, 'registrations', registrationIdOrUid);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        return snap.data() as RegistrationApplication;
      }

      // If not found, query by uid
      const allRegs = await this.getAllRegistrations('all');
      const found = allRegs.find((r) => r.uid === registrationIdOrUid || r.registrationId === registrationIdOrUid);
      return found || null;
    } catch (err) {
      console.warn(`[RegistrationService] Error fetching registration ${registrationIdOrUid}:`, err);
      return null;
    }
  }

  /**
   * Reloads Firebase Auth user and syncs real email verification status to Firestore
   */
  async syncEmailVerificationStatus(uid: string): Promise<boolean> {
    try {
      if (auth.currentUser && auth.currentUser.uid === uid) {
        await auth.currentUser.reload();
        const isVerified = auth.currentUser.emailVerified;
        if (isVerified) {
          const userRef = doc(db, 'users', uid);
          const regRef = doc(db, 'registrations', uid);
          await updateDoc(userRef, { emailVerified: true }).catch(() => {});
          await updateDoc(regRef, { emailVerified: true }).catch(() => {});
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('[RegistrationService] Failed to sync email verification status:', err);
      return false;
    }
  }

  /**
   * Claims an application for verification by a specific verifier officer
   */
  async claimApplication(
    registrationId: string,
    verifierUser: User
  ): Promise<{ success: boolean; message: string }> {
    const timestamp = new Date().toISOString();

    try {
      await runTransaction(db, async (transaction) => {
        const regRef = doc(db, 'registrations', registrationId);
        const regDoc = await transaction.get(regRef);

        if (!regDoc.exists()) {
          throw new Error('Registration application record not found.');
        }

        const currentReg = regDoc.data() as RegistrationApplication;

        if (currentReg.assignedVerifier && currentReg.assignedVerifier !== verifierUser.uid) {
          throw new Error(
            `This application has already been claimed by ${currentReg.assignedVerifierName || 'another verifier'}.`
          );
        }

        transaction.update(regRef, {
          assignedVerifier: verifierUser.uid,
          assignedVerifierName: verifierUser.fullName || 'Verification Officer',
          status: 'under_review',
          reviewedBy: verifierUser.uid,
          reviewerName: verifierUser.fullName || 'Verification Officer',
          updatedAt: timestamp,
        });
      });

      await adminService.logAuditEvent({
        action: 'REGISTRATION_STATUS_UPDATED',
        module: 'Registration',
        targetId: registrationId,
        targetType: 'RegistrationApplication',
        performedBy: verifierUser.uid,
        performerName: verifierUser.fullName,
        performerRole: verifierUser.role,
        newValues: { assignedVerifier: verifierUser.uid, status: 'under_review' },
        reason: 'Verifier claimed application for verification review',
      });

      return { success: true, message: `Application claimed successfully by ${verifierUser.fullName}.` };
    } catch (err: any) {
      console.error('[RegistrationService] claimApplication transaction failed:', err);
      throw new Error(err.message || 'Failed to claim application.');
    }
  }

  /**
   * Marks a registration application as 'under_review' using a single Firestore runTransaction()
   */
  async markUnderReview(
    registrationId: string,
    reviewerUser: User
  ): Promise<{ success: boolean; message: string }> {
    const timestamp = new Date().toISOString();

    try {
      await runTransaction(db, async (transaction) => {
        const regRef = doc(db, 'registrations', registrationId);
        const regDoc = await transaction.get(regRef);

        if (!regDoc.exists()) {
          throw new Error('Registration application record not found.');
        }

        transaction.update(regRef, {
          status: 'under_review',
          reviewedBy: reviewerUser.uid,
          reviewerName: reviewerUser.fullName || 'Verification Officer',
          updatedAt: timestamp,
        });
      });

      return { success: true, message: 'Application status set to Under Review.' };
    } catch (err: any) {
      console.error('[RegistrationService] markUnderReview transaction failed:', err);
      throw new Error(err.message || 'Failed to update review status.');
    }
  }

  /**
   * Requests additional documents from applicant using a single Firestore runTransaction()
   */
  async requestAdditionalDocs(
    registrationId: string,
    reviewerUser: User,
    additionalDocsRemarks: string
  ): Promise<{ success: boolean; message: string }> {
    if (!additionalDocsRemarks || !additionalDocsRemarks.trim()) {
      throw new Error('Please specify what additional documents or corrections are required from the applicant.');
    }

    const timestamp = new Date().toISOString();

    try {
      const result = await runTransaction(db, async (transaction) => {
        const regRef = doc(db, 'registrations', registrationId);
        const regDoc = await transaction.get(regRef);

        if (!regDoc.exists()) {
          throw new Error('Registration application record not found.');
        }

        const currentReg = regDoc.data() as RegistrationApplication;

        transaction.update(regRef, {
          status: 'needs_additional_docs',
          additionalDocsRemarks: additionalDocsRemarks.trim(),
          reviewedBy: reviewerUser.uid,
          reviewerName: reviewerUser.fullName || 'Verification Officer',
          reviewedAt: timestamp,
          updatedAt: timestamp,
        });

        return {
          applicantUid: currentReg.uid,
          applicantName: currentReg.fullName,
        };
      });

      // Send notification to user
      await notificationService.createNotification({
        userId: result.applicantUid,
        title: '📄 Additional Verification Documents Required',
        message: `Your BOIMS registration requires additional verification documents: "${additionalDocsRemarks.trim()}". Please update your application.`,
        type: 'announcement',
        priority: 'high',
        link: '/pending-verification',
        createdBy: reviewerUser.uid,
      });

      await adminService.logAuditEvent({
        action: 'REGISTRATION_STATUS_UPDATED',
        module: 'Registration',
        targetId: registrationId,
        targetType: 'RegistrationApplication',
        performedBy: reviewerUser.uid,
        performerName: reviewerUser.fullName,
        performerRole: reviewerUser.role,
        newValues: { status: 'needs_additional_docs', remarks: additionalDocsRemarks },
        reason: 'Requested additional verification documents from applicant',
      });

      return {
        success: true,
        message: `Requested additional documents from ${result.applicantName}.`,
      };
    } catch (err: any) {
      console.error('[RegistrationService] requestAdditionalDocs transaction failed:', err);
      throw new Error(err.message || 'Failed to request additional documents.');
    }
  }

  /**
   * Approves a registration application using a single Firestore runTransaction()
   * Updates registration status, user account status, and creates resident profile atomically.
   */
  async approveRegistration(
    registrationId: string,
    reviewerUser: User,
    assignedRole?: UserRole,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    const timestamp = new Date().toISOString();

    const regSnap = await getDoc(doc(db, 'registrations', registrationId));
    if (!regSnap.exists()) {
      throw new Error('Registration application record not found.');
    }
    const regData = regSnap.data() as RegistrationApplication;
    const claimedBoimsId = await claimUniqueBoimsId(regData.uid);

    try {
      const result = await runTransaction(db, async (transaction) => {
        const regRef = doc(db, 'registrations', registrationId);

        const regDoc = await transaction.get(regRef);
        if (!regDoc.exists()) {
          throw new Error('Registration application record not found.');
        }

        const currentReg = regDoc.data() as RegistrationApplication;
        const userRef = doc(db, 'users', currentReg.uid);
        const userDoc = await transaction.get(userRef);

        const residentId = `RES-${currentReg.uid.slice(0, 8).toUpperCase()}`;
        const residentRef = doc(db, 'residents', residentId);
        const residentDoc = await transaction.get(residentRef);

        // ENFORCE REAL FIREBASE EMAIL VERIFICATION
        const isEmailVerified = Boolean(
          currentReg.emailVerified || (userDoc.exists() && userDoc.data().emailVerified)
        );

        if (!isEmailVerified) {
          throw new Error(
            `Cannot approve registration: Applicant ${currentReg.fullName} (${currentReg.email}) has not verified their email address via Firebase Authentication link yet. The applicant must click the verification link sent to their email before approval.`
          );
        }

        // Prevent double-approval or approval of rejected accounts without reset
        if (currentReg.status === 'approved') {
          throw new Error(
            `CONCURRENCY ERROR: This registration application was already APPROVED by ${
              currentReg.reviewerName || 'another administrator'
            } on ${new Date(currentReg.reviewedAt || '').toLocaleString()}.`
          );
        }

        const finalRole = assignedRole || currentReg.requestedRole || 'resident';

        // --- PERFORM ALL WRITES STRICTLY AFTER ALL READS ---

        // Update Registration Application status atomically inside transaction
        transaction.update(regRef, {
          status: 'approved',
          reviewedBy: reviewerUser.uid,
          reviewerName: reviewerUser.fullName || 'Verification Officer',
          reviewedAt: timestamp,
          updatedAt: timestamp,
          notes: notes || 'Verified identity documents and approved account.',
          ...(!residentDoc.exists() ? { linkedResidentId: residentId } : {}),
        });

        // Provision official User Profile atomically inside transaction
        const newUserDoc: User = {
          uid: currentReg.uid,
          boimsId: (userDoc.exists() && userDoc.data()?.boimsId) || claimedBoimsId,
          email: currentReg.email.trim().toLowerCase(),
          firstName: currentReg.firstName ? currentReg.firstName.trim() : '',
          middleName: currentReg.middleName ? currentReg.middleName.trim() : '',
          lastName: currentReg.lastName ? currentReg.lastName.trim() : '',
          suffix: currentReg.suffix ? currentReg.suffix.trim() : '',
          fullName: currentReg.fullName || `${currentReg.firstName || ''} ${currentReg.lastName || ''}`.trim(),
          phoneNumber: currentReg.phoneNumber || '',
          address: currentReg.address || 'Barangay Central',
          purok: currentReg.purok || 'Central',
          jurisdiction: currentReg.purok || currentReg.barangay || 'Barangay Central',
          barangay: currentReg.barangay || 'Barangay Central',
          municipality: currentReg.municipality || 'Baras',
          province: currentReg.province || 'Rizal',
          postalCode: currentReg.postalCode || '1970',
          profilePicture: currentReg.selfieUrl || currentReg.idFrontUrl || '',
          role: finalRole,
          dutyStatus: 'offDuty',
          dutyMode: 'offDuty',
          presence: {
            status: 'offline',
            lastSeen: timestamp,
          },
          status: 'active',
          emailVerified: true,
          mustChangePassword: false,
          isActive: true,
          createdAt: currentReg.submittedAt || timestamp,
          updatedAt: timestamp,
          createdBy: reviewerUser.uid,
          updatedBy: reviewerUser.uid,
          isDeleted: false,
        };

        if (userDoc.exists()) {
          const existingData = userDoc.data();
          const mergedUserDoc: User = {
            ...newUserDoc,
            ...existingData,
            role: finalRole,
            status: 'active',
            emailVerified: true,
            isActive: true,
            updatedAt: timestamp,
            updatedBy: reviewerUser.uid,
          };
          transaction.set(userRef, mergedUserDoc);
        } else {
          transaction.set(userRef, newUserDoc);
        }

        // Link or create Resident Profile in residents/ collection atomically
        if (!residentDoc.exists()) {
          const birthYear = currentReg.birthDate ? new Date(currentReg.birthDate).getFullYear() : 2000;
          const age = new Date().getFullYear() - birthYear;

          const newResident: ResidentProfile = {
            residentId,
            userId: currentReg.uid,
            firstName: currentReg.firstName,
            middleName: currentReg.middleName,
            lastName: currentReg.lastName,
            suffix: currentReg.suffix,
            fullName: currentReg.fullName,
            birthDate: currentReg.birthDate,
            age,
            gender: currentReg.gender,
            civilStatus: (currentReg.civilStatus as any) || 'single',
            citizenship: 'Filipino',
            occupation: currentReg.occupation,
            contactNumber: currentReg.phoneNumber,
            email: currentReg.email,
            address: currentReg.address,
            purok: currentReg.purok,
            barangay: currentReg.barangay,
            municipality: currentReg.municipality,
            province: currentReg.province,
            idType: currentReg.idType || 'Document Verified',
            idNumber: currentReg.idNumber || '',
            idFrontImage: currentReg.idFrontUrl || currentReg.supportingDocUrl || '',
            sectors: currentReg.sectors,
            voterStatus: currentReg.voterStatus,
            verificationStatus: 'verified',
            verifiedBy: reviewerUser.uid,
            verifiedAt: timestamp,
            isHouseholdHead: false,
            residencyStatus: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: reviewerUser.uid,
            isDeleted: false,
          };

          transaction.set(residentRef, newResident);
        }

        return {
          applicantName: currentReg.fullName,
          applicantUid: currentReg.uid,
          roleAssigned: finalRole,
        };
      });

      // Synchronize index metadata for newly approved user
      syncBoimsIndexMetadata(result.applicantUid).catch(() => {});

      // Post-transaction Audit Logging & User Notification
      await adminService.logAuditEvent({
        action: 'REGISTRATION_APPROVED',
        module: 'Registration',
        targetId: registrationId,
        targetType: 'RegistrationApplication',
        performedBy: reviewerUser.uid,
        performerName: reviewerUser.fullName,
        performerRole: reviewerUser.role,
        newValues: { status: 'approved', assignedRole: result.roleAssigned },
        reason: notes || 'Identity verified and account approved by verification officer',
      });

      await notificationService.createNotification({
        userId: result.applicantUid,
        title: '🎉 Registration Approved! Welcome to BOIMS',
        message: `Your BOIMS account registration for ${result.applicantName} has been approved as ${result.roleAssigned.toUpperCase()}. You now have full access to barangay services.`,
        type: 'certificateApproved',
        priority: 'high',
        link: '/dashboard',
        createdBy: reviewerUser.uid,
      });

      return {
        success: true,
        message: `Successfully approved registration for ${result.applicantName} as ${result.roleAssigned}.`,
      };
    } catch (err: any) {
      console.error('[RegistrationService] Transaction failed:', err);
      throw new Error(err.message || 'Failed to process approval transaction.');
    }
  }

  /**
   * Alias for approveRegistration
   */
  async approveRegistrationTransaction(
    registrationId: string,
    reviewerUser: User,
    assignedRole?: UserRole,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.approveRegistration(registrationId, reviewerUser, assignedRole, notes);
  }

  /**
   * Rejects a registration application using a single Firestore runTransaction()
   * Updates registration status and user account status atomically.
   */
  async rejectRegistration(
    registrationId: string,
    reviewerUser: User,
    rejectionReason: string
  ): Promise<{ success: boolean; message: string }> {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new Error('Mandatory rejection reason must be provided for account verification rejection.');
    }

    const timestamp = new Date().toISOString();

    try {
      const result = await runTransaction(db, async (transaction) => {
        const regRef = doc(db, 'registrations', registrationId);

        const regDoc = await transaction.get(regRef);
        if (!regDoc.exists()) {
          throw new Error('Registration application record not found.');
        }

        const currentReg = regDoc.data() as RegistrationApplication;
        const userRef = doc(db, 'users', currentReg.uid);
        const userDoc = await transaction.get(userRef);

        if (currentReg.status === 'rejected') {
          throw new Error(
            `CONCURRENCY ERROR: This registration application was already REJECTED by ${
              currentReg.reviewerName || 'another administrator'
            } on ${new Date(currentReg.reviewedAt || '').toLocaleString()}.`
          );
        }

        // Update Registration Application status atomically inside transaction
        transaction.update(regRef, {
          status: 'rejected',
          rejectionReason: rejectionReason.trim(),
          reviewedBy: reviewerUser.uid,
          reviewerName: reviewerUser.fullName || 'Verification Officer',
          reviewedAt: timestamp,
          updatedAt: timestamp,
        });

        // Update User Profile status atomically inside transaction
        if (userDoc.exists()) {
          transaction.update(userRef, {
            status: 'suspended',
            isActive: false,
            updatedAt: timestamp,
            updatedBy: reviewerUser.uid,
          });
        }

        return {
          applicantName: currentReg.fullName,
          applicantUid: currentReg.uid,
        };
      });

      // Post-transaction Audit Logging & User Notification
      await adminService.logAuditEvent({
        action: 'REGISTRATION_REJECTED',
        module: 'Registration',
        targetId: registrationId,
        targetType: 'RegistrationApplication',
        performedBy: reviewerUser.uid,
        performerName: reviewerUser.fullName,
        performerRole: reviewerUser.role,
        newValues: { status: 'rejected', rejectionReason },
        reason: rejectionReason,
      });

      await notificationService.createNotification({
        userId: result.applicantUid,
        title: '⚠️ Registration Status Update: Verification Unsuccessful',
        message: `Your BOIMS registration application for ${result.applicantName} was not approved. Reason: ${rejectionReason}. Please contact Barangay Administration or resubmit with valid documents.`,
        type: 'announcement',
        priority: 'high',
        link: '/pending-verification',
        createdBy: reviewerUser.uid,
      });

      return {
        success: true,
        message: `Registration application for ${result.applicantName} rejected. Reason logged.`,
      };
    } catch (err: any) {
      console.error('[RegistrationService] Reject transaction failed:', err);
      throw new Error(err.message || 'Failed to reject registration application.');
    }
  }

  /**
   * Alias for rejectRegistration
   */
  async rejectRegistrationTransaction(
    registrationId: string,
    reviewerUser: User,
    rejectionReason: string
  ): Promise<{ success: boolean; message: string }> {
    return this.rejectRegistration(registrationId, reviewerUser, rejectionReason);
  }

  /**
   * Updates registration document URLs for an authenticated applicant in /registrations/{registrationId}.
   * Allowed for the document owner while the application is in pending / needs_revision status.
   */
  async updateRegistrationDocuments(
    registrationId: string,
    documentUrls: {
      idFrontUrl?: string;
      idBackUrl?: string;
      selfieUrl?: string;
      residencyProofUrl?: string;
      appointmentProofUrl?: string;
      supportingDocUrl?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const regRef = doc(db, 'registrations', registrationId);
      const updates: any = {
        updatedAt: new Date().toISOString(),
      };
      if (documentUrls.idFrontUrl !== undefined) updates.idFrontUrl = documentUrls.idFrontUrl;
      if (documentUrls.idBackUrl !== undefined) updates.idBackUrl = documentUrls.idBackUrl;
      if (documentUrls.selfieUrl !== undefined) updates.selfieUrl = documentUrls.selfieUrl;
      if (documentUrls.residencyProofUrl !== undefined) updates.residencyProofUrl = documentUrls.residencyProofUrl;
      if (documentUrls.appointmentProofUrl !== undefined) updates.appointmentProofUrl = documentUrls.appointmentProofUrl;
      if (documentUrls.supportingDocUrl !== undefined) updates.supportingDocUrl = documentUrls.supportingDocUrl;

      await updateDoc(regRef, updates);
      return { success: true, message: 'Registration documents updated successfully.' };
    } catch (err: any) {
      console.error('[RegistrationService] updateRegistrationDocuments error:', err);
      throw new Error(err.message || 'Failed to update registration documents.');
    }
  }

  /**
   * Allows applicant to resubmit missing/additional documents
   */
  async resubmitDocuments(
    registrationId: string,
    payload: { documentUrl?: string; documentType?: string; notes?: string }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const regRef = doc(db, 'registrations', registrationId);
      const updates: any = {
        status: 'under_review',
        updatedAt: new Date().toISOString(),
      };
      if (payload.documentUrl) {
        if (payload.documentType === 'residencyProof') {
          updates.residencyProofUrl = payload.documentUrl;
        } else if (payload.documentType === 'appointmentProof') {
          updates.appointmentProofUrl = payload.documentUrl;
        } else if (payload.documentType === 'selfie') {
          updates.selfieUrl = payload.documentUrl;
        } else if (payload.documentType === 'idBack') {
          updates.idBackUrl = payload.documentUrl;
        } else if (payload.documentType === 'supportingDoc') {
          updates.supportingDocUrl = payload.documentUrl;
        } else {
          updates.idFrontUrl = payload.documentUrl;
        }
      }
      if (payload.notes) {
        updates.resubmissionNotes = payload.notes;
      }
      await updateDoc(regRef, updates);
      return { success: true, message: 'Documents resubmitted successfully.' };
    } catch (err: any) {
      console.error('[RegistrationService] resubmitDocuments error:', err);
      throw new Error(err.message || 'Failed to resubmit documents.');
    }
  }
}

export const registrationService = new RegistrationService();
