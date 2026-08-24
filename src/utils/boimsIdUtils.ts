import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from '../types';

// In-memory cache of synced user metadata signatures to avoid duplicate Firestore writes
const syncedSignatures = new Map<string, string>();

/**
 * Synchronizes user profile metadata into boimsIds/{boimsId} index document.
 * Safe, idempotent, and avoids redundant Firestore writes via signature hashing.
 */
export async function syncBoimsIndexMetadata(
  uid: string,
  userData?: Partial<User> | null
): Promise<void> {
  if (!uid) return;

  try {
    let profile = userData;

    // Fetch user profile if missing required fields
    if (!profile || !profile.boimsId || !profile.firstName) {
      try {
        const uSnap = await getDoc(doc(db, 'users', uid));
        if (uSnap.exists()) {
          profile = { uid: uSnap.id, ...uSnap.data() } as User;
        }
      } catch (err) {
        // Safe catch if reading user profile is denied
      }
    }

    if (!profile) return;

    const boimsId = profile.boimsId;
    if (!boimsId || !/^BOIMS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(boimsId)) {
      return;
    }

    const firstName = profile.firstName || '';
    const lastName = profile.lastName || '';
    const middleName = profile.middleName || '';
    const fullName =
      profile.fullName ||
      `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim() ||
      'Resident';
    const birthDate = profile.birthDate || (profile as any).birthdate || '';
    const purok = profile.purok || '';
    const address = profile.address || '';
    const barangay = profile.barangay || 'Barangay Central';
    const role = profile.role || 'resident';
    const status = profile.status || 'active';
    const isDeleted = profile.isDeleted === true;
    const householdId = (profile as any).householdId || '';

    const signature = `${uid}:${boimsId}:${fullName}:${birthDate}:${purok}:${address}:${status}:${role}:${isDeleted}:${householdId}`;

    if (syncedSignatures.get(uid) === signature) {
      return; // Skip write if metadata signature hasn't changed
    }

    const indexRef = doc(db, 'boimsIds', boimsId);
    await setDoc(
      indexRef,
      {
        uid: profile.uid || uid,
        boimsId,
        fullName,
        firstName,
        lastName,
        middleName,
        birthDate,
        purok,
        address,
        barangay,
        role,
        status,
        isDeleted,
        householdId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    syncedSignatures.set(uid, signature);
  } catch (err) {
    console.warn(`[boimsIdUtils] Failed to sync BOIMS index metadata for UID ${uid}:`, err);
  }
}

/**
 * Generates a randomized BOIMS User ID with format: BOIMS-XXXX-XXXX
 * Uses strong random values (crypto.getRandomValues).
 * Does not derive from UID, email, name, role, purok, or any personal field.
 */
export function generateBoimsId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let part1 = '';
  let part2 = '';
  const array = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 8; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < 4; i++) {
    part1 += chars[array[i] % chars.length];
  }
  for (let i = 4; i < 8; i++) {
    part2 += chars[array[i] % chars.length];
  }
  return `BOIMS-${part1}-${part2}`;
}

/**
 * Atomically claims and assigns a unique BOIMS ID for a given user UID using Firestore transactions.
 * Guarantees database-level atomic uniqueness:
 * - One UID maps to EXACTLY ONE active BOIMS ID.
 * - One BOIMS ID maps to EXACTLY ONE UID.
 * 
 * Strict Invariants:
 * 1. Uses a deterministic user index document (userBoimsIndexes/{uid}) to lock the UID mapping atomically.
 * 2. If userBoimsIndexes/{uid} or users/{uid} already has a boimsId, reuses it immediately with zero reservation writes.
 * 3. Bounded candidate generation loop (max 10 attempts).
 * 4. Throws an explicit error if all attempts fail. NEVER returns an unclaimed candidate.
 */
export async function claimUniqueBoimsId(uid: string): Promise<string> {
  if (!uid) {
    throw new Error('[boimsIdUtils] Cannot claim BOIMS ID without a valid user UID.');
  }

  const userRef = doc(db, 'users', uid);
  const userIndexRef = doc(db, 'userBoimsIndexes', uid);

  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const candidate = generateBoimsId();
    const candidateResRef = doc(db, 'boimsIds', candidate);

    try {
      const result = await runTransaction(db, async (transaction) => {
        const now = new Date().toISOString();

        // -------------------------------------------------------------
        // STEP 1: READ PHASE (All transaction reads MUST precede writes)
        // -------------------------------------------------------------

        // Read A: userBoimsIndexes/{uid}
        const indexSnap = await transaction.get(userIndexRef);
        const indexedBoimsId = (indexSnap.exists() && indexSnap.data()?.boimsId) ? (indexSnap.data().boimsId as string) : null;

        // Read B: boimsIds/{indexedBoimsId} (if index exists)
        let indexedResSnap = null;
        if (indexedBoimsId) {
          const indexedResRef = doc(db, 'boimsIds', indexedBoimsId);
          indexedResSnap = await transaction.get(indexedResRef);
        }

        // Read C: users/{uid}
        const uSnap = await transaction.get(userRef);
        const userDocBoimsId = (uSnap.exists() && uSnap.data()?.boimsId) ? (uSnap.data().boimsId as string) : null;

        // Read D: boimsIds/{userDocBoimsId} (if user doc has boimsId different from indexedBoimsId)
        let userResSnap = null;
        if (userDocBoimsId && userDocBoimsId !== indexedBoimsId) {
          const userResRef = doc(db, 'boimsIds', userDocBoimsId);
          userResSnap = await transaction.get(userResRef);
        }

        // Read E: boimsIds/{candidate}
        const candidateResSnap = await transaction.get(candidateResRef);

        // -------------------------------------------------------------
        // STEP 2: EVALUATION & ATOMIC WRITE PHASE
        // -------------------------------------------------------------

        // Case A: Verify userBoimsIndexes/{uid} against boimsIds/{indexedBoimsId}
        if (indexedBoimsId) {
          if (indexedResSnap && indexedResSnap.exists()) {
            const resUid = indexedResSnap.data()?.uid;
            if (resUid === uid) {
              // VERIFIED: Index exists AND reservation belongs to this exact UID.
              if (uSnap.exists() && uSnap.data()?.boimsId !== indexedBoimsId) {
                transaction.update(userRef, {
                  boimsId: indexedBoimsId,
                  updatedAt: now,
                });
              }
              return indexedBoimsId;
            } else {
              console.warn(`[boimsIdUtils] Index for UID ${uid} points to ${indexedBoimsId} owned by ${resUid}. Untrusted index discarded.`);
            }
          } else {
            // Index exists but reservation doc is missing.
            // If indexedBoimsId has valid format, atomically repair reverse reservation!
            if (/^BOIMS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(indexedBoimsId)) {
              const indexedResRef = doc(db, 'boimsIds', indexedBoimsId);
              transaction.set(indexedResRef, {
                uid,
                createdAt: now,
              });
              if (uSnap.exists() && uSnap.data()?.boimsId !== indexedBoimsId) {
                transaction.update(userRef, {
                  boimsId: indexedBoimsId,
                  updatedAt: now,
                });
              }
              return indexedBoimsId;
            }
          }
        }

        // Case B: Verify users/{uid}.boimsId against boimsIds/{userDocBoimsId}
        if (userDocBoimsId) {
          if (userResSnap && userResSnap.exists()) {
            const userResUid = userResSnap.data()?.uid;
            if (userResUid === uid) {
              // VERIFIED: User doc has boimsId AND reservation belongs to this exact UID.
              transaction.set(userIndexRef, {
                boimsId: userDocBoimsId,
                createdAt: now,
              }, { merge: true });
              return userDocBoimsId;
            } else {
              console.warn(`[boimsIdUtils] User doc for UID ${uid} has boimsId ${userDocBoimsId} owned by ${userResUid}. Untrusted user doc boimsId discarded.`);
            }
          } else if (!userResSnap && /^BOIMS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(userDocBoimsId)) {
            // Repair reservation & index for userDocBoimsId
            const userResRef = doc(db, 'boimsIds', userDocBoimsId);
            transaction.set(userResRef, {
              uid,
              createdAt: now,
            });
            transaction.set(userIndexRef, {
              boimsId: userDocBoimsId,
              createdAt: now,
            }, { merge: true });
            return userDocBoimsId;
          }
        }

        // Case C: Check Candidate Reservation
        if (candidateResSnap.exists()) {
          const candUid = candidateResSnap.data()?.uid;
          if (candUid === uid) {
            // Candidate is already reserved for this exact UID
            transaction.set(userIndexRef, {
              boimsId: candidate,
              createdAt: now,
            }, { merge: true });
            if (uSnap.exists() && uSnap.data()?.boimsId !== candidate) {
              transaction.update(userRef, {
                boimsId: candidate,
                updatedAt: now,
              });
            }
            return candidate;
          }
          // Reserved by another UID -> candidate collision! Return null to loop to next attempt.
          return null;
        }

        // Case D: Candidate is available and unreserved!
        // ATOMIC TRIPLE WRITE
        transaction.set(userIndexRef, {
          boimsId: candidate,
          createdAt: now,
        }, { merge: true });

        transaction.set(candidateResRef, {
          uid,
          createdAt: now,
        });

        if (uSnap.exists()) {
          transaction.update(userRef, {
            boimsId: candidate,
            updatedAt: now,
          });
        }

        return candidate;
      });

      if (result) {
        return result;
      }
    } catch (err) {
      console.warn(`[boimsIdUtils] Transaction attempt ${attempts} failed for UID ${uid}:`, err);
    }
  }

  throw new Error(`[boimsIdUtils] Failed to claim a unique BOIMS ID for UID ${uid} after ${maxAttempts} attempts.`);
}

// In-memory set tracking UIDs currently undergoing lazy backfill to prevent duplicate concurrent calls in the same client runtime
const pendingBackfills = new Set<string>();

/**
 * Idempotently ensures that an existing user has a BOIMS ID.
 * If user.boimsId already exists, returns immediately with zero writes.
 * If user.boimsId is missing, atomically claims a new BOIMS ID and updates the user document in a single transaction.
 */
export async function ensureUserBoimsId(user: User): Promise<string | undefined> {
  if (!user || !user.uid) return undefined;

  // 1. If boimsId already exists, sync metadata in background if needed and return boimsId
  if (user.boimsId) {
    syncBoimsIndexMetadata(user.uid, user).catch(() => {});
    return user.boimsId;
  }

  // 2. Prevent concurrent backfill operations for the same user UID in this client runtime session
  if (pendingBackfills.has(user.uid)) {
    return undefined;
  }

  pendingBackfills.add(user.uid);

  try {
    const boimsId = await claimUniqueBoimsId(user.uid);
    console.log(`[boimsIdUtils] Successfully ensured BOIMS ID ${boimsId} for user ${user.uid}`);
    syncBoimsIndexMetadata(user.uid, { ...user, boimsId }).catch(() => {});
    return boimsId;
  } catch (err) {
    console.warn(`[boimsIdUtils] Failed to ensure BOIMS ID for user ${user.uid}:`, err);
    return undefined;
  } finally {
    pendingBackfills.delete(user.uid);
  }
}
