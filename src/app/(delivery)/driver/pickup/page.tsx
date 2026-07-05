'use client';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import {
  subscribeToActiveRiderTrip,
  subscribeToAgentDeliveries,
  updateDeliveryStatus,
  updateRiderTrip,
} from '@/lib/queries/delivery';
import type { PickupStop, RiderTrip } from '@/types/delivery';
import { Geolocation } from '@capacitor/geolocation';
import {
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Route,
  PackageCheck,
  MapPin,
  Loader2,
  Phone,
  ChevronRight,
  Package,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

function openMapsNavigation(lat: number, lng: number, vendorId: string) {
  const label = encodeURIComponent(`Dabzo Kitchen – ${vendorId.slice(0, 8)}`);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(url, '_blank');
}

export default function DriverPickupPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);
  const setAgentOrders = useDeliveryStore((s) => s.setAgentOrders);
  const activeTrip = useDeliveryStore((s) => s.activeTrip);
  const setActiveTrip = useDeliveryStore((s) => s.setActiveTrip);

  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // OTP state
  const [verifyingStop, setVerifyingStop] = useState<PickupStop | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const handleGenerateRoute = async () => {
    if (!user?.id || agentOrders.length === 0) return;
    setIsGenerating(true);
    try {
      const assignedOrders = agentOrders.filter(
        (o) => o.driverId === user.id && (o.status === 'preparing' || o.status === 'picked_up')
      );
      if (assignedOrders.length === 0) {
        toast.error('No orders to route');
        return;
      }

      const vendorIds = Array.from(new Set(assignedOrders.map(o => o.vendorId)));
      const pickupStops: PickupStop[] = vendorIds.map((vId, idx) => ({
        vendorId: vId,
        location: { lat: 0, lng: 0 },
        sequence: idx + 1,
        distanceKm: 0,
        status: 'pending',
        pickupOTP: Math.floor(1000 + Math.random() * 9000).toString()
      }));
      
      const newTrip = {
        riderId: user.id,
        assignedOrderIds: assignedOrders.map(o => o.id),
        vendorIds,
        pickupStops,
        status: 'pickup_pending',
        isPartialLoad: assignedOrders.length < 20,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'rider_trips'), newTrip);
      toast.success('Route generated successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate route');
    } finally {
      setIsGenerating(false);
    }
  };

  // Poll current location for live ETA calculation
  useEffect(() => {
    let watchId: string;
    Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      (position) => {
        if (position) {
          setCurrentCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        }
      }
    ).then(id => watchId = id).catch(e => console.error('GPS Watch Error', e));
    
    return () => {
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }, []);

  function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Subscribe to live orders
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToAgentDeliveries(user.id, (orders) => {
      setAgentOrders(orders);
    });
    return () => unsub();
  }, [setAgentOrders, user?.id]);

  // Subscribe to active RiderTrip
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToActiveRiderTrip(user.id, (trip) => {
      setActiveTrip(trip);
    });
    return () => unsub();
  }, [setActiveTrip, user?.id]);

  // Current pending stop (first one not completed)
  const pendingStops = activeTrip?.pickupStops?.filter((s) => s.status === 'pending') ?? [];
  const completedStops = activeTrip?.pickupStops?.filter((s) => s.status === 'completed') ?? [];
  const currentStop = pendingStops[0] ?? null;

  // Total tiffins per vendor
  function tiffinsForVendor(vendorId: string) {
    return agentOrders.filter((o) => o.vendorId === vendorId && o.status === 'preparing').length;
  }

  // Open OTP modal for a single stop
  const handleConfirmStop = useCallback((stop: PickupStop) => {
    setVerifyingStop(stop);
    setOtpInput('');
  }, []);

  const handleVerifyOtp = async () => {
    if (!verifyingStop || !activeTrip?.id || !user?.id) return;
    
    if (otpInput.length !== 4) {
      toast.error('Please enter the 4-digit OTP');
      return;
    }

    setIsVerifyingOtp(true);
    setError(null);

    try {
      const functions = getFunctions();
      const verifyPickupOTP = httpsCallable(functions, 'verifyPickupOTP');
      
      const res = await verifyPickupOTP({
        tripId: activeTrip.id,
        vendorId: verifyingStop.vendorId,
        otp: otpInput
      }) as any;

      if (res.data?.success) {
        toast.success('Pickup confirmed!', { duration: 2500 });
        setVerifyingStop(null);
        setOtpInput('');
        
        // Check if this was the last stop
        const pending = activeTrip.pickupStops.filter(s => s.status === 'pending');
        if (pending.length === 1 && pending[0].vendorId === verifyingStop.vendorId) {
           router.push('/delivery/dashboard');
        }
      } else {
        toast.error(res.data?.message || 'Invalid OTP');
        setError(res.data?.message || 'Invalid OTP');
      }
    } catch (err: any) {
      console.error('[DriverPickup] Error verifying OTP:', err);
      setError(err.message || 'Failed to verify OTP');
      toast.error('Failed to verify OTP');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Legacy fallback: no active trip (old flow)
  const assignedOrders = agentOrders.filter(
    (o) => o.driverId === user?.id && (o.status === 'preparing' || o.status === 'picked_up')
  );

  // ── Render: Trip-based UI ──────────────────────────────────────────────────
  if (activeTrip) {
    const totalStops = activeTrip.pickupStops?.length ?? 0;
    const completedCount = completedStops.length;

    return (
      <main className="animate-fade-in min-h-screen pb-28">
        {/* Header */}
        <div className="border-b border-slate-100 bg-gradient-to-b from-brand/10 to-slate-50 px-4 pb-5 pt-6">
          <div className="mx-auto max-w-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">
                  Pickup Route
                </p>
                <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-900">
                  Kitchen pickups
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Visit each vendor in order and confirm when you have the tiffins.
                </p>
              </div>
              <div className="rounded-[1.2rem] bg-white p-3 shadow-sm">
                <Route className="h-6 w-6 text-brand" />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Progress</span>
                <span>{completedCount}/{totalStops} stops</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-brand"
                  initial={{ width: 0 }}
                  animate={{ width: totalStops > 0 ? `${(completedCount / totalStops) * 100}%` : '0%' }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-md space-y-4 px-4 pt-5">
          {/* Stats chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
              Assigned: {activeTrip.assignedOrderIds.length} Tiffins
            </span>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
              Picked up: {agentOrders.filter(o => o.status === 'picked_up').length}
            </span>
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Traveled: {activeTrip.gpsDistanceKm ? activeTrip.gpsDistanceKm.toFixed(2) : '0.00'} km
            </span>
            {activeTrip.isPartialLoad && (
              <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
                Partial load
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-[1.4rem] border border-rose-100 bg-rose-50 p-4 text-rose-700">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-xs font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {/* Stop list */}
          <div className="space-y-3">
            {activeTrip.pickupStops?.map((stop, index) => {
              const isCurrentStop = stop.status === 'pending' && index === completedCount;
              const isDone = stop.status === 'completed';
              const isFuture = !isCurrentStop && !isDone;
              const tiffins = tiffinsForVendor(stop.vendorId);
              const isConfirming = confirmingStopId === stop.vendorId;

              return (
                <motion.div
                  key={stop.vendorId}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className={`card transition-all ${
                    isDone
                      ? 'border border-emerald-100 bg-emerald-50/60 opacity-75'
                      : isCurrentStop
                      ? 'ring-2 ring-brand ring-offset-2'
                      : 'opacity-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Stop number badge */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrentStop
                          ? 'bg-brand text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : stop.sequence}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Stop {stop.sequence}
                        {isCurrentStop && currentCoords ? (
                          <span className="text-brand"> · Live ETA: {Math.ceil((haversineDist(currentCoords.lat, currentCoords.lng, stop.location.lat, stop.location.lng) / 25) * 60)} mins</span>
                        ) : (
                           ` · ${stop.distanceKm.toFixed(2)} km from previous`
                        )}
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-slate-900">
                        {isDone ? 'Pickup confirmed' : isCurrentStop ? 'Next stop' : 'Upcoming stop'}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        Vendor ID: {stop.vendorId.slice(0, 16)}...
                      </p>
                      {(isCurrentStop || isDone) && (
                        <p className="mt-1 text-xs font-bold text-slate-600">
                          {isDone ? '✓' : '🍱'}{' '}
                          {tiffins > 0 ? `${tiffins} tiffin${tiffins > 1 ? 's' : ''}` : 'Loading...'} to collect
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions for current stop */}
                  {isCurrentStop && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() =>
                          openMapsNavigation(stop.location.lat, stop.location.lng, stop.vendorId)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-[1.1rem] border border-slate-200 bg-white py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 transition-all active:scale-95"
                      >
                        <Navigation className="h-4 w-4 text-blue-500" />
                        Navigate
                      </button>
                      <button
                        onClick={() => {
                          const vPhone = agentOrders.find(o => o.vendorId === stop.vendorId)?.vendorPhone;
                          if (vPhone) {
                            window.location.href = `tel:${vPhone}`;
                          } else {
                            toast('Vendor phone not available', { icon: '📞' });
                          }
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-[1.1rem] border border-slate-200 bg-white py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 transition-all active:scale-95"
                      >
                        <Phone className="h-4 w-4 text-emerald-500" />
                        Call
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleConfirmStop(stop)}
                        disabled={isConfirming}
                        className="btn-primary flex-1 py-3"
                      >
                        {isConfirming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PackageCheck className="h-4 w-4" />
                        )}
                        Confirm pickup
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* All done state */}
          {pendingStops.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card bg-gradient-to-br from-emerald-50 to-teal-50 text-center"
            >
              <Sparkles className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 text-base font-black text-slate-900">All pickups complete!</p>
              <p className="mt-1 text-sm text-slate-500">
                Heading to your drop route...
              </p>
            </motion.div>
          )}
        </div>

        {/* OTP Modal */}
        <AnimatePresence>
          {verifyingStop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl"
              >
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-brand/10 text-brand">
                    <PackageCheck className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-xl font-black text-slate-900">Confirm Pickup</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Ask the kitchen for the 4-digit pickup OTP to confirm you've received the tiffins.
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <input
                    type="number"
                    pattern="[0-9]*"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.slice(0, 4))}
                    placeholder="Enter 4-digit OTP"
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-6 py-4 text-center text-3xl font-black tracking-widest text-slate-900 focus:border-brand focus:bg-white focus:outline-none focus:ring-0"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => setVerifyingStop(null)}
                      className="btn-outline flex-1 rounded-2xl py-3.5 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyOtp}
                      disabled={otpInput.length !== 4 || isVerifyingOtp}
                      className="btn-primary flex-1 rounded-2xl py-3.5 text-sm disabled:opacity-50"
                    >
                      {isVerifyingOtp ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    );
  }

  // ── Render: Legacy fallback (no RiderTrip) ─────────────────────────────────
  return (
    <main className="animate-fade-in min-h-screen pb-28">
      <div className="border-b border-slate-100 bg-gradient-to-b from-brand/10 to-slate-50 px-4 pb-5 pt-6">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">
                Logistics handover
              </p>
              <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-900">
                Kitchen pickup
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Confirm your pickup and open the route in one tap.
              </p>
            </div>
            <div className="rounded-[1.2rem] bg-white p-3 shadow-sm">
              <Package className="h-6 w-6 text-brand" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {assignedOrders.length === 0 ? (
          <div className="card p-6 text-center">
            <Package className="mx-auto h-10 w-10 text-amber-500" />
            <p className="mt-3 text-sm font-black text-slate-900">No orders currently in queue</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Active assignments will show up here once the kitchen marks meals ready.
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Assigned orders
            </p>
            <p className="mt-2 text-3xl font-black text-brand">{assignedOrders.length}</p>
            <p className="mt-1 text-sm text-slate-500">tiffins awaiting pickup</p>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerateRoute}
              disabled={isGenerating}
              className="btn-primary mt-4 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              {isGenerating ? 'Generating Route...' : 'Generate Route'}
            </motion.button>
          </div>
        )}
      </div>
    </main>
  );
}
