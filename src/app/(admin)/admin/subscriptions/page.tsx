'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllSubscriptions } from '@/lib/queries/subscriptions';
import { getAllUsers } from '@/lib/queries/users';
import { EnrichedSubscription, AppUser } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { Search, Ticket, User, Store, Clock } from 'lucide-react';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';

export default function AdminSubscriptions() {
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<EnrichedSubscription[]>([]);
  const [filter, setFilter] = useState<'active' | 'cancelled' | 'all'>('active');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    setLoading(true);
    try {
      const [{ subs: list }, users] = await Promise.all([
        getAllSubscriptions(undefined, 100),
        getAllUsers(),
      ]);

      const userMap: Record<string, AppUser> = {};
      users.forEach(u => userMap[u.id] = u);

      const enriched = list.map(s => ({
        ...s,
        userName: userMap[s.user_id]?.name || 'Unknown User',
        userPhone: userMap[s.user_id]?.phone || '',
        vendorName: userMap[s.vendor_id]?.name || 'Unknown Vendor',
      }));

      setSubs(enriched);
    } catch (err) {
      addToast('Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = subs;
    if (filter === 'active') list = list.filter(s => s.status === 'active');
    else if (filter === 'cancelled') list = list.filter(s => s.status === 'cancelled');

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => 
        s.userName?.toLowerCase().includes(q) || 
        s.vendorName?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [subs, filter, search]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Subscriptions</h1>
        <p className="text-sm text-slate-500 mt-0.5">Global subscription logs</p>
      </div>

      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search user or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
          {(['active', 'cancelled', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                filter === t ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🎫"
          title="No records found"
          description={`No ${filter} subscriptions found.`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white rounded-3xl p-5 shadow-card border border-slate-50">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-brand/5 flex items-center justify-center">
                    <Ticket className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Sub ID</span>
                    <span className="text-[10px] font-mono font-medium text-slate-600">{s.id.slice(0, 12)}...</span>
                  </div>
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                  s.status === 'active' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
                }`}>
                  {s.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">{s.userName}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Store className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">{s.vendorName}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Started</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-600">{formatDate(s.created_at)}</p>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Plan</span>
                  <p className="text-sm font-black text-brand uppercase">{s.meal_type}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
