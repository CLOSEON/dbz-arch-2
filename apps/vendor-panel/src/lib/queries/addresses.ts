import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

/* ─── Types ───────────────────────────────────────────────────── */

export type AddressType = 'home' | 'work' | 'other';

export interface UserAddress {
  id:           string;
  label:        string;      // 'Home' | 'Work' | 'Other'
  type:         AddressType;
  locality:     string;      // 'Koramangala'
  city:         string;      // 'Bengaluru'
  full_address: string;      // Raw Nominatim display_name
  lat:          number;
  lng:          number;
  is_default:   boolean;
  created_at:   Timestamp;
}

/* ─── CRUD ─────────────────────────────────────────────────────── */

/** Fetch all saved addresses for a user, ordered oldest → newest */
export async function getUserAddresses(userId: string): Promise<UserAddress[]> {
  const snap = await getDocs(
    query(
      collection(db, 'users', userId, 'addresses'),
      orderBy('created_at', 'asc'),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserAddress));
}

/** Add a new address and return the saved doc (with client-side Timestamp) */
export async function addUserAddress(
  userId: string,
  data: Omit<UserAddress, 'id' | 'created_at'>,
): Promise<UserAddress> {
  const ref = await addDoc(collection(db, 'users', userId, 'addresses'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...data, created_at: Timestamp.now() };
}

/** Hard-delete a saved address */
export async function deleteUserAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'addresses', addressId));
}

/**
 * Set one address as the default.
 * Atomically flips `is_default` for every address in the list.
 */
export async function setDefaultAddress(
  userId: string,
  addressId: string,
  allIds: string[],
): Promise<void> {
  await Promise.all(
    allIds.map((id) =>
      updateDoc(doc(db, 'users', userId, 'addresses', id), {
        is_default: id === addressId,
      }),
    ),
  );
}
