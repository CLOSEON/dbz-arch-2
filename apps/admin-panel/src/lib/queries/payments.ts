/**
 * Payment Queries — Razorpay integration utilities
 * 
 * Handles payment history, subscription tracking, and Razorpay integration
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface PaymentRecord {
  id: string;
  payment_id: string;
  order_id?: string;
  user_id?: string;
  vendor_id?: string;
  plan_id?: string;
  amount: number; // in ₹
  currency: string;
  status: 'authorized' | 'captured' | 'failed' | 'pending';
  notes?: Record<string, any>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PaymentSubscription {
  id: string;
  razorpay_subscription_id: string;
  user_id: string;
  vendor_id: string;
  plan_id: string;
  meal_type: string;
  frequency: string;
  amount: number; // in ₹
  currency: string;
  customer_id?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
  status: 'created' | 'authenticated' | 'active' | 'paused' | 'cancelled' | 'failed';
  start_at?: Timestamp;
  current_start?: Timestamp;
  authenticated_at?: Timestamp;
  activated_at?: Timestamp;
  paused_at?: Timestamp;
  cancelled_at?: Timestamp;
  resumed_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  notes?: Record<string, any>;
}

/**
 * Get payment history for a user
 */
export async function getUserPaymentHistory(
  userId: string,
  pageSize = 10
): Promise<PaymentRecord[]> {
  try {
    const q = query(
      collection(db, 'payment_history'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      limit(pageSize)
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as PaymentRecord));
  } catch (err) {
    console.error('[Payment Queries] getUserPaymentHistory error:', err);
    return [];
  }
}

/**
 * Get payment history for a vendor
 */
export async function getVendorPaymentHistory(
  vendorId: string,
  pageSize = 20
): Promise<PaymentRecord[]> {
  try {
    const q = query(
      collection(db, 'payment_history'),
      where('vendor_id', '==', vendorId),
      orderBy('created_at', 'desc'),
      limit(pageSize)
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as PaymentRecord));
  } catch (err) {
    console.error('[Payment Queries] getVendorPaymentHistory error:', err);
    return [];
  }
}

/**
 * Get active Razorpay subscriptions for a user
 */
export async function getUserActiveSubscriptions(
  userId: string
): Promise<PaymentSubscription[]> {
  try {
    const q = query(
      collection(db, 'payment_subscriptions'),
      where('user_id', '==', userId),
      where('status', 'in', ['authenticated', 'active'])
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as PaymentSubscription));
  } catch (err) {
    console.error('[Payment Queries] getUserActiveSubscriptions error:', err);
    return [];
  }
}

/**
 * Get all Razorpay subscriptions for a user
 */
export async function getUserAllSubscriptions(
  userId: string
): Promise<PaymentSubscription[]> {
  try {
    const q = query(
      collection(db, 'payment_subscriptions'),
      where('user_id', '==', userId),
      orderBy('created_at', 'desc')
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as PaymentSubscription));
  } catch (err) {
    console.error('[Payment Queries] getUserAllSubscriptions error:', err);
    return [];
  }
}

/**
 * Get Razorpay subscriptions for a vendor
 */
export async function getVendorActiveSubscriptions(
  vendorId: string
): Promise<PaymentSubscription[]> {
  try {
    const q = query(
      collection(db, 'payment_subscriptions'),
      where('vendor_id', '==', vendorId),
      where('status', 'in', ['authenticated', 'active'])
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as PaymentSubscription));
  } catch (err) {
    console.error('[Payment Queries] getVendorActiveSubscriptions error:', err);
    return [];
  }
}

/**
 * Get specific Razorpay subscription by ID
 */
export async function getPaymentSubscription(
  subscriptionId: string
): Promise<PaymentSubscription | null> {
  try {
    const q = query(
      collection(db, 'payment_subscriptions'),
      where('razorpay_subscription_id', '==', subscriptionId)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const doc = snap.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as PaymentSubscription;
  } catch (err) {
    console.error('[Payment Queries] getPaymentSubscription error:', err);
    return null;
  }
}

/**
 * Get user's total spending with a vendor
 */
export async function getUserVendorSpending(
  userId: string,
  vendorId: string
): Promise<number> {
  try {
    const q = query(
      collection(db, 'payment_history'),
      where('user_id', '==', userId),
      where('vendor_id', '==', vendorId),
      where('status', '==', 'captured')
    );

    const snap = await getDocs(q);
    return snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
  } catch (err) {
    console.error('[Payment Queries] getUserVendorSpending error:', err);
    return 0;
  }
}

/**
 * Get vendor's total revenue
 */
export async function getVendorTotalRevenue(vendorId: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'payment_history'),
      where('vendor_id', '==', vendorId),
      where('status', '==', 'captured')
    );

    const snap = await getDocs(q);
    return snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
  } catch (err) {
    console.error('[Payment Queries] getVendorTotalRevenue error:', err);
    return 0;
  }
}

/**
 * Cancel a Razorpay subscription (client-side trigger)
 * Note: The actual cancellation happens through Razorpay API
 */
export async function markSubscriptionCancelled(
  paymentSubscriptionDocId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'payment_subscriptions', paymentSubscriptionDocId), {
      status: 'cancelled',
      cancelled_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
  } catch (err) {
    console.error('[Payment Queries] markSubscriptionCancelled error:', err);
    throw err;
  }
}

/**
 * Pause a Razorpay subscription (client-side trigger)
 * Note: The actual pause happens through Razorpay API
 */
export async function markSubscriptionPaused(
  paymentSubscriptionDocId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'payment_subscriptions', paymentSubscriptionDocId), {
      status: 'paused',
      paused_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
  } catch (err) {
    console.error('[Payment Queries] markSubscriptionPaused error:', err);
    throw err;
  }
}

/**
 * Resume a Razorpay subscription (client-side trigger)
 * Note: The actual resume happens through Razorpay API
 */
export async function markSubscriptionResumed(
  paymentSubscriptionDocId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'payment_subscriptions', paymentSubscriptionDocId), {
      status: 'active',
      resumed_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
  } catch (err) {
    console.error('[Payment Queries] markSubscriptionResumed error:', err);
    throw err;
  }
}

/**
 * Get payment status summary for a user
 */
export async function getUserPaymentSummary(userId: string): Promise<{
  total_spent: number;
  total_failed: number;
  active_subscriptions: number;
  recent_payment_status: string;
}> {
  try {
    const allPayments = await getUserPaymentHistory(userId, 100);
    const activeSubscriptions = await getUserActiveSubscriptions(userId);

    const total_spent = allPayments
      .filter((p) => p.status === 'captured')
      .reduce((sum, p) => sum + p.amount, 0);

    const total_failed = allPayments
      .filter((p) => p.status === 'failed')
      .length;

    const recent_payment_status =
      allPayments.length > 0 ? allPayments[0].status : 'no_payments';

    return {
      total_spent: parseFloat(total_spent.toFixed(2)),
      total_failed,
      active_subscriptions: activeSubscriptions.length,
      recent_payment_status,
    };
  } catch (err) {
    console.error('[Payment Queries] getUserPaymentSummary error:', err);
    return {
      total_spent: 0,
      total_failed: 0,
      active_subscriptions: 0,
      recent_payment_status: 'error',
    };
  }
}
