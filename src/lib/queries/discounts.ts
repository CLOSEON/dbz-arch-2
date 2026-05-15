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
  vendor_id: string;
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
  const q = query(
    collection(db, 'discount_codes'), 
    where('vendor_id', '==', vendorId),
    where('code', '==', code.toUpperCase()),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as DiscountCode;
}
