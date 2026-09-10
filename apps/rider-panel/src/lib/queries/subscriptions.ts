/**
 * SUBSCRIPTIONS — Deterministic ID Architecture
 *
 * Every subscription slot is identified by:
 *   sub_{userId}_{vendorId}_{mealType}
 *
 * This means there is EXACTLY ONE Firestore document per subscription slot,
 * forever. Re-subscribing after cancellation simply sets status back to 'active'
 * on the same document — addDoc is never used, so duplicates are impossible.
 */

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
  limit,
  startAfter,
  deleteDoc,
  type DocumentSnapshot,
  Timestamp,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Subscription, EnrichedSubscription, MealType, SubscriptionFrequency, DietaryCategory, SelectedAddon } from '@/types';

// ─── Deterministic document ID ────────────────────────────────────────────────
// One document per (user × vendor × mealType). Always the same ID, always.
export function subDocId(userId: string, vendorId: string, mealType: MealType): string {
  return `sub_${userId}_${vendorId}_${mealType}`;
}

// ─── In-memory TTL cache ──────────────────────────────────────────────────────
// Optimized: increased TTL from 30s to 60s for better cache hit rate
const CACHE_TTL_MS = 60_000;  // 60 seconds (was 30s)
const _subsCache = new Map<string, { data: Subscription[]; ts: number }>();

export function invalidateSubsCache(userId?: string) {
  if (userId) _subsCache.delete(userId);
  else _subsCache.clear();
}

// ─── Get User Subscriptions ───────────────────────────────────────────────────
// Optimized: uses cache for faster repeated access
export async function getUserSubscriptions(userId: string): Promise<Subscription[]> {
  const now = Date.now();
  const cached = _subsCache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const q = query(collection(db, 'subscriptions'), where('user_id', '==', userId));
  const snap = await getDocs(q);
  const subs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Subscription))
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));

  // Cache result
  _subsCache.set(userId, { data: subs, ts: now });
  return subs;
}

// ─── Get Vendor Subscriptions ─────────────────────────────────────────────────
export async function getVendorSubscriptions(vendorId: string): Promise<Subscription[]> {
  const q = query(
    collection(db, 'subscriptions'),
    where('vendor_id', '==', vendorId),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));
}

// ─── Bulk-update Subscription Prices ──────────────────────────────────────────
// When a vendor updates their meal rates, call this to propagate new prices to
// all active subscriptions so subscribers always see the current rate.
export async function updateVendorSubscriptionRates(
  vendorId: string,
  rates: { lunch: number; dinner: number; both: number }
): Promise<number> {
  const subs = await getVendorSubscriptions(vendorId);

  const updates = subs.map((sub) => {
    let newPrice: number;
    if (sub.meal_type === 'lunch') newPrice = rates.lunch;
    else if (sub.meal_type === 'dinner') newPrice = rates.dinner;
    else newPrice = rates.both; // 'both'

    return updateDoc(doc(db, 'subscriptions', sub.id), { price: newPrice });
  });

  await Promise.all(updates);
  return updates.length; // how many subscriptions were updated
}

