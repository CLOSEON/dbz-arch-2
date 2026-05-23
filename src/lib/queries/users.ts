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
import { 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import type { AppUser, UserRole, Vendor } from '@/types';

/**
 * DABZO USER PROFILE & DATA SERVICE
 */

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function isTestAccount(e164: string): boolean {
  const TEST_NUMBERS = ['+919000000001', '+919000000002', '+919000000003', '+919000000004'];
  return TEST_NUMBERS.includes(e164);
}

/** Resolve or Create a user profile in Firestore */
export async function resolveUserProfile(
  uid: string,
  phone: string
): Promise<{ user: AppUser; isNewUser: boolean }> {
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    const data = userDoc.data() as Partial<AppUser>;
    if (data.is_rejected) throw new Error('Account rejected.');
    
    // If the user hasn't set their name, treat them as a new user to trigger onboarding
    if (!data.name || data.name.trim() === '') {
      return { user: { id: uid, ...data } as AppUser, isNewUser: true };
    }

    return { user: { id: uid, ...data } as AppUser, isNewUser: false };
  }

  return {
    user: { id: uid, phone, name: '', role: 'user', is_approved: true },
    isNewUser: true,
  };
}

export async function completeOnboarding(
  uid: string,
  phone: string,
  name: string,
  role: UserRole
): Promise<AppUser> {
  const userData: Partial<AppUser> = {
    name,
    phone,
    role,
    is_approved: true,
    is_rejected: false,
    created_at: Timestamp.now() as any, // Using any for Timestamp temporarily
  };

  if (role === 'vendor') {
    userData.kitchen_name = `${name}'s Kitchen`;
    userData.is_approved = false;
  }

  await setDoc(doc(db, 'users', uid), userData, { merge: true });
  return { id: uid, ...userData } as AppUser;
}

// ─── Missing Exports Re-added ───────────────────────────────────────────────

export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<AppUser> {
  const { user: authUser } = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', authUser.uid));
  if (!userDoc.exists()) throw new Error('Admin profile not found.');
  const data = userDoc.data() as Partial<AppUser>;
  if (data.role !== 'admin') throw new Error('Unauthorized.');
  return { id: authUser.uid, ...data } as AppUser;
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppUser));
}

export async function setVendorApproval(id: string, approved: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', id), { is_approved: approved });
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getUserById(id: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as AppUser) : null;
}

export async function updateUser(id: string, data: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', id), { ...data, updated_at: Timestamp.now() });
}

export async function getApprovedVendors(): Promise<Vendor[]> {
  // Read both `users` and legacy `vendors` collections, then normalize.
  const [usersSnap, vendorsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'vendors')),
  ]);

  const merged = [
    ...usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor)),
    ...vendorsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor)),
  ];

  const deduped = new Map<string, Vendor>();
  merged.forEach((item) => {
    deduped.set(item.id, { ...deduped.get(item.id), ...item });
  });

  return Array.from(deduped.values()).filter((user) => {
    const role = String((user as any).role ?? '').toLowerCase();
    const hasVendorShape =
      Boolean(user.kitchen_name) ||
      Boolean(user.cuisine_type) ||
      typeof user.rate_lunch === 'number' ||
      typeof user.rate_dinner === 'number' ||
      typeof user.rate_both === 'number';
    const isVendorRole = role === 'vendor' || role === 'kitchen' || role === 'seller';
    const isVisible = user.is_rejected !== true && user.is_approved !== false;
    return isVisible && (isVendorRole || hasVendorShape);
  });
}
