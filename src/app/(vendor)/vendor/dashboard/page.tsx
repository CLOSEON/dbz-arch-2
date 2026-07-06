'use client';
import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { useUiStore } from '@/store/uiStore';
import { Users, CheckCircle, Navigation, CalendarClock, ChefHat, PackageCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { VendorProfileCard } from '@/components/vendor/VendorProfileCard';
import { VendorReviews } from '@/components/vendor/VendorReviews';
import dynamic from 'next/dynamic';
import type { Batch, BatchStatus } from '@/types';

const RiderTrackingCard = dynamic(
  () => import('@/components/delivery/RiderTrackingCard').then(m => ({ default: m.RiderTrackingCard })),
  { ssr: false }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_SORT: Record<string, number> = { '8am': 0, '11am': 1, '8pm': 2 };

const BATCH_STATUS_DISPLAY: Record<BatchStatus, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',          color: 'text-slate-500', bg: 'bg-slate-50' },
  notified:          { label: 'Awaiting Prep',    color: 'text-amber-600', bg: 'bg-amber-50' },
  preparing:         { label: 'Preparing',         color: 'text-blue-600',  bg: 'bg-blue-50' },
  ready:             { label: 'Ready',             color: 'text-emerald-600', bg: 'bg-emerald-50' },
  pickup_in_progress:{ label: 'Pickup In Progress',color: 'text-purple-600', bg: 'bg-purple-50' },
  completed:         { label: 'Completed',         color: 'text-slate-400', bg: 'bg-slate-50' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function VendorDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Data state
  const [batches, setBatches] = useState<(Batch & { id: string })[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [activePickups, setActivePickups] = useState<any[]>([]);
  const [fleetLocations, setFleetLocations] = useState<any[]>([]);
  const [subsStore, setSubsStore] = useState<any[]>([]);

  // UI state
  const [isMarkingReady, setIsMarkingReady] = useState<string | null>(null);

  // Computed
  const partnerLocations = fleetLocations.filter(p =>
    activeDeliveries.some(d => d.assigned_to === p.id && d.status === 'picked_up')
  );

  // ── Subscriptions ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    // 1. Listen to today's + tomorrow's batches for this vendor
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const qBatches = query(
      collection(db, 'batches'),
      where('vendor_id', '==', user.id),
      where('date', 'in', [todayStr, tomorrowStr])
    );
    const unsubBatches = onSnapshot(qBatches, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Batch & { id: string }));
      docs.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (SLOT_SORT[a.slot] ?? 99) - (SLOT_SORT[b.slot] ?? 99);
      });
      setBatches(docs);
    });

    // 2. Live deliveries (existing)
    const qDel = query(collection(db, 'deliveries'), where('vendor_id', '==', user.id));
    const unsubDel = onSnapshot(qDel, (snap) => {
      setActiveDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 3. Active pickups (existing)
    const qPickups = query(
      collection(db, 'rider_trips'),
      where('vendorIds', 'array-contains', user.id),
      where('status', '==', 'pickup_pending')
    );
    const unsubPickups = onSnapshot(qPickups, (snap) => {
      setActivePickups(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    // 4. Fleet locations
    const qFleet = query(collection(db, 'users'), where('role', '==', 'delivery'));
    const unsubFleet = onSnapshot(qFleet, (snap) => {
      setFleetLocations(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(u => u.location?.lat)
      );
    });

    // 5. Active Subscriptions with User Preferences (for Preparation Forecast)
    const qSubs = query(
      collection(db, 'subscriptions'),
      where('vendor_id', '==', user.id),
      where('status', '==', 'active')
    );
    
    const unsubSubs = onSnapshot(qSubs, async (snap) => {
      const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const userIds = [...new Set(subs.map((s: any) => s.user_id))].filter(Boolean) as string[];
      const userPrefs: Record<string, string> = {};
      
      if (userIds.length > 0) {
        // Chunk userIds to avoid 'in' query limit of 30
        for (let i = 0; i < userIds.length; i += 30) {
          const chunk = userIds.slice(i, i + 30);
          const uSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
          uSnap.docs.forEach(d => {
            userPrefs[d.id] = d.data().deliveryPreference || '11am';
          });
        }
      }
      
      const enrichedSubs = subs.map((s: any) => ({
        ...s,
        deliveryPreference: userPrefs[s.user_id] || '11am'
      }));
      
      setSubsStore(enrichedSubs);
    });

    return () => {
      unsubBatches();
      unsubDel();
      unsubPickups();
      unsubFleet();
      unsubSubs();
    };
  }, [user?.id]);

  // ── Estimated Prep (projection) ───────────────────────────────────────────
  // Build a 7-day forecast from active subscriptions, applying the accurate
  // customer delivery preference (8am vs 11am) to provide real, actionable data.
  const estimatedPrep = (() => {
    const now = new Date();
    const confirmedKeys = new Set(batches.map(b => `${b.date}_${b.slot}`));
    const days: { dateKey: string; displayDate: string; slots: { slot: string; count: number }[] }[] = [];

    for (let i = 1; i <= 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      const displayDate = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

      const slotCounts: Record<string, number> = {};
      let hasData = false;
      
      subsStore.forEach((sub: any) => {
        const slots = [];
        if (sub.meal_type === 'lunch' || sub.meal_type === 'both') slots.push(sub.deliveryPreference);
        if (sub.meal_type === 'dinner' || sub.meal_type === 'both') slots.push('8pm');
        
        slots.forEach(slot => {
          if (!confirmedKeys.has(`${dateKey}_${slot}`)) {
            slotCounts[slot] = (slotCounts[slot] || 0) + 1;
            hasData = true;
          }
        });
      });

      if (hasData) {
        const sortedSlots = Object.entries(slotCounts)
          .map(([slot, count]) => ({ slot, count }))
          .sort((a, b) => (SLOT_SORT[a.slot] ?? 99) - (SLOT_SORT[b.slot] ?? 99));
        days.push({ dateKey, displayDate, slots: sortedSlots });
      }
    }
    return days;
  })();

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleMarkReady = async (batch: Batch & { id: string }) => {
    if (!confirm(`Mark ${batch.total_count} tiffins ready for the ${batch.slot} batch? This will notify riders.`)) return;

    setIsMarkingReady(batch.id);
    try {
      const functions = getFunctions();
      const markBatchReady = httpsCallable(functions, 'markBatchReady');
      const assignRiderTrips = httpsCallable(functions, 'assignRiderTrips');

      const res = await markBatchReady({ batch_id: batch.id }) as any;
      if (res.data?.success) {
        toast.success('Batch marked ready! Assigning riders…');
        await assignRiderTrips({ vendorId: user?.id, slot: batch.slot });
      } else {
        toast.error(res.data?.message || 'Failed to mark ready.');
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error marking batch ready.');
    } finally {
      setIsMarkingReady(null);
    }
  };

  const handleRegenerateOTP = async (tripId: string) => {
    if (!user?.id) return;
    try {
      const functions = getFunctions();
      const regenerate = httpsCallable(functions, 'regeneratePickupOTP');
      await regenerate({ tripId, vendorId: user.id });
      toast.success('OTP regenerated successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to regenerate OTP');
    }
  };

  // ── Approval Gate ─────────────────────────────────────────────────────────
  if (user?.role === 'vendor' && !user.is_approved) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-24 h-24 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mb-6 text-4xl shadow-xl shadow-amber-100">⏳</div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Pending</h1>
        <p className="text-slate-500 max-w-xs mb-8 font-medium">
          Your kitchen profile is under review. Our team will verify your details and approve you within 24 hours.
        </p>
        <button onClick={logout} className="btn-outline w-auto px-8">Logout &amp; Wait</button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">Dashboard</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">Manage your kitchen &amp; daily operations</p>
        </div>
        <button onClick={logout} className="btn-outline">Logout</button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-1">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
          Subscribers: {user?.subscriberCount || 0}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">
          Kitchen: Active
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-blue-50 text-blue-600">
          On Route: {partnerLocations.length}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subscribers</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-900 leading-none">{user?.subscriberCount || 0}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-end justify-between">
            <h3 className="text-lg font-black text-emerald-500 leading-none flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
              Active
            </h3>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── TODAY'S BATCHES ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-brand" />
          Today's Batches
        </h3>

        {batches.filter(b => b.date === new Date().toISOString().split('T')[0]).length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center">
            <div className="text-3xl mb-2">🍱</div>
            <p className="text-sm font-bold text-slate-400">No batches confirmed yet today</p>
            <p className="text-xs text-slate-400 mt-1">Batches appear 4 hours before each delivery slot</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches
              .filter(b => b.date === new Date().toISOString().split('T')[0])
              .map((batch) => {
                const disp = BATCH_STATUS_DISPLAY[batch.status] ?? BATCH_STATUS_DISPLAY.pending;
                const canMarkReady = !['ready', 'pickup_in_progress', 'completed'].includes(batch.status);

                return (
                  <div key={batch.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
                    {/* Batch header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {batch.slot} Batch
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-4xl font-black text-slate-900 leading-none">{batch.total_count}</span>
                          <span className="text-sm font-bold text-slate-500">tiffins</span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full ${disp.bg} ${disp.color}`}>
                        {disp.label}
                      </span>
                    </div>

                    {/* Mark Ready CTA */}
                    {canMarkReady && (
                      <button
                        id={`mark-ready-${batch.id}`}
                        onClick={() => handleMarkReady(batch)}
                        disabled={isMarkingReady === batch.id}
                        className="w-full py-3 rounded-2xl font-bold text-sm bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        <PackageCheck className="w-4 h-4" />
                        {isMarkingReady === batch.id ? 'Marking Ready…' : `Mark ${batch.total_count} Tiffins Ready`}
                      </button>
                    )}

                    {batch.status === 'ready' && (
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm justify-center">
                        <CheckCircle className="w-4 h-4" />
                        Batch marked ready — riders are being assigned
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 font-medium">
                      Batch ID: {batch.id}
                    </p>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── INCOMING PICKUPS ─────────────────────────────────────────────────── */}
      {activePickups.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            Incoming Riders for Pickup
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePickups.map((trip) => {
              const myStop = trip.pickupStops?.find((s: any) => s.vendorId === user?.id);
              if (!myStop || myStop.status === 'completed') return null;
              const rider = fleetLocations.find(p => p.id === trip.riderId);
              return (
                <div key={trip.id} className="bg-amber-50 rounded-3xl p-5 border border-amber-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                        Rider On The Way
                      </span>
                      <h4 className="font-bold text-slate-900 text-lg mt-3">
                        {rider?.name || 'A Rider'} is arriving for pickup
                      </h4>
                      <p className="text-sm font-medium text-slate-600 mt-1">
                        Please provide this OTP to confirm handover.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-amber-200">
                    <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-amber-200 shadow-sm">
                      <span className="text-sm font-black uppercase tracking-widest text-slate-400">Pickup OTP</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleRegenerateOTP(trip.id)}
                          className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          REGENERATE
                        </button>
                        <span className="text-2xl font-black text-amber-600 tracking-[0.2em]">{myStop.pickupOTP || '----'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LIVE DELIVERIES ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-emerald-500" />
            Live Deliveries
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
            {activeDeliveries.filter(d => d.status !== 'delivered').length} on route
          </span>
        </div>

        {activeDeliveries.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center">
            <div className="text-3xl mb-2">🛵</div>
            <p className="text-sm font-bold text-slate-400">No active deliveries right now</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeDeliveries.map((delivery) => {
              const partner = fleetLocations.find(p => p.id === delivery.assigned_to);
              return (
                <div key={delivery.id} className="bg-slate-50 rounded-3xl p-4 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    {delivery.address?.line1 || 'Customer Address'}
                  </p>
                  <RiderTrackingCard
                    status={delivery.status as any}
                    mealName={delivery.meal?.name || 'Tiffin'}
                    mealType={(delivery.meal?.type as any) || 'lunch'}
                    riderName={delivery.agentName || partner?.name || 'Dabzo Rider'}
                    riderPhone={delivery.agentPhone || partner?.phone}
                    riderRating={4.8}
                    vehicleNumber={delivery.vehicleNumber}
                    driverLocation={partner?.location && { lat: partner.location.lat, lng: partner.location.lng }}
                    destLocation={delivery.address && { lat: delivery.address.lat, lng: delivery.address.lng }}
                    onCallRider={(phone) => { try { window.open(`tel:${phone}`, '_self'); } catch {} }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ESTIMATED PREP (next 7 days) ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-brand" />
            Preparation Forecast
          </h3>
          <span className="text-[10px] font-bold text-brand bg-brand/10 px-3 py-1 rounded-full uppercase tracking-wide">
            Projected
          </span>
        </div>
        
        {estimatedPrep.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {estimatedPrep.map((day) => (
              <div key={day.dateKey} className="flex-none w-[200px] bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:border-brand/30 transition-colors">
                <div className="absolute top-0 right-0 w-16 h-16 bg-brand/5 rounded-bl-full -z-10 group-hover:scale-150 transition-transform duration-500" />
                <p className="text-sm font-black text-slate-900 mb-4">{day.displayDate}</p>
                <div className="space-y-3">
                  {day.slots.map(s => (
                    <div key={s.slot} className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg">{s.slot}</span>
                      <span className="text-lg font-black text-slate-700">{s.count} <span className="text-[10px] text-slate-400 font-bold uppercase">Tiffins</span></span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center">
            <CalendarClock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">No Upcoming Orders</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[250px] mx-auto">Your prep forecast is empty. Real orders will appear here automatically.</p>
          </div>
        )}

        <p className="text-[11px] text-slate-400 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2">
          <span className="w-5 h-5 shrink-0 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">ℹ</span>
          Estimates are projected from your active subscriptions. Confirmed prep batches will appear exactly 4 hours before each slot.
        </p>
      </div>

      {/* ── KITCHEN MANAGEMENT ───────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <TodayMenuCard />
          <MealRatesCard />
        </div>
        <div className="space-y-6">
          <VendorProfileCard />
          {user?.id && <VendorReviews vendorId={user.id} />}
        </div>
      </div>

    </div>
  );
}
