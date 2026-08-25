import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { isSuperadminEmail, SUPERADMIN_EMAIL } from '@/lib/auth';
import type { AppUser, UserRole, Vendor } from '@/types';

// ─── Module-level TTL cache ──────────────────────────────────────────────────
// Prevents hammering Firestore with repeated full-collection reads on every
// page navigation. TTL = 60 s; invalidated on explicit writes.
const CACHE_TTL_MS = 60_000;
let _allUsersCache: { data: AppUser[]; ts: number } | null = null;
let _vendorsCache: { data: Vendor[]; ts: number } | null = null;

export function invalidateUserCache() {
  _allUsersCache = null;
  _vendorsCache = null;
}

/**
 * DABZZO USER PROFILE & DATA SERVICE
 */

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function isTestAccount(e164: string): boolean {
  // Legacy: only kept for any residual test code paths
  return false;
}

/** Resolve or Create a user profile in Firestore (Social Auth) */
export async function resolveUserProfile(
  uid: string,
  email: string | null,
  displayName?: string | null,
  photoURL?: string | null,
): Promise<{ user: AppUser; isNewUser: boolean }> {
  const userRef = doc(db, 'users', uid);

  let userDoc: any;
  let retries = 3;
  while (retries > 0) {
    try {
      userDoc = await getDoc(userRef);
      break;
    } catch (error: any) {
      if (
        (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) &&
        retries > 1
      ) {
        console.warn(`[resolveUserProfile] Permission denied, retrying in 1s... (${retries - 1} left)`);
        retries--;
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw error;
      }
    }
  }

  if (userDoc.exists()) {
    const data = userDoc.data() as Partial<AppUser>;
    if (data.is_rejected) throw new Error('Account rejected.');

    // Patch email/photo if missing from earlier sign-ins
    const updates: Partial<AppUser> = {};
    if (email && !data.email) updates.email = email;
    if (photoURL && !data.image) updates.image = photoURL;
    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, { ...updates, updated_at: Timestamp.now() });
    }

    // Superadmin auto-elevate
    if (isSuperadminEmail(email) && data.role !== 'admin') {
      await updateDoc(userRef, { role: 'admin', is_approved: true, is_superadmin: true, verification_status: 'verified', updated_at: Timestamp.now() });
      return { user: { id: uid, ...data, role: 'admin', is_approved: true, is_superadmin: true } as AppUser, isNewUser: false };
    }

    // Needs onboarding if missing phone or role
    if (!data.phone || !data.role) {
      return { user: { id: uid, ...data, ...updates } as AppUser, isNewUser: true };
    }

    return { user: { id: uid, ...data, ...updates } as AppUser, isNewUser: false };
  }

  // ── Brand new user from social sign-in ──
  // Auto-elevate superadmin on first sign-in
  if (isSuperadminEmail(email)) {
    const superData: Partial<AppUser> = {
      email: email!,
      name: displayName || 'Superadmin',
      image: photoURL || undefined,
      role: 'admin',
      is_approved: true,
      is_superadmin: true,
      verification_status: 'verified',
      created_at: Timestamp.now() as any,
    };
    await setDoc(userRef, superData);
    return { user: { id: uid, ...superData } as AppUser, isNewUser: false };
  }

  return {
    user: {
      id: uid,
      email: email || undefined,
      name: displayName || '',
      image: photoURL || undefined,
      phone: '',
      is_approved: false,
      verification_status: 'pending',
    } as any,
    isNewUser: true,
  };
}

export async function completeOnboarding(
  uid: string,
  phone: string,
  name: string,
  role: UserRole,
  email?: string | null,
  image?: string | null,
  vendorDetails?: Partial<AppUser>
): Promise<AppUser> {
  const safeRole: UserRole = role === 'admin' ? 'user' : role;
  const isPartnerRole = safeRole === 'vendor' || safeRole === 'delivery';
  const isVendorRole = safeRole === 'vendor';

  const userData: Partial<AppUser> = {
    name,
    phone,
    role: safeRole,
    is_approved: isPartnerRole ? false : true,
    verification_status: isPartnerRole ? 'pending' : 'verified',
    is_rejected: false,
    created_at: Timestamp.now() as any,
  };

  if (email) userData.email = email;
  if (image) userData.image = image;

  if (isVendorRole) {
    userData.kitchen_name = `${name}'s Kitchen`;
    if (vendorDetails) Object.assign(userData, vendorDetails);
  }

  await setDoc(doc(db, 'users', uid), userData, { merge: true });
  return { id: uid, ...userData } as AppUser;
}

