import {
  collection,
  doc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Subscription, EnrichedSubscription, MealType } from '@/types';

// ─── Get User Subscriptions ──────────────────────────────────────────────────

export async function getUserSubscriptions(userId: string): Promise<Subscription[]> {
  const q = query(collection(db, 'subscriptions'), where('user_id', '==', userId));
  const snap = await getDocs(q);
  const subs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));
  return subs.sort((a, b) => {
    const tA = a.created_at?.seconds ?? 0;
    const tB = b.created_at?.seconds ?? 0;
    return tB - tA;
  });
}

// ─── Get Vendor Subscriptions ────────────────────────────────────────────────

export async function getVendorSubscriptions(vendorId: string): Promise<Subscription[]> {
  const q = query(
    collection(db, 'subscriptions'),
    where('vendor_id', '==', vendorId),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));
}

// ─── Create Subscription ─────────────────────────────────────────────────────

export async function createSubscription(data: {
  user_id: string;
  vendor_id: string;
  plan_id: string;
  meal_type: MealType;
  discount_pct?: number;
  promo_code?: string;
}): Promise<string> {
  const payload: any = {
    user_id: data.user_id,
    vendor_id: data.vendor_id,
    plan_id: data.plan_id,
    meal_type: data.meal_type,
    status: 'active',
    created_at: Timestamp.now(),
  };

  if (data.discount_pct !== undefined && data.discount_pct !== null) {
    payload.discount_pct = data.discount_pct;
  }
  if (data.promo_code !== undefined && data.promo_code !== null) {
    payload.promo_code = data.promo_code;
  }

  const ref = await addDoc(collection(db, 'subscriptions'), payload);
  return ref.id;
}

// ─── Cancel Subscription ──────────────────────────────────────────────────────

export async function cancelSubscription(subId: string, cancelledBy = 'user'): Promise<void> {
  await updateDoc(doc(db, 'subscriptions', subId), {
    status: 'cancelled',
    cancelled_at: Timestamp.now(),
    cancelled_by: cancelledBy,
  });
}

// ─── Admin: Paginated All Subscriptions ──────────────────────────────────────

export async function getAllSubscriptions(
  afterDoc?: DocumentSnapshot,
  pageSize = 20
): Promise<{ subs: EnrichedSubscription[]; lastDoc: DocumentSnapshot | null }> {
  let q = query(
    collection(db, 'subscriptions'),
    orderBy('created_at', 'desc'),
    limit(pageSize)
  );
  if (afterDoc) {
    q = query(
      collection(db, 'subscriptions'),
      orderBy('created_at', 'desc'),
      startAfter(afterDoc),
      limit(pageSize)
    );
  }
  const snap = await getDocs(q);
  const subs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EnrichedSubscription));
  const lastDoc = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
  return { subs, lastDoc };
}
