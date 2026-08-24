'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useVendorStore } from '@/store/vendorStore';
import { useUiStore } from '@/store/uiStore';
import { getApprovedVendors } from '@/lib/queries/users';
import { getDocs, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { VendorCard } from '@/components/vendor/VendorCard';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { LocationSheet, type SelectedLocation } from '@/components/shared/LocationSheet';
import type { Vendor } from '@/types';
import {
  Search,
  Bell,
  MapPin,
  Home,
  Briefcase,
  ChevronDown,
  ArrowLeftRight,
  CalendarCheck2,
  Zap,
  ChevronRight,
  X,
  RefreshCw,
  Leaf,
  ChefHat,
} from 'lucide-react';

/* ─── Data ─────────────────────────────────────────────────────── */

const CATEGORIES = [
  { label: 'All',          value: 'all'   },
  { label: 'Home Style',   value: 'home'  },
  { label: 'North Indian', value: 'north' },
  { label: 'South Indian', value: 'south' },
  { label: 'Jain',         value: 'jain'  },
  { label: 'Pure Veg',     value: 'veg'   },
] as const;

type CatValue = typeof CATEGORIES[number]['value'];



function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/* ─── Component ────────────────────────────────────────────────── */

export default function UserDashboard() {
  const router   = useRouter();
  const user     = useAuthStore((s) => s.user);
  const { vendors, setVendors, isStale } = useVendorStore();
  const addToast = useUiStore((s) => s.addToast);

  /* UI state */
  const [loading,        setLoading]        = useState(vendors.length === 0);
  const [search,         setSearch]          = useState('');
  const [category,       setCategory]        = useState<CatValue>('all');
  const [locationOpen,   setLocationOpen]    = useState(false);
  const [selectedLoc,    setSelectedLoc]     = useState<SelectedLocation | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* Derived location pill text */
  const locationDisplay = selectedLoc
    ? (['Home', 'Work', 'Other'].includes(selectedLoc.label)
        ? selectedLoc.label                                       // saved label
        : selectedLoc.locality || selectedLoc.city || 'My Location') // GPS/searched
    : 'Near You';

  /* Pill icon: Home icon for saved Home, Briefcase for Work, MapPin otherwise */
  const LocationIcon =
    selectedLoc?.label === 'Home' ? Home
    : selectedLoc?.label === 'Work' ? Briefcase
    : MapPin;

  /* Live Database States */
  const [activeSubs, setActiveSubs] = useState<any[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);

  useEffect(() => {
    if (!user) return;

    // Listen to active subscriptions
    const qSubs = query(
      collection(db, 'subscriptions'),
      where('user_id', '==', user.id),
      where('status', '==', 'active')
    );
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setActiveSubs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to today's active delivery order across canonical 'orders' and 'delivery_orders'
    const ACTIVE_STATUSES = ['pending', 'preparing', 'ready', 'picked_up', 'out_for_delivery'];
    let ordersList: any[] = [];
    let deliveryOrdersList: any[] = [];

    const updateActiveDelivery = () => {
      const allActive = [...ordersList, ...deliveryOrdersList];
      if (allActive.length > 0) {
        // Prioritize out_for_delivery / picked_up > ready > preparing > pending
        const priorityOrder: Record<string, number> = {
          out_for_delivery: 1,
          picked_up: 2,
          ready: 3,
          preparing: 4,
          pending: 5,
        };
        allActive.sort((a, b) => (priorityOrder[a.status] || 9) - (priorityOrder[b.status] || 9));
        setActiveDelivery(allActive[0]);
      } else {
        setActiveDelivery(null);
      }
    };

    const qOrders = query(
      collection(db, 'orders'),
      where('user_id', '==', user.id),
      where('status', 'in', ACTIVE_STATUSES)
    );
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      ordersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateActiveDelivery();
    }, (err) => console.warn('Dashboard orders listener warning:', err.message));

    const qDeliveries = query(
      collection(db, 'delivery_orders'),
      where('customerId', '==', user.id),
      where('status', 'in', ACTIVE_STATUSES)
    );
    const unsubDeliveries = onSnapshot(qDeliveries, (snap) => {
      deliveryOrdersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateActiveDelivery();
    }, (err) => console.warn('Dashboard delivery_orders listener warning:', err.message));

    return () => {
      unsubSubs();
      unsubOrders();
      unsubDeliveries();
    };
  }, [user]);




  /* Vendor load */
  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await getApprovedVendors();
      const countMap: Record<string, number> = {};
      try {
        const snap = await getDocs(query(collection(db, 'subscriptions'), where('status', '==', 'active')));
        snap.forEach((d) => { const s = d.data(); if (s.vendor_id) countMap[s.vendor_id] = (countMap[s.vendor_id] ?? 0) + 1; });
      } catch { /* users may not have subscription list permission */ }
      setVendors(raw.map((v) => ({ ...v, subscriberCount: countMap[v.id] ?? 0 })));
    } catch { addToast('Failed to load vendors', 'error'); }
    finally  { setLoading(false); }
  }, [addToast, setVendors]);

  useEffect(() => {
    if (!isStale() && vendors.length > 0) return;
    void Promise.resolve().then(loadVendors);
  }, [isStale, loadVendors, vendors.length]);

  const filtered = useMemo(() => {
    let list = [...vendors];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q) || (v.cuisine_type ?? '').toLowerCase().includes(q));
    }
    if (category !== 'all') {
      list = list.filter((v) => (v.cuisine_type ?? '').toLowerCase().includes(category));
    }
    return list;
  }, [vendors, search, category]);

  /* Handlers */
  const handleLocationSelect = useCallback((loc: SelectedLocation) => {
    setSelectedLoc(loc);
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <div style={{ background: '#FEFCE8', minHeight: '100dvh' }}>
      <div className="animate-fade-in">
        {/* ════════════════════════════════════════
            HERO — flat brand red, zero orbs
        ════════════════════════════════════════ */}
        <section
          className="relative rounded-b-[36px] overflow-hidden"
          style={{
            background: '#FF3B30',
            paddingBottom: '48px',
            paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
          }}
        >
        {/* Subtle top-right highlight (1 layer, intentional) */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', transform: 'translate(25%,-25%)' }}
        />

        <div className="relative z-10 px-5 sm:px-6">

          {/* ── Top bar ── */}
          <div className="mb-7 flex items-center justify-between">

            {/* Location — opens full sheet */}
            <button
              type="button"
              aria-label="Select delivery location"
              onClick={() => setLocationOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/30 bg-black/10 py-2 pl-2.5 pr-3 text-white transition-all duration-200 hover:bg-black/20 active:scale-95"
            >
              <LocationIcon className="h-3.5 w-3.5 shrink-0" style={{ color: '#FFCC00' }} strokeWidth={2.5} />
              <span className="max-w-[120px] truncate text-[12.5px] font-bold leading-none">{locationDisplay}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-55" strokeWidth={2.5} />
            </button>

            {/* Right — wordmark + bell */}
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                aria-label="Dabzzo home"
                className="rounded-full px-4 py-2 text-[13px] font-black leading-none tracking-tight text-slate-900 transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ background: '#FFCC00', boxShadow: '0 4px 16px rgba(255,204,0,0.5)' }}
              >
                Dabzzo.in
              </Link>

              <button
                type="button"
                aria-label="Notifications"
                onClick={() => router.push('/support')}
                className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/25 bg-black/10 text-white transition-all duration-200 hover:bg-black/20 active:scale-95"
              >
                <Bell className="h-[17px] w-[17px]" strokeWidth={2} />
                <span
                  aria-label="New notifications"
                  className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-[#FF3B30]"
                  style={{ background: '#FFCC00' }}
                />
              </button>
            </div>
          </div>

          {/* ── Headline ── */}
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">
              {greeting()}, {firstName}
            </p>
            <h1
              className="font-black leading-[1.06] tracking-[-0.025em] text-white"
              style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}
            >
              Fresh Home Tiffins<br />Delivered Daily.
            </h1>
          </div>

          {/* ── Blended Status/Onboarding Panel ── */}
          {activeDelivery ? (
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-4 shadow-lg border border-white/10 animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live Order Status</span>
                </div>
                <span className="text-[9px] font-bold text-white/50 uppercase">Today</span>
              </div>
              <p className="text-white font-bold text-base leading-tight">
                {activeDelivery.partnerName || 'Your kitchen'}
              </p>
              <p className="text-slate-400 text-xs mt-1 capitalize">
                Status: {activeDelivery.status?.replace(/_/g, ' ') || 'Preparing'}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/track"
                  className="flex-1 text-center py-2.5 bg-brand text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-brand-650 transition-all duration-200 active:scale-[0.98]"
                >
                  Track Live Delivery
                </Link>
              </div>
            </div>
          ) : activeSubs.length > 0 ? (
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-4 shadow-lg border border-white/10 animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider">Subscription Active</span>
                <span className="text-[9px] font-bold text-white/50 uppercase">{activeSubs.length} Active Plan{activeSubs.length > 1 ? 's' : ''}</span>
              </div>
              <p className="text-white font-bold text-base leading-tight">
                {activeSubs[0].meal_type ? `${activeSubs[0].meal_type.charAt(0).toUpperCase() + activeSubs[0].meal_type.slice(1)} Subscriptions` : 'Daily Meals'}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Your kitchen meals are scheduled and tracking automatically.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/orders"
                  className="flex-1 text-center py-2.5 bg-white/10 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white/15 transition-all duration-200 active:scale-[0.98] border border-white/5"
                >
                  Manage Weekly Planner
                </Link>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-black/15 backdrop-blur-md p-5 border border-white/10 shadow-sm">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl -mr-6 -mt-6" />
              <span className="rounded-[6px] px-2 py-0.5 text-[9.5px] font-bold tracking-wide uppercase bg-white/10 text-white/90">
                Premium Meal Service
              </span>
              <h2 className="mt-2.5 text-base font-bold text-white leading-tight">
                Healthy Home Tiffins. Pause or Swap Anytime.
              </h2>
              <p className="mt-1.5 text-[11.5px] text-white/70 leading-relaxed max-w-[90%]">
                Switch kitchens instantly if you get bored, and pause your subscription easily when you are away.
              </p>
            </div>
          )}
        </div>

      </section>

      {/* ════════════════════════════════════════
          BODY — ivory
      ════════════════════════════════════════ */}
      <div className="px-5 pb-6 sm:px-6" style={{ background: '#FEFCE8' }}>

        {/* ── Search ── */}
        <div className="group relative -mt-7 mb-5">
          <div className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within:text-brand">
            <Search className="h-[17px] w-[17px]" strokeWidth={2.3} />
          </div>
          <input
            ref={searchRef}
            aria-label="Search vendors or cuisines"
            className="w-full rounded-2xl border border-slate-200/90 bg-white py-[14px] pl-12 pr-14 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:-translate-y-0.5 focus:border-brand/40 focus:shadow-[0_12px_36px_rgba(255,59,48,0.12)]"
            style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.08)' }}
            placeholder="Explore now…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {search ? (
              <button
                aria-label="Clear search"
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-400 transition-all duration-200 hover:bg-rose-100 hover:text-rose-600 active:scale-95"
              >
                <X className="h-[14px] w-[14px]" strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Category pills ── */}
        <div role="group" aria-label="Filter by cuisine" className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const active = category === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(cat.value)}
                className="shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95"
                style={
                  active
                    ? { background: '#0f172a', color: '#fff', borderColor: 'transparent', boxShadow: '0 4px 12px rgba(15,23,42,0.15)' }
                    : { background: '#fff', color: '#475569', borderColor: '#e2e8f0' }
                }
              >
                {cat.label}
              </button>
            );
          })}
        </div>


        {/* ── Vendor header ── */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[17.5px] font-black tracking-tight text-slate-950">Nearest Vendors</h2>
            <div className="mt-1.5 h-[3px] w-8 rounded-full" style={{ background: '#FF3B30' }} />
          </div>
          {!loading && (
            <button
              type="button"
              aria-label="Refresh vendor list"
              onClick={() => void loadVendors()}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-all duration-200 hover:border-brand/40 hover:text-brand active:scale-95"
              style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}
            >
              <RefreshCw className="h-3 w-3" strokeWidth={2.4} />
              {filtered.length} found
            </button>
          )}
        </div>

        {/* ── Vendor list ── */}
        {loading ? (
          <SkeletonList count={3} hasImage />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'rgba(255,59,48,0.08)' }}><ChefHat className="w-9 h-9 text-brand stroke-[1.25]" /></div>}
            title="No vendors found"
            description={search ? `No results for "${search}". Try another keyword.` : 'Try a different category above.'}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((v, i) => (
              <div key={v.id} className="animate-slide-up-soft" style={{ animationDelay: `${Math.min(i, 5) * 55}ms` }}>
                <VendorCard vendor={v} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* ── Location bottom sheet ── */}
    <LocationSheet
      isOpen={locationOpen}
      onClose={() => setLocationOpen(false)}
      onSelect={handleLocationSelect}
    />
  </div>
);
}
