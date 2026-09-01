'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useVendorStore } from '@/store/vendorStore';
import { useUiStore } from '@/store/uiStore';
import { getApprovedVendors } from '@/lib/queries/users';
import { getDocs, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { VendorCard } from '@/components/vendor/VendorCard';
import { OffersCarousel } from '@/components/home/OffersCarousel';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import type { SelectedLocation } from '@/components/shared/LocationSheet';
import type { Vendor } from '@/types';
import {
  Search,
  Bell,
  MapPin,
  Home,
  Briefcase,
  ChevronDown,
  X,
  RefreshCw,
  ChefHat,
} from 'lucide-react';

// Dynamic import for heavy LocationSheet to cut critical bundle weight & blocking time
const LocationSheet = dynamic(
  () => import('@/components/shared/LocationSheet').then((m) => m.LocationSheet),
  { ssr: false }
);

/* ─── Data ─────────────────────────────────────────────────────── */

const CATEGORIES = [
  { label: 'All',          value: 'all'   },
  { label: 'Home Style',   value: 'home'  },
  { label: 'North Indian', value: 'north' },
  { label: 'South Indian', value: 'south' },
  { label: 'Pure Veg',     value: 'veg'   },
  { label: 'Jain Menu',    value: 'jain'  },
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
        ? selectedLoc.label
        : selectedLoc.locality || selectedLoc.city || 'My Location')
    : 'Near You';

  const LocationIcon =
    selectedLoc?.label === 'Home' ? Home
    : selectedLoc?.label === 'Work' ? Briefcase
    : MapPin;

  /* Live Database States */
  const [activeSubs, setActiveSubs] = useState<any[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);

  // Defer Firestore real-time subscriptions off critical rendering path
  useEffect(() => {
    if (!user) return;

    let unsubSubs = () => {};
    let unsubOrders = () => {};
    let unsubDeliveries = () => {};

    const timer = setTimeout(() => {
      // Listen to active subscriptions
      const qSubs = query(
        collection(db, 'subscriptions'),
        where('user_id', '==', user.id),
        where('status', '==', 'active')
      );
      unsubSubs = onSnapshot(qSubs, (snap) => {
        setActiveSubs(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });

      // Listen to today's active delivery order
      const ACTIVE_STATUSES = ['pending', 'preparing', 'ready', 'picked_up', 'out_for_delivery'];
      let ordersList: any[] = [];

      const updateActiveDelivery = () => {
        const allActive = [...ordersList];
        if (allActive.length > 0) {
          const priorityOrder: Record<string, number> = {
            out_for_delivery: 1,
            picked_up: 2,
            ready: 3,
            preparing: 4,
            pending: 5,
          };
          allActive.sort(
            (a, b) => (priorityOrder[a.status] || 9) - (priorityOrder[b.status] || 9)
          );
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
      unsubOrders = onSnapshot(
        qOrders,
        (snap) => {
          ordersList = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          updateActiveDelivery();
        },
        (err) => console.warn('Dashboard orders listener warning:', err.message)
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      unsubSubs();
      unsubOrders();
    };
  }, [user]);

  /* Vendor load */
  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await getApprovedVendors();
      const countMap: Record<string, number> = {};
      try {
        const snap = await getDocs(
          query(collection(db, 'subscriptions'), where('status', '==', 'active'))
        );
        snap.forEach((d) => {
          const s = d.data();
          if (s.vendor_id) countMap[s.vendor_id] = (countMap[s.vendor_id] ?? 0) + 1;
        });
      } catch {
        /* subscription permission fallback */
      }
      setVendors(raw.map((v) => ({ ...v, subscriberCount: countMap[v.id] ?? 0 })));
    } catch {
      addToast('Failed to load kitchens', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, setVendors]);

  useEffect(() => {
    if (!isStale() && vendors.length > 0) return;
    void Promise.resolve().then(loadVendors);
  }, [isStale, loadVendors, vendors.length]);

  const filtered = useMemo(() => {
    let list = [...vendors];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.cuisine_type ?? '').toLowerCase().includes(q)
      );
    }
    if (category !== 'all') {
      list = list.filter((v) => (v.cuisine_type ?? '').toLowerCase().includes(category));
    }
    return list;
  }, [vendors, search, category]);

  const handleLocationSelect = useCallback((loc: SelectedLocation) => {
    setSelectedLoc(loc);
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="animate-fade-in">
        {/* ════════════════════════════════════════
            HERO — Solid Orange with Crisp 2D Graphics
        ════════════════════════════════════════ */}
        <section
          className="relative rounded-b-[36px] overflow-hidden"
          style={{
            background: '#E68A00',
            paddingBottom: '44px',
            paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
          }}
        >
          {/* ── 2D Geometric Graphics & Vector Accents ── */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden select-none"
          >
            {/* Top-Right Large 2D Concentric Circles */}
            <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full border-2 border-white/15" />
            <div className="absolute -right-8 -top-8 w-56 h-56 rounded-full bg-white/10" />
            <div className="absolute right-4 top-4 w-32 h-32 rounded-full border border-white/20" />

            {/* Bottom-Left 2D Circles & Arc */}
            <div className="absolute -left-12 bottom-6 w-48 h-48 rounded-full border-2 border-white/10" />
            <div className="absolute -left-6 bottom-12 w-32 h-32 rounded-full bg-white/8" />

            {/* Subtle 2D Decorative Dots & Vector Accents */}
            <div className="absolute left-8 top-28 flex flex-col gap-2 opacity-25">
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>

            <div className="absolute right-12 bottom-20 opacity-20">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                  fill="white"
                />
              </svg>
            </div>
          </div>

          <div className="relative z-10 px-5 sm:px-6">
            {/* ── Top bar ── */}
            <div className="mb-6 flex items-center justify-between">
              {/* Location — opens dynamic sheet */}
              <button
                type="button"
                aria-label="Select delivery location"
                onClick={() => setLocationOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-white/30 bg-black/15 py-2 pl-3 pr-3.5 text-white transition-all duration-200 hover:bg-black/25 active:scale-95 backdrop-blur-md shadow-xs"
              >
                <LocationIcon
                  className="h-3.5 w-3.5 shrink-0 text-amber-200"
                  strokeWidth={2.5}
                />
                <span className="max-w-[130px] truncate text-[12.5px] font-bold leading-none">
                  {locationDisplay}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2.5} />
              </button>

              {/* Right — brand logo + notification bell */}
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  aria-label="Dabzzo home"
                  className="flex items-center transition-all duration-200 hover:opacity-90 active:scale-95 py-1"
                >
                  <Image
                    src="/logo-white.png"
                    alt="Dabzzo"
                    width={120}
                    height={28}
                    priority
                    unoptimized
                    className="h-7 w-auto object-contain drop-shadow-xs"
                  />
                </Link>

                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => router.push('/support')}
                  className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/25 bg-black/15 text-white transition-all duration-200 hover:bg-black/25 active:scale-95 backdrop-blur-md shadow-xs"
                >
                  <Bell className="h-[17px] w-[17px]" strokeWidth={2.2} />
                  <span
                    aria-label="New notifications"
                    className="absolute right-2.5 top-2.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-[#E68A00] bg-amber-200"
                  />
                </button>
              </div>
            </div>

            {/* ── Headline ── */}
            <div className="mb-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100/90 mb-1">
                {greeting()}, {firstName}!
              </p>
              <h1
                className="font-black leading-[1.08] tracking-[-0.025em] text-white"
                style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}
              >
                Fresh Home Tiffins
                <br />
                Delivered Daily.
              </h1>
            </div>

            {/* ── Status / Subscription Card ── */}
            {activeDelivery ? (
              <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-4.5 shadow-lg border border-white/10 animate-fade-in">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Live Delivery Status
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold text-white/50 uppercase">Today</span>
                </div>
                <p className="text-white font-bold text-base leading-tight">
                  {activeDelivery.partnerName || 'Your Kitchen'}
                </p>
                <p className="text-slate-400 text-xs mt-1 capitalize">
                  Status: {activeDelivery.status?.replace(/_/g, ' ') || 'Preparing'}
                </p>
                <div className="mt-3.5 flex gap-2">
                  <Link
                    href="/track"
                    className="flex-1 text-center py-2.5 bg-brand text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-brand-650 transition-all duration-200 active:scale-[0.98]"
                  >
                    Track Live Delivery
                  </Link>
                </div>
              </div>
            ) : activeSubs.length > 0 ? (
              <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-4.5 shadow-lg border border-white/10 animate-fade-in">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      Subscription Active
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold text-white/50 uppercase">
                    {activeSubs.length} Active Plan{activeSubs.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-white font-bold text-base leading-tight">
                  {activeSubs[0].meal_type
                    ? `${activeSubs[0].meal_type.charAt(0).toUpperCase() + activeSubs[0].meal_type.slice(1)} Subscriptions`
                    : 'Daily Meals'}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  Your kitchen meals are scheduled and tracking automatically.
                </p>
                <div className="mt-3.5">
                  <Link
                    href="/orders"
                    className="block w-full text-center py-2.5 bg-white/10 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white/15 transition-all duration-200 active:scale-[0.98] border border-white/5"
                  >
                    Manage Weekly Planner
                  </Link>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-black/15 backdrop-blur-md p-4.5 border border-white/15 shadow-sm">
                <span className="rounded-md px-2 py-0.5 text-[9.5px] font-bold tracking-wider uppercase bg-white/15 text-white">
                  Premium Meal Service
                </span>
                <h2 className="mt-2 text-base font-bold text-white leading-snug">
                  Healthy Home Tiffins. Pause or Swap Anytime.
                </h2>
                <p className="mt-1 text-[11.5px] text-white/80 leading-relaxed font-normal">
                  Switch kitchens easily if you want a change, or pause when you are away.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ════════════════════════════════════════
            BODY — Clean Slate Canvas
        ════════════════════════════════════════ */}
        <div className="px-5 pb-8 sm:px-6">
          {/* ── Search Bar ── */}
          <div className="group relative -mt-7 mb-5">
            <div className="pointer-events-none absolute left-4.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand">
              <Search className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </div>
            <input
              ref={searchRef}
              aria-label="Search vendors or cuisines"
              className="w-full rounded-2xl border border-slate-200/90 bg-white py-[14px] pl-12 pr-12 text-sm font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:-translate-y-0.5 focus:border-brand focus:shadow-[0_8px_24px_rgba(230,138,0,0.12)]"
              style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.06)' }}
              placeholder="Explore kitchens or cuisines…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {search ? (
                <button
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 transition-all duration-200 hover:bg-rose-100 active:scale-95"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
          </div>

          {/* ── Cuisine Category Pills ── */}
          <div
            role="group"
            aria-label="Filter by cuisine"
            className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(cat.value)}
                  className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 border"
                  style={
                    active
                      ? {
                          background: '#0F172A',
                          color: '#FFFFFF',
                          borderColor: '#0F172A',
                          boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
                        }
                      : {
                          background: '#FFFFFF',
                          color: '#475569',
                          borderColor: '#E2E8F0',
                        }
                  }
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* ── Promotional Offers Carousel ── */}
          <OffersCarousel />

          {/* ── Vendor Section Header ── */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-black tracking-tight text-slate-900">
                Nearest Kitchens
              </h2>
              <div
                className="mt-1 h-[3px] w-8 rounded-full"
                style={{ background: '#E68A00' }}
              />
            </div>
            {!loading && (
              <button
                type="button"
                aria-label="Refresh vendor list"
                onClick={() => void loadVendors()}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-all duration-200 hover:border-brand hover:text-brand active:scale-95 shadow-2xs"
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
              icon={
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 border border-orange-100">
                  <ChefHat className="w-9 h-9 text-brand stroke-[1.5]" />
                </div>
              }
              title="No kitchens found"
              description={
                search
                  ? `No kitchens matching "${search}". Try searching for another keyword.`
                  : 'Try selecting a different category above.'
              }
            />
          ) : (
            <div className="space-y-3.5">
              {filtered.map((v, i) => (
                <div
                  key={v.id}
                  className="animate-slide-up-soft"
                  style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
                >
                  <VendorCard vendor={v} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Location bottom sheet (Loaded dynamically only when opened) ── */}
      {locationOpen && (
        <LocationSheet
          isOpen={locationOpen}
          onClose={() => setLocationOpen(false)}
          onSelect={handleLocationSelect}
        />
      )}
    </div>
  );
}
