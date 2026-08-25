'use client';
import { useState, useMemo, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { Users, CheckCircle, Navigation, CalendarClock, ChefHat, PackageCheck, Phone } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useVendorData } from '@/components/vendor/VendorDataProvider';
import dynamic from 'next/dynamic';
import type { BatchStatus } from '@/types';
import { db, functions } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';

const LiveDeliveryMap = dynamic(() => import('@/components/delivery/LiveDeliveryMap'), { ssr: false });

const BATCH_STATUS_DISPLAY: Record<BatchStatus, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',          color: 'text-slate-500', bg: 'bg-slate-50' },
  notified:          { label: 'Awaiting Prep',    color: 'text-amber-600', bg: 'bg-amber-50' },
  preparing:         { label: 'Preparing',         color: 'text-blue-600',  bg: 'bg-blue-50' },
  ready:             { label: 'Ready',             color: 'text-emerald-600', bg: 'bg-emerald-50' },
  pickup_in_progress:{ label: 'Pickup In Progress',color: 'text-purple-600', bg: 'bg-purple-50' },
  completed:         { label: 'Completed',         color: 'text-slate-400', bg: 'bg-slate-50' },
};

import { PendingVerificationScreen } from '@/components/shared/PendingVerificationScreen';

export default function VendorDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { batches, pickups, deliveries, subscriptions, loading } = useVendorData();

  const isVendorRole = user?.role === 'vendor' || user?.role === 'admin';
  const isVerifiedVendor = (user?.is_approved === true || user?.verification_status === 'verified') && user?.is_rejected !== true && (user as any)?.is_suspended !== true && user?.verification_status !== 'rejected' && user?.verification_status !== 'details_requested';

  if (user && (!isVendorRole || !isVerifiedVendor)) {
    return <PendingVerificationScreen role="vendor" />;
  }

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
  const [selectedDateDetails, setSelectedDateDetails] = useState<{ dateKey: string, displayDate: string, details: any[] } | null>(null);

  // ── Live rider location for en-route pickups ─────────────────────────────
  const [riderLocations, setRiderLocations] = useState<Record<string, { lat: number; lng: number } | null>>({});

  // Subscribe to each incoming rider's driver_profile
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
    
    // Project subscriptions for the next 30 days
    for (let i = 0; i <= 30; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateKey = targetDate.toLocaleDateString('en-CA');
      const displayDate = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

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
          addProjected('lunch', sub.deliveryPreference || '11am');
        }
        if (sub.meal_type === 'dinner' || sub.meal_type === 'both') {
          addProjected('dinner', '8pm');
        }
      });
    }

    return Object.values(grouped).sort((a: any, b: any) => a.sortDate - b.sortDate);
  }, [subscriptions]);

  const handleMarkReady = async (batch: any) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Confirm Batch Ready?',
      message: `Are you sure you want to mark all ${batch.total_count} tiffins as ready for the ${batch.slot} batch? This triggers notification alerts for active dispatch riders.`,
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

  if (loading) {
    return <div className="flex h-[80vh] items-center justify-center"><div className="animate-spin text-brand"><ChefHat className="w-8 h-8" /></div></div>;
  }

  const localToday = new Date().toLocaleDateString('en-CA');
  const todayBatches = batches.filter(b => b.date === localToday);

  return (
    <div className="space-y-10 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1 gap-3">
        <div>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">Operations</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">Manage kitchen & delivery handoffs</p>
        </div>
        <button onClick={logout} className="btn-outline">Logout</button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Subscribers</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-900 leading-none">{subscriptions.length}</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Capacity</p>
          <div className="flex items-end justify-between animate-fade-in">
            <h3 className="text-2xl font-black text-slate-900 leading-none">
              {subscriptions.length}
              <span className="text-slate-400 text-sm font-medium"> / {user?.capacity ?? '∞'}</span>
            </h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
              <ChefHat className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-end justify-between">
            <h3 className="text-sm sm:text-base font-black text-emerald-500 leading-none flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
              Active
            </h3>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: Batches & Pickups */}
        <div className="space-y-8">
          {/* TODAY'S BATCHES */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-brand" />
              Today's Prep
            </h3>

            {todayBatches.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center">
                <div className="text-3xl mb-2">🍱</div>
                <p className="text-sm font-bold text-slate-400">No batches confirmed yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayBatches.map((batch) => {
                  const disp = BATCH_STATUS_DISPLAY[batch.status as BatchStatus] ?? BATCH_STATUS_DISPLAY.pending;
                  const canMarkReady = !['ready', 'pickup_in_progress', 'completed'].includes(batch.status);

                  return (
                    <div key={batch.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
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

                      {canMarkReady && (
                        <button
                          onClick={() => handleMarkReady(batch)}
                          disabled={isMarkingReady === batch.id}
                          className="w-full py-3 rounded-2xl font-bold text-sm bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                          <PackageCheck className="w-4 h-4" />
                          {isMarkingReady === batch.id ? 'Marking Ready…' : `Mark ${batch.total_count} Tiffins Ready`}
                        </button>
                      )}

                      {batch.status === 'ready' && (
                        <div className="flex flex-col items-center gap-2 mt-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-100 relative">
                          <button 
                            onClick={async () => {
                              try {
                                const { doc, updateDoc } = await import('firebase/firestore');
                                await updateDoc(doc(db, 'batches', batch.id), { status: 'completed' });
                                toast.success('Cleared batch!');
                              } catch (e) {
                                toast.error('Failed to clear');
                              }
                            }}
                            className="absolute top-2 right-2 text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-lg"
                          >
                            Clear (If Stuck)
                          </button>
                          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm mt-4">
                            <CheckCircle className="w-4 h-4 animate-bounce" />
                            Ready for Rider Pickup
                          </div>
                          {(() => {
                            const tripOTP = pickups.find(p => 
                              p.batch_ids?.includes(batch.id) || 
                              p.assignedOrderIds?.some((oid: string) => batch.order_ids?.includes(oid))
                            )?.pickupStops?.find((s: any) => s.vendorId === user?.id)?.pickupOTP;
                            const displayOTP = batch.pickup_otp || tripOTP;
                            if (!displayOTP) return null;
                            return (
                              <div className="text-center mt-1">
                                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest mb-1">Pickup OTP</p>
                                <div className="text-3xl font-black text-emerald-600 tracking-[0.2em] font-mono bg-white px-4 py-2 rounded-xl shadow-sm border border-emerald-200">
                                  {displayOTP}
                                </div>
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
          </div>

          {/* INCOMING PICKUPS */}
          {pickups.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                Riders En Route
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {pickups.map((trip) => {
                  const myStop = trip.pickupStops?.find((s: any) => s.vendorId === user?.id);
                  if (!myStop || myStop.status === 'completed') return null;
                  return (
                    <div key={trip.id} className="bg-amber-50 rounded-3xl p-5 border border-amber-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                          Rider Assigned
                        </span>
                        {trip.riderPhone && (
                          <a href={`tel:${trip.riderPhone}`} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5 hover:bg-indigo-100 transition-colors">
                            <Phone className="w-3 h-3" /> Call {trip.riderName}
                          </a>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-lg mt-3">
                        {trip.riderName ? `${trip.riderName} is arriving for pickup.` : 'A rider is arriving for pickup.'}
                      </h4>
                      <p className="text-sm font-medium text-slate-600 mt-1">
                        Please hand over the tiffins when they arrive. They will mark it picked up in their app.
                      </p>
                      {myStop.pickupOTP ? (
                        <div className="mt-4 p-3 bg-white rounded-2xl border border-amber-200 text-center">
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Pickup OTP</p>
                          <p className="text-2xl font-black text-slate-900 tracking-[0.2em] font-mono">{myStop.pickupOTP}</p>
                        </div>
                      ) : (
                        <div className="mt-4">
                          <button 
                            onClick={async () => {
                              try {
                                const newOTP = Math.floor(1000 + Math.random() * 9000).toString();
                                const stops = [...trip.pickupStops];
                                const stopIdx = stops.findIndex(s => s.vendorId === user?.id);
                                if (stopIdx > -1) {
                                  stops[stopIdx].pickupOTP = newOTP;
                                  const { doc, updateDoc } = await import('firebase/firestore');
                                  await updateDoc(doc(db, 'rider_trips', trip.id), { pickupStops: stops });
                                  toast.success('Generated OTP for legacy trip!');
                                }
                              } catch (e) {
                                toast.error('Failed to patch legacy OTP');
                              }
                            }}
                            className="w-full py-2 bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 hover:bg-red-200"
                          >
                            Generate Missing OTP (Legacy Fix)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Menu & Forecast */}
        <div className="space-y-8">
          <TodayMenuCard />

          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-indigo-500" />
              30-Day Forecast
            </h3>
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
        </div>
      </div>

    </div>

      {/* Date Details Modal */}
      {selectedDateDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up relative">
            <button 
              onClick={() => setSelectedDateDetails(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"
            >✕</button>
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-900 mb-1">{selectedDateDetails.displayDate}</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">Meal prep details for this day</p>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {selectedDateDetails.details.map((prep: any, idx: number) => (
                  <div key={idx} className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-100/50 px-2 py-1 rounded-full">
                        {prep.mealType === 'lunch' ? 'Lunch' : 'Dinner'}
                      </span>
                      <h4 className="font-bold text-slate-900 text-lg mt-2">
                        Prepare {prep.count} tiffins
                      </h4>
                      <p className="text-xs font-medium text-slate-600 mt-1">
                        Slot: <span className="font-bold text-indigo-600">{prep.slot.toUpperCase()}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
