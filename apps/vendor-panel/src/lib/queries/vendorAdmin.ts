import { collection, getDocs, query, where, doc, updateDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, Vendor, Order } from '@/types';
import { invalidateUserCache } from './users';

export interface VendorPerformance {
  deliverySuccessRate: number;
  totalOrders: number;
  deliveredOrders: number;
  failedOrders: number;
  activeSubscribers: number;
  totalRevenue: number;
}

/**
 * Get detailed statistics for a specific vendor
 */
export async function getVendorStats(vendorId: string): Promise<VendorPerformance> {
  const subscriptionsQ = query(
    collection(db, 'subscriptions'),
    where('vendor_id', '==', vendorId),
    where('status', '==', 'active')
  );
  
  const paymentsQ = query(
    collection(db, 'payment_history'),
    where('vendor_id', '==', vendorId),
    where('status', '==', 'captured')
  );

  const ordersQ = query(
    collection(db, 'orders'),
    where('vendor_id', '==', vendorId)
  );

  const [subsSnap, paymentsSnap, ordersSnap] = await Promise.all([
    getDocs(subscriptionsQ),
    getDocs(paymentsQ),
    getDocs(ordersQ)
  ]);

  const activeSubscribers = subsSnap.size;
  const totalRevenue = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
  
  const orders = ordersSnap.docs.map(doc => doc.data() as Order);
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
  const failedOrders = orders.filter(o => o.status === 'failed').length;

  const deliverySuccessRate = totalOrders > 0 
    ? parseFloat(((deliveredOrders / totalOrders) * 100).toFixed(1)) 
    : 100.0;

  return {
    deliverySuccessRate,
    totalOrders,
    deliveredOrders,
    failedOrders,
    activeSubscribers,
    totalRevenue
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
