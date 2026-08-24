import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { HouseholdInvite, Household, HouseholdMember, User } from '../types';
import { residentService } from './residentService';
import { notificationService } from './notificationService';

const HOUSEHOLD_INVITES_COLLECTION = 'householdInvites';
const USERS_COLLECTION = 'users';
const BOIMS_IDS_COLLECTION = 'boimsIds';

class HouseholdInviteService {
  private localInvites: HouseholdInvite[] = [];

  /**
   * Helper to normalize BOIMS ID string
   */
  normalizeBoimsId(raw: string): string {
    if (!raw) return '';
    return raw.trim().toUpperCase();
  }

  /**
   * Look up a target user by BOIMS ID
   */
  async lookupUserByBoimsId(rawBoimsId: string, currentUserId: string): Promise<User> {
    const cleanBoimsId = this.normalizeBoimsId(rawBoimsId);

    if (!cleanBoimsId) {
      throw new Error('Please enter a BOIMS Identification Number.');
    }

    if (!cleanBoimsId.startsWith('BOIMS-')) {
      throw new Error('Invalid BOIMS ID format. Expected format: BOIMS-XXXX-XXXX');
    }

    // 1. Check if user is attempting to add themselves using current user's profile
    if (currentUserId) {
      try {
        const currentUserSnap = await getDoc(doc(db, USERS_COLLECTION, currentUserId));
        if (currentUserSnap.exists()) {
          const curData = currentUserSnap.data() as User;
          if (curData.boimsId && this.normalizeBoimsId(curData.boimsId) === cleanBoimsId) {
            throw new Error("You cannot add yourself to your own household using your own BOIMS ID.");
          }
        }
      } catch (e) {
        // Safe to ignore if current user snapshot read fails
      }
    }

    let targetUid: string | null = null;
    let targetUserData: User | null = null;

    // 2. Query boimsIds collection point lookup (Allowed for all authenticated users)
    try {
      const boimsDocRef = doc(db, BOIMS_IDS_COLLECTION, cleanBoimsId);
      const boimsSnap = await getDoc(boimsDocRef);
      if (boimsSnap.exists()) {
        const bData = boimsSnap.data();
        if (bData && bData.uid && bData.isDeleted !== true) {
          targetUid = bData.uid;

          // If index contains metadata (fullName/firstName), construct targetUserData directly
          if (bData.fullName || bData.firstName) {
            const firstName = bData.firstName || '';
            const lastName = bData.lastName || '';
            const middleName = bData.middleName || '';
            const fullName =
              bData.fullName ||
              `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim() ||
              'Resident';

            targetUserData = {
              uid: bData.uid,
              boimsId: bData.boimsId || cleanBoimsId,
              fullName,
              firstName,
              lastName,
              middleName,
              birthDate: bData.birthDate || bData.birthdate || '',
              purok: bData.purok || '',
              address: bData.address || '',
              barangay: bData.barangay || 'Barangay Central',
              role: bData.role || 'resident',
              status: bData.status || 'active',
              isDeleted: bData.isDeleted === true,
              householdId: bData.householdId || '',
            } as User;
          }
        }
      }
    } catch (err) {
      console.warn('[HouseholdInviteService] boimsIds lookup error:', err);
    }

    // 3. Fallback for staff/admin if index doc lacked metadata
    if (!targetUserData && targetUid) {
      if (targetUid === currentUserId) {
        throw new Error("You cannot add yourself to your own household.");
      }
      try {
        const userSnap = await getDoc(doc(db, USERS_COLLECTION, targetUid));
        if (userSnap.exists() && !userSnap.data()?.isDeleted) {
          targetUserData = { uid: userSnap.id, ...userSnap.data() } as User;
        }
      } catch (err) {
        console.warn('[HouseholdInviteService] Direct user read fallback error (expected for residents):', err);
      }
    }

    // 4. Secondary fallback for staff/admin: Query users collection
    if (!targetUserData) {
      try {
        const q = query(
          collection(db, USERS_COLLECTION),
          where('boimsId', '==', cleanBoimsId),
          where('isDeleted', '==', false)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          targetUserData = { uid: docSnap.id, ...docSnap.data() } as User;
        }
      } catch (err) {
        console.warn('[HouseholdInviteService] Fallback user query error (expected for residents):', err);
      }
    }

    if (!targetUserData) {
      throw new Error(`No active registered resident found with BOIMS ID: ${cleanBoimsId}`);
    }

    if (targetUserData.uid === currentUserId) {
      throw new Error("You cannot add yourself to your own household.");
    }

    if (targetUserData.status === 'suspended') {
      throw new Error(`The account associated with BOIMS ID ${cleanBoimsId} is currently suspended.`);
    }

    return targetUserData;
  }

  /**
   * Send a family member request to a target BOIMS ID
   */
  async sendHouseholdInvite(params: {
    requester: User;
    householdId: string;
    targetBoimsId: string;
    proposedRole: string;
    occupation?: string;
  }): Promise<HouseholdInvite> {
    const { requester, householdId, targetBoimsId, proposedRole, occupation } = params;

    // Validate role
    if (!proposedRole || !proposedRole.trim()) {
      throw new Error('Relationship / Role is required.');
    }

    // 1. Look up target user
    const targetUser = await this.lookupUserByBoimsId(targetBoimsId, requester.uid);

    // 2. Fetch household document
    let household = await residentService.getHouseholdById(householdId);
    if (!household) {
      // If requester does not have a household yet, create one automatically
      household = await residentService.createHousehold(
        {
          householdHeadName: requester.fullName,
          householdHeadId: requester.uid,
          address: requester.address || 'Barangay Central',
          purok: requester.purok || 'Purok 1',
          barangay: requester.barangay || 'Barangay Central',
          municipality: requester.municipality || 'City',
          province: requester.province || 'Province',
          membersCount: 1,
          memberResidentIds: [requester.uid],
          members: [
            {
              id: `MEM-${requester.uid.slice(0, 8)}`,
              fullName: requester.fullName,
              birthdate: (requester as any).birthDate || (requester as any).birthdate || '',
              age: residentService.computeAgeFromBirthdate((requester as any).birthDate || (requester as any).birthdate),
              gender: (requester as any).gender || 'male',
              relationshipToHead: 'Head of Household',
              isHouseholdHead: true,
              residentId: requester.uid,
              boimsId: requester.boimsId,
            },
          ],
        },
        requester.uid,
        true,
        false,
        requester.role,
        requester.fullName
      );
    }

    // 3. Check if target user already belongs to this household
    const isMember =
      household.memberResidentIds?.includes(targetUser.uid) ||
      household.members?.some(
        (m) =>
          m.residentId === targetUser.uid ||
          (m.boimsId && this.normalizeBoimsId(m.boimsId) === this.normalizeBoimsId(targetUser.boimsId || targetBoimsId))
      ) ||
      (targetUser as any).householdId === household.householdId;

    if (isMember) {
      throw new Error(`${targetUser.fullName} is already a member of your household.`);
    }

    // 4. Check if there is already a pending request to this user from this household
    try {
      const qPending = query(
        collection(db, HOUSEHOLD_INVITES_COLLECTION),
        where('fromUid', '==', requester.uid),
        where('toUid', '==', targetUser.uid),
        where('status', '==', 'pending')
      );
      const pendingSnap = await getDocs(qPending);
      if (!pendingSnap.empty) {
        throw new Error(`A pending family request has already been sent to ${targetUser.fullName}.`);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('already been sent')) {
        throw err;
      }
      console.warn('[HouseholdInviteService] Query pending invites error:', err);
    }

    // 5. Create invitation object
    const inviteId = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    const newInvite: HouseholdInvite = {
      inviteId,
      householdId: household.householdId,
      fromUid: requester.uid,
      fromBoimsId: requester.boimsId || 'BOIMS-UNKNOWN',
      fromName: requester.fullName,
      toUid: targetUser.uid,
      toBoimsId: this.normalizeBoimsId(targetUser.boimsId || targetBoimsId),
      toName: targetUser.fullName,
      proposedRole: proposedRole.trim(),
      occupation: occupation?.trim() || '',
      status: 'pending',
      createdAt: now,
      respondedAt: null,
    };

    // Save locally
    this.localInvites.unshift(newInvite);

    // Save to Firestore
    try {
      const inviteDocRef = doc(db, HOUSEHOLD_INVITES_COLLECTION, inviteId);
      await setDoc(inviteDocRef, newInvite);
    } catch (err) {
      console.warn('[HouseholdInviteService] Failed to save invite to Firestore, kept locally:', err);
    }

    // Send notification to target user
    try {
      await notificationService.createNotification({
        userId: targetUser.uid,
        title: 'Family Member Request',
        message: `${requester.fullName} (${requester.boimsId || 'BOIMS ID'}) wants to add you to their household as ${proposedRole}.`,
        type: 'family_request',
        priority: 'medium',
        link: '/households',
        createdBy: requester.uid,
        metadata: {
          inviteId: newInvite.inviteId,
        },
      });
    } catch (notifErr) {
      console.warn('[HouseholdInviteService] Could not send notification:', notifErr);
    }

    return newInvite;
  }

  /**
   * Fetch incoming and outgoing household invitations for a user
   */
  async getUserInvites(userId: string): Promise<{
    incoming: HouseholdInvite[];
    outgoing: HouseholdInvite[];
  }> {
    let incoming: HouseholdInvite[] = [];
    let outgoing: HouseholdInvite[] = [];

    if (!userId) return { incoming: [], outgoing: [] };

    try {
      const colRef = collection(db, HOUSEHOLD_INVITES_COLLECTION);
      
      const qIn = query(colRef, where('toUid', '==', userId));
      const snapIn = await getDocs(qIn);
      if (!snapIn.empty) {
        incoming = snapIn.docs.map((doc) => doc.data() as HouseholdInvite);
      }

      const qOut = query(colRef, where('fromUid', '==', userId));
      const snapOut = await getDocs(qOut);
      if (!snapOut.empty) {
        outgoing = snapOut.docs.map((doc) => doc.data() as HouseholdInvite);
      }
    } catch (err) {
      console.warn('[HouseholdInviteService] Error fetching invites from Firestore:', err);
      incoming = this.localInvites.filter((i) => i.toUid === userId);
      outgoing = this.localInvites.filter((i) => i.fromUid === userId);
    }

    // Combine with local memory
    this.localInvites.forEach((local) => {
      if (local.toUid === userId && !incoming.some((i) => i.inviteId === local.inviteId)) {
        incoming.unshift(local);
      }
      if (local.fromUid === userId && !outgoing.some((o) => o.inviteId === local.inviteId)) {
        outgoing.unshift(local);
      }
    });

    return { incoming, outgoing };
  }

  /**
   * Subscribe to real-time incoming and outgoing household invites for a user
   */
  subscribeToUserInvites(
    userId: string,
    onUpdate: (data: { incoming: HouseholdInvite[]; outgoing: HouseholdInvite[] }) => void
  ): () => void {
    if (!userId) return () => {};

    let incoming: HouseholdInvite[] = [];
    let outgoing: HouseholdInvite[] = [];

    const emit = () => {
      onUpdate({
        incoming: [...incoming],
        outgoing: [...outgoing],
      });
    };

    const colRef = collection(db, HOUSEHOLD_INVITES_COLLECTION);
    const qIn = query(colRef, where('toUid', '==', userId));
    const qOut = query(colRef, where('fromUid', '==', userId));

    const unsubIn = onSnapshot(
      qIn,
      (snapshot) => {
        incoming = snapshot.docs.map((doc) => doc.data() as HouseholdInvite);
        emit();
      },
      (err) => {
        console.warn('[HouseholdInviteService] Incoming invites snapshot error:', err);
      }
    );

    const unsubOut = onSnapshot(
      qOut,
      (snapshot) => {
        outgoing = snapshot.docs.map((doc) => doc.data() as HouseholdInvite);
        emit();
      },
      (err) => {
        console.warn('[HouseholdInviteService] Outgoing invites snapshot error:', err);
      }
    );

    return () => {
      unsubIn();
      unsubOut();
    };
  }

  /**
   * Accept household invitation using an atomic transaction
   */
  async acceptHouseholdInvite(inviteId: string, currentUserId: string): Promise<Household> {
    const now = new Date().toISOString();
    let returnHousehold: Household | null = null;

    await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST
      const inviteDocRef = doc(db, HOUSEHOLD_INVITES_COLLECTION, inviteId);
      const inviteSnap = await transaction.get(inviteDocRef);

      if (!inviteSnap.exists()) {
        throw new Error('Household invitation request not found.');
      }

      const invite = inviteSnap.data() as HouseholdInvite;

      if (invite.toUid !== currentUserId) {
        throw new Error('You are not authorized to respond to this request.');
      }

      const householdRef = doc(db, 'households', invite.householdId);
      const householdSnap = await transaction.get(householdRef);

      if (!householdSnap.exists()) {
        throw new Error('The target household profile no longer exists.');
      }

      const household = { householdId: householdSnap.id, ...householdSnap.data() } as Household;
      returnHousehold = household;

      // Idempotency check: if already accepted, return cleanly without duplicating writes/notifications
      if (invite.status === 'accepted') {
        return;
      }

      if (invite.status !== 'pending') {
        throw new Error(`This request has already been ${invite.status}.`);
      }

      const userRef = doc(db, USERS_COLLECTION, currentUserId);
      const userSnap = await transaction.get(userRef);
      const targetUserData = userSnap.exists() ? ({ uid: userSnap.id, ...userSnap.data() } as User) : null;

      // Deterministic notification document ID to guarantee transaction retry safety
      const notifDocId = `family-invite-${inviteId}-accepted`;
      const notifRef = doc(db, 'notifications', notifDocId);
      const notifSnap = await transaction.get(notifRef);

      // Construct Member Object
      const birthdate =
        (targetUserData as any)?.birthDate ||
        (targetUserData as any)?.birthdate ||
        '';
      const computedAge = residentService.computeAgeFromBirthdate(birthdate);

      const newMember: HouseholdMember = {
        id: `MEM-${currentUserId.slice(0, 8)}`,
        fullName: targetUserData?.fullName || invite.toName,
        birthdate,
        age: computedAge,
        gender: (targetUserData as any)?.gender || 'male',
        civilStatus: (targetUserData as any)?.civilStatus || 'single',
        relationshipToHead: invite.proposedRole,
        occupation: invite.occupation || targetUserData?.occupation || '',
        residentId: currentUserId,
        boimsId: invite.toBoimsId,
        isHouseholdHead: false,
        isVoter: targetUserData?.voterStatus === 'registered',
        isSenior: computedAge >= 60,
        isYouth: computedAge >= 13 && computedAge <= 24,
        contactNumber: targetUserData?.phoneNumber || '',
      };

      const existingMembers = household.members || [];

      // Avoid duplicate member entry
      const updatedMembers = existingMembers.filter(
        (m) =>
          m.residentId !== currentUserId &&
          (!m.boimsId || this.normalizeBoimsId(m.boimsId) !== this.normalizeBoimsId(invite.toBoimsId))
      );
      updatedMembers.push(newMember);

      const existingIds = new Set(household.memberResidentIds || []);
      existingIds.add(currentUserId);
      const memberResidentIds = Array.from(existingIds);

      const updatedHouseholdData: Household = {
        ...household,
        members: updatedMembers,
        membersCount: updatedMembers.length,
        memberResidentIds,
        updatedAt: now,
        updatedBy: currentUserId,
      };

      returnHousehold = updatedHouseholdData;

      // 2. ALL WRITES SECOND
      transaction.update(householdRef, {
        members: updatedMembers,
        membersCount: updatedMembers.length,
        memberResidentIds,
        updatedAt: now,
        updatedBy: currentUserId,
      });

      transaction.update(userRef, {
        householdId: household.householdId,
        householdNumber: household.householdNumber || '',
        updatedAt: now,
      });

      transaction.update(inviteDocRef, {
        status: 'accepted',
        respondedAt: now,
      });

      if (!notifSnap.exists()) {
        transaction.set(notifRef, {
          id: notifDocId,
          notificationId: notifDocId,
          userId: invite.fromUid,
          title: 'Family Request Accepted',
          message: `${invite.toName} accepted your request to join your household as ${invite.proposedRole}.`,
          type: 'system',
          priority: 'medium',
          status: 'unread',
          createdAt: now,
          link: '/households',
          createdBy: currentUserId,
        });
      }
    });

    // Local state fallback update
    const local = this.localInvites.find((i) => i.inviteId === inviteId);
    if (local) {
      local.status = 'accepted';
      local.respondedAt = now;
    }

    return returnHousehold || (await residentService.getHouseholdById(inviteId)) || ({ } as Household);
  }

  /**
   * Reject household invitation (idempotent with atomic transaction)
   */
  async rejectHouseholdInvite(inviteId: string, currentUserId: string): Promise<void> {
    const now = new Date().toISOString();

    await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST
      const inviteDocRef = doc(db, HOUSEHOLD_INVITES_COLLECTION, inviteId);
      const inviteSnap = await transaction.get(inviteDocRef);

      if (!inviteSnap.exists()) {
        return;
      }

      const invite = inviteSnap.data() as HouseholdInvite;

      if (invite.toUid !== currentUserId) {
        throw new Error('You are not authorized to respond to this request.');
      }

      // Idempotency check: if already rejected, return cleanly
      if (invite.status === 'rejected') {
        return;
      }

      if (invite.status !== 'pending') {
        throw new Error(`This request has already been ${invite.status}.`);
      }

      // Deterministic notification document ID to guarantee idempotency
      const notifDocId = `family-invite-${inviteId}-rejected`;
      const notifRef = doc(db, 'notifications', notifDocId);
      const notifSnap = await transaction.get(notifRef);

      // 2. ALL WRITES SECOND
      transaction.update(inviteDocRef, {
        status: 'rejected',
        respondedAt: now,
      });

      if (!notifSnap.exists()) {
        transaction.set(notifRef, {
          id: notifDocId,
          notificationId: notifDocId,
          userId: invite.fromUid,
          title: 'Family Request Declined',
          message: `${invite.toName} declined your request to join the household as ${invite.proposedRole}.`,
          type: 'system',
          priority: 'medium',
          status: 'unread',
          createdAt: now,
          link: '/households',
          createdBy: currentUserId,
        });
      }
    });

    // Update local memory fallback
    const local = this.localInvites.find((i) => i.inviteId === inviteId);
    if (local) {
      local.status = 'rejected';
      local.respondedAt = now;
    }
  }

  /**
   * Sort household family members deterministically by relationship priority and age
   * Priority:
   * 1. Father / Head of Household
   * 2. Mother
   * 3. Spouse / Husband / Wife
   * 4. Children & descendants (Son, Daughter, Brother, Sister, Grandson, Granddaughter, Child, Grandchild)
   * 5. Other
   * Within same relationship rank: Oldest first (highest age -> lowest age).
   */
  sortHouseholdMembers(
    members: HouseholdMember[] = [],
    linkedProfilesMap: Record<string, any> = {}
  ): HouseholdMember[] {
    const getRelationshipRank = (relationship: string, isHead?: boolean): number => {
      const rel = (relationship || '').trim().toLowerCase();
      if (isHead) return 1;
      if (rel === 'father' || rel === 'head of household' || rel === 'head') return 1;
      if (rel === 'mother') return 2;
      if (rel === 'spouse' || rel === 'wife' || rel === 'husband') return 3;
      if (
        [
          'son',
          'daughter',
          'child',
          'brother',
          'sister',
          'grandson',
          'granddaughter',
          'grandchild',
        ].includes(rel)
      ) {
        return 4;
      }
      return 5;
    };

    // Clone & resolve updated name/age from linked user profile if available
    const resolvedMembers = members.map((member) => {
      const linkedUser = member.residentId ? linkedProfilesMap[member.residentId] : null;
      if (!linkedUser) return member;

      const birthdate =
        linkedUser.birthDate ||
        linkedUser.birthdate ||
        member.birthdate ||
        '';
      const age = birthdate
        ? residentService.computeAgeFromBirthdate(birthdate)
        : member.age;

      return {
        ...member,
        fullName: linkedUser.fullName || member.fullName,
        birthdate,
        age,
        occupation: member.occupation || linkedUser.occupation || '',
      };
    });

    return [...resolvedMembers].sort((a, b) => {
      const rankA = getRelationshipRank(a.relationshipToHead, a.isHouseholdHead);
      const rankB = getRelationshipRank(b.relationshipToHead, b.isHouseholdHead);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // If same relationship rank, sort by age: Oldest first (highest age -> lowest age)
      const ageA = a.age || (a.birthdate ? residentService.computeAgeFromBirthdate(a.birthdate) : 0);
      const ageB = b.age || (b.birthdate ? residentService.computeAgeFromBirthdate(b.birthdate) : 0);

      if (ageA !== ageB) {
        return ageB - ageA;
      }

      // If same age, sort alphabetically by full name
      return (a.fullName || '').localeCompare(b.fullName || '');
    });
  }
}

export const householdInviteService = new HouseholdInviteService();
