import { collection, getDocs, query, where, doc, updateDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, Vendor, Order, Subscription } from '@/types';
import { invalidateUserCache } from './users';

export interface VendorPerformance {
  deliverySuccessRate: number;
  totalOrders: number;
  deliveredOrders: number;
  failedOrders: number;
  activeSubscribers: number;
  totalSales: number;           // Actual gross customer sales (subscriptions + standalone orders + captured payments)
  totalRevenue: number;         // Net vendor earnings after commissions (what they get)
  netRevenue: number;           // Explicit alias for net vendor payout
  commissionRate: number;       // Platform commission rate in % (e.g. 10)
  commissionAmount: number;     // Platform fee deducted
  subscriptionSales: number;    // Sales from meal subscriptions
  orderSales: number;           // Sales from standalone / direct orders
}

/**
 * Get detailed statistics for a specific vendor
 */
export async function getVendorStats(vendorId: string, feePct?: number): Promise<VendorPerformance> {
  // 1. Fetch vendor document
  let vendorDocData: any = null;
  try {
    const vendorSnap = await getDoc(doc(db, 'users', vendorId));
    if (vendorSnap.exists()) {
      vendorDocData = vendorSnap.data();
    }
  } catch (e) {
    console.warn('[getVendorStats] Error fetching vendor user doc:', e);
  }

  // 2. Fetch all subscriptions for this vendor
  const subscriptionsQ = query(
    collection(db, 'subscriptions'),
    where('vendor_id', '==', vendorId)
  );
  
  // 3. Fetch payment_history where vendor_id matches (if any)
  const paymentsQ = query(
    collection(db, 'payment_history'),
    where('vendor_id', '==', vendorId),
    where('status', '==', 'captured')
  );

  // 4. Fetch orders for this vendor
  const ordersQ = query(
    collection(db, 'orders'),
    where('vendor_id', '==', vendorId)
  );

  // 5. Fetch vendor_payouts records (from external subscription creation / payout obligations)
  const vendorPayoutsQ = query(
    collection(db, 'vendor_payouts'),
    where('vendor_id', '==', vendorId)
  );

  const [subsSnap, paymentsSnap, ordersSnap, vendorPayoutsSnap] = await Promise.all([
    getDocs(subscriptionsQ),
    getDocs(paymentsQ),
    getDocs(ordersQ),
    getDocs(vendorPayoutsQ).catch(() => ({ empty: true, docs: [] } as any))
  ]);

  // A. Subscriptions metrics & sales
  const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subscription));
  const activeSubscribers = subs.filter(s => s.status === 'active').length;

  let subscriptionSales = 0;
  let subVendorObligation = 0;
  for (const s of subs) {
    const amt = Number(s.paid_amount ?? s.total_price ?? s.price ?? 0) ||
      (Number(s.base_price || 0) + Number(s.addons_price || 0));
    if (amt > 0) {
      subscriptionSales += amt;
    }

    const vObligation = Number(
      (s as any).vendorTotalPayable ??
      (s as any).vendor_payable ??
      (s as any).vendor_payout ??
      0
    );
    if (vObligation > 0) {
      subVendorObligation += vObligation;
    } else {
      const costPerMeal = Number(
        (s as any).vendorCostPerMeal ??
        (s as any).vendor_cost_per_meal ??
        0
      );
      const meals = Number((s as any).total_meals || (s as any).totalMeals || 0);
      if (costPerMeal > 0 && meals > 0) {
        subVendorObligation += costPerMeal * meals;
      }
    }
  }

  // B. Orders metrics & standalone sales
  const orders = ordersSnap.docs.map(doc => doc.data() as Order);
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
  const failedOrders = orders.filter(o => o.status === 'failed').length;

  let orderSales = 0;
  for (const o of orders) {
    const isUnderSub = Boolean((o as any).subscription_id || (o as any).subscriptionId);
    if (!isUnderSub && o.status !== 'cancelled') {
      const amt = Number(o.total_amount ?? o.amount ?? o.price ?? 0);
      if (amt > 0) {
        orderSales += amt;
      }
    }
  }

  // C. Captured payments from payment_history
  const capturedPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0);

  // D. Compute Gross Total Sales (actual total sales paid by customers)
  const calculatedSales = subscriptionSales + orderSales;
  const totalSales = Math.max(calculatedSales, capturedPayments);

  // E. Determine Vendor Revenue (what they get after payout obligations / commissions)
  // Check vendor_payouts collection first:
  let payoutsSum = 0;
  if (!vendorPayoutsSnap.empty) {
    payoutsSum = (vendorPayoutsSnap.docs as any[]).reduce((sum: number, d: any) => sum + (Number(d.data().amount) || 0), 0);
  }

  let netRevenue = 0;
  if (payoutsSum > 0) {
    netRevenue = payoutsSum;
  } else if (subVendorObligation > 0) {
    netRevenue = subVendorObligation;
  } else if (vendorDocData && (vendorDocData.total_earnings || vendorDocData.pending_payout)) {
    netRevenue = Number(vendorDocData.total_earnings || vendorDocData.pending_payout || 0);
  } else if (feePct !== undefined && !isNaN(feePct) && feePct > 0) {
    // Only apply fee percentage if explicitly passed in
    const commAmt = Math.round((totalSales * (feePct / 100)) * 100) / 100;
    netRevenue = Math.max(0, totalSales - commAmt);
  } else {
    // Default: what customer paid is what vendor gets (no arbitrary deductions)
    netRevenue = totalSales;
  }

  const commissionAmount = Math.max(0, Math.round((totalSales - netRevenue) * 100) / 100);

  const deliverySuccessRate = totalOrders > 0 
    ? parseFloat(((deliveredOrders / totalOrders) * 100).toFixed(1)) 
    : 100.0;

  return {
    deliverySuccessRate,
    totalOrders,
    deliveredOrders,
    failedOrders,
    activeSubscribers,
    totalSales,
    totalRevenue: netRevenue,
    netRevenue,
    commissionRate: feePct || 0,
    commissionAmount,
    subscriptionSales,
    orderSales
  };
}

/**
 * Get recent order history for a vendor
 */
export async function getVendorOrderHistory(vendorId: string, limitCount = 50): Promise<Order[]> {
  const q = query(
    collection(db, 'orders'),
    where('vendor_id', '==', vendorId),
    orderBy('created_at', 'desc'),
    limit(limitCount)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
  } catch {
    // Fallback if index on vendor_id + created_at is not created yet
    const fallbackQ = query(
      collection(db, 'orders'),
      where('vendor_id', '==', vendorId),
      limit(limitCount)
    );
    const snap = await getDocs(fallbackQ);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Order))
      .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));
  }
}

/**
 * Suspend a vendor's account
 */
export async function suspendVendor(vendorId: string): Promise<void> {
  const vendorRef = doc(db, 'users', vendorId);
  await updateDoc(vendorRef, {
    is_approved: false,
    is_suspended: true,
    updated_at: new Date()
  });
  invalidateUserCache();
}

/**
 * Unsuspend a vendor's account
 */
export async function unsuspendVendor(vendorId: string): Promise<void> {
  const vendorRef = doc(db, 'users', vendorId);
  await updateDoc(vendorRef, {
    is_approved: true,
    is_suspended: false,
    updated_at: new Date()
  });
  invalidateUserCache();
}
