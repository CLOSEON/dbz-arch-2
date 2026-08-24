'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getVendorSubscriptions } from '@/lib/queries/subscriptions';
import { getUserById } from '@/lib/queries/users';
import { EnrichedSubscription } from '@/types';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { Search, Users } from 'lucide-react';

export default function VendorMenuPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<EnrichedSubscription[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user?.id) loadSubscribers();
  }, [user?.id]);

  async function loadSubscribers() {
    if (!user) return;
    setLoading(true);
    try {
      const rawSubs = await getVendorSubscriptions(user.id);
      
      const enriched = await Promise.all(
        rawSubs.map(async (s) => {
          const userData = await getUserById(s.user_id);
          return {
            ...s,
            userName: userData?.name || 'Unknown User',
            userPhone: userData?.phone || '',
          };
        })
      );
      
      setSubs(enriched);
    } catch (err) {
      addToast('Failed to load subscribers', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = subs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.userName?.toLowerCase().includes(q) ||
          (s.userPhone || '').includes(q) ||
          s.meal_type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [subs, search]);

  return (
    <div className="px-5 py-4 max-w-2xl mx-auto space-y-10 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
          Food & Customers
        </span>
        <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight mt-2.5">
          Menu Settings
        </h1>
        <p className="text-sm font-medium text-slate-400 mt-1">
          Set your daily menu and view active subscribers
        </p>
      </div>

      {/* Menu Settings */}
      <div>
        <TodayMenuCard />
      </div>

      {/* Subscribers List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-indigo-500" />
            Active Subscribers
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {subs.length} Total
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
            placeholder="Search subscribers by name or plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No subscribers found"
            description="You don't have any subscribers matching this criteria."
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between hover:border-brand/20 transition-colors">
                <div>
                  <h4 className="font-bold text-slate-900">{s.userName}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-brand/10 text-brand px-2 py-0.5 rounded-md">
                      {s.meal_type}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {s.userPhone ? `+91 ******${s.userPhone.replace(/\D/g,'').slice(-4)}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto mb-1" />
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Active</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
