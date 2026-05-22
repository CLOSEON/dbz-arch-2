import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function getAdminStats() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  
  // Fetch today's delivery orders
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  // NOTE: Assuming firestore can do this basic filtering or we will filter in memory if no index exists
  const ordersSnap = await getDocs(collection(db, 'delivery_orders'));
  const orders = ordersSnap.docs.map(d => d.data());
  const todaysOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    const date = o.createdAt.toDate();
    return date >= todayStart && date <= todayEnd;
  });

  const users = usersSnap.docs.map(d => d.data());
  const subs = subsSnap.docs.map(d => d.data());

  const vendors = users.filter(u => u.role === 'vendor');
  const activeSubs = subs.filter(s => s.status === 'active');

  // Estimate revenue (simplified)
  const estimatedRevenue = activeSubs.length * 3000;

  return {
    totalUsers: users.length,
    totalVendors: vendors.length,
    approvedVendors: vendors.filter(v => v.is_approved).length,
    activeSubscriptions: activeSubs.length,
    cancelledSubscriptions: subs.filter(s => s.status === 'cancelled').length,
    estimatedRevenue,
    totalDeliveryOrders: todaysOrders.length,
    unassignedDeliveries: todaysOrders.filter(o => !o.driverId && o.status !== 'delivered').length,
    delayedOrders: todaysOrders.filter(o => o.status === 'failed_attempt').length,
  };
}

export async function getRecentActivity() {
  // Fetch recent users (new vendors/users)
  const usersSnap = await getDocs(query(collection(db, 'users'), limit(10)));
  
  // Fetch recent subscriptions
  const subsSnap = await getDocs(query(collection(db, 'subscriptions'), limit(10)));

  const activities: any[] = [];

  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    activities.push({
      id: doc.id,
      type: data.role === 'vendor' ? 'vendor' : 'user',
      title: data.role === 'vendor' ? `New Vendor: ${data.kitchen_name || 'Unnamed Kitchen'}` : `New User: ${data.name || 'Anonymous'}`,
      timestamp: data.created_at,
      icon: data.role === 'vendor' ? '🏪' : '👤',
    });
  });

  subsSnap.docs.forEach(doc => {
    const data = doc.data();
    activities.push({
      id: doc.id,
      type: 'subscription',
      title: `New Subscription: ${data.plan_name || 'Standard Plan'}`,
      timestamp: data.created_at,
      icon: '🍱',
    });
  });

  // Sort all activities by timestamp desc
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