// ─── Admin Role Management (Superadmin only) ──────────────────────────────────

export async function grantAdminRole(targetUid: string, requestingUserEmail: string | null): Promise<void> {
  if (!isSuperadminEmail(requestingUserEmail)) {
    throw new Error('Only the Superadmin can grant admin roles.');
  }
  await updateDoc(doc(db, 'users', targetUid), {
    role: 'admin',
    is_approved: true,
    verification_status: 'verified',
    updated_at: Timestamp.now(),
  });
  invalidateUserCache();
}

export async function revokeAdminRole(targetUid: string, requestingUserEmail: string | null): Promise<void> {
  if (!isSuperadminEmail(requestingUserEmail)) {
    throw new Error('Only the Superadmin can revoke admin roles.');
  }
  await updateDoc(doc(db, 'users', targetUid), {
    role: 'user',
    is_approved: true,
    verification_status: 'verified',
    updated_at: Timestamp.now(),
  });
  invalidateUserCache();
}

// ─── Admin/Email Login (legacy, kept for console fallback) ──────────────────
export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<AppUser> {
  const { signInWithEmailAndPassword: signIn } = await import('firebase/auth');
  const { user: authUser } = await signIn(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', authUser.uid));
  if (!userDoc.exists()) throw new Error('Admin profile not found.');
  const data = userDoc.data() as Partial<AppUser>;
  if (data.role !== 'admin') throw new Error('Unauthorized.');
  return { id: authUser.uid, ...data } as AppUser;
}

export async function getAllUsers(): Promise<AppUser[]> {
  const now = Date.now();
  if (_allUsersCache && now - _allUsersCache.ts < CACHE_TTL_MS) {
    return _allUsersCache.data;
  }
  const snap = await getDocs(collection(db, 'users'));
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppUser));
  _allUsersCache = { data, ts: now };
  return data;
}

export async function setVendorApproval(id: string, approved: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', id), {
    is_approved: approved,
    verification_status: approved ? 'verified' : 'rejected',
    is_rejected: !approved,
    is_suspended: false,
    updated_at: Timestamp.now(),
  });
  invalidateUserCache();
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getUserById(id: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null;
}

export async function updateUser(id: string, data: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', id), { ...data, updated_at: Timestamp.now() });
  invalidateUserCache();
}

export async function approveUserRole(
  uid: string,
  phone: string,
  name: string,
  role: UserRole
) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    is_approved: true,
    is_rejected: false,
    verification_status: 'verified',
    updated_at: Timestamp.now(),
  });

  invalidateUserCache();

  // Trigger Notification
  const { sendNotificationAlert } = await import('@/lib/notifications');
  await sendNotificationAlert({
    userId: uid,
    phone,
    title: 'Application Approved! 🎉',
    message: `Congratulations ${name}! Your Dabzzo ${role.toUpperCase()} account has been verified. You can now access your dashboard.`,
    type: 'approval',
  });
}

export async function requestRoleDetails(
  uid: string,
  phone: string,
  requestedFields: string[],
  adminNote: string
) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    verification_status: 'details_requested',
    requested_fields: requestedFields,
    admin_note: adminNote,
    updated_at: Timestamp.now(),
  });

  invalidateUserCache();

  // Trigger Notification
  const { sendNotificationAlert } = await import('@/lib/notifications');
  await sendNotificationAlert({
    userId: uid,
    phone,
    title: 'Additional Details Requested 📝',
    message: `Admin has requested additional info: "${adminNote}". Please update your application details.`,
    type: 'request_details',
  });
}

