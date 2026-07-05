'use client';
import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { useUiStore } from '@/store/uiStore';
import { Users, CheckCircle, Navigation, CalendarClock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { VendorProfileCard } from '@/components/vendor/VendorProfileCard';
import { VendorReviews } from '@/components/vendor/VendorReviews';
import { getVendorDeliveries } from '@/lib/queries/delivery';
import { getActiveDeliveryPartners } from '@/lib/queries/admin';
import dynamic from 'next/dynamic';
import { Capacitor } from '@capacitor/core';

const RiderTrackingCard = dynamic(
  () => import('@/components/delivery/RiderTrackingCard').then(m => ({ default: m.RiderTrackingCard })),
  { ssr: false }
);

export default function VendorDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [activePickups, setActivePickups] = useState<any[]>([]);
  const [fleetLocations, setFleetLocations] = useState<any[]>([]);
  const [prepSchedule, setPrepSchedule] = useState<any[]>([]);
  const [isMarkingReady, setIsMarkingReady] = useState<string | null>(null);
  const [selectedDateDetails, setSelectedDateDetails] = useState<{ dateKey: string, displayDate: string, details: any[] } | null>(null);

  const [ordersStore, setOrdersStore] = useState<any[]>([]);
  const [subsStore, setSubsStore] = useState<any[]>([]);


  // Computed state for the map
  const partnerLocations = fleetLocations.filter(p => 
    activeDeliveries.some(d => d.assigned_to === p.id && d.status === 'picked_up')
  );

  useEffect(() => {
    let unsubscribeDeliveries: (() => void) | undefined;
    let unsubscribeFleet: (() => void) | undefined;
    let unsubscribeUpcoming: (() => void) | undefined;
    let unsubscribeSubs: (() => void) | undefined;

    if (user?.id) {
          
          // 1. Listen to vendor's live deliveries
          const qDel = query(collection(db, 'deliveries'), where('vendor_id', '==', user.id));
          unsubscribeDeliveries = onSnapshot(qDel, (snap) => {
            setActiveDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
          });

          // 1.5 Listen to active pickups where rider is assigned but not yet picked up
          const qPickups = query(
            collection(db, 'rider_trips'),
            where('vendorIds', 'array-contains', user.id),
            where('status', '==', 'pickup_pending')
          );
          const unsubscribePickups = onSnapshot(qPickups, (snap) => {
            const pickups = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setActivePickups(pickups);
          });

          // 2. Listen to all fleet locations
          const qFleet = query(collection(db, 'users'), where('role', '==', 'delivery'));
          unsubscribeFleet = onSnapshot(qFleet, (snap) => {
            const fleet = snap.docs
              .map(d => ({ id: d.id, ...d.data() } as any))
              .filter(u => u.location && u.location.lat && u.location.lng);
            setFleetLocations(fleet);
          });

          // 3. Listen to upcoming delivery orders for prep schedule
          const qUpcoming = query(
            collection(db, 'delivery_orders'),
            where('vendorId', '==', user.id),
            where('status', 'in', ['pending', 'preparing', 'ready'])
          );
          unsubscribeUpcoming = onSnapshot(qUpcoming, (snap) => {
            const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setOrdersStore(orders);
          });

          // 4. Listen to active subscriptions to project future prep schedule
          const qSubs = query(
            collection(db, 'subscriptions'),
            where('vendor_id', '==', user.id),
            where('status', '==', 'active')
          );
          unsubscribeSubs = onSnapshot(qSubs, (snap) => {
            const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setSubsStore(subs);
          });
    }

    return () => {
      if (unsubscribeDeliveries) unsubscribeDeliveries();
      if (unsubscribeFleet) unsubscribeFleet();
      if (unsubscribeUpcoming) unsubscribeUpcoming();
      if (unsubscribeSubs) unsubscribeSubs();
    };
  }, [user?.id]);

  useEffect(() => {
    const grouped: any = {};
    const exactDays = new Set<string>();
    const now = new Date();

    // 1. Process explicit delivery orders (which represent today/tomorrow typically)
    ordersStore.forEach((o: any) => {
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      const dateKey = d.toLocaleDateString('en-CA'); // YYYY-MM-DD local
      const displayDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const mealType = o.meal?.type || 'lunch';
      const slot = o.scheduledSlot || 'Standard Time';
      const key = `${dateKey}_${mealType}_${slot}`;
      
      exactDays.add(dateKey);

      if (!grouped[key]) {
        grouped[key] = { 
          dateKey, 
          displayDate, 
          dateObj: d, 
          sortDate: d.getTime(), 
          mealType, 
          slot, 
          count: 0, 
          readyCount: 0, 
          isProjected: false 
        };
      }
      grouped[key].count++;
      if (o.status === 'ready') grouped[key].readyCount++;
    });

    // 2. Project subscriptions for the next 30 days
    for (let i = 0; i <= 30; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateKey = targetDate.toLocaleDateString('en-CA');
      const displayDate = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      if (exactDays.has(dateKey)) continue;

      subsStore.forEach((sub: any) => {
        const addProjected = (mealType: string, slot: string) => {
          const key = `${dateKey}_${mealType}_${slot}`;
          if (!grouped[key]) {
            grouped[key] = { 
              dateKey, 
              displayDate, 
              dateObj: targetDate, 
              sortDate: targetDate.getTime(), 
              mealType, 
              slot, 
              count: 0, 
              readyCount: 0, 
              isProjected: true 
            };
          }
          grouped[key].count++;
        };
        if (sub.meal_type === 'lunch' || sub.meal_type === 'both') {
          addProjected('lunch', sub.deliveryPreference || '11am');
        }
        if (sub.meal_type === 'dinner' || sub.meal_type === 'both') {
          addProjected('dinner', '8pm');
        }
      });
    }

    const scheduleArray = Object.values(grouped).sort((a: any, b: any) => a.sortDate - b.sortDate);
    setPrepSchedule(scheduleArray);
  }, [ordersStore, subsStore]);

  if (user?.role === 'vendor' && !user.is_approved) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-24 h-24 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mb-6 text-4xl shadow-xl shadow-amber-100">
          ⏳
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Pending</h1>
        <p className="text-slate-500 max-w-xs mb-8 font-medium">
          Your kitchen profile is under review. Our team will verify your details and approve you within 24 hours.
        </p>
        <button
          onClick={logout}
          className="btn-outline w-auto px-8"
        >
          Logout & Wait
        </button>
      </div>
    );
  }

  const handleMarkReady = async (prep: any) => {
    const batchKey = `${prep.date}_${prep.slot}`;
    if (!confirm(`Are you sure you want to mark ${prep.count} tiffins ready for ${prep.slot}? This will automatically assign riders.`)) return;

    setIsMarkingReady(batchKey);
    try {
      const functions = getFunctions();
      const markBatchReady = httpsCallable(functions, 'markBatchReady');
      const assignRiderTrips = httpsCallable(functions, 'assignRiderTrips');

      // 1. Mark ready (lock)
      const res = await markBatchReady({ dateStr: prep.date, slot: prep.slot }) as any;
      if (res.data?.success) {
        toast.success('Batch marked ready. Assigning riders...');
        // 2. Trigger rider assignment
        const matchRes = await assignRiderTrips({ vendorId: user?.id, slot: prep.slot }) as any;
        toast.success(matchRes.data?.message || 'Riders assigned!');
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

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Manage your kitchen & daily operations
          </p>
        </div>
        <button
          onClick={logout}
          className="btn-outline"
        >
          Logout
        </button>
      </div>

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

      {/* Active Pickups (Rider Incoming) */}
      {activePickups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              Incoming Riders for Pickup
            </h3>
          </div>
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

      {/* Active Deliveries — Blinkit-style per-rider tracking */}
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
