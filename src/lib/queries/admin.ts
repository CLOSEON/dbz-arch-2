import { collection, getDocs, query, where, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function getAdminStats() {
  // Use getCountFromServer to avoid full collection downloads (highly optimized)
  const totalUsersCountPromise = getCountFromServer(collection(db, 'users'));
  const totalVendorsCountPromise = getCountFromServer(query(collection(db, 'users'), where('role', '==', 'vendor')));
  const approvedVendorsCountPromise = getCountFromServer(query(collection(db, 'users'), where('role', '==', 'vendor'), where('is_approved', '==', true)));
  const activeSubsCountPromise = getCountFromServer(query(collection(db, 'subscriptions'), where('status', '==', 'active')));
  const cancelledSubsCountPromise = getCountFromServer(query(collection(db, 'subscriptions'), where('status', '==', 'cancelled')));

  const [
    totalUsersSnap,
    totalVendorsSnap,
    approvedVendorsSnap,
    activeSubsSnap,
    cancelledSubsSnap
  ] = await Promise.all([
    totalUsersCountPromise,
    totalVendorsCountPromise,
    approvedVendorsSnapPromiseHelper(),
    activeSubsCountPromise,
    cancelledSubsCountPromise
  ]);

  // Helper because compound queries might require index, fallback safely if needed
  async function approvedVendorsSnapPromiseHelper() {
    try {
      return await approvedVendorsCountPromise;
    } catch {
      // Fallback if index not ready
      return null;
    }
  }

  const activeSubs = activeSubsSnap.data().count;
  const estimatedRevenue = activeSubs * 3000;

  // Query only today's orders (highly optimized compared to fetching all delivery_orders)
  const todayStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const todayOrdersSnap = await getDocs(query(collection(db, 'orders'), where('date', '==', todayStr)));
  const todaysOrders = todayOrdersSnap.docs.map(d => d.data());

  const totalVendors = totalVendorsSnap.data().count;
  const approvedVendors = approvedVendorsSnap ? approvedVendorsSnap.data().count : totalVendors; // Fallback to total vendors if index fails

  return {
    totalUsers: totalUsersSnap.data().count,
    totalVendors: totalVendors,
    approvedVendors: approvedVendors,
    activeSubscriptions: activeSubs,
    cancelledSubscriptions: cancelledSubsSnap.data().count,
    estimatedRevenue,
    totalDeliveryOrders: todaysOrders.length,
    unassignedDeliveries: todaysOrders.filter(o => !o.driverId && o.status !== 'delivered' && o.status !== 'failed' && o.status !== 'skipped').length,
    delayedOrders: todaysOrders.filter(o => o.status === 'failed_attempt' || o.status === 'failed').length,
  };
}

export async function getRecentActivity() {
  // Query and order by created_at desc to get actual recent items instead of random ones
  const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('created_at', 'desc'), limit(5))).catch(() => 
    getDocs(query(collection(db, 'users'), limit(5))) // fallback if index doesn't exist
  );
  
  const subsSnap = await getDocs(query(collection(db, 'subscriptions'), orderBy('created_at', 'desc'), limit(5))).catch(() =>
    getDocs(query(collection(db, 'subscriptions'), limit(5))) // fallback if index doesn't exist
  );

  const activities: any[] = [];

  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    activities.push({
      id: doc.id,
      type: data.role === 'vendor' ? 'vendor' : 'user',
      title: data.role === 'vendor' ? `New Vendor: ${data.kitchen_name || 'Unnamed Kitchen'}` : `New User: ${data.name || 'Anonymous'}`,
      timestamp: data.created_at || data.createdAt,
      icon: data.role === 'vendor' ? '🏪' : '👤',
    });
  });

  subsSnap.docs.forEach(doc => {
    const data = doc.data();
    activities.push({
      id: doc.id,
      type: 'subscription',
      title: `New Subscription: ${data.plan_name || 'Standard Plan'}`,
      timestamp: data.created_at || data.createdAt,
      icon: '🍱',
    });
  });

  return activities
    .sort((a, b) => {
      const timeA = a.timestamp?.seconds || 0;
      const timeB = b.timestamp?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, 5);
}

export async function getActiveDeliveryPartners() {
  const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'delivery')));
  return usersSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(u => u.location && u.location.lat && u.location.lng);
}
