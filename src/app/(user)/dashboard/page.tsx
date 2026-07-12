'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useVendorStore } from '@/store/vendorStore';
import { useUiStore } from '@/store/uiStore';
import { getApprovedVendors } from '@/lib/queries/users';
import { getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { VendorCard } from '@/components/vendor/VendorCard';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import type { Vendor } from '@/types';
import { Search, SlidersHorizontal } from 'lucide-react';

const CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Home Style', value: 'home' },
  { label: 'North Indian', value: 'north' },
  { label: 'South Indian', value: 'south' },
  { label: 'Jain', value: 'jain' },
  { label: 'Pure Veg', value: 'veg' },
];

export default function UserDashboard() {
  const user = useAuthStore((s) => s.user);
  const { vendors, setVendors, isStale } = useVendorStore();
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(vendors.length === 0);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const rawVendors = await getApprovedVendors();

      const countMap: Record<string, number> = {};
      try {
        const subsSnap = await getDocs(
          query(collection(db, 'subscriptions'), where('status', '==', 'active'))
        );
        subsSnap.forEach((d) => {
          const s = d.data();
          if (s.vendor_id) countMap[s.vendor_id] = (countMap[s.vendor_id] ?? 0) + 1;
        });
      } catch {
        // Normal users may not be allowed to list all subscriptions.
      }

      const enriched: Vendor[] = rawVendors.map((v) => ({
        ...v,
        subscriberCount: countMap[v.id] ?? 0,
      }));

      setVendors(enriched);
    } catch {
      addToast('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, setVendors]);

  useEffect(() => {
    if (!isStale() && vendors.length > 0) return; // serve from cache
    void Promise.resolve().then(loadVendors);
  }, [isStale, loadVendors, vendors.length]);

  const filtered = useMemo(() => {
    let list = [...vendors];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) => v.name.toLowerCase().includes(q) || (v.cuisine_type ?? '').toLowerCase().includes(q)
      );
    }
    if (activeCategory !== 'all') {
      list = list.filter((v) =>
        (v.cuisine_type ?? '').toLowerCase().includes(activeCategory)
      );
    }
    return list;
  }, [vendors, search, activeCategory]);

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="animate-slide-up-soft flex items-start justify-between mb-7 px-1 pt-4 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-950 tracking-tight leading-none">
            Hey, {user?.name?.split(' ')[0] || 'Tiffin Lover'} 👋
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-3">
            Discover the best home-made tiffins in your area
          </p>
        </div>
        <Link 
          href="/profile"
          className="interactive-card soft-float w-14 h-14 rounded-2xl bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] flex items-center justify-center border border-slate-200/70 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(255,59,48,0.14)] active:scale-[0.97] transition-all duration-300 shrink-0 overflow-hidden"
        >
          <Image src="/assets/dabzzo-logo.png" alt="Dabzzo" width={48} height={48} priority className="object-contain" />
        </Link>
      </div>

      {/* Search Bar */}
      <div className="animate-slide-up-soft relative mb-5 group" style={{ animationDelay: '70ms' }}>
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand transition-colors">
          <Search className="h-5 w-5" strokeWidth={2.4} />
        </div>
        <input
          className="input pl-14 pr-12 py-5 transition-all duration-300 focus:-translate-y-0.5 focus:shadow-[0_16px_34px_rgba(255,59,48,0.12)]"
          placeholder="Search vendors or cuisines…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-all duration-300 group-focus-within:rotate-12 group-focus-within:text-brand">
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.4} />
        </div>
      </div>

      {/* Category Filter */}
      <div className="pill-container animate-slide-up-soft overflow-x-auto mb-6 scrollbar-none" style={{ animationDelay: '120ms' }}>
        {CATEGORIES.map((cat, index) => (
          <button
            key={cat.value}
            className={`pill transition-all duration-300 hover:-translate-y-0.5 active:scale-95 ${activeCategory === cat.value ? 'active pulse-ring' : ''}`}
            style={{ animationDelay: `${index * 35}ms` }}
            onClick={() => setActiveCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Vendors List Header */}
      <div className="animate-slide-up-soft flex items-end justify-between mb-5 px-1 mt-9" style={{ animationDelay: '160ms' }}>
        <div>
          <h2 className="text-[17px] font-black text-slate-950 tracking-tight">Featured Kitchens</h2>
          <div className="h-1 w-12 bg-brand rounded-full mt-1.5" />
        </div>
        {!loading && (
          <div className="bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{filtered.length} found</span>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonList count={3} hasImage />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-brand/10">
              <span className="text-3xl">🍱</span>
            </div>
          }
          title="No vendors found"
          description="Try a different search or category"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((v, index) => (
            <div key={v.id} className="animate-slide-up-soft" style={{ animationDelay: `${Math.min(index, 6) * 55}ms` }}>
              <VendorCard vendor={v} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