// ─── Create / Re-activate Subscription ───────────────────────────────────────
// Uses setDoc with a deterministic ID — idempotent by design.
// If the slot exists (even cancelled), it is simply set back to 'active'.
// If it doesn't exist, it is created fresh.
// Either way: exactly ONE document, no exceptions.
export async function createSubscription(data: {
  user_id: string;
  vendor_id: string;
  vendor_name?: string;
  plan_id: string;
  meal_type: MealType;
  category?: DietaryCategory;
  frequency?: SubscriptionFrequency;
  selected_addons?: SelectedAddon[];
  base_price?: number;
  addons_price?: number;
  total_price?: number;
  discount_pct?: number;
  promo_code?: string;
  /** Razorpay payment ID after successful payment (for audit trail) */
  payment_id?: string;
  /** Razorpay order ID */
  razorpay_order_id?: string;
  /** Amount actually charged (in ₹, not paise) */
  paid_amount?: number;
}): Promise<string> {
  const docId = subDocId(data.user_id, data.vendor_id, data.meal_type);
  const docRef = doc(db, 'subscriptions', docId);

  const payload: Record<string, any> = {
    user_id: data.user_id,
    vendor_id: data.vendor_id,
    ...(data.vendor_name ? { vendor_name: data.vendor_name } : {}),
    plan_id: data.plan_id,
    meal_type: data.meal_type,
    status: 'active',
    created_at: Timestamp.now(),
    // Clear any previous cancellation fields
    cancelled_at: null,
    cancelled_by: null,
  };

  // Calculate and store next billing date
  const daysToAdd = data.frequency === 'monthly' ? 30 : data.frequency === 'weekly' ? 7 : 1;
  const nextBilling = new Date();
  nextBilling.setDate(nextBilling.getDate() + daysToAdd);
  payload.next_billing_date = Timestamp.fromDate(nextBilling);

  if (data.category) payload.category = data.category;
  if (data.frequency) payload.frequency = data.frequency;
  if (data.selected_addons) payload.selected_addons = data.selected_addons;
  if (data.base_price != null) payload.base_price = data.base_price;
  if (data.addons_price != null) payload.addons_price = data.addons_price;
  if (data.total_price != null) payload.total_price = data.total_price;
  if (data.discount_pct != null) payload.discount_pct = data.discount_pct;
  if (data.promo_code != null) payload.promo_code = data.promo_code;
  if (data.payment_id) payload.payment_id = data.payment_id;
  if (data.razorpay_order_id) payload.razorpay_order_id = data.razorpay_order_id;
  if (data.paid_amount != null) {
    payload.paid_amount = data.paid_amount;
    payload.price = data.paid_amount; // Store as price so the proration logic works
  }

  // setDoc is fully idempotent: creates if new, overwrites if already exists.
  // The deterministic docId guarantees no duplicates ever.
  await setDoc(docRef, payload);

  // Initialize or Reset Swap Allowance for this subscription
  const allowanceRef = doc(db, 'subscription_swap_allowances', docId);
  const freeSwapsTotal = data.meal_type === 'both' ? 2 : 1;
  await setDoc(allowanceRef, {
    subscription_id: docId,
    user_id: data.user_id,
    free_swaps_total: freeSwapsTotal,
    free_swaps_used: 0,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now()
  }, { merge: true }).catch(err => console.warn('[Subscriptions] Failed to init/reset swap allowance:', err));

  // --- Merge/Upgrade Logic ---
  // If user subscribes to 'both', cancel any existing standalone 'lunch' or 'dinner' for this vendor
  if (data.meal_type === 'both') {
    const lunchDocId = subDocId(data.user_id, data.vendor_id, 'lunch');
    const dinnerDocId = subDocId(data.user_id, data.vendor_id, 'dinner');
    getDoc(doc(db, 'subscriptions', lunchDocId)).then(d => {
      if (d.exists() && d.data()?.status === 'active') {
        updateDoc(doc(db, 'subscriptions', lunchDocId), { status: 'cancelled', cancelled_at: Timestamp.now(), cancelled_by: 'system_upgrade' }).catch(() => {});
      }
    }).catch(() => {});
    getDoc(doc(db, 'subscriptions', dinnerDocId)).then(d => {
      if (d.exists() && d.data()?.status === 'active') {
        updateDoc(doc(db, 'subscriptions', dinnerDocId), { status: 'cancelled', cancelled_at: Timestamp.now(), cancelled_by: 'system_upgrade' }).catch(() => {});
      }
    }).catch(() => {});
  }
  // If user subscribes to 'lunch' or 'dinner', cancel any existing 'both' for this vendor
  else if (data.meal_type === 'lunch' || data.meal_type === 'dinner') {
    const bothDocId = subDocId(data.user_id, data.vendor_id, 'both');
    getDoc(doc(db, 'subscriptions', bothDocId)).then(d => {
      if (d.exists() && d.data()?.status === 'active') {
        updateDoc(doc(db, 'subscriptions', bothDocId), { status: 'cancelled', cancelled_at: Timestamp.now(), cancelled_by: 'system_downgrade' }).catch(() => {});
      }
    }).catch(() => {});
  }

  invalidateSubsCache(data.user_id);
  return docId;
}

