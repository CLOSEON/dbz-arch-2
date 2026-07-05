'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import {
  subscribeToAgentDeliveries,
  subscribeToActiveRiderTrip,
  updateRiderTrip,
  updateDeliveryStatus,
  verifyDeliveryOTP,
} from '@/lib/queries/delivery';
import type { DeliveryStatus, DropStop } from '@/types/delivery';
import { Geolocation } from '@capacitor/geolocation';
import { useDeliveryNavigation } from '@/hooks/useDeliveryNavigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Loader2,
  MapPin,
  Milestone,
  Navigation,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function DriverDeliveriesPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);
  const setAgentOrders = useDeliveryStore((s) => s.setAgentOrders);
  const activeTrip = useDeliveryStore((s) => s.activeTrip);
  const setActiveTrip = useDeliveryStore((s) => s.setActiveTrip);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [otpErrors, setOtpErrors] = useState<Record<string, string>>({});
  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [confirmingDropId, setConfirmingDropId] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);

  const { navigateTo } = useDeliveryNavigation();

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to live orders
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToAgentDeliveries(user.id, (orders) => setAgentOrders(orders));
    return () => unsub();
  }, [setAgentOrders, user?.id]);

  // Subscribe to active RiderTrip
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToActiveRiderTrip(user.id, (trip) => setActiveTrip(trip));
    return () => unsub();
  }, [setActiveTrip, user?.id]);

  // ── Trip-based drop route UI ────────────────────────────────────────────────
  const dropStops = activeTrip?.dropStops ?? [];
  const completedDrops = dropStops.filter((s) => s.status === 'completed');
  const pendingDrops = dropStops.filter((s) => s.status === 'pending');
  const hasDropRoute = dropStops.length > 0;
  
  const totalDrops = dropStops.length;
  const completedCount = completedDrops.length;
  const deliveryProgressPct = totalDrops > 0 ? (completedCount / totalDrops) * 100 : 0;

  // Order lookup by orderId
  const orderMap = Object.fromEntries(agentOrders.map((o) => [o.id, o]));

  const handleOtpChange = (orderId: string, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setOtpValues((prev) => ({ ...prev, [orderId]: digits }));
    setOtpErrors((prev) => ({ ...prev, [orderId]: '' }));
  };

  const handleConfirmDrop = useCallback(
    async (drop: DropStop) => {
      const otp = otpValues[drop.orderId] || '';
      if (otp.length !== 4) {
        setOtpErrors((prev) => ({ ...prev, [drop.orderId]: 'Please enter a 4-digit OTP' }));
        return;
      }

      setSubmittingIds((prev) => ({ ...prev, [drop.orderId]: true }));
      setOtpErrors((prev) => ({ ...prev, [drop.orderId]: '' }));

      try {
        const response = await verifyDeliveryOTP(drop.orderId, otp);
        if (!response.success) {
          setOtpErrors((prev) => ({
            ...prev,
            [drop.orderId]: response.error || 'Wrong OTP — ask customer to check their app',
          }));
          return;
        }

        toast.success('Delivered! ✅');

        // Mark this stop as completed in the RiderTrip
        if (activeTrip?.id) {
          const updatedDropStops = activeTrip.dropStops!.map((s) =>
            s.orderId === drop.orderId ? { ...s, status: 'completed' } : s
          );
          const allDelivered = updatedDropStops.every((s) => s.status === 'completed');

          await updateRiderTrip(activeTrip.id, {
            dropStops: updatedDropStops as DropStop[],
            status: allDelivered ? 'completed' : 'dropping',
          });

          if (allDelivered) {
            toast.success('All deliveries complete! 🎉 Great work today!', { duration: 4000 });
            setTimeout(() => router.push('/delivery/dashboard'), 2500);
          } else {
            toast.success('Moving to next stop…', { duration: 2000 });
            setExpandedId(null);
            setOtpValues((prev) => ({ ...prev, [drop.orderId]: '' }));
          }
        }
      } catch (error: any) {
        setOtpErrors((prev) => ({
          ...prev,
          [drop.orderId]: error?.message || 'Verification failed. Please retry.',
        }));
      } finally {
        setSubmittingIds((prev) => ({ ...prev, [drop.orderId]: false }));
      }
    },
    [activeTrip, otpValues, router]
  );

  const getStatusBadge = (status: DeliveryStatus) => {
    const styles: Record<DeliveryStatus, string> = {
      pending: 'bg-slate-50 text-slate-600 border-slate-200',
      preparing: 'bg-amber-50 text-amber-600 border-amber-100',
      ready: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      picked_up: 'bg-blue-50 text-blue-600 border-blue-100',
      out_for_delivery: 'bg-orange-50 text-orange-600 border-orange-100',
      delivered: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      failed: 'bg-rose-50 text-rose-600 border-rose-100',
      failed_attempt: 'bg-rose-100 text-rose-700 border-rose-200',
    };
    const map: Record<DeliveryStatus, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      picked_up: 'Picked up',
      out_for_delivery: 'In transit',
      delivered: 'Delivered',
      failed: 'Failed',
      failed_attempt: 'Failed attempt',
    };
    return (
      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${styles[status]}`}>
        {map[status]}
      </span>
    );
  };

  return (
    <main className="animate-fade-in min-h-screen pb-28">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-600/30 bg-amber-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white"
          >
            <AlertTriangle className="h-4 w-4" />
            Offline mode
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-slate-100 bg-gradient-to-b from-brand/10 to-slate-50 px-4 pb-5 pt-6">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Drop route</p>
              <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-900">Today's Route</h1>
              <p className="mt-1 text-sm text-slate-500">
                Deliver each tiffin in order. Confirm with the customer OTP.
              </p>
            </div>
            <div className="rounded-[1.2rem] bg-white px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Delivered</p>
              <p className="mt-1 text-lg font-black text-slate-900">
                {completedCount} <span className="text-slate-400">/ {totalDrops}</span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/80">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${deliveryProgressPct}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="h-full rounded-full bg-brand"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-3 px-4 pb-4 pt-4">
        {hasDropRoute ? (
          <>
            {/* Stats chips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                Total: {totalDrops}
              </span>
              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                Done: {completedCount}
              </span>
              <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
                Traveled: {activeTrip?.gpsDistanceKm ? activeTrip.gpsDistanceKm.toFixed(2) : '0.00'} km
              </span>
              <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
                Remaining: {pendingDrops.length}
              </span>
            </div>

            {/* Drop stop cards in route order */}
            {dropStops.map((drop, index) => {
              const order = orderMap[drop.orderId];
              const isDone = drop.status === 'completed';
              const isCurrentDrop = drop.status === 'pending' && index === completedCount;
              const isExpanded = expandedId === drop.orderId;

              return (
                <motion.div
                  key={drop.orderId}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`card transition-all overflow-hidden ${
                    isDone
                      ? 'border border-emerald-100 bg-emerald-50/60 opacity-75'
                      : isCurrentDrop
                      ? 'ring-2 ring-brand ring-offset-2'
                      : 'opacity-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => !isDone && setExpandedId(isExpanded ? null : drop.orderId)}
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    {/* Sequence number */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition-colors ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrentDrop
                          ? 'bg-brand text-white shadow-sm'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : drop.sequence}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Stop {drop.sequence}
                        {isCurrentDrop && currentCoords ? (
                          <span className="text-brand"> · Live ETA: {Math.ceil((haversineDist(currentCoords.lat, currentCoords.lng, drop.location.lat, drop.location.lng) / 25) * 60)} mins</span>
                        ) : (
                           ` · ${drop.distanceKm.toFixed(2)} km`
                        )}
                      </p>
                      <p className={`text-sm font-black ${isDone ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        #{drop.orderId.slice(-6).toUpperCase()}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{drop.address}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {order && getStatusBadge(order.status)}
                      {!isDone && (isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />)}
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && !isDone && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden border-t border-slate-100 bg-slate-50/50"
                      >
                        <div className="space-y-4 p-4">
                          <div className="rounded-[1.2rem] bg-white p-4 border border-slate-100">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              <Milestone className="h-3.5 w-3.5" />
                              Drop point details
                            </div>
                            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{order?.address?.line1 || drop.address}</p>
                            {order?.address?.landmark && (
                              <p className="mt-2 inline-flex rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
                                Landmark: {order.address.landmark}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (order && order.status !== 'out_for_delivery') {
                                  updateDeliveryStatus(order.id, 'out_for_delivery', user?.id).catch(console.error);
                                }
                                navigateTo(`${drop.location.lat},${drop.location.lng}`);
                              }}
                              className="flex items-center justify-center gap-2 rounded-[1.2rem] bg-slate-900 px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white"
                            >
                              <Navigation className="h-4 w-4" />
                              Navigate
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (order?.customerPhone) {
                                  window.location.href = `tel:${order.customerPhone}`;
                                } else {
                                  toast('Customer phone is not available', { icon: '📞' });
                                }
                              }}
                              className="flex items-center justify-center gap-2 rounded-[1.2rem] border border-slate-200 bg-white px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600"
                            >
                              <Phone className="h-4 w-4 text-emerald-500" />
                              Call
                            </button>
                          </div>

                          <div className="rounded-[1.2rem] border border-slate-100 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                Proof of delivery OTP
                              </label>
                              <span className="text-[10px] font-bold text-slate-400">4 digits</span>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                placeholder="0000"
                                value={otpValues[drop.orderId] || ''}
                                onChange={(event) => handleOtpChange(drop.orderId, event.target.value)}
                                className="w-28 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-black tracking-[0.5em] text-slate-900 outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => handleConfirmDrop(drop)}
                                disabled={submittingIds[drop.orderId] || (otpValues[drop.orderId]?.length ?? 0) !== 4}
                                className="flex-1 rounded-[1.2rem] bg-brand px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50"
                              >
                                {submittingIds[drop.orderId] ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm delivery'}
                              </button>
                            </div>

                            {otpErrors[drop.orderId] && (
                              <div className="mt-3 rounded-[1.2rem] border border-rose-100 bg-rose-50 px-3 py-3 text-[11px] font-bold leading-relaxed text-rose-700">
                                {otpErrors[drop.orderId]}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </>
        ) : (
          <div className="card p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
              <Compass className="h-8 w-8 text-brand" />
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-900">No route active</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Complete your kitchen pickups first to generate the delivery route.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
