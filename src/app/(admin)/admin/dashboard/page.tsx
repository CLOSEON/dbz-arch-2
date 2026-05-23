'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAdminStats, getRecentActivity, getActiveDeliveryPartners } from '@/lib/queries/admin';
import { formatDate } from '@/lib/utils';
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
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

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
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    
    // Set up real-time listener for fleet tracking
    let unsubscribe: (() => void) | undefined;
    import('firebase/firestore').then(({ collection, query, where, onSnapshot }) => {
      import('@/lib/firebase').then(({ db }) => {
        const q = query(collection(db, 'users'), where('role', '==', 'delivery'));
        unsubscribe = onSnapshot(q, (snap) => {
          const fleet = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(u => u.location && u.location.lat && u.location.lng);
          setPartners(fleet);
        });
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [statsData, activityData] = await Promise.all([
        getAdminStats(),
        getRecentActivity()
      ]);
      setStats(statsData);
      setActivities(activityData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const QUICK_ACTIONS = [
    { label: 'Generate', icon: Package, color: 'text-brand', bg: 'bg-brand/10', href: '/admin/orders?action=generate' },
    { label: 'Approve', icon: CheckCircle, color: 'text-rose-500', bg: 'bg-rose-50', href: '/admin/vendors?filter=pending' },
    { label: 'Tickets', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50', href: '/admin/support' },
    { label: 'Broadcast', icon: Bell, color: 'text-purple-500', bg: 'bg-purple-50', href: '/admin/notifications?action=broadcast' },
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">
            Admin Panel
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            System overview & real-time controls
          </p>
        </div>
        <button
          onClick={logout}
          className="btn-outline"
        >
          Logout
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-1">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
          Orders: {loading ? '—' : stats?.totalDeliveryOrders || 0}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-50 text-amber-700">
          Unassigned: {loading ? '—' : stats?.unassignedDeliveries || 0}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">
          Fleet Live: {partners.length}
        </span>
      </div>

      {/* Stats Grid */}
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
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Revenue</p>
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
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Vendors</p>
          <div className="flex items-end justify-between">
            <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : `${stats?.approvedVendors}/${stats?.totalVendors}`}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-100/50 flex items-center justify-center">
              <Store className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 ml-1">Quick Actions</h3>
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
          {QUICK_ACTIONS.map((action) => (
            <Link 
              key={action.label} 
              href={action.href}
              className="flex flex-col items-center gap-3 group"
            >
              <div className={`w-16 h-16 rounded-[1.75rem] ${action.bg} ${action.color} flex items-center justify-center shadow-[0_10px_20px_-5px_rgba(0,0,0,0.05)] group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-300 relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <action.icon className="w-7 h-7 relative z-10" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="grid lg:grid-cols-3 gap-6 pt-2">
        {/* Fleet Tracking Map */}
        <div className="lg:col-span-3 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100 mb-2">
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

        <div className="lg:col-span-2 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Recent Activity</h3>
            <Link href="/admin/support" className="text-xs font-bold text-brand hover:underline">View All</Link>
          </div>
          <div className="space-y-4">
            {activities.length === 0 && !loading ? (
              <p className="text-xs text-slate-400 text-center py-10">No recent activity found</p>
            ) : (
              <div className="space-y-1">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between group cursor-pointer hover:bg-slate-50/80 -mx-4 px-4 py-4 rounded-2xl transition-all duration-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[1.25rem] bg-slate-50 flex items-center justify-center text-xl shadow-sm border border-slate-100 group-hover:bg-white transition-colors">
                        {activity.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-brand transition-colors">
                          {activity.title}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {activity.timestamp ? formatDate(activity.timestamp) : 'Just now'}
                        </p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {loading && [1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
