'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getUserSubscriptions, cancelSubscription } from '@/lib/queries/subscriptions';
import { getAllUsers } from '@/lib/queries/users';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate, formatMeal, toMillis } from '@/lib/utils';
import type { EnrichedSubscription } from '@/types';
import Link from 'next/link';
import { Box, History, CreditCard, Utensils, Calendar, ChevronRight } from 'lucide-react';

export default function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [orders, setOrders] = useState<EnrichedSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    if (user) loadOrders();
  }, [user]);

  async function loadOrders() {
    if (!user) return;
    setLoading(true);
    try {
      const [subs, users] = await Promise.all([
        getUserSubscriptions(user.id),
        getAllUsers(),
      ]);

      const vendorMap: Record<string, any> = {};
      users.forEach((u) => { if (u.role === 'vendor') vendorMap[u.id] = u; });

      const enriched: EnrichedSubscription[] = subs.map((s) => {
        const vendor = vendorMap[s.vendor_id] ?? {};
        const mealType = s.meal_type;
        let price = 0;
        let title = 'Subscription';

        if (mealType === 'lunch') {
          price = vendor.rate_lunch ?? 0;
          title = 'Lunch Plan';
        } else if (mealType === 'dinner') {
          price = vendor.rate_dinner ?? 0;
          title = 'Dinner Plan';
        } else if (mealType === 'both') {
          price = vendor.rate_both ?? 0;
          title = 'Lunch + Dinner';
        }

        return {
          ...s,
          vendorName: vendor.name ?? 'Vendor',
          vendorImage: vendor.image ?? '',
          planTitle: title,
          planPrice: price,
          planFrequency: 'day',
          createdMs: toMillis(s.created_at),
        };
      });

      // Deduplicate: Keep only the latest entry per (vendor_id + meal_type)
      const uniqueMap = new Map<string, EnrichedSubscription>();
      enriched.forEach((item) => {
        const key = `${item.vendor_id}-${item.meal_type}-${item.status}`;
        const existing = uniqueMap.get(key);
        if (!existing || (item.createdMs ?? 0) > (existing.createdMs ?? 0)) {
          uniqueMap.set(key, item);
        }
      });

      setOrders(Array.from(uniqueMap.values()).sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0)));
    } catch (err) {
      addToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(subId: string) {
    if (!confirm('Cancel this subscription?')) return;
    try {
      await cancelSubscription(subId);
      setOrders((prev) => prev.map((o) => o.id === subId ? { ...o, status: 'cancelled' } : o));
      addToast('Subscription cancelled', 'success');
    } catch {
      addToast('Failed to cancel', 'error');
    }
  }

  const filtered = orders.filter((o) =>
    activeTab === 'active' ? o.status !== 'cancelled' : o.status === 'cancelled'
  );

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mt-4 mb-10 px-1">
        <h1 className="text-[36px] font-black text-slate-900 tracking-tight leading-tight">
          My Orders
        </h1>
        <p className="text-sm font-medium text-slate-400 mt-1">
          Manage your active plans & history
        </p>
      </div>

      {/* Tabs */}
      <div className="pill-container mb-8">
        <button 
          className={`pill ${activeTab === 'active' ? 'active' : ''}`} 
          onClick={() => setActiveTab('active')}
        >
          <Box className="w-4 h-4" />
          Active
        </button>
        <button 
          className={`pill ${activeTab === 'history' ? 'active' : ''}`} 
          onClick={() => setActiveTab('history')}
        >
          <History className="w-4 h-4" />
          History
        </button>
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={activeTab === 'active' ? '📦' : '📋'}
          title={activeTab === 'active' ? 'No active subscriptions' : 'No cancelled plans'}
          description={activeTab === 'active' ? 'Browse vendors to find a meal plan' : 'Cancelled plans will appear here'}
          action={activeTab === 'active' ? <Link href="/dashboard" className="btn-primary inline-flex mt-4 px-8 py-4">Browse Vendors</Link> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {filtered.map((order, i) => {
            const isActive = order.status !== 'cancelled';
            return (
              <div key={order.id} className="card !p-0 overflow-hidden group">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                        {isActive ? <Utensils className="w-6 h-6 text-brand" /> : <History className="w-6 h-6 text-slate-300" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-[17px] leading-tight">{order.vendorName}</h4>
                        <p className="text-xs font-medium text-slate-400 mt-1">{order.planTitle}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                      isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {isActive ? 'Active' : 'Cancelled'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50/50 border border-slate-100 rounded-2xl p-4 mb-5">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> Rate
                      </p>
                      <p className="text-sm font-black text-slate-900">₹{order.planPrice}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Utensils className="w-3 h-3" /> Meal
                      </p>
                      <p className="text-sm font-black text-slate-900 truncate">{formatMeal(order.meal_type)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Started
                      </p>
                      <p className="text-sm font-black text-slate-900">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex gap-3">
                      <button 
                        className="flex-1 bg-rose-50 text-rose-500 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-colors" 
                        onClick={() => handleCancel(order.id)}
                      >
                        Cancel Plan
                      </button>
                      <Link 
                        href={`/vendor/detail?id=${order.vendor_id}`} 
                        className="flex-1 bg-slate-900 text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        View Vendor <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
