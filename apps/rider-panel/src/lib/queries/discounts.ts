import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DiscountCode } from '@/types';

export async function getVendorDiscounts(vendorId: string): Promise<DiscountCode[]> {
  const q = query(collection(db, 'discount_codes'), where('vendor_id', '==', vendorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiscountCode));
}

export async function createDiscountCode(data: {
  vendor_id?: string | null;
  code: string;
  discount_pct: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'discount_codes'), {
    ...data,
    active: true,
    created_at: Timestamp.now(),
  });
  return ref.id;
}

export async function deleteDiscountCode(id: string): Promise<void> {
  await deleteDoc(doc(db, 'discount_codes', id));
}

export async function validateDiscountCode(vendorId: string, code: string): Promise<DiscountCode | null> {
  // Query all active codes with this string
  const q = query(
    collection(db, 'discount_codes'), 
    where('code', '==', code.toUpperCase()),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  // Find a match that is either for this vendor or global
  const match = snap.docs.find(d => {
    const data = d.data();
    return !data.vendor_id || data.vendor_id === 'global' || data.vendor_id === vendorId;
  });

  if (!match) return null;
  return { id: match.id, ...match.data() } as DiscountCode;
}
