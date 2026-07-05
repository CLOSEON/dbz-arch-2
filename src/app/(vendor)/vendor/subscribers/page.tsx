'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getVendorSubscriptions } from '@/lib/queries/subscriptions';
import { getUserById } from '@/lib/queries/users';
import { Subscription, EnrichedSubscription } from '@/types';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

export default function VendorSubscribers() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<EnrichedSubscription[]>([]);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user?.id) loadSubscribers();
  }, [user?.id]);

  async function loadSubscribers() {
    if (!user) return;
    setLoading(true);
    try {
      // For now get active ones, we could expand this to get all if needed
      const rawSubs = await getVendorSubscriptions(user.id);
      
      // Enrich with user data
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Subscribers</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your active customers</p>
      </div>

      {/* Tabs & Search */}
      <div className="space-y-4">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setFilter('active')}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
              filter === 'active' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
              filter === 'all' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
            }`}
          >
            All
          </button>
        </div>

        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Search by name or plan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No subscribers found"
          description="You don't have any subscribers matching this criteria."
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white rounded-3xl p-5 shadow-card flex items-center justify-between border border-slate-50">
              <div>
                <h4 className="font-bold text-slate-900">{s.userName}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-brand/5 text-brand px-1.5 py-0.5 rounded">
                    {s.meal_type}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {s.userPhone ? `+91 ******${s.userPhone.replace(/\D/g,'').slice(-4)}` : '—'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Active</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
