'use client';

import { useState, useEffect, useMemo } from 'react';
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

  useEffect(() => {
    if (!isStale() && vendors.length > 0) return; // serve from cache
    loadVendors();
  }, []);

  async function loadVendors() {
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
    } catch (err) {
      addToast('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }

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
      <div className="flex items-start justify-between mb-8 px-1 pt-4 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-none">
            Hey, {user?.name?.split(' ')[0] || 'Tiffin Lover'} 👋
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-3">
            Discover the best home-made tiffins in your area
          </p>
        </div>
        <Link 
          href="/profile"
          className="w-14 h-14 rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] flex items-center justify-center border border-slate-50 hover:scale-[1.05] active:scale-[0.97] transition-all duration-300 shrink-0 overflow-hidden"
        >
          <Image src="/assets/dabzo-logo.png" alt="Dabzo" width={48} height={48} priority className="object-contain" />
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8 group">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-brand transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          className="input pl-14 py-5 shadow-lg shadow-slate-200/20 border-slate-100/50"
          placeholder="Search vendors or cuisines…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category Filter */}
      <div className="pill-container overflow-x-auto mb-6 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`pill ${activeCategory === cat.value ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Vendors List Header */}
      <div className="flex items-end justify-between mb-6 px-1 mt-10">
        <div>
          <h2 className="text-[17px] font-black text-slate-900 tracking-tight">Featured Kitchens</h2>
          <div className="h-1 w-12 bg-brand/30 rounded-full mt-1.5" />
        </div>
        {!loading && (
          <div className="bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filtered.length} found</span>
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
          {filtered.map((v, i) => (
            <VendorCard key={v.id} vendor={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