// ─── Renew Subscription ───────────────────────────────────────────────────────
export async function renewSubscription(
  subId: string,
  frequency: string,
  currentNextBillingDate: Date,
  userId?: string
): Promise<void> {
  const daysToAdd = frequency === 'monthly' ? 30 : 7;
  const newDate = new Date(currentNextBillingDate.getTime());
  newDate.setDate(newDate.getDate() + daysToAdd);
  
  await updateDoc(doc(db, 'subscriptions', subId), {
    next_billing_date: Timestamp.fromDate(newDate),
    updated_at: Timestamp.now()
  });
  
  if (userId) invalidateSubsCache(userId);
  else invalidateSubsCache();
}

// ─── Cancel Subscription ──────────────────────────────────────────────────────
// Works with both old random IDs (legacy) and new deterministic IDs.
export async function cancelSubscription(
  subId: string,
  cancelledBy = 'user',
  userId?: string
): Promise<void> {
  await updateDoc(doc(db, 'subscriptions', subId), {
    status: 'cancelled',
    cancelled_at: Timestamp.now(),
    cancelled_by: cancelledBy,
  });
  if (userId) invalidateSubsCache(userId);
  else invalidateSubsCache();
}

// ─── Pause Subscription ───────────────────────────────────────────────────────
export async function pauseSubscription(subId: string, userId?: string): Promise<void> {
  await updateDoc(doc(db, 'subscriptions', subId), {
    status: 'paused',
    paused_at: Timestamp.now(),
  });
  if (userId) invalidateSubsCache(userId);
  else invalidateSubsCache();
}

// ─── Resume Subscription ──────────────────────────────────────────────────────
export async function resumeSubscription(subId: string, userId?: string): Promise<void> {
  await updateDoc(doc(db, 'subscriptions', subId), {
    status: 'active',
    resumed_at: Timestamp.now(),
  });
  if (userId) invalidateSubsCache(userId);
  else invalidateSubsCache();
}

// ─── One-time migration: old random-ID docs → deterministic IDs ───────────────
/**
 * Run once after login for existing users to migrate legacy subscription docs
 * to the new deterministic ID format and delete the old random-ID ones.
 * Safe to run multiple times — fully idempotent.
 */
export async function migrateSubscriptions(userId: string): Promise<void> {
  const q = query(collection(db, 'subscriptions'), where('user_id', '==', userId));
  const snap = await getDocs(q);
  if (snap.empty) return;

  // Group docs by slot key; keep only the most-recent active, else most-recent cancelled
  const slotMap = new Map<string, { doc: any; data: any }>();
  for (const d of snap.docs) {
    const data = d.data();
    const slotKey = `${data.vendor_id}_${data.meal_type}`;
    const existing = slotMap.get(slotKey);
    if (!existing) {
      slotMap.set(slotKey, { doc: d, data });
    } else {
      // Prefer active over cancelled; then prefer newer
      const existingIsActive = existing.data.status === 'active';
      const newIsActive = data.status === 'active';
      const newIsNewer = (data.created_at?.seconds ?? 0) > (existing.data.created_at?.seconds ?? 0);
      if ((newIsActive && !existingIsActive) || (newIsActive === existingIsActive && newIsNewer)) {
        slotMap.set(slotKey, { doc: d, data });
      }
    }
  }

  const writes: Promise<void>[] = [];
  const toDelete: string[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    const slotKey = `${data.vendor_id}_${data.meal_type}`;
    const winner = slotMap.get(slotKey);
    const deterministicId = subDocId(userId, data.vendor_id, data.meal_type as MealType);

    if (winner && winner.doc.id === d.id) {
      // This is the canonical doc for this slot
      if (d.id !== deterministicId) {
        // Write to new deterministic ID
        writes.push(
          setDoc(doc(db, 'subscriptions', deterministicId), { ...data, user_id: userId })
        );
        toDelete.push(d.id);
      }
      // else: already has deterministic ID — nothing to do
    } else {
      // Loser duplicate — delete it
      toDelete.push(d.id);
    }
  }

  await Promise.all([
    ...writes,
    ...toDelete.map((id) => deleteDoc(doc(db, 'subscriptions', id)).catch(() => {})),
  ]);

  invalidateSubsCache(userId);
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

// ─── Legacy alias kept so old purge import in login page still compiles ───────
/** @deprecated Use migrateSubscriptions instead */
export const purgeSubscriptionDuplicates = migrateSubscriptions;

// ─── Custom Plan Subscription Caller ──────────────────────────────────────────
export interface CreateCustomPlanParams {
  userId: string;
  planType: 'weekly' | 'monthly';
  pattern: Record<string, any>;
  totalMeals: number;
  totalPrice: number;
  planStartDate?: Date | string | number;
  vendorId?: string;
  paymentId?: string;
  razorpayOrderId?: string;
  metadata?: Record<string, any>;
}

export interface CreateCustomPlanResponse {
  success: boolean;
  subscriptionId: string;
  confirmation: boolean;
  message: string;
  subscription: any;
}

/**
 * Calls the "createCustomPlanSubscription" Cloud Function.
 */
export async function createCustomPlanSubscription(
  params: CreateCustomPlanParams
): Promise<CreateCustomPlanResponse> {
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('@/lib/firebase');

  const fn = httpsCallable<CreateCustomPlanParams, CreateCustomPlanResponse>(
    functions,
    'createCustomPlanSubscription'
  );

  const res = await fn(params);
  invalidateSubsCache(params.userId);
  return res.data;
}

// ─── External Subscription & Payment Activation ──────────────────────────────
export interface ExternalSubscriptionParams {
  userId: string;
  userName?: string;
  userPhone?: string;
  planType: 'weekly' | 'monthly' | 'standard';
  planName?: string;
  subscriptionType: 'custom_weekly' | 'custom_monthly' | 'standard';
  billingCycle: 'weekly' | 'monthly';
  mealType?: 'lunch' | 'dinner' | 'both';
  dietary?: 'veg' | 'non_veg';
  pattern?: Record<string, any>;
  totalMeals: number;
  totalPrice: number;
  pricePerMeal?: number;
  // External Payment
  paymentMethod: 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'card_pos' | 'other';
  transactionId?: string; // UTR or Ref ID
  paymentNotes?: string;
  // Vendor Attribution & Payout
  vendorId?: string;
  vendorName?: string;
  vendorCostPerMeal?: number;
  vendorTotalPayable?: number;
  // Delivery Schedule
  startDate: Date | string;
  nextBillingDate?: Date | string;
  deliveryAddress?: string;
  deliverySlot?: string;
  adminId?: string;
}

export interface ActivateExternalSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  message: string;
}