export async function rejectUserRole(
  uid: string,
  phone: string,
  reason: string
) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    is_rejected: true,
    verification_status: 'rejected',
    admin_note: reason,
    updated_at: Timestamp.now(),
  });

  invalidateUserCache();

  // Trigger Notification
  const { sendNotificationAlert } = await import('@/lib/notifications');
  await sendNotificationAlert({
    userId: uid,
    phone,
    title: 'Application Rejected',
    message: `Your account application could not be approved at this time: "${reason}".`,
    type: 'rejection',
  });
}

/** Seed the 4 primary test accounts into Firestore */
export async function seedTestAccounts(): Promise<void> {
  const TEST_ACCOUNTS = [
    {
      id: 'test_admin_001',
      phone: '+919000000001',
      name: 'Super Admin',
      role: 'admin' as UserRole,
      is_approved: true,
      verification_status: 'verified',
      created_at: Timestamp.now(),
    },
    {
      id: 'test_vendor_002',
      phone: '+919000000002',
      name: 'Chef Sharma Kitchen',
      role: 'vendor' as UserRole,
      kitchen_name: 'Sharma Gourmet Kitchen',
      is_approved: true,
      verification_status: 'verified',
      capacity: 50,
      fssai_license: 'FSSAI-12345678901234',
      address: 'Sector 62, Noida, UP',
      created_at: Timestamp.now(),
    },
    {
      id: 'test_rider_003',
      phone: '+919000000003',
      name: 'Rider Vikram',
      role: 'delivery' as UserRole,
      is_approved: true,
      verification_status: 'verified',
      vehicle_type: 'EV Scooter',
      vehicle_number: 'UP16-AB-1234',
      license_number: 'DL-987654321',
      created_at: Timestamp.now(),
    },
    {
      id: 'test_user_004',
      phone: '+919000000004',
      name: 'Ananya Customer',
      role: 'user' as UserRole,
      is_approved: true,
      verification_status: 'verified',
      address: 'Tower 4, Jaypee Greens, Noida',
      created_at: Timestamp.now(),
    },
  ];

  for (const acc of TEST_ACCOUNTS) {
    const userRef = doc(db, 'users', acc.id);
    await setDoc(userRef, acc, { merge: true });
  }

  invalidateUserCache();
}


export async function getApprovedVendors(): Promise<Vendor[]> {
  const now = Date.now();
  if (_vendorsCache && now - _vendorsCache.ts < CACHE_TTL_MS) {
    return _vendorsCache.data;
  }

  // Only query users with role === 'vendor' — no need to fetch the entire collection
  const vendorQ = query(collection(db, 'users'), where('role', '==', 'vendor'));
  const usersSnap = await getDocs(vendorQ);

  const results: Vendor[] = usersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Vendor))
    .filter((v) => v.is_rejected !== true && v.is_approved !== false);

  _vendorsCache = { data: results, ts: now };
  return results;
}

// ─── Individual Profile Cache for Real-time Listeners ───────────────────────
// Caches profiles for 5 minutes. Prevents repetitive reads on frequent updates.
const _profileCache = new Map<string, { data: any; ts: number }>();
const PROFILE_CACHE_TTL = 300_000;

export async function fetchEnrichedProfiles(ids: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  const missingIds: string[] = [];
  const now = Date.now();

  ids.forEach(id => {
    const cached = _profileCache.get(id);
    if (cached && now - cached.ts < PROFILE_CACHE_TTL) {
      result.set(id, cached.data);
    } else {
      missingIds.push(id);
    }
  });

  if (missingIds.length > 0) {
    const { documentId: docId } = await import('firebase/firestore');
    // Firestore "in" queries are limited to chunks of 30 items
    for (let i = 0; i < missingIds.length; i += 30) {
      const chunk = missingIds.slice(i, i + 30);
      try {
        const snap = await getDocs(query(collection(db, 'users'), where(docId(), 'in', chunk)));
        snap.forEach(d => {
          const userData = d.data();
          _profileCache.set(d.id, { data: userData, ts: now });
          result.set(d.id, userData);
        });
      } catch (err) {
        console.warn('[fetchEnrichedProfiles] failed to fetch chunk:', err);
      }
    }
  }

  return result;
}

