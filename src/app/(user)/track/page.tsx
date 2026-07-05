'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, where,
  Timestamp,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Loader2, Clock, Bell, AlertTriangle, Package, ChevronRight, Navigation, CheckCircle2, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import type { DeliveryOrder } from '@/types/delivery';

const RiderTrackingCard = dynamic(
  () => import('@/components/delivery/RiderTrackingCard').then(m => ({ default: m.RiderTrackingCard })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-3xl animate-pulse" />
        ))}
      </div>
    ),
  }
);

/* ─── helpers ──────────────────────────────────────────────────────────────── */

const SLOT_HOURS: Record<string, number> = {
  '8am': 8,
  '11am': 11,
  '8pm': 20,
};

function getSlotTime(order: any): Date {
  const base = order.createdAt?.toDate
    ? order.createdAt.toDate()
    : order.createdAt?.seconds
    ? new Date(order.createdAt.seconds * 1000)
    : new Date();

  const d = new Date(base);
  const slot = order.scheduledSlot as string | undefined;
  if (slot && SLOT_HOURS[slot] !== undefined) {
    d.setHours(SLOT_HOURS[slot], 0, 0, 0);
  } else if (order.meal?.type === 'lunch') {
    d.setHours(11, 0, 0, 0);
  } else {
    d.setHours(20, 0, 0, 0);
  }
  return d;
}

