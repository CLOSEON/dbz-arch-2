'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { LocationTracker } from '@/lib/delivery/locationTracker';
import { updateDeliveryStatus, verifyDeliveryOTP } from '@/lib/queries/delivery';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useDeliveryNavigation } from '@/hooks/useDeliveryNavigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Loader2,
  MapPin,
  Milestone,
  Navigation,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DeliveryOrder, DeliveryStatus } from '@/types/delivery';

export default function DriverDeliveriesPage() {
  const user = useAuthStore((s) => s.user);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);
  const setAgentOrders = useDeliveryStore((s) => s.setAgentOrders);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [otpErrors, setOtpErrors] = useState<Record<string, string>>({});
  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  const { navigateTo } = useDeliveryNavigation();
  const assignedOrders = agentOrders.filter((order) => order.driverId === user?.id);

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

  useEffect(() => {
    if (!user?.id) return;

    LocationTracker.startTracking(user.id, user.name, user.phone).catch((err) => {
      console.error('[Deliveries] Failed to start location tracker:', err);
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const q = query(collection(db, 'delivery_orders'), where('driverId', '==', user.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as DeliveryOrder))
          .filter((order) => {
            if (!order.createdAt) return false;
            const createdAt = order.createdAt as { seconds?: number } | string | Date;
            const timestamp = typeof createdAt === 'string'
              ? new Date(createdAt).getTime()
              : createdAt instanceof Date
                ? createdAt.getTime()
                : (createdAt?.seconds ?? 0) * 1000;
            return timestamp >= start.getTime() && timestamp <= end.getTime();
          });

        setAgentOrders(list);
      },
      (error) => {
        console.error('[Deliveries] Query subscription error:', error);
        toast.error('Sync failed. Reconnecting...');
      }
    );

    return () => {
      LocationTracker.stopTracking().catch(console.error);
      unsubscribe();
    };
  }, [setAgentOrders, user?.id, user?.name, user?.phone]);

  const totalOrders = assignedOrders.length;
  const deliveredOrdersCount = assignedOrders.filter((order) => order.status === 'delivered').length;
  const deliveryProgressPct = totalOrders > 0 ? (deliveredOrdersCount / totalOrders) * 100 : 0;

  const sortedOrders = [...assignedOrders].sort((a, b) => {
    if (a.status === 'delivered' && b.status !== 'delivered') return 1;
    if (b.status === 'delivered' && a.status !== 'delivered') return -1;
    return 0;
  });

  const handleOtpChange = (orderId: string, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setOtpValues((prev) => ({ ...prev, [orderId]: digits }));
    setOtpErrors((prev) => ({ ...prev, [orderId]: '' }));
  };

  async function handleConfirmDelivery(orderId: string) {
    const otp = otpValues[orderId] || '';

    if (otp.length !== 4) {
      setOtpErrors((prev) => ({ ...prev, [orderId]: 'Please enter a 4-digit OTP' }));
      return;
    }

    setSubmittingIds((prev) => ({ ...prev, [orderId]: true }));
    setOtpErrors((prev) => ({ ...prev, [orderId]: '' }));

    try {
      const response = await verifyDeliveryOTP(orderId, otp);

      if (response.success) {
        toast.success('Meal delivered successfully! 🎉');
        setExpandedId(null);
        setOtpValues((prev) => ({ ...prev, [orderId]: '' }));
        return;
      }

      setOtpErrors((prev) => ({
        ...prev,
        [orderId]: response.error || 'Wrong OTP — ask customer to check their app',
      }));
    } catch (error: any) {
      setOtpErrors((prev) => ({
        ...prev,
        [orderId]: error?.message || 'Verification failed. Please retry.',
      }));
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  const getStatusBadge = (status: DeliveryStatus) => {
    const styles: Record<DeliveryStatus, string> = {
      pending: 'bg-slate-50 text-slate-600 border-slate-200',
      preparing: 'bg-amber-50 text-amber-600 border-amber-100',
      picked_up: 'bg-blue-50 text-blue-600 border-blue-100',
      out_for_delivery: 'bg-orange-50 text-orange-600 border-orange-100',
      delivered: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      failed: 'bg-rose-50 text-rose-600 border-rose-100',
      failed_attempt: 'bg-rose-100 text-rose-700 border-rose-200',
    };

    const map: Record<DeliveryStatus, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
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

      <div className="border-b border-slate-100 bg-gradient-to-b from-brand/10 to-slate-50 px-4 pb-5 pt-6">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Live delivery route</p>
              <h1 className="mt-2 text-[28px] font-black tracking-tight text-slate-900">Today&apos;s Route</h1>
              <p className="mt-1 text-sm text-slate-500">Track, verify, and complete every assigned delivery with confidence.</p>
            </div>
            <div className="rounded-[1.2rem] bg-white px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Delivered</p>
              <p className="mt-1 text-lg font-black text-slate-900">
                {deliveredOrdersCount} <span className="text-slate-400">/ {totalOrders}</span>
              </p>
            </div>
          </div>

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

      <div className="mx-auto max-w-md space-y-4 px-4 pb-4 pt-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Total: {totalOrders}</span>
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Delivered: {deliveredOrdersCount}</span>
          <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">Active: {Math.max(totalOrders - deliveredOrdersCount, 0)}</span>
        </div>

        {totalOrders === 0 ? (
          <div className="card p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
              <Compass className="h-8 w-8 text-brand" />
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-900">No route active</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">You are all caught up. New assignments will appear here automatically as kitchens prepare deliveries.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOrders.map((order) => {
              const isExpanded = expandedId === order.id;
              const isDelivered = order.status === 'delivered';

              return (
                <div key={order.id} className={`card overflow-hidden ${isDelivered ? 'opacity-85' : ''}`}>
                  <div
                    className={`flex items-center justify-between gap-3 p-4 ${!isDelivered ? 'cursor-pointer active:bg-slate-50/70' : ''}`}
                    onClick={() => !isDelivered && setExpandedId(isExpanded ? null : order.id)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`rounded-[1.1rem] p-2.5 ${isDelivered ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-500'}`}>
                        {isDelivered ? <CheckCircle2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-black ${isDelivered ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                          #{order.id.slice(-6).toUpperCase()}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          {order.meal?.name || 'Meal'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      {!isDelivered && (isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />)}
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && !isDelivered && (
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
                            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{order.address.line1}</p>
                            {order.address?.landmark && (
                              <p className="mt-2 inline-flex rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
                                Landmark: {order.address.landmark}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (order.status !== 'out_for_delivery') {
                                  updateDeliveryStatus(order.id, 'out_for_delivery', user?.id).catch(console.error);
                                }
                                const lat = order.address?.lat;
                                const lng = order.address?.lng;
                                if (typeof lat === 'number' && typeof lng === 'number') {
                                  navigateTo(`${lat},${lng}`);
                                  return;
                                }
                                toast.error('Location not available for this order');
                              }}
                              className="flex items-center justify-center gap-2 rounded-[1.2rem] bg-slate-900 px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white"
                            >
                              <Navigation className="h-4 w-4" />
                              Navigate
                            </button>

                            <button
                              type="button"
                              onClick={() => toast('Customer phone is not available yet', { icon: '📞' })}
                              className="flex items-center justify-center gap-2 rounded-[1.2rem] border border-slate-200 bg-white px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600"
                            >
                              <Phone className="h-4 w-4" />
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
                                value={otpValues[order.id] || ''}
                                onChange={(event) => handleOtpChange(order.id, event.target.value)}
                                className="w-28 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-black tracking-[0.5em] text-slate-900 outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => handleConfirmDelivery(order.id)}
                                disabled={submittingIds[order.id] || (otpValues[order.id]?.length ?? 0) !== 4}
                                className="flex-1 rounded-[1.2rem] bg-brand px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50"
                              >
                                {submittingIds[order.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm delivery'}
                              </button>
                            </div>

                            {otpErrors[order.id] && (
                              <div className="mt-3 rounded-[1.2rem] border border-rose-100 bg-rose-50 px-3 py-3 text-[11px] font-bold leading-relaxed text-rose-700">
                                {otpErrors[order.id]}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
