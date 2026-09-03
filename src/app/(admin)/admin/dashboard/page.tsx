'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAdminStats, getRecentActivity, getActiveDeliveryPartners } from '@/lib/queries/admin';
import { formatDate } from '@/lib/utils';
import { db } from '@/lib/firebase';
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
  serverTimestamp,
  Timestamp,
  runTransaction
} from 'firebase/firestore';
import { 
  Users, 
  Store, 
  Ticket, 
  TrendingUp, 
  ChevronRight, 
  Bell, 
  MessageSquare, 
  Tag, 
  CheckCircle,
  Navigation,
  Package,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Search,
  ArrowLeftRight,
  Database,
  Plus,
  Minus,
  RefreshCw,
  Coins,
  ShieldCheck,
  Power,
  Percent,
  TrendingDown,
  X
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { CustomPlanInsightsCard } from '@/components/admin/CustomPlanInsightsCard';
import { UserManagementHub } from '@/components/admin/UserManagementHub';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center animate-pulse">
      <Navigation className="w-8 h-8 text-slate-300" />
    </div>
  )
});

export default function AdminDashboard() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  
  // States
  const [activeTab, setActiveTab] = useState<'overview' | 'global' | 'kitchens' | 'impersonation' | 'financials' | 'custom_plans'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Global Settings States
  const [isSystemPaused, setIsSystemPaused] = useState(false);
  const [emergencyMsg, setEmergencyMsg] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Impersonation States
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserSubs, setSelectedUserSubs] = useState<any[]>([]);
  const [selectedUserCredits, setSelectedUserCredits] = useState<any[]>([]);
  const [selectedUserAllowances, setSelectedUserAllowances] = useState<any[]>([]);
  const [creditAdjustment, setCreditAdjustment] = useState<number>(1);
  const [swapAdjustment, setSwapAdjustment] = useState<number>(1);
  const [impersonatingLoading, setImpersonatingLoading] = useState(false);

  // Kitchen Override States
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [allVendors, setAllVendors] = useState<any[]>([]);
  const [selectedOrderToMove, setSelectedOrderToMove] = useState<any>(null);
  const [targetVendorId, setTargetVendorId] = useState('');
  const [movingOrder, setMovingOrder] = useState(false);
  // Financial Health States
  const [financials, setFinancials] = useState({
    swapRevenue: 0,
    creditLiability: 0,
    voucherCost: 0,
    totalRefunds: 0,
    grossProfit: 0,
    activeSubsRevenue: 0
  });
  const [financialsLastFetched, setFinancialsLastFetched] = useState<number>(0);

  useEffect(() => {
    loadStats();
    loadGlobalConfig();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [statsData, activityData, partnersData] = await Promise.all([
        getAdminStats(),
        getRecentActivity(),
        getActiveDeliveryPartners()
      ]);
      setStats(statsData);
      setActivities(activityData);
      setPartners(partnersData);
      
      // Reset financials cache to force reload if user clicks the refresh button
      setFinancialsLastFetched(0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }
  // 1. Global Settings
  async function loadGlobalConfig() {
    try {
      const configSnap = await getDoc(doc(db, 'system_settings', 'global_config'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        setIsSystemPaused(!!data.is_paused);
        setEmergencyMsg(data.emergency_message || '');
      }
    } catch (err) {
      console.error('Failed to load system settings', err);
    }
  }

  async function saveGlobalConfig() {
    setUpdatingSettings(true);
    try {
      await setDoc(doc(db, 'system_settings', 'global_config'), {
        is_paused: isSystemPaused,
        emergency_message: emergencyMsg,
        updated_at: serverTimestamp(),
        updated_by: user?.id || 'admin'
      });
      toast.success('System configuration updated! 🚀');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update config');
    } finally {
      setUpdatingSettings(false);
    }
  }

  // 2. User Impersonation & Ledgers
  async function searchUsers() {
    if (!userSearchQuery) return;
    setImpersonatingLoading(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'user'));
      const snap = await getDocs(q);
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((u: any) => 
          (u.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          (u.phone || '').includes(userSearchQuery)
        );
      setSearchedUsers(filtered);
      if (filtered.length === 0) toast.error('No users found matching query');
    } catch (err) {
      console.error(err);
      toast.error('Search failed');
    } finally {
      setImpersonatingLoading(false);
    }
  }

  async function selectUser(targetUser: any) {
    setSelectedUser(targetUser);
    setImpersonatingLoading(true);
    try {
      // 1. Fetch user subscriptions
      const subsSnap = await getDocs(query(collection(db, 'subscriptions'), where('user_id', '==', targetUser.id)));
      setSelectedUserSubs(subsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 2. Fetch user credits
      const creditsSnap = await getDocs(query(collection(db, 'user_credits'), where('user_id', '==', targetUser.id)));
      setSelectedUserCredits(creditsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 3. Fetch user swap allowances
      const allowanceSnap = await getDocs(query(collection(db, 'subscription_swap_allowances'), where('user_id', '==', targetUser.id)));
      setSelectedUserAllowances(allowanceSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (err) {
      console.error(err);
      toast.error('Failed to load user details');
    } finally {
      setImpersonatingLoading(false);
    }
  }

  async function handleAdjustCredits(amount: number) {
    if (!selectedUser) return;
    try {
      const creditRef = doc(collection(db, 'user_credits'));
      await setDoc(creditRef, {
        id: creditRef.id,
        user_id: selectedUser.id,
        credit_amount: amount,
        source: 'admin_adjustment',
        source_reference_id: user?.id || 'admin',
        redeemed: false,
        created_at: serverTimestamp()
      });
      toast.success(`Successfully adjusted credits by ${amount}!`);
      selectUser(selectedUser);
    } catch (err) {
      console.error(err);
      toast.error('Credit adjustment failed');
    }
  }

  async function handleAdjustSwaps(subId: string, count: number) {
    try {
      const allowanceRef = doc(db, 'subscription_swap_allowances', subId);
      const snap = await getDoc(allowanceRef);
      if (snap.exists()) {
        const data = snap.data();
        const currentTotal = data.free_swaps_total || 0;
        await updateDoc(allowanceRef, {
          free_swaps_total: Math.max(0, currentTotal + count),
          updated_at: serverTimestamp()
        });
      } else {
        await setDoc(allowanceRef, {
          subscription_id: subId,
          user_id: selectedUser.id,
          free_swaps_total: count,
          free_swaps_used: 0,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
      toast.success(`Successfully adjusted free swaps by ${count}!`);
      selectUser(selectedUser);
    } catch (err) {
      console.error(err);
      toast.error('Swap adjustment failed');
    }
  }

  // 3. Kitchen override & Batch manual move
  async function loadKitchenOverrideData() {
    setLoading(true);
    try {
      // Load all active vendors
      const vendorSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'vendor')));
      setAllVendors(vendorSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load today's created/preparing orders
      const todayStr = new Date().toISOString().split('T')[0];
      const ordersSnap = await getDocs(query(collection(db, 'orders'), where('date', '==', todayStr)));
      setActiveOrders(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load override data');
    } finally {
      setLoading(false);
    }
  }

  async function moveOrder() {
    if (!selectedOrderToMove || !targetVendorId) return;
    setMovingOrder(true);
    try {
      const orderRef = doc(db, 'orders', selectedOrderToMove.id);
      
      await runTransaction(db, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error('Order not found');
        
        const orderData = orderSnap.data();
        const oldVendorId = orderData.vendor_id;
        const oldBatchId = orderData.batch_id;

        // 1. Update Order's Vendor ID
        transaction.update(orderRef, {
          vendor_id: targetVendorId,
          updated_at: serverTimestamp()
        });

        // 2. If already batched, we need to adjust batches
        if (oldBatchId) {
          const oldBatchRef = doc(db, 'batches', oldBatchId);
          const oldBatchSnap = await transaction.get(oldBatchRef);
          if (oldBatchSnap.exists()) {
            const oldBatchData = oldBatchSnap.data();
            const updatedIds = (oldBatchData.order_ids || []).filter((id: string) => id !== selectedOrderToMove.id);
            transaction.update(oldBatchRef, {
              order_ids: updatedIds,
              total_count: updatedIds.length,
              updated_at: serverTimestamp()
            });
          }

          // Search or create a batch for the target vendor for this date/slot
          const todayStr = new Date().toISOString().split('T')[0];
          const newBatchId = `batch_${targetVendorId}_${orderData.delivery_slot}_${todayStr}`;
          const newBatchRef = doc(db, 'batches', newBatchId);
          const newBatchSnap = await transaction.get(newBatchRef);

          if (newBatchSnap.exists()) {
            const newBatchData = newBatchSnap.data();
            const updatedIds = [...(newBatchData.order_ids || []), selectedOrderToMove.id];
            transaction.update(newBatchRef, {
              order_ids: updatedIds,
              total_count: updatedIds.length,
              updated_at: serverTimestamp(),
              batch_id: newBatchId
            });
            // Update order with new batch ID too
            transaction.update(orderRef, { batch_id: newBatchId });
          } else {
            // Create target batch
            transaction.set(newBatchRef, {
              id: newBatchId,
              vendor_id: targetVendorId,
              slot: orderData.delivery_slot,
              date: todayStr,
              order_ids: [selectedOrderToMove.id],
              total_count: 1,
              status: 'notified',
              created_at: serverTimestamp(),
              updated_at: serverTimestamp()
            });
            transaction.update(orderRef, { batch_id: newBatchId });
          }
        }
      });

      toast.success('Successfully moved tiffin to new vendor! 🏪');
      setSelectedOrderToMove(null);
      loadKitchenOverrideData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to move order');
    } finally {
      setMovingOrder(false);
    }
  }

  // 4. Financial Health Analytics
  async function loadFinancialHealth(force = false) {
    if (!force && Date.now() - financialsLastFetched < 120000) {
      return;
    }
    setLoading(true);
    try {
      const [swapsSnap, creditsSnap, vouchersSnap, subsSnap] = await Promise.all([
        getDocs(query(collection(db, 'swap_requests'), where('status', '==', 'matched'))),
        getDocs(query(collection(db, 'user_credits'), where('redeemed', '==', false))),
        getDocs(query(collection(db, 'free_meal_vouchers'), where('status', '==', 'used'))),
        getDocs(query(collection(db, 'subscriptions'), where('status', '==', 'active')))
      ]);

      let swapRevenue = 0;
      swapsSnap.docs.forEach(d => {
        const data = d.data();
        if (data.is_paid && data.payment_amount) {
          swapRevenue += data.payment_amount;
        }
      });

      let creditLiability = 0;
      creditsSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.redeemed) {
          creditLiability += (data.credit_amount || 0) * 200; // Estimated Rs 200 per full credit
        }
      });

      let voucherCost = 0;
      vouchersSnap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'used') {
          voucherCost += 200; // Actual tiffin cost Rs 200 paid to vendor
        }
      });

      const activeSubsRevenue = subsSnap.docs.length * 3000; // Approx ₹3,000 per subscriber / month
      const grossProfit = activeSubsRevenue + swapRevenue - voucherCost;

      setFinancials({
        swapRevenue,
        creditLiability,
        voucherCost,
        totalRefunds: 0,
        grossProfit,
        activeSubsRevenue
      });
      setFinancialsLastFetched(Date.now());

    } catch (err) {
      console.error(err);
      toast.error('Failed to load financial stats');
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="space-y-10 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 px-1 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">
              Admin Control Center
            </h1>
            <button 
              onClick={loadStats}
              disabled={loading}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors disabled:opacity-50"
              title="Refresh Stats"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <p className="text-sm font-medium text-slate-400">
            Real-time management, override controls & health metrics
          </p>
        </div>
        <button onClick={logout} className="btn-outline whitespace-nowrap">Logout</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-none gap-2">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'overview' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Overview & Live Fleet
        </button>
        <button 
          onClick={() => { setActiveTab('global'); loadGlobalConfig(); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'global' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Global Controls
        </button>
        <button 
          onClick={() => { setActiveTab('kitchens'); loadKitchenOverrideData(); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'kitchens' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Kitchen Override
        </button>
        <button 
          onClick={() => setActiveTab('impersonation')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'impersonation' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Users & Subscriptions
        </button>
        <button 
          onClick={() => { setActiveTab('financials'); loadFinancialHealth(); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'financials' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Financial Health
        </button>
        <button 
          onClick={() => setActiveTab('custom_plans')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === 'custom_plans' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
        >
          Custom Plans
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-6">
            <div className="card bg-white/60 backdrop-blur-md border border-white/20 shadow-lg">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Users</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : stats?.totalUsers}</h3>
                <div className="w-10 h-10 rounded-xl bg-slate-100/50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </div>
            <div className="card bg-white/60 backdrop-blur-md border border-white/20 shadow-lg">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Est Revenue</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-emerald-600 leading-none">₹{loading ? '0' : stats?.estimatedRevenue?.toLocaleString()}</h3>
                <div className="w-10 h-10 rounded-xl bg-emerald-50/80 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="card bg-white/60 backdrop-blur-md border border-white/20 shadow-lg">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Active Subs</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : stats?.activeSubscriptions}</h3>
                <div className="w-10 h-10 rounded-xl bg-slate-100/50 flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </div>
            <div className="card bg-brand/5 backdrop-blur-md border border-brand/10 shadow-lg">
              <p className="text-[11px] font-bold text-brand/60 uppercase tracking-wider mb-1.5">Today Orders</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-brand leading-none">{loading ? '—' : stats?.totalDeliveryOrders || '0'}</h3>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-brand" />
                </div>
              </div>
            </div>
            <div className="card bg-amber-50/50 backdrop-blur-md border border-amber-100 shadow-lg">
              <p className="text-[11px] font-bold text-amber-600/70 uppercase tracking-wider mb-1.5">Unassigned</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-amber-600 leading-none">{loading ? '—' : stats?.unassignedDeliveries || '0'}</h3>
                <div className="w-10 h-10 rounded-xl bg-amber-100/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </div>
            <div className="card bg-white/60 backdrop-blur-md border border-white/20 shadow-lg">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Live Riders</p>
              <div className="flex items-end justify-between">
                <h3 className="text-2xl font-black text-slate-900 leading-none">{partners.length}</h3>
                <div className="w-10 h-10 rounded-xl bg-slate-100/50 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Map & Recent Activity */}
          <div className="grid lg:grid-cols-3 gap-6 pt-2">
            <div className="lg:col-span-3 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-emerald-500" />
                  Live Fleet Tracking
                </h3>
                <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                  {partners.length} Active Partners
                </span>
              </div>
              <DeliveryMap 
                markers={partners.map(p => ({
                  id: p.id,
                  lat: p.location.lat,
                  lng: p.location.lng,
                  title: p.name || 'Delivery Partner',
                  subtitle: p.phone
                }))} 
              />
            </div>

            <div className="lg:col-span-3 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900">Recent System Activity</h3>
              </div>
              <div className="space-y-4">
                {activities.length === 0 && !loading ? (
                  <p className="text-xs text-slate-400 text-center py-10">No recent activity found</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex items-center gap-4 bg-slate-50/50 border border-slate-100/70 p-4 rounded-2xl">
                        <div className="text-2xl">{activity.icon}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{activity.title}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {activity.timestamp ? formatDate(activity.timestamp) : 'Just now'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom Meal Plan Business Intelligence */}
          <CustomPlanInsightsCard />
        </div>
      )}

      {activeTab === 'global' && (
        <div className="space-y-6 max-w-2xl animate-fade-in">
          <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100 space-y-6">
            <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
              <Power className="w-5 h-5 text-brand" /> System Operations Settings
            </h3>
            
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">Emergency System Pause</p>
                <p className="text-xs text-slate-400 max-w-[360px] mt-0.5">Temporarily halts all tiffin orders, skips, and swap request generation across the marketplace.</p>
              </div>
              <button 
                onClick={() => setIsSystemPaused(prev => !prev)}
                className={`w-14 h-8 rounded-full transition-all duration-300 relative ${isSystemPaused ? 'bg-rose-500' : 'bg-slate-200'}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-all ${isSystemPaused ? 'left-7 shadow-md' : 'left-1 shadow-sm'}`} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Emergency Banner Message</label>
              <textarea 
                value={emergencyMsg}
                onChange={(e) => setEmergencyMsg(e.target.value)}
                placeholder="Show a banner to all active users, e.g., 'Heavy rainfall in Bengaluru may delay deliveries today.'"
                className="input min-h-[90px] text-xs"
              />
            </div>

            <button 
              onClick={saveGlobalConfig}
              disabled={updatingSettings}
              className="btn-primary"
            >
              {updatingSettings ? 'Saving Configuration...' : 'Apply Operation settings'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'kitchens' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-brand" /> Kitchen Load Balancer / Override
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Manually move specific tiffin orders to different kitchen partners before/after batch creation.</p>
              </div>
              <button onClick={loadKitchenOverrideData} className="btn-outline">Refresh Active List</button>
            </div>

            {selectedOrderToMove ? (
              <div className="p-5 bg-orange-50 border border-orange-100 rounded-3xl space-y-4 max-w-md">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase bg-brand/10 text-brand px-2 py-0.5 rounded">Move Order</span>
                    <h4 className="font-bold text-slate-900 mt-2 text-sm">Order ID: {selectedOrderToMove.id}</h4>
                    <p className="text-xs text-slate-500 font-medium">Slot: {selectedOrderToMove.delivery_slot} | Current Kitchen: {allVendors.find(v => v.id === selectedOrderToMove.vendor_id)?.kitchen_name || allVendors.find(v => v.id === selectedOrderToMove.vendor_id)?.name || 'Unknown'}</p>
                  </div>
                  <button onClick={() => setSelectedOrderToMove(null)} className="p-1 rounded-full hover:bg-orange-100 text-slate-500"><X className="w-4 h-4" /></button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Target Kitchen</label>
                  <select 
                    value={targetVendorId}
                    onChange={(e) => setTargetVendorId(e.target.value)}
                    className="w-full py-2.5 px-4 text-xs border border-slate-200 rounded-2xl bg-white text-slate-900 font-medium shadow-sm"
                  >
                    <option value="">-- Select Kitchen Partner --</option>
                    {allVendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>{vendor.kitchen_name || vendor.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={moveOrder}
                  disabled={movingOrder || !targetVendorId}
                  className="w-full py-3 rounded-2xl bg-brand text-white text-xs font-black uppercase tracking-wider shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {movingOrder ? 'Moving Tiffin...' : 'Confirm Kitchen Move'}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="p-4">User</th>
                      <th className="p-4">Slot</th>
                      <th className="p-4">Current Kitchen</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeOrders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{order.user_id}</td>
                        <td className="p-4 font-bold text-slate-500 uppercase">{order.delivery_slot}</td>
                        <td className="p-4 font-bold text-slate-700">{allVendors.find(v => v.id === order.vendor_id)?.kitchen_name || allVendors.find(v => v.id === order.vendor_id)?.name || 'Unknown'}</td>
                        <td className="p-4">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold">{order.status}</span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => { setSelectedOrderToMove(order); setTargetVendorId(''); }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                          >
                            Rebalance
                          </button>
                        </td>
                      </tr>
                    ))}
                    {activeOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">No active orders generated for today.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'impersonation' && (
        <UserManagementHub />
      )}

      {activeTab === 'financials' && (
        <div className="space-y-6 animate-fade-in">
          {/* Gross overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sub Monthly Revenue</p>
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-3xl font-black text-slate-900">₹{financials.activeSubsRevenue.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Based on active subscriptions (₹3000/sub)</p>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paid Swap Revenue</p>
                <Percent className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-3xl font-black text-slate-900">₹{financials.swapRevenue.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Gross revenue collected from paid tiffin swaps</p>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Voucher Cost</p>
                <TrendingDown className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-3xl font-black text-rose-600">₹{financials.voucherCost.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Actual payments to kitchen partners for redeemed tiffins</p>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 space-y-6">
            <h3 className="font-black text-slate-900 text-lg">Financial Net Ledger Balance</h3>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Estimated Voucher Liability</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Voucher pool waiting to be redeemed by active subscribers.</p>
                  </div>
                  <span className="text-lg font-black text-orange-600">₹{financials.creditLiability.toLocaleString()}</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Calculated Profitability Margin</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Approx tiffin marketplace earnings after tiffin cost deduction.</p>
                  </div>
                  <span className="text-lg font-black text-emerald-600">
                    ₹{(financials.activeSubsRevenue + financials.swapRevenue - financials.voucherCost).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-center text-center">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Platform Unit Economics Health</h4>
                <div className="mt-4 flex justify-center items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-base font-black text-slate-800">Economic Health: STABLE</span>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold mt-2.5 max-w-[280px] mx-auto leading-relaxed">
                  Swap revenue offsets free voucher liabilities by a margin of {(((financials.activeSubsRevenue + financials.swapRevenue - financials.voucherCost) / (financials.activeSubsRevenue || 1)) * 100).toFixed(1)}%.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Custom Meal Plans Intelligence Tab */}
      {activeTab === 'custom_plans' && (
        <div className="space-y-8 animate-fade-in">
          <CustomPlanInsightsCard />
        </div>
      )}
    </div>
  );
}
