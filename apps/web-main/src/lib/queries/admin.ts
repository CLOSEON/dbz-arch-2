import { collection, getDocs, query, where, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';

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

// ─────────────────────────────────────────────────────────────────────────────
// Custom Plan Business Insights Query
// ─────────────────────────────────────────────────────────────────────────────

export interface MostCommonPatternData {
  pattern: Record<string, any>;
  usersCount: number;
}

export interface CustomPlanStats {
  totalCustomWeeklySubscriptions: number;
  totalCustomMonthlySubscriptions: number;
  averageMealsPerWeekOrdered: number;
  averageRevenuePerCustomSubscription: number;
  mostCommonPattern: MostCommonPatternData | null;
  totalActiveCustomPlanSubscriptions: number;
  totalCustomSubscriptions: number;
  updatedAt?: string;
}

export async function fetchCustomPlanStats(): Promise<CustomPlanStats> {
  // 1. Try Firebase Callable Cloud Function (getCustomPlanStats)
  try {
    const callable = httpsCallable<void, CustomPlanStats>(functions, 'getCustomPlanStats');
    const result = await callable();
    if (result && result.data) {
      return result.data;
    }
  } catch (callableErr: any) {
    console.warn('[AdminQueries] Callable getCustomPlanStats fallback to client aggregation:', callableErr?.message || callableErr);
  }

  // 2. Client-side fallback aggregation
  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  let totalWeekly = 0;
  let totalMonthly = 0;
  let totalActive = 0;
  let totalRevenue = 0;
  let totalCustomCount = 0;
  let weeklyMealsSum = 0;
  let weeklyMealsCount = 0;

  const patternFrequencyMap = new Map<string, { pattern: Record<string, any>; count: number }>();

  subsSnap.docs.forEach((d) => {
    const sub = d.data();
    const isCustom =
      sub.isCustomPlan === true ||
      sub.is_custom_plan === true ||
      sub.subscriptionType === 'custom_weekly' ||
      sub.subscriptionType === 'custom_monthly' ||
      sub.plan_id === 'custom_weekly' ||
      sub.plan_id === 'custom_monthly';

    if (!isCustom) return;

    totalCustomCount += 1;
    const isWeekly =
      sub.billingCycle === 'weekly' ||
      sub.frequency === 'weekly' ||
      sub.subscriptionType === 'custom_weekly' ||
      sub.plan_id === 'custom_weekly';

    if (isWeekly) {
      totalWeekly += 1;
    } else {
      totalMonthly += 1;
    }

    if (sub.status === 'active') {
      totalActive += 1;
    }

    const price =
      Number(sub.customPlan?.totalPrice) ||
      Number(sub.total_price) ||
      Number(sub.price) ||
      0;
    totalRevenue += price;

    const rawPattern =
      sub.customPlan?.pattern ||
      sub.deliveryPattern ||
      sub.delivery_pattern ||
      {};

    const patternMeals = Object.values(rawPattern).reduce<number>((sum, val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0 ? sum + num : sum;
    }, 0);

    const subTotalMeals =
      Number(sub.customPlan?.totalMeals) ||
      Number(sub.totalMeals) ||
      patternMeals;

    if (isWeekly && subTotalMeals > 0) {
      weeklyMealsSum += subTotalMeals;
      weeklyMealsCount += 1;
    }

    if (Object.keys(rawPattern).length > 0) {
      const sorted = Object.entries(rawPattern)
        .filter(([_, v]) => Number(v) > 0)
        .sort(([a], [b]) => a.localeCompare(b));
      const key = sorted.map(([k, v]) => `${k}:${v}`).join(',');
      if (key) {
        const item = patternFrequencyMap.get(key);
        if (item) item.count += 1;
        else patternFrequencyMap.set(key, { pattern: rawPattern, count: 1 });
      }
    }
  });

  let mostCommonPattern: MostCommonPatternData | null = null;
  let highestCount = 0;
  patternFrequencyMap.forEach(({ pattern, count }) => {
    if (count > highestCount) {
      highestCount = count;
      mostCommonPattern = { pattern, usersCount: count };
    }
  });

  return {
    totalCustomWeeklySubscriptions: totalWeekly,
    totalCustomMonthlySubscriptions: totalMonthly,
    averageMealsPerWeekOrdered:
      weeklyMealsCount > 0 ? Math.round((weeklyMealsSum / weeklyMealsCount) * 10) / 10 : 0,
    averageRevenuePerCustomSubscription:
      totalCustomCount > 0 ? Math.round(totalRevenue / totalCustomCount) : 0,
    mostCommonPattern: mostCommonPattern || {
      pattern: { monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 2, sunday: 2 },
      usersCount: 0,
    },
    totalActiveCustomPlanSubscriptions: totalActive,
    totalCustomSubscriptions: totalCustomCount,
    updatedAt: new Date().toISOString(),
  };
}