/**
 * Activates an external subscription in Firestore when offline payment (UPI, cash, bank transfer)
 * has been collected, and automatically credits vendor payout obligation.
 */
export async function activateExternalSubscription(
  params: ExternalSubscriptionParams
): Promise<ActivateExternalSubscriptionResponse> {
  const startDateObj = new Date(params.startDate);
  const nextBillingDateObj = params.nextBillingDate
    ? new Date(params.nextBillingDate)
    : new Date(
        startDateObj.getTime() +
          (params.billingCycle === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000
      );

  // Attempt 1: Call Cloud Function (Admin SDK privileges, always bypasses client rule limits)
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('@/lib/firebase');
    const callable = httpsCallable<any, ActivateExternalSubscriptionResponse>(
      functions,
      'activateExternalSubscriptionAdmin'
    );
    const result = await callable({
      ...params,
      startDate: startDateObj.toISOString(),
      nextBillingDate: nextBillingDateObj.toISOString(),
    });

    if (result.data && result.data.success) {
      invalidateSubsCache(params.userId);
      return result.data;
    }
  } catch (fnErr) {
    console.warn('[activateExternalSubscription] Cloud Function call fallback to direct write:', fnErr);
  }

  // Attempt 2: Direct Firestore write batch
  const batch = writeBatch(db);
  const subRef = doc(collection(db, 'subscriptions'));
  const isCustom = params.subscriptionType !== 'standard';

  const vendorPayable = params.vendorId
    ? (params.vendorTotalPayable !== undefined
        ? params.vendorTotalPayable
        : (params.vendorCostPerMeal || 35) * params.totalMeals)
    : 0;

  // 1. Subscription Document
  batch.set(subRef, {
    id: subRef.id,
    user_id: params.userId,
    status: 'active',
    isCustomPlan: isCustom,
    is_custom_plan: isCustom,
    subscriptionType: params.subscriptionType,
    billingCycle: params.billingCycle,
    frequency: params.billingCycle,
    plan_id: params.subscriptionType,
    plan_name:
      params.planName ||
      (params.subscriptionType === 'custom_weekly'
        ? 'Weekly Custom Plan'
        : params.subscriptionType === 'custom_monthly'
        ? 'Monthly Custom Plan'
        : 'Standard Plan'),
    meal_type: params.mealType || 'both',
    dietary: params.dietary || 'veg',
    deliveryPattern: params.pattern || {},
    customPlan: isCustom
      ? {
          pattern: params.pattern || {},
          totalMeals: params.totalMeals,
          totalPrice: params.totalPrice,
          pricePerMeal:
            params.pricePerMeal ||
            Math.round(params.totalPrice / Math.max(1, params.totalMeals)),
          createdAt: Timestamp.now(),
        }
      : null,
    total_meals: params.totalMeals,
    totalMeals: params.totalMeals,
    total_price: params.totalPrice,
    price: params.totalPrice,
    vendor_id: params.vendorId || '',
    vendor_name: params.vendorName || '',
    vendor_payable: vendorPayable,
    vendorTotalPayable: vendorPayable,
    vendor_cost_per_meal: params.vendorCostPerMeal || 35,
    is_external_payment: true,
    payment_method: `external_${params.paymentMethod}`,
    transaction_id: params.transactionId || `EXT-${Date.now()}`,
    payment_notes: params.paymentNotes || '',
    delivery_status: 'ready_for_delivery',
    start_date: Timestamp.fromDate(startDateObj),
    startDate: Timestamp.fromDate(startDateObj),
    next_billing_date: Timestamp.fromDate(nextBillingDateObj),
    nextBillingDate: Timestamp.fromDate(nextBillingDateObj),
    delivery_address: params.deliveryAddress || '',
    delivery_slot: params.deliverySlot || 'lunch',
    created_at: Timestamp.now(),
    created_by_admin: params.adminId || 'admin',
  });

  // 2. Transaction Payment Record
  const paymentRef = doc(collection(db, 'payments'));
  batch.set(paymentRef, {
    id: paymentRef.id,
    user_id: params.userId,
    subscription_id: subRef.id,
    amount: params.totalPrice,
    currency: 'INR',
    status: 'success',
    method: `external_${params.paymentMethod}`,
    is_external: true,
    transaction_id: params.transactionId || `EXT-${Date.now()}`,
    notes: params.paymentNotes || 'External transaction recorded by admin',
    created_at: Timestamp.now(),
  });

  // 3. Vendor Attribution & Earnings Record (if assigned)
  if (params.vendorId) {
    const vendorPayable =
      params.vendorTotalPayable !== undefined
        ? params.vendorTotalPayable
        : (params.vendorCostPerMeal || 35) * params.totalMeals;

    const vendorPayoutRef = doc(collection(db, 'vendor_payouts'));
    batch.set(vendorPayoutRef, {
      id: vendorPayoutRef.id,
      vendor_id: params.vendorId,
      vendor_name: params.vendorName || '',
      subscription_id: subRef.id,
      user_id: params.userId,
      user_name: params.userName || '',
      amount: vendorPayable,
      cost_per_meal: params.vendorCostPerMeal || 35,
      total_meals: params.totalMeals,
      source: 'external_subscription',
      status: 'credited',
      reference_id: params.transactionId || '',
      created_at: Timestamp.now(),
    });

    // Increment vendor user document earnings & pending payout balance
    const vendorUserRef = doc(db, 'users', params.vendorId);
    batch.set(
      vendorUserRef,
      {
        total_earnings: increment(vendorPayable),
        pending_payout: increment(vendorPayable),
        last_payout_credit_at: Timestamp.now(),
      },
      { merge: true }
    );
  }

  // 4. Update Customer User Profile to Active Subscriber
  const customerUserRef = doc(db, 'users', params.userId);
  batch.set(
    customerUserRef,
    {
      is_active_subscriber: true,
      membership_status: 'active',
      active_subscription_id: subRef.id,
      last_subscribed_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    },
    { merge: true }
  );

  await batch.commit();
  invalidateSubsCache(params.userId);

  return {
    success: true,
    subscriptionId: subRef.id,
    message: `External subscription activated successfully! Assigned to vendor ${params.vendorName || params.vendorId || 'kitchen'}.`,
  };
}