function formatETA(slotTime: Date): string {
  const now = new Date();
  const diffMs = slotTime.getTime() - now.getTime();
  if (diffMs <= 0) return 'Arriving soon';
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `~${hrs}h ${remMins}m`;
  return `~${mins}m`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const LIVE_STATUSES = ['picking_up', 'out_for_delivery', 'picked_up', 'preparing'];
const DONE_STATUSES = ['delivered'];

/* ─── component ─────────────────────────────────────────────────────────────── */

export default function CustomerTrackPage() {
  const user = useAuthStore((s) => s.user);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSubs, setActiveSubs] = useState<any[]>([]);

  /* Fetch all today's delivery_orders and active subscriptions */
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const qOrders = query(
      collection(db, 'delivery_orders'),
      where('customerId', '==', user.id),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59, 999))),
    );

    const qSubs = query(
      collection(db, 'subscriptions'),
      where('user_id', '==', user.id),
      where('status', '==', 'active')
    );

    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllOrders(docs);
      setLoading(false);
    });

    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setActiveSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubOrders();
      unsubSubs();
    };
  }, [user?.id]);

  /* Derive current order */
  const liveOrder = allOrders.find((o) => LIVE_STATUSES.includes(o.status)) ?? null;

  const latestDelivered = allOrders
    .filter((o) => DONE_STATUSES.includes(o.status))
    .sort((a, b) => {
      const aT = a.timestamps?.deliveredAt?.seconds ?? 0;
      const bT = b.timestamps?.deliveredAt?.seconds ?? 0;
      return bT - aT; // newest first
    })[0] ?? null;

  const currentOrder: any | null = liveOrder ?? latestDelivered;

  /* Derive next order (real or projected) */
  const now = new Date();
  
  // 1. Build a map of existing real orders by slot to avoid projecting over them
  const slotMap = new Set<string>();
  allOrders.forEach(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date());
    slotMap.add(`${d.toLocaleDateString('en-CA')}_${o.meal?.type || 'lunch'}`);
  });

  // 2. Project future orders from active subscriptions for the next 2 days
  const projectedOrders: any[] = [];
  for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const dateKey = targetDate.toLocaleDateString('en-CA');
    
    activeSubs.forEach((sub) => {
      const mealTypes = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];
      mealTypes.forEach((mealType) => {
        if (slotMap.has(`${dateKey}_${mealType}`)) return; // Already exists as a real order
        
        const scheduledSlot = mealType === 'lunch' ? (user?.deliveryPreference || '11am') : '8pm';
        const slotHour = scheduledSlot === '8am' ? 8 : scheduledSlot === '11am' ? 11 : 20;
        const slotDate = new Date(targetDate);
        slotDate.setHours(slotHour, 0, 0, 0);
        
        if (slotDate.getTime() < now.getTime()) return; // Skip past slots

        projectedOrders.push({
          id: `projected_${dateKey}_${mealType}_${sub.id}`,
          status: 'pending',
          meal: { type: mealType, name: mealType === 'lunch' ? 'Lunch' : 'Dinner' },
          scheduledSlot,
          address: { line1: 'Delivery Address from Plan' }, // Placeholder or use user.location if available
          createdAt: { toDate: () => targetDate, seconds: targetDate.getTime() / 1000 },
          isProjected: true
        });
      });
    });
  }

  // 3. Combine real pending orders and projected orders, and pick the soonest one
  const combinedFutureOrders = [
    ...allOrders.filter((o) => ['pending', 'preparing'].includes(o.status) && o !== currentOrder),
    ...projectedOrders
  ];

  const nextOrder: any | null = combinedFutureOrders
    .sort((a, b) => getSlotTime(a).getTime() - getSlotTime(b).getTime())
    .find((o) => getSlotTime(o).getTime() > now.getTime()) ?? null;

  /* Notifications for current order */
  useEffect(() => {
    if (!currentOrder?.id) return;
    const q = query(
      collection(db, 'delivery_orders', currentOrder.id, 'notifications'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timeString: data.createdAt
            ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
        };
      }));
    });
    return () => unsub();
  }, [currentOrder?.id]);

  function handleCallRider(phone: string) {
    try {
      if (Capacitor.isNativePlatform() && (Capacitor as any).Plugins?.Phone) {
        (Capacitor as any).Plugins.Phone.call({ number: phone });
      } else {
        window.open(`tel:${phone}`, '_self');
      }
    } catch {
      window.open(`tel:${phone}`, '_self');
    }
  }

  /* ── loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 animate-fade-in">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Connecting live GPS…</p>
        </div>
      </div>
    );
  }

  /* ── empty state ── */
  if (!currentOrder && !nextOrder) {
    return (
      <div className="pt-16 pb-24 px-6 max-w-md mx-auto animate-fade-in">
        <div className="bg-white rounded-[2rem] p-10 text-center border border-slate-100 shadow-sm flex flex-col items-center gap-4">
          <div className="text-5xl">🍱</div>
          <div>
            <h2 className="font-black text-slate-900 text-lg">No Active Delivery</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-[220px] mx-auto leading-relaxed">
              Your tiffin hasn&apos;t been dispatched yet for today. Check back closer to meal time!
            </p>
          </div>
          <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            <span>Lunch ~11 AM · Dinner ~8 PM</span>
          </div>
        </div>
      </div>
    );
  }

  const isLive = currentOrder && LIVE_STATUSES.includes(currentOrder.status);
  const isDelivered = currentOrder && DONE_STATUSES.includes(currentOrder.status);

  return (
    <div className="pb-28 animate-fade-in">
      {/* Header */}
      <div className="pt-8 pb-4 px-6 max-w-md mx-auto">
        <p className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full inline-block">
          {isLive ? '🟢 Live Tracking' : '📦 Delivery Status'}
        </p>
        <h1 className="text-[28px] font-black text-slate-900 tracking-tight leading-tight mt-2.5">
          {currentOrder?.meal?.name ?? nextOrder?.meal?.name ?? 'Today\'s Tiffin'}
        </h1>
        <p className="text-sm text-slate-400 font-medium capitalize mt-1">
          {currentOrder?.meal?.type ?? nextOrder?.meal?.type} · {currentOrder?.address?.line1 ?? nextOrder?.address?.line1 ?? ''}
        </p>
      </div>

      <div className="px-6 max-w-md mx-auto space-y-5">

        {/* ── Card 1: Current order (live / latest delivered) ─────────────── */}
        {currentOrder && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Live status badge */}
            {isLive && (
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Rider is live</span>
              </div>
            )}
            {isDelivered && (
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  Delivered {currentOrder.timestamps?.deliveredAt
                    ? formatTime(new Date(currentOrder.timestamps.deliveredAt.seconds * 1000))
                    : ''}
                </span>
              </div>
            )}

            <RiderTrackingCard
              status={currentOrder.status as any}
              mealName={currentOrder.meal?.name}
              mealType={currentOrder.meal?.type as any}
              riderName={currentOrder.agentName ?? 'Dabzo Rider'}
              riderPhone={currentOrder.agentPhone}
              riderRating={4.8}
              vehicleNumber={currentOrder.vehicleNumber}
              otp={currentOrder.otp}
              driverLocation={currentOrder.driverLocation ?? undefined}
              destLocation={currentOrder.address}
              onCallRider={handleCallRider}
            />
          </motion.div>
        )}

        {/* ── Card 2: Next order (upcoming with ETA) ───────────────────────── */}
        {nextOrder && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Navigation className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Next Delivery</span>
            </div>

            <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
              {/* Top gradient strip */}
              <div className="h-1 bg-gradient-to-r from-brand/60 via-brand to-brand/60" />

              <div className="p-5 space-y-4">
                {/* Meal info row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0 text-xl">
                      {nextOrder.meal?.type === 'lunch' ? '🍛' : '🍽️'}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm leading-tight">{nextOrder.meal?.name}</p>
                      <p className="text-[10px] font-semibold text-slate-400 capitalize mt-0.5">{nextOrder.meal?.type}</p>
                    </div>
                  </div>

                  {/* ETA pill */}
                  <div className="shrink-0 bg-brand/10 rounded-full px-3 py-1.5 text-center">
                    <p className="text-[10px] font-black text-brand uppercase tracking-wider">ETA</p>
                    <p className="text-sm font-black text-brand mt-0.5">{formatETA(getSlotTime(nextOrder))}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-50" />

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Scheduled</p>
                    <p className="text-xs font-black text-slate-800">{formatTime(getSlotTime(nextOrder))}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Status</p>
                    <p className="text-xs font-black text-slate-800 capitalize">
                      {nextOrder.status === 'pending' ? 'Scheduled' : nextOrder.status}
                    </p>
                  </div>
                </div>

                {/* Delivery address */}
                {nextOrder.address?.line1 && (
                  <div className="flex items-start gap-2.5 bg-slate-50 rounded-xl p-3">
                    <MapPin className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed">{nextOrder.address.line1}</p>
                  </div>
                )}

                {/* Rider not assigned yet notice */}
                {!nextOrder.agentName && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span className="font-semibold">Rider will be assigned closer to delivery time</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  </div>
                )}

                {/* Rider assigned */}
                {nextOrder.agentName && (
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="w-8 h-8 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
                      <span className="text-sm">🛵</span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Rider Assigned</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{nextOrder.agentName}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Notification Feed (for current order) ───────────────────────── */}
        {notifications.length > 0 && (
          <motion.div
            className="space-y-3 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center gap-2 ml-1">
              <Bell className="w-3.5 h-3.5 text-slate-400" />
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Updates</h2>
            </div>
            <AnimatePresence initial={false}>
              {notifications.map((notif, i) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`rounded-2xl p-4 border flex items-start gap-3 shadow-sm ${
                    notif.type === 'delay_alert'
                      ? 'bg-amber-50 border-amber-100'
                      : 'bg-white border-slate-100'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${
                    notif.type === 'delay_alert' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {notif.type === 'delay_alert' ? <AlertTriangle className="w-4 h-4" /> : '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {notif.type === 'delay_alert' ? 'Delay Alert' : 'Update'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{notif.timeString}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed mt-0.5">{notif.message}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
