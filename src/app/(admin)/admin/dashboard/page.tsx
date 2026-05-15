'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAdminStats, getRecentActivity } from '@/lib/queries/admin';
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
  CheckCircle 
} from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboard() {
  const logout = useAuthStore((s) => s.logout);
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
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
    { label: 'Approve', icon: CheckCircle, color: 'text-rose-500', bg: 'bg-rose-50', href: '/admin/vendors?filter=pending' },
    { label: 'Tickets', icon: MessageSquare, color: 'text-brand', bg: 'bg-brand-50', href: '/admin/support' },
    { label: 'Notify', icon: Bell, color: 'text-purple-500', bg: 'bg-purple-50', href: '/admin/notifications' },
    { label: 'Coupons', icon: Tag, color: 'text-emerald-500', bg: 'bg-emerald-50', href: '/admin/discount-codes' },
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1">
        <div>
          <h1 className="text-[36px] font-black text-slate-900 tracking-tight leading-tight">
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Users</p>
          <div className="flex items-end justify-between">
            <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : stats?.totalUsers}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Revenue (Est)</p>
          <div className="flex items-end justify-between">
            <h3 className="text-2xl font-black text-brand leading-none">₹{loading ? '0' : stats?.estimatedRevenue?.toLocaleString()}</h3>
            <div className="w-10 h-10 rounded-xl bg-brand/5 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-brand" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Vendors</p>
          <div className="flex items-end justify-between">
            <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : `${stats?.approvedVendors}/${stats?.totalVendors}`}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
              <Store className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Active Subs</p>
          <div className="flex items-end justify-between">
            <h3 className="text-2xl font-black text-slate-900 leading-none">{loading ? '—' : stats?.activeSubscriptions}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-slate-400" />
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
