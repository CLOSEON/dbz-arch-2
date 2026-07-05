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

export default function VendorSchedule() {
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
            Schedule
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            View your upcoming meal prep schedule
          </p>
        </div>
        <button
          onClick={logout}
          className="btn-outline"
        >
          Logout
        </button>
      </div>

      {/* Prep Schedule (Aggregated View) */}
      <div className="space-y-4 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-500" />
            Prep Schedule
          </h3>
        </div>
        
        {prepSchedule.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center">
            <div className="text-3xl mb-2">🧑‍🍳</div>
            <p className="text-sm font-bold text-slate-400">No scheduled meals currently</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 p-6">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {(() => {
                const groupedByDate: Record<string, { displayDate: string, totalCount: number, details: any[] }> = {};
                prepSchedule.forEach(prep => {
                  if (!groupedByDate[prep.dateKey]) {
                    groupedByDate[prep.dateKey] = {
                      displayDate: prep.displayDate,
                      totalCount: 0,
                      details: []
                    };
                  }
                  groupedByDate[prep.dateKey].totalCount += prep.count;
                  groupedByDate[prep.dateKey].details.push(prep);
                });

                const today = new Date();
                const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
                
                const calendarCells = [];
                for (let i = 0; i < 35; i++) {
                  const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
                  const dKey = d.toLocaleDateString('en-CA');
                  const dayData = groupedByDate[dKey];
                  const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  
                  calendarCells.push(
                    <div 
                      key={dKey} 
                      onClick={() => {
                        if (dayData && !isPast) setSelectedDateDetails({ dateKey: dKey, displayDate: dayData.displayDate, details: dayData.details });
                      }}
                      className={`
                        aspect-square rounded-2xl border flex flex-col items-center justify-center p-1 transition-all
                        ${dayData && !isPast ? 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100 cursor-pointer hover:scale-105 shadow-sm' : 'bg-slate-50/50 border-slate-100'}
                        ${isPast ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                      `}
                    >
                      <span className={`text-xs font-bold ${dayData && !isPast ? 'text-indigo-900' : 'text-slate-400'}`}>
                        {d.getDate()}
                      </span>
                      {dayData && dayData.totalCount > 0 && !isPast && (
                        <span className="mt-1 text-[10px] font-black text-white bg-indigo-500 px-1.5 py-0.5 rounded-full">
                          {dayData.totalCount}
                        </span>
                      )}
                    </div>
                  );
                }
                return calendarCells;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Date Details Modal */}
      {selectedDateDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up relative">
            <button 
              onClick={() => setSelectedDateDetails(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
            >
              ✕
            </button>
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-900 mb-1">{selectedDateDetails.displayDate}</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">Meal prep details for this day</p>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {selectedDateDetails.details.map((prep: any, idx: number) => {
                  const batchKey = `${prep.dateKey}_${prep.slot}`;
                  const isLoading = isMarkingReady === batchKey;
                  const isFullyReady = prep.readyCount === prep.count && prep.count > 0;
                  
                  return (
                    <div key={idx} className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-100/50 px-2 py-1 rounded-full">
                            {prep.mealType === 'lunch' ? 'Lunch' : 'Dinner'}
                          </span>
                          {isFullyReady && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-100/50 px-2 py-1 rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-900 text-lg mt-2">
                          Prepare {prep.count} tiffins
                        </h4>
                        <p className="text-xs font-medium text-slate-600 mt-1">
                          Slot: <span className="font-bold text-indigo-600">{prep.slot.toUpperCase()}</span>
                        </p>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-indigo-100/50">
                        {prep.isProjected ? (
                          <div className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-center bg-indigo-50 text-indigo-300">
                            Projected
                          </div>
                        ) : (
                          <button
                            disabled={isFullyReady || isLoading}
                            onClick={() => handleMarkReady(prep)}
                            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                              isFullyReady 
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : isLoading
                                  ? 'bg-indigo-200 text-indigo-500 cursor-wait'
                                  : 'bg-indigo-500 text-white hover:bg-indigo-600 active:scale-[0.98]'
                            }`}
                          >
                            {isLoading ? 'Processing...' : isFullyReady ? 'Riders Notified' : 'Mark Food Ready'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
