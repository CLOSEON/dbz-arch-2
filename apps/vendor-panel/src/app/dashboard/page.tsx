'use client';

import { useState, useMemo, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { 
  Users, CheckCircle, ChefHat, PackageCheck, Phone, 
  CalendarClock, IndianRupee, UtensilsCrossed, Sliders, 
  Star, MapPin, Sparkles, Activity, ShieldCheck, Clock,
  ArrowUpRight, AlertTriangle, RefreshCw, Tag, Check
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useVendorData } from '@/components/vendor/VendorDataProvider';
import type { BatchStatus } from '@/types';
import { db, functions } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';
import { PendingVerificationScreen } from '@/components/shared/PendingVerificationScreen';
import { generateBoxTag } from '@/lib/boxTag';
import { VegIcon, NonVegIcon, DietaryBadge } from '@/components/shared/DietaryIcon';

type ActiveTab = 'overview' | 'tags' | 'menu' | 'subscribers' | 'rates';

const BATCH_STATUS_DISPLAY: Record<BatchStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:            { label: 'Pending',           color: 'text-slate-600',  bg: 'bg-slate-50',    border: 'border-slate-200' },
  notified:           { label: 'Awaiting Prep',     color: 'text-amber-700',  bg: 'bg-amber-50',    border: 'border-amber-200' },
  preparing:          { label: 'In Kitchen Oven',   color: 'text-blue-700',   bg: 'bg-blue-50',     border: 'border-blue-200' },
  ready:              { label: 'Ready for Dispatch',color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  pickup_in_progress: { label: 'Rider Handover',    color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  completed:          { label: 'Dispatched',        color: 'text-slate-500',  bg: 'bg-slate-100',   border: 'border-slate-200' },
};

export default function VendorDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { batches, pickups, subscriptions, loading } = useVendorData();
  const { 
    batches, 
    pickups, 
    subscriptions, 
    loading, 
    activeVendorId, 
    setActiveVendorId, 
    allVendors, 
    managedVendor 
  } = useVendorData();

  const vendorProfile = managedVendor || user;

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const isVendorRole = user?.role === 'vendor' || user?.role === 'admin' || user?.is_superadmin === true;
  const isVerifiedVendor = (user?.is_approved === true || user?.verification_status === 'verified' || user?.is_superadmin === true) &&
    user?.is_rejected !== true && (user as any)?.is_suspended !== true &&
    user?.verification_status !== 'rejected' && user?.verification_status !== 'details_requested';

  // Custom confirmation dialog state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [isMarkingReady, setIsMarkingReady] = useState<string | null>(null);
  const [selectedDateDetails, setSelectedDateDetails] = useState<{ dateKey: string; displayDate: string; details: any[] } | null>(null);

  // Live rider location tracking
  const [riderLocations, setRiderLocations] = useState<Record<string, { lat: number; lng: number } | null>>({});

  useEffect(() => {
    if (!pickups.length) return;
    const unsubs: (() => void)[] = [];
    pickups.forEach((trip: any) => {
      if (!trip.riderId) return;
      const unsub = onSnapshot(doc(db, 'driver_profiles', trip.riderId), (snap) => {
        if (snap.exists()) {
          const loc = snap.data().currentLocation;
          if (loc?.lat && loc?.lng) {
            setRiderLocations((prev) => ({ ...prev, [trip.riderId]: { lat: loc.lat, lng: loc.lng } }));
          }
        }
      });
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [pickups]);

  // Derive schedule forecast from subscriptions (next 30 days)
  const prepSchedule = useMemo(() => {
    const grouped: any = {};
    const now = new Date();
    
    for (let i = 0; i <= 30; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateKey = targetDate.toLocaleDateString('en-CA');
      const displayDate = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const shortDay = targetDate.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

      subscriptions.forEach((sub: any) => {
        const addProjected = (mealType: string, slot: string) => {
          const key = `${dateKey}_${mealType}_${slot}`;
          if (!grouped[key]) {
            grouped[key] = { 
              dateKey, displayDate, dateObj: targetDate, sortDate: targetDate.getTime(), 
              mealType, slot, count: 0, isProjected: true 
            };
          }
          grouped[key].count++;
        };
        if (sub.meal_type === 'lunch' || sub.meal_type === 'both') {

        let shouldDeliverToday = true;
        let mealsToday = 1;
        if (sub.deliveryPattern) {
          const count = sub.deliveryPattern[dayOfWeek] ?? sub.deliveryPattern[shortDay];
          if (count !== undefined) {
            shouldDeliverToday = Number(count) > 0;
            mealsToday = Number(count);
          }
        }

        if (!shouldDeliverToday) return;

        if (mealsToday >= 2 || sub.meal_type === 'both') {
          addProjected('lunch', sub.deliveryPreference || '11am');
        }
        if (sub.meal_type === 'dinner' || sub.meal_type === 'both') {
          addProjected('dinner', '8pm');
        } else if (sub.delivery_slot === 'dinner' || sub.meal_type === 'dinner') {
          addProjected('dinner', '8pm');
        } else {
          addProjected('lunch', sub.deliveryPreference || '11am');
        }
      });
    }

    return Object.values(grouped).sort((a: any, b: any) => a.sortDate - b.sortDate);
  }, [subscriptions]);

  const handleMarkReady = async (batch: any) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Confirm Batch Ready?',
      message: `Are you sure you want to mark all ${batch.total_count} tiffins as ready for the ${batch.slot} batch? This immediately notifies assigned dispatch riders.`,
      confirmLabel: 'Mark Ready',
      variant: 'primary',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        setIsMarkingReady(batch.id);
        try {
          const markBatchReady = httpsCallable(functions, 'markBatchReady');
          const res = await markBatchReady({ batch_id: batch.id }) as any;
          if (res.data?.success) {
            toast.success('Batch marked ready! Assigning riders…');
          } else {
            toast.error(res.data?.message || 'Failed to mark ready.');
          }
        } catch (e: any) {
          console.error(e);
          toast.error(e.message || 'Error marking batch ready.');
        } finally {
          setIsMarkingReady(null);
        }
      }
    });
  };

  const localToday = new Date().toLocaleDateString('en-CA');
  const todayBatches = batches.filter(b => b.date === localToday);
  const totalTodayTiffins = todayBatches.reduce((acc, b) => acc + (b.total_count || 0), 0);
  const kitchenCapacity = user?.capacity || 10;
  const subscriberCount = subscriptions.length || user?.subscriberCount || 2;
  const totalTodayTiffins = todayBatches.reduce((acc, b) => acc + (b.total_orders || b.tiffin_count || b.total_count || 1), 0);
  const kitchenCapacity = vendorProfile?.capacity || 20;
  const subscriberCount = subscriptions.length;
  const capacityPercent = Math.min(100, Math.round((subscriberCount / kitchenCapacity) * 100));
  const totalRevenue = subscriptions.reduce((sum, s: any) => sum + (s.total_price || s.base_price || s.price || 0), 0);

  const [packedBoxes, setPackedBoxes] = useState<Record<string, boolean>>({});
  const [tagFilterSlot, setTagFilterSlot] = useState<'all' | 'lunch' | 'dinner'>('all');

  const TABS: { key: ActiveTab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Operations & Dispatch', icon: Activity },
    { key: 'tags', label: '🏷️ Box Tags & Pack', icon: Tag },
    { key: 'menu', label: "Today's Menu", icon: UtensilsCrossed },
    { key: 'subscribers', label: `Subscribers (${subscriptions.length})`, icon: Users },
    { key: 'rates', label: 'Rates & Pricing', icon: IndianRupee },
  ];

  if (user && (!isVendorRole || !isVerifiedVendor)) {
    return <PendingVerificationScreen role="vendor" />;
  }

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center animate-bounce">
            <ChefHat className="w-6 h-6" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Kitchen Hub…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16 max-w-7xl mx-auto px-2 sm:px-4">

      {/* ── TOP HERO KITCHEN CARD ────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-brand flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-brand/20 shrink-0">
              {user?.kitchen_name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase() || 'T'}
              {(vendorProfile?.kitchen_name || vendorProfile?.name || 'K')[0].toUpperCase()}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {user?.kitchen_name || user?.name || 'Test Vendor'}
                  {vendorProfile?.kitchen_name || vendorProfile?.name || 'Partner Kitchen'}
                </h1>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Verified Kitchen
                </span>
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-black border border-amber-200">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" /> {Number(user?.rating_avg || user?.rating || 4.5).toFixed(1)}
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" /> {vendorProfile?.rating_avg ? Number(vendorProfile.rating_avg).toFixed(1) : '—'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {user?.address || 'Sector 62, Noida, Uttar Pradesh'}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {user?.phone || '+919900990022'}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {vendorProfile?.address || 'Location on profile'}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {vendorProfile?.phone || vendorProfile?.phone_number || 'No phone'}</span>
                <span className="text-slate-400">•</span>
                <span className="text-brand font-bold">{user?.cuisine_type || 'Home Style'}</span>
                <span className="text-brand font-bold">{vendorProfile?.cuisine_type || 'Home Style'}</span>

                {user?.is_superadmin && allVendors.length > 1 && (
                  <div className="inline-flex items-center gap-1.5 ml-2 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-xl border border-amber-200/80">
                    <Sliders className="w-3 h-3 text-brand" />
                    <span className="font-bold text-[11px]">Active Kitchen:</span>
                    <select
                      value={activeVendorId || ''}
                      onChange={(e) => setActiveVendorId(e.target.value)}
                      className="bg-transparent font-black text-[11px] text-brand outline-hidden cursor-pointer"
                    >
                      {allVendors.map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.kitchen_name || v.name || v.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl border border-emerald-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <div className="text-left">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Kitchen Status</div>
                <div className="text-xs font-bold text-emerald-900 leading-tight">Online & Receiving Orders</div>
              </div>
            </div>

            <button 
              onClick={logout} 
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all active:scale-[0.98]"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-100 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 active:scale-[0.98] ${
                  active
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-brand' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB 1: OPERATIONS & DISPATCH OVERVIEW ────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* 1. Active Subscribers */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-2">
                <span className="uppercase tracking-wider">Active Subscribers</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-brand flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900">{subscriberCount}</div>
                <div className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active recurring eaters
                </div>
              </div>
            </div>

            {/* 2. Today's Prep Volume */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-2">
                <span className="uppercase tracking-wider">Today's Prep</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ChefHat className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900">{totalTodayTiffins > 0 ? totalTodayTiffins : subscriberCount * 2} <span className="text-base font-bold text-slate-400">Tiffins</span></div>
                <div className="text-[11px] font-semibold text-slate-500 mt-1">Lunch & Dinner batches</div>
                <div className="text-3xl font-black text-slate-900">{totalTodayTiffins} <span className="text-base font-bold text-slate-400">Tiffins</span></div>
                <div className="text-[11px] font-semibold text-slate-500 mt-1">Today's active preparation</div>
              </div>
            </div>

            {/* 3. Kitchen Capacity */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-2">
                <span className="uppercase tracking-wider">Slot Capacity</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900">{subscriberCount}</span>
                  <span className="text-sm font-bold text-slate-400">/ {kitchenCapacity} Slots</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-brand to-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${capacityPercent}%` }} />
                </div>
              </div>
            </div>

            {/* 4. Total Revenue */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-2">
                <span className="uppercase tracking-wider">Estimated Revenue</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900">₹{(subscriberCount * 3600).toLocaleString('en-IN')}</div>
                <div className="text-[11px] font-semibold text-emerald-600 mt-1">Processed monthly total</div>
                <div className="text-3xl font-black text-slate-900">₹{totalRevenue.toLocaleString('en-IN')}</div>
                <div className="text-[11px] font-semibold text-emerald-600 mt-1">Active recurring monthly sum</div>
              </div>
            </div>

          </div>

          {/* Main 2-Column Dispatch Center */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* LEFT: Today's Prep Batches & Handover */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-brand" />
                  Today's Batches & Rider Dispatch
                </h3>
                <span className="text-xs font-bold text-slate-400">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>

              {todayBatches.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center shadow-xs">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 text-brand flex items-center justify-center mx-auto mb-3">
                    <ChefHat className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-black text-slate-900">Ready for Daily Preparation</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Active subscriber orders are queued. Batches will automatically appear here for 1-click readiness marking.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {todayBatches.map((batch) => {
                    const disp = BATCH_STATUS_DISPLAY[batch.status as BatchStatus] ?? BATCH_STATUS_DISPLAY.pending;
                    const canMarkReady = !['ready', 'pickup_in_progress', 'completed'].includes(batch.status);

                    return (
                      <div key={batch.id} className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {batch.slot.toUpperCase()} PREP BATCH
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-3xl font-black text-slate-900">{batch.total_count}</span>
                              <span className="text-sm font-bold text-slate-500">Tiffins</span>
                            </div>
                          </div>

                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${disp.bg} ${disp.color} ${disp.border}`}>
                            {disp.label}
                          </span>
                        </div>

                        {canMarkReady && (
                          <button
                            onClick={() => handleMarkReady(batch)}
                            disabled={isMarkingReady === batch.id}
                            className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-brand hover:bg-amber-600 text-white shadow-md shadow-brand/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <PackageCheck className="w-4 h-4" />
                            {isMarkingReady === batch.id ? 'Confirming Dispatch…' : `Mark ${batch.total_count} Tiffins Ready For Rider`}
                          </button>
                        )}

                        {batch.status === 'ready' && (
                          <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-center space-y-2">
                            <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-bold text-xs">
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              Tiffins Ready! Awaiting Rider Pickup
                            </div>

                            {(() => {
                              const tripOTP = pickups.find(p => 
                                p.batch_ids?.includes(batch.id) || 
                                p.assignedOrderIds?.some((oid: string) => batch.order_ids?.includes(oid))
                              )?.pickupStops?.find((s: any) => s.vendorId === user?.id)?.pickupOTP;
                              const displayOTP = batch.pickup_otp || tripOTP || '6721';
                              )?.pickupStops?.find((s: any) => s.vendorId === (vendorProfile?.id || user?.id))?.pickupOTP;
                              const displayOTP = batch.pickup_otp || tripOTP || '—';

                              return (
                                <div className="mt-2 bg-white py-3 px-6 rounded-2xl border border-emerald-200 inline-block shadow-sm">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-0.5">Rider Handover OTP</div>
                                  <div className="text-3xl font-black font-mono tracking-[0.25em] text-emerald-600">{displayOTP}</div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Incoming Riders En Route */}
              {pickups.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    Assigned Riders En Route
                  </h4>

                  {pickups.map((trip) => {
                    const myStop = trip.pickupStops?.find((s: any) => s.vendorId === user?.id);
                    if (!myStop || myStop.status === 'completed') return null;

                    return (
                      <div key={trip.id} className="bg-amber-50/80 rounded-3xl p-5 border border-amber-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest bg-amber-200/60 text-amber-800 px-3 py-1 rounded-full">
                            Rider Assigned
                          </span>
                          {trip.riderPhone && (
                            <a href={`tel:${trip.riderPhone}`} className="text-xs font-bold text-slate-800 bg-white px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5 shadow-xs hover:bg-slate-50">
                              <Phone className="w-3.5 h-3.5 text-brand" /> Call {trip.riderName || 'Rider'}
                            </a>
                          )}
                        </div>

                        <div>
                          <h5 className="font-bold text-slate-900 text-base">
                            {trip.riderName ? `${trip.riderName} is arriving for pickup` : 'Rider is arriving at your kitchen'}
                          </h5>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Hand over the prepared lunch/dinner packs when they arrive.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: 30-Day Demand Heatmap */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-indigo-600" />
                  30-Day Tiffin Forecast Calendar
                </h3>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                  {subscriberCount} Active Subscribers
                </span>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs">
                <div className="grid grid-cols-7 gap-2 mb-3">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {(() => {
                    const groupedByDate: Record<string, { displayDate: string; totalCount: number; details: any[] }> = {};
                    prepSchedule.forEach((prep: any) => {
                      if (!groupedByDate[prep.dateKey]) {
                        groupedByDate[prep.dateKey] = { displayDate: prep.displayDate, totalCount: 0, details: [] };
                      }
                      groupedByDate[prep.dateKey].totalCount += prep.count;
                      groupedByDate[prep.dateKey].details.push(prep);
                    });

                    const today = new Date();
                    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
                    
                    const calendarCells = [];
                    for (let i = 0; i < 28; i++) {
                      const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
                      const dKey = d.toLocaleDateString('en-CA');
                      const dayData = groupedByDate[dKey];
                      const isToday = dKey === localToday;
                      const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      const tiffinCount = dayData ? dayData.totalCount : (isPast ? 0 : subscriberCount * 2);
                      const tiffinCount = dayData ? dayData.totalCount : 0;
                      
                      calendarCells.push(
                        <div 
                          key={dKey} 
                          onClick={() => {
                            if (!isPast) setSelectedDateDetails({ dateKey: dKey, displayDate: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }), details: dayData?.details || [{ mealType: 'both', count: subscriberCount * 2, slot: 'Lunch & Dinner' }] });
                            if (!isPast) setSelectedDateDetails({ dateKey: dKey, displayDate: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }), details: dayData?.details || [] });
                          }}
                          className={`
                            aspect-square rounded-2xl border flex flex-col items-center justify-center p-1 transition-all
                            ${isToday ? 'bg-amber-500 text-white font-bold border-amber-500 shadow-md shadow-amber-500/20 scale-105 z-10' : ''}
                            ${!isToday && !isPast ? 'bg-slate-50 hover:bg-amber-50 border-slate-200/80 hover:border-amber-200 cursor-pointer' : ''}
                            ${isPast ? 'opacity-40 grayscale bg-slate-50/50 border-slate-100 cursor-not-allowed' : ''}
                          `}
                        >
                          <span className={`text-xs font-black ${isToday ? 'text-white' : 'text-slate-800'}`}>
                            {d.getDate()}
                          </span>
                          {!isPast && (
                            <span className={`mt-0.5 text-[9px] font-black px-1.5 py-0.2 rounded-full ${isToday ? 'bg-white text-slate-900' : 'bg-brand/10 text-brand'}`}>
                              {tiffinCount}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return calendarCells;
                  })()}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── TAB: BOX TAGS & PACKING BOARD ──────────────────────────────── */}
      {activeTab === 'tags' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header & Instructions */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-brand bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                  Zero-Mismatch System
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                  🏷️ Tiffin Box Tagging Board
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Write these exact unique codes on your tiffin container stickers with a marker pen. Riders & customers verify this code at handover.
                </p>
              </div>
      {/* ── TAB: BOX TAGS & PACKING BOARD ──────────────────────────────── */}
      {activeTab === 'tags' && (() => {
        // Generate discrete box items based on active slot filter
        const boxItems: Array<{
          sub: any;
          key: string;
          slotLabel: string;
          slotType: 'lunch' | 'dinner';
          isVeg: boolean;
        }> = [];

              {/* Slot Filter */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shrink-0">
                {(['all', 'lunch', 'dinner'] as const).map(slot => (
                  <button
                    key={slot}
                    onClick={() => setTagFilterSlot(slot)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      tagFilterSlot === slot
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {slot === 'all' ? 'All Slots' : slot}
                  </button>
                ))}
              </div>
            </div>
        subscriptions.forEach((sub: any) => {
          const isNonVeg = sub.dietary === 'non_veg' || sub.category === 'non_veg' || (sub.meal_type as any) === 'non_veg';
          const isVeg = !isNonVeg;
          const servesLunch = sub.meal_type === 'lunch' || sub.meal_type === 'both' || sub.delivery_slot === 'lunch' || (!sub.meal_type && !sub.delivery_slot);
          const servesDinner = sub.meal_type === 'dinner' || sub.meal_type === 'both' || sub.delivery_slot === 'dinner';

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Boxes</span>
                <div className="text-xl font-black text-slate-900 mt-0.5">{subscriptions.length || 2}</div>
              </div>
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Pure Veg Boxes</span>
                <div className="text-xl font-black text-emerald-900 mt-0.5">
                  {subscriptions.filter(s => (s.meal_type as any) === 'veg' || !s.meal_type).length || 2}
          if (tagFilterSlot === 'all') {
            if (servesLunch) {
              boxItems.push({ sub, key: `${sub.id}_lunch`, slotLabel: 'Lunch (1:00 PM)', slotType: 'lunch', isVeg });
            }
            if (servesDinner) {
              boxItems.push({ sub, key: `${sub.id}_dinner`, slotLabel: 'Dinner (8:00 PM)', slotType: 'dinner', isVeg });
            }
          } else if (tagFilterSlot === 'lunch' && servesLunch) {
            boxItems.push({ sub, key: `${sub.id}_lunch`, slotLabel: 'Lunch (1:00 PM)', slotType: 'lunch', isVeg });
          } else if (tagFilterSlot === 'dinner' && servesDinner) {
            boxItems.push({ sub, key: `${sub.id}_dinner`, slotLabel: 'Dinner (8:00 PM)', slotType: 'dinner', isVeg });
          }
        });

        const totalBoxes = boxItems.length;
        const vegBoxes = boxItems.filter(b => b.isVeg).length;
        const nonVegBoxes = boxItems.filter(b => !b.isVeg).length;
        const packedCount = boxItems.filter(b => packedBoxes[b.key]).length;

        return (
          <div className="space-y-6 animate-fade-in">
            {/* Header & Instructions */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-brand bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                    Zero-Mismatch System
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                    🏷️ Tiffin Box Tagging Board
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Write these exact unique codes on your tiffin container stickers with a marker pen. Riders & customers verify this code at handover.
                  </p>
                </div>
              </div>
              <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Non-Veg Boxes</span>
                <div className="text-xl font-black text-rose-900 mt-0.5">
                  {subscriptions.filter(s => (s.meal_type as any) === 'non_veg').length || 0}

                {/* Slot Filter */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shrink-0">
                  {(['all', 'lunch', 'dinner'] as const).map(slot => (
                    <button
                      key={slot}
                      onClick={() => setTagFilterSlot(slot)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        tagFilterSlot === slot
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {slot === 'all' ? 'All Slots' : slot}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Tagged & Packed</span>
                <div className="text-xl font-black text-amber-900 mt-0.5">
                  {Object.values(packedBoxes).filter(Boolean).length} / {subscriptions.length || 2}

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Boxes</span>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{totalBoxes}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200/60">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Pure Veg Boxes</span>
                  <div className="text-xl font-black text-emerald-900 mt-0.5">{vegBoxes}</div>
                </div>
                <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200/60">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Non-Veg Boxes</span>
                  <div className="text-xl font-black text-rose-900 mt-0.5">{nonVegBoxes}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200/60">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Tagged & Packed</span>
                  <div className="text-xl font-black text-amber-900 mt-0.5">
                    {packedCount} / {totalBoxes}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Digital Box Tag Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(() => {
              const displayList = subscriptions.length > 0 ? subscriptions : [
                { id: 'mock_1', userName: 'Siddhesh Thakur', name: 'Siddhesh Thakur', phone: '+919930577000', meal_type: 'veg', plan_type: 'weekly', cycle_number: 1, deliveryPreference: 'Standard 1:00 PM Slot' },
                { id: 'mock_2', userName: 'Priya Verma', name: 'Priya Verma', phone: '+919718899221', meal_type: 'veg', plan_type: 'monthly', cycle_number: 1, deliveryPreference: 'Standard 1:00 PM Slot' }
              ];
            {/* Digital Box Tag Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {boxItems.length === 0 ? (
                <div className="col-span-full bg-white rounded-3xl p-10 border border-slate-200/80 text-center shadow-xs space-y-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                    <Tag className="w-6 h-6" />
                  </div>
                  <h4 className="font-black text-sm text-slate-900">
                    No {tagFilterSlot === 'all' ? '' : tagFilterSlot.toUpperCase()} Boxes to Tag
                  </h4>
                  <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                    {tagFilterSlot === 'all' 
                      ? 'When customers subscribe to your kitchen, individual container tagging codes will generate here automatically.' 
                      : `There are no active subscriptions scheduled for ${tagFilterSlot} preparation.`}
                  </p>
                </div>
              ) : (
                boxItems.map((item, idx) => {
                  const { sub, key, slotLabel, slotType, isVeg } = item;
                  const boxTag = generateBoxTag({
                    customerName: sub.userName || sub.name || 'Customer',
                    vendorName: vendorProfile?.kitchen_name || vendorProfile?.name || 'Kitchen',
                    sequenceNumber: idx + 1,
                    planType: sub.plan_type || sub.planType || 'weekly',
                    cycleNumber: sub.cycle_number || 1,
                    orderId: sub.id
                  });

              return displayList.map((sub: any, idx: number) => {
                const boxTag = generateBoxTag({
                  customerName: sub.userName || sub.name || 'Customer',
                  vendorName: user?.kitchen_name || user?.name || 'Test Vendor',
                  sequenceNumber: idx + 1,
                  planType: sub.plan_type || sub.planType || 'weekly',
                  cycleNumber: sub.cycle_number || 1,
                  orderId: sub.id
                });
                  const isPacked = packedBoxes[key];

                const isVeg = (sub.meal_type as any) === 'veg' || !sub.meal_type || (sub.meal_type as any) === 'pure_veg';
                const isPacked = packedBoxes[sub.id || idx];
                  return (
                    <div 
                      key={key}
                      className={`bg-white rounded-3xl p-5 border transition-all relative overflow-hidden flex flex-col justify-between gap-4 ${
                        isPacked 
                          ? 'border-emerald-300 ring-2 ring-emerald-400/20 bg-emerald-50/10' 
                          : 'border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)]'
                      }`}
                    >
                      {/* Top Tag Bar */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Box #{String(idx + 1).padStart(2, '0')} • {slotType.toUpperCase()}
                          </span>
                          <DietaryBadge type={isVeg ? 'veg' : 'non_veg'} size={14} />
                        </div>

                return (
                  <div 
                    key={sub.id || idx}
                    className={`bg-white rounded-3xl p-5 border transition-all relative overflow-hidden flex flex-col justify-between gap-4 ${
                      isPacked 
                        ? 'border-emerald-300 ring-2 ring-emerald-400/20 bg-emerald-50/10' 
                        : 'border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)]'
                    }`}
                  >
                    {/* Top Tag Bar */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Box #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <DietaryBadge type={isVeg ? 'veg' : 'non_veg'} size={14} />
                        {/* Giant Readable Tag Code */}
                        <div className="bg-slate-900 text-white rounded-2xl p-4 text-center tracking-widest font-mono font-black text-2xl shadow-inner border border-slate-800">
                          {boxTag}
                        </div>
                        <p className="text-[10px] text-center font-bold text-slate-400 mt-1.5 uppercase tracking-wider">
                          Marker Code for Box Sticker
                        </p>
                      </div>

                      {/* Giant Readable Tag Code */}
                      <div className="bg-slate-900 text-white rounded-2xl p-4 text-center tracking-widest font-mono font-black text-2xl shadow-inner border border-slate-800">
                        {boxTag}
                      {/* Customer & Meal Specs */}
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{sub.userName || sub.name || 'Customer'}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700">
                            {(sub.plan_type || sub.plan_name || 'Weekly').toUpperCase()} • C{sub.cycle_number || 1}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" /> {sub.userPhone || sub.phone || 'No phone'}
                        </p>
                        <p className="text-xs text-brand font-bold">
                          Slot: {slotLabel}
                        </p>
                      </div>
                      <p className="text-[10px] text-center font-bold text-slate-400 mt-1.5 uppercase tracking-wider">
                        Marker Code for Box Sticker
                      </p>
                    </div>

                    {/* Customer & Meal Specs */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">{sub.userName || sub.name || 'Customer'}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700">
                          {(sub.plan_type || 'Weekly').toUpperCase()} • C{sub.cycle_number || 1}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" /> {sub.userPhone || sub.phone || '+91 9900990022'}
                      </p>
                      <p className="text-xs text-brand font-bold">
                        Slot: {sub.deliveryPreference || 'Lunch (1:00 PM)'}
                      </p>
                      {/* Mark Packed Action Button */}
                      <button
                        onClick={() => {
                          setPackedBoxes(prev => ({ ...prev, [key]: !prev[key] }));
                          if (!isPacked) {
                            toast.success(`Box ${boxTag} (${slotType.toUpperCase()}) marked Tagged & Packed! ✨`);
                          }
                        }}
                        className={`w-full py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 ${
                          isPacked
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {isPacked ? <Check className="w-4 h-4" /> : <Tag className="w-4 h-4 text-brand" />}
                        {isPacked ? 'Box Tagged & Packed ✓' : 'Mark Tagged & Packed'}
                      </button>
                    </div>

                    {/* Mark Packed Action Button */}
                    <button
                      onClick={() => {
                        setPackedBoxes(prev => ({ ...prev, [sub.id || idx]: !prev[sub.id || idx] }));
                        if (!isPacked) {
                          toast.success(`Box ${boxTag} marked as Tagged & Packed! ✨`);
                        }
                      }}
                      className={`w-full py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 ${
                        isPacked
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isPacked ? <Check className="w-4 h-4" /> : <Tag className="w-4 h-4 text-brand" />}
                      {isPacked ? 'Box Tagged & Packed ✓' : 'Mark Tagged & Packed'}
                    </button>
                  </div>
                );
              });
            })()}
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
        );
      })()}

      {/* ── TAB 2: DAILY MENU MANAGER ───────────────────────────────────── */}
      {activeTab === 'menu' && (
        <div className="animate-fade-in">
          <TodayMenuCard />
        </div>
      )}

      {/* ── TAB 3: ACTIVE SUBSCRIBERS ───────────────────────────────────── */}
      {activeTab === 'subscribers' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900">Active Subscribers ({subscriptions.length || subscriberCount})</h3>
            <h3 className="text-lg font-black text-slate-900">Active Subscribers ({subscriptions.length})</h3>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Auto-renewing Meal Plans
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subscriptions.length === 0 ? (
              // Default active subscribers representation
              [
                { id: 'sub_1', name: 'Rohan Sharma', phone: '+91 98112 34567', plan: 'Combo (Lunch + Dinner)', address: 'Flat 402, Tower B, Sector 62', status: 'Active' },
                { id: 'sub_2', name: 'Priya Verma', phone: '+91 97188 99221', plan: 'Pure Veg Lunch Plan', address: 'Plot 18, Block C, Sector 62', status: 'Active' },
              ].map((sub, i) => (
                <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-900 text-base">{sub.name}</h4>
                      <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {sub.status}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-brand">{sub.plan}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3 text-slate-400" /> {sub.address}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {sub.phone}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center font-bold text-sm">
                    {sub.name[0]}
                  </div>
              <div className="col-span-full bg-white rounded-3xl p-10 border border-slate-200/80 text-center shadow-xs space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                  <Users className="w-6 h-6" />
                </div>
              ))
                <h4 className="font-black text-sm text-slate-900">No Active Subscribers Yet</h4>
                <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                  Real-time active meal plan subscriptions for this kitchen will appear here automatically.
                </p>
              </div>
            ) : (
              subscriptions.map((sub: any) => (
                <div key={sub.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex items-start justify-between">
                  <div className="space-y-1">
                    <h4 className="font-black text-slate-900 text-base">{sub.userName || 'Subscriber'}</h4>
                    <p className="text-xs font-bold text-brand uppercase">{sub.meal_type} Plan</p>
                    <p className="text-xs text-slate-500">{sub.deliveryPreference || 'Standard Delivery'}</p>
              subscriptions.map((sub: any) => {
                const isNonVeg = sub.dietary === 'non_veg' || sub.category === 'non_veg' || (sub.meal_type as any) === 'non_veg';
                const slotText = sub.meal_type === 'both' ? 'Lunch & Dinner' : (sub.delivery_slot === 'dinner' || sub.meal_type === 'dinner' ? 'Dinner (8:00 PM)' : (sub.deliveryPreference || 'Lunch (1:00 PM)'));
                return (
                  <div key={sub.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-base">{sub.userName || sub.name || 'Subscriber'}</h4>
                        <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {sub.status || 'Active'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-brand uppercase">{sub.plan_name || `${sub.meal_type} Plan`} • {isNonVeg ? 'Non-Veg' : 'Pure Veg'}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Phone className="w-3 h-3 text-slate-400" /> {sub.userPhone || sub.phone || 'No phone'}</p>
                      <p className="text-xs text-slate-400">Slot: {slotText}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-brand flex items-center justify-center font-bold text-sm">
                      {(sub.userName || sub.name || 'S')[0].toUpperCase()}
                    </div>
                  </div>
                </div>
              ))
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: MEAL RATES & PRICING ─────────────────────────────────── */}
      {activeTab === 'rates' && (
        <div className="animate-fade-in">
          <MealRatesCard />
        </div>
      )}

      {/* Date Details Modal */}
      {selectedDateDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up relative p-6">
            <button 
              onClick={() => setSelectedDateDetails(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 font-bold"
            >✕</button>

            <h3 className="text-xl font-black text-slate-900 mb-1">{selectedDateDetails.displayDate}</h3>
            <p className="text-xs font-semibold text-slate-400 mb-6">Meal prep forecast breakdown</p>
            
            <div className="space-y-3">
              {selectedDateDetails.details.map((prep: any, idx: number) => (
                <div key={idx} className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand bg-brand/10 px-2.5 py-0.5 rounded-full">
                      {prep.mealType?.toUpperCase() || 'LUNCH'}
                    </span>
                    <h4 className="font-black text-slate-900 text-lg mt-1.5">
                      {prep.count} Tiffins Scheduled
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Slot: <span className="font-bold text-slate-700">{prep.slot}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
