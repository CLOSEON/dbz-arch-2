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
  totalRevenue: number;         // Net vendor revenue / payout obligation (what they get)
  netRevenue: number;           // Explicit alias for net vendor payout
  commissionRate: number;       // Platform commission rate in % (e.g. 10)
  commissionAmount: number;     // Platform fee or margin (totalSales - netRevenue)
  subscriptionSales: number;    // Sales from meal subscriptions
  orderSales: number;           // Sales from standalone / direct orders
  hasExplicitObligation?: boolean; // True if revenue is determined from explicit vendor payout obligation
}

/**
 * Get detailed statistics for a specific vendor
 */
export async function getVendorStats(vendorId: string, feePct?: number): Promise<VendorPerformance> {
  // 1. Determine platform commission percentage and load vendor profile data
  let commissionRate = feePct;
  let vendorDocData: any = null;
  try {
    const vendorSnap = await getDoc(doc(db, 'users', vendorId));
    if (vendorSnap.exists()) {
      vendorDocData = vendorSnap.data();
      if (commissionRate === undefined || isNaN(commissionRate)) {
        commissionRate = typeof vendorDocData.platform_fee_pct === 'number'
          ? vendorDocData.platform_fee_pct
          : Number(vendorDocData.platform_fee_pct) || 10;
      }
    }
  } catch (e) {
    console.warn('[getVendorStats] Error fetching vendor fee pct:', e);
  }
  if (commissionRate === undefined || isNaN(commissionRate)) {
    commissionRate = 10; // Default 10%
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

  // A. Subscriptions metrics & sales & payout obligations
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

    // Check if subscription has explicit vendor payout obligation from subscription creation
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

  // C. Captured payments from payment_history (if any)
  const capturedPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0);

  // D. Compute Gross Total Sales
  const calculatedSales = subscriptionSales + orderSales;
  const totalSales = Math.max(calculatedSales, capturedPayments);

  // E. Determine Vendor Revenue / Payout Obligation
  const recordedPayouts = !vendorPayoutsSnap.empty
    ? (vendorPayoutsSnap.docs as any[]).reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0)
    : 0;

  const vendorUserEarnings = Number(vendorDocData?.total_earnings ?? vendorDocData?.pending_payout ?? 0);

  const explicitObligation = Math.max(recordedPayouts, vendorUserEarnings, subVendorObligation);

  let netRevenue: number;
  let commissionAmount: number;
  let hasExplicitObligation = false;

  if (explicitObligation > 0) {
    // Explicit vendor payout obligation defined during subscription creation or in payout ledger
    netRevenue = Math.round(explicitObligation * 100) / 100;
    commissionAmount = Math.max(0, Math.round((totalSales - netRevenue) * 100) / 100);
    hasExplicitObligation = true;
  } else {
    // Standard percentage-based commission
    commissionAmount = Math.round((totalSales * (commissionRate / 100)) * 100) / 100;
    netRevenue = Math.max(0, Math.round((totalSales - commissionAmount) * 100) / 100);
  }

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
    commissionRate,
    commissionAmount,
    subscriptionSales,
    orderSales,
    hasExplicitObligation,
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
