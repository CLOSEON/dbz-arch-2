'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getUserSubscriptions, cancelSubscription } from '@/lib/queries/subscriptions';
import { cancelScheduledTiffin, undoSkipScheduledTiffin } from '@/lib/queries/delivery';
import { requestSwap, cancelSwapRequest } from '@/lib/queries/swaps';
import { getAllUsers } from '@/lib/queries/users';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate, formatMeal, toMillis } from '@/lib/utils';
import type { EnrichedSubscription } from '@/types';
import Link from 'next/link';
import { SwapVendorModal } from '@/components/shared/SwapVendorModal';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Box, History, CreditCard, Utensils, Calendar, ChevronRight, Navigation, ArrowLeftRight, SkipForward, Clock, XCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center animate-pulse">
      <Navigation className="w-8 h-8 text-slate-300" />
    </div>
  )
});

function CountdownTimer({ delivery, actionType }: { delivery: any, actionType: 'skip_swap' | 'undo_skip' }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    let d: Date;
    if (delivery.createdAt?.toDate) {
      d = delivery.createdAt.toDate();
    } else if (delivery.createdAt?.seconds) {
      d = new Date(delivery.createdAt.seconds * 1000);
    } else {
      d = new Date();
    }
    
    const deliveryMoment = new Date(d);
    
    if (delivery.scheduledSlot === '8am') deliveryMoment.setHours(8, 0, 0, 0);
    else if (delivery.scheduledSlot === '11am') deliveryMoment.setHours(11, 0, 0, 0);
    else if (delivery.scheduledSlot === '8pm') deliveryMoment.setHours(20, 0, 0, 0);
    else if (delivery.meal?.type === 'lunch') deliveryMoment.setHours(13, 0, 0, 0);
    else deliveryMoment.setHours(20, 0, 0, 0);

    // Skip/Swap has a 4-hour cutoff. Undo Skip has no 4-hour cutoff (can be done until delivery time).
    const cutoffMoment = actionType === 'skip_swap' 
      ? new Date(deliveryMoment.getTime() - 4 * 60 * 60 * 1000) 
      : deliveryMoment;

    const updateTimer = () => {
      const now = new Date();
      const diff = cutoffMoment.getTime() - now.getTime();
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Time expired');
        return;
      }
      setIsExpired(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${hours}h ${mins}m ${secs}s left to act`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [delivery, actionType]);

  if (isExpired) {
    return (
      <div className="w-full text-center mt-2 text-[10px] font-bold text-red-400 flex items-center justify-center gap-1">
        <Clock className="w-3 h-3" /> Action Window Closed
      </div>
    );
  }

  return (
    <div className="w-full text-center mt-2 text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1">
      <Clock className="w-3 h-3" /> {timeLeft}
    </div>
  );
}

export default function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [orders, setOrders] = useState<EnrichedSubscription[]>([]);
  const [upcomingDeliveries, setUpcomingDeliveries] = useState<any[]>([]);
  const [realOrders, setRealOrders] = useState<any[]>([]);
  const [activeSubs, setActiveSubs] = useState<any[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [skipping, setSkipping] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(new Set());
  const [swappedIds, setSwappedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [selectedDeliveryForSwap, setSelectedDeliveryForSwap] = useState<any>(null);

  useEffect(() => {
    let unsubscribeDeliveries: (() => void) | undefined;
    let unsubscribePartner: (() => void) | undefined;
    let unsubscribeUpcoming: (() => void) | undefined;

    if (user) {
      loadOrders();

      const qUpcoming = query(
        collection(db, 'delivery_orders'),
        where('customerId', '==', user.id),
        where('status', 'in', ['pending', 'preparing', 'ready', 'skipped', 'picked_up', 'out_for_delivery', 'delivered'])
      );
      unsubscribeUpcoming = onSnapshot(qUpcoming, (snap) => {
        const deliveries = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        deliveries.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        setRealOrders(deliveries);
      });

      // Also listen to active subscriptions for projection
      const qSubs = query(
        collection(db, 'subscriptions'),
        where('user_id', '==', user.id),
        where('status', '==', 'active')
      );
      const unsubSubs = onSnapshot(qSubs, (snap) => {
        setActiveSubs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      });
      const origUnsub = unsubscribeUpcoming;
      unsubscribeUpcoming = () => { if (origUnsub) origUnsub(); unsubSubs(); };

      import('firebase/firestore').then(({ collection: col, query: q2, where: w, onSnapshot: ons, doc }) => {
        import('@/lib/firebase').then(({ db: firedb }) => {
          const qDel = q2(col(firedb, 'deliveries'), w('user_id', '==', user.id));
          unsubscribeDeliveries = ons(qDel, (snap) => {
            const deliveries = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const active = deliveries.find(d => d.status === 'picked_up');
            
            if (active && active.assigned_to) {
              if (unsubscribePartner) unsubscribePartner();
              
              const partnerRef = doc(firedb, 'users', active.assigned_to);
              unsubscribePartner = ons(partnerRef, (partnerSnap) => {
                const partnerData = partnerSnap.data();
                if (partnerData && partnerData.location) {
                  setActiveDelivery({
                    ...active,
                    partnerLocation: partnerData.location,
                    partnerName: partnerData.name || 'Delivery Partner',
                    partnerPhone: partnerData.phone
                  });
                }
              });
            } else {
              setActiveDelivery(null);
              if (unsubscribePartner) {
                unsubscribePartner();
                unsubscribePartner = undefined;
              }
            }
          });
        });
      });
    }

    return () => {
      if (unsubscribeDeliveries) unsubscribeDeliveries();
      if (unsubscribePartner) unsubscribePartner();
      if (unsubscribeUpcoming) unsubscribeUpcoming();
    };
  }, [user]);

  // Merge real delivery_orders with projected meals from subscriptions
  // Real orders take priority; projected ones fill in the gaps for future days
  useEffect(() => {
    // If no active subscriptions, only show real non-projected future orders (no dummies)
    // Deduplicate real orders: keep only the most recent per slot
    const slotMap = new Map<string, any>();
    for (const o of realOrders) {
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      const dateKey = d.toLocaleDateString('en-CA');
      const slotKey = `${dateKey}_${o.meal?.type || 'lunch'}`;
      const existing = slotMap.get(slotKey);
      // Keep the newest one (highest updatedAt or createdAt seconds)
      const oMs = o.updatedAt?.seconds ?? o.createdAt?.seconds ?? 0;
      const exMs = existing ? (existing.updatedAt?.seconds ?? existing.createdAt?.seconds ?? 0) : -1;
      if (!existing || oMs > exMs) {
        slotMap.set(slotKey, o);
      }
    }

    const dedupedRealOrders = Array.from(slotMap.values());
    const merged: any[] = [...dedupedRealOrders];
    const coveredKeys = new Set(slotMap.keys());

    // Also exclude manually skipped slots so they don't re-appear as "Generating..."
    skippedSlots.forEach(k => coveredKeys.add(k));

    // Only project future slots if there are active subscriptions
    if (activeSubs.length > 0) {
      const now = new Date();
      for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
        const dateKey = targetDate.toLocaleDateString('en-CA');

        activeSubs.forEach((sub: any) => {
          const mealTypes = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];
          mealTypes.forEach((mealType: string) => {
            const key = `${dateKey}_${mealType}`;
            if (coveredKeys.has(key)) return; // already have a real order for this slot

            const scheduledSlot = mealType === 'lunch' ? (user?.deliveryPreference || '11am') : '8pm';
            
            // Skip already-elapsed slots for today
            const slotHour = scheduledSlot === '8am' ? 8 : scheduledSlot === '11am' ? 11 : 20;
            const slotDate = new Date(targetDate);
            slotDate.setHours(slotHour, 0, 0, 0);
            if (slotDate.getTime() < now.getTime()) return;

            coveredKeys.add(key);
            merged.push({
              id: `projected_${dateKey}_${mealType}_${sub.id}`,
              subscriptionId: sub.id,
              customerId: user?.id,
              vendorId: sub.vendor_id,
              status: 'pending',
              isProjected: true,
              meal: { type: mealType, name: mealType === 'lunch' ? 'Lunch' : 'Dinner' },
              scheduledSlot,
              createdAt: { toDate: () => targetDate, seconds: targetDate.getTime() / 1000 },
            });
          });
        });
      }
    }

    // Filter: only show real skipped orders that:
    // 1. Belong to an active subscription
    // 2. Have a vendorId linked to an active sub (filters orphan/ghost docs that have no vendor)
    // 3. Have not yet reached their delivery slot time
    const activeSubIds = new Set(activeSubs.map((s: any) => s.id));
    const activeVendorIds = new Set(activeSubs.map((s: any) => s.vendor_id).filter(Boolean));
    const now2 = new Date();
    const todayStart = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());

    const filtered = merged.filter(o => {
      if (o.isProjected) return true;

      const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date());
      const slotTime = new Date(d);
      if (o.scheduledSlot === '8am') slotTime.setHours(8, 0, 0, 0);
      else if (o.scheduledSlot === '11am') slotTime.setHours(11, 0, 0, 0);
      else if (o.scheduledSlot === '8pm') slotTime.setHours(20, 0, 0, 0);
      else if (o.meal?.type === 'lunch') slotTime.setHours(11, 0, 0, 0);
      else slotTime.setHours(20, 0, 0, 0);

      // 1. Filter out orders from past days
      if (d.getTime() < todayStart.getTime()) return false;

      // 2. Filter out active/completed orders from the Upcoming Schedule list (they are tracked via Track button)
      if (['picked_up', 'out_for_delivery', 'delivered'].includes(o.status)) return false;

      if (o.status === 'skipped') {
        // Must belong to an active subscription
        if (!o.subscriptionId || !activeSubIds.has(o.subscriptionId)) return false;
        // Must have a vendor matching an active subscription (orphan docs won't pass this)
        if (!o.vendorId || !activeVendorIds.has(o.vendorId)) return false;
        // Must not be past delivery time
        if (slotTime.getTime() < now2.getTime()) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const getExactTime = (o: any) => {
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date());
        const moment = new Date(d);
        if (o.scheduledSlot === '8am') moment.setHours(8, 0, 0, 0);
        else if (o.scheduledSlot === '11am') moment.setHours(11, 0, 0, 0);
        else if (o.scheduledSlot === '8pm') moment.setHours(20, 0, 0, 0);
        else if (o.meal?.type === 'lunch') moment.setHours(13, 0, 0, 0);
        else moment.setHours(20, 0, 0, 0);
        return moment.getTime();
      };
      return getExactTime(a) - getExactTime(b);
    });
    
    setUpcomingDeliveries(filtered.slice(0, 5));
  }, [realOrders, activeSubs, user, skippedSlots]);

  async function loadOrders() {
    if (!user) return;
    setLoading(true);
    try {
      const [subs, users] = await Promise.all([
        getUserSubscriptions(user.id),
        getAllUsers(),
      ]);

      const vendorMap: Record<string, any> = {};
      users.forEach((u) => { if (u.role === 'vendor') vendorMap[u.id] = u; });

      const enriched: EnrichedSubscription[] = subs.map((s) => {
        const vendor = vendorMap[s.vendor_id] ?? {};
        const mealType = s.meal_type;
        let price = 0;
        let title = 'Subscription';

        if (mealType === 'lunch') {
          price = vendor.rate_lunch ?? 0;
          title = 'Lunch Plan';
        } else if (mealType === 'dinner') {
          price = vendor.rate_dinner ?? 0;
          title = 'Dinner Plan';
        } else if (mealType === 'both') {
          price = vendor.rate_both ?? 0;
          title = 'Lunch + Dinner';
        }

        return {
          ...s,
          vendorName: vendor.name ?? 'Vendor',
          vendorImage: vendor.image ?? '',
          planTitle: title,
          planPrice: price,
          planFrequency: 'day',
          createdMs: toMillis(s.created_at),
        };
      });

      const uniqueMap = new Map<string, EnrichedSubscription>();
      enriched.forEach((item) => {
        const key = `${item.vendor_id}-${item.meal_type}-${item.status}`;
        const existing = uniqueMap.get(key);
        if (!existing || (item.createdMs ?? 0) > (existing.createdMs ?? 0)) {
          uniqueMap.set(key, item);
        }
      });

      setOrders(Array.from(uniqueMap.values()).sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0)));
    } catch (err) {
      addToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(subId: string) {
    if (!confirm('Cancel this subscription?')) return;
    try {
      await cancelSubscription(subId);
      setOrders((prev) => prev.map((o) => o.id === subId ? { ...o, status: 'cancelled' } : o));
      addToast('Subscription cancelled', 'success');
    } catch {
      addToast('Failed to cancel', 'error');
    }
  }

  async function handleSkip(delivery: any) {
    if (!user) return;
    if (!confirm("Skip this delivery? You'll earn 0.5 credits!")) return;
    setSkipping(delivery.id);
    try {
      const result = await cancelScheduledTiffin(delivery, user.id);
      // Optimistically track this slot as skipped so projection doesn't re-add it
      const d = delivery.createdAt?.toDate ? delivery.createdAt.toDate() : new Date();
      const slotKey = `${d.toLocaleDateString('en-CA')}_${delivery.meal?.type || 'lunch'}`;
      setSkippedSlots(prev => new Set([...prev, slotKey]));
      addToast(`Skipped! You earned ${result.creditsEarned} credits 🎉`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Cannot skip this delivery', 'error');
    } finally { setSkipping(null); }
  }

  async function handleUndoSkip(delivery: any) {
    if (!user) return;
    setSkipping(delivery.id);
    try {
      const result = await undoSkipScheduledTiffin(delivery, user.id);
      const d = delivery.createdAt?.toDate ? delivery.createdAt.toDate() : new Date();
      const slotKey = `${d.toLocaleDateString('en-CA')}_${delivery.meal?.type || 'lunch'}`;
      setSkippedSlots(prev => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
      if (result.mode === 'credit') {
        addToast('Skip cancelled — 0.5 credit used ✓', 'success');
      } else {
        addToast('Skip cancelled — 1 day deducted, 0.5 credit refunded ✓', 'success');
      }
    } catch (err: any) {
      addToast(err?.message || 'Cannot undo skip', 'error');
    } finally { setSkipping(null); }
  }

  async function handleSwap(delivery: any) {
    if (!user) return;
    if (!user.location) { addToast('Please update your location in Profile first', 'error'); return; }
    setSelectedDeliveryForSwap(delivery);
    setIsSwapModalOpen(true);
  }

  function handleSwapSuccess(deliveryId: string) {
    setSwappedIds(prev => new Set([...prev, deliveryId]));
    addToast('Swap confirmed! Enjoy your new meal 🎉', 'success');
  }

  async function handleCancelSwap(delivery: any) {
    if (!user) return;
    setSwapping(delivery.id);
    try {
      await cancelSwapRequest(delivery.id, user.id);
      setSwappedIds(prev => {
        const next = new Set(prev);
        next.delete(delivery.id);
        return next;
      });
      addToast('Swap request cancelled.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Cannot cancel swap request', 'error');
    } finally { setSwapping(null); }
  }

  function getSlotLabel(delivery: any): string {
    const slot = delivery.scheduledSlot;
    if (slot === '8am') return '8:00 AM';
    if (slot === '11am') return '11:00 AM';
    if (slot === '8pm') return '8:00 PM';
    return slot || 'Scheduled';
  }

  function formatDeliveryDate(delivery: any): string {
    if (!delivery.createdAt?.toDate) return 'Today';
    const d = delivery.createdAt.toDate();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function isActionWindowOpen(delivery: any): boolean {
    let d: Date;
    if (delivery.createdAt?.toDate) {
      d = delivery.createdAt.toDate();
    } else if (delivery.createdAt?.seconds) {
      d = new Date(delivery.createdAt.seconds * 1000);
    } else {
      d = new Date();
    }
    
    const deliveryMoment = new Date(d);
    if (delivery.scheduledSlot === '8am') deliveryMoment.setHours(8, 0, 0, 0);
    else if (delivery.scheduledSlot === '11am') deliveryMoment.setHours(11, 0, 0, 0);
    else if (delivery.scheduledSlot === '8pm') deliveryMoment.setHours(20, 0, 0, 0);
    else if (delivery.meal?.type === 'lunch') deliveryMoment.setHours(13, 0, 0, 0);
    else deliveryMoment.setHours(20, 0, 0, 0);

    const now = new Date();
    const cutoffMoment = new Date(deliveryMoment.getTime() - 4 * 60 * 60 * 1000); // 4 hours before
    return now.getTime() < cutoffMoment.getTime();
  }

  function canSwap(delivery: any): boolean { return isActionWindowOpen(delivery); }
  function canSkip(delivery: any): boolean { return isActionWindowOpen(delivery); }

  const filtered = orders.filter((o) =>
    activeTab === 'active' ? o.status !== 'cancelled' : o.status === 'cancelled'
  );

  // Determine if there's a real order today to show the track button
  const todayStr = new Date().toLocaleDateString('en-CA');
  const hasTodayOrder = realOrders.some(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : null);
    if (!d) return false;
    return d.toLocaleDateString('en-CA') === todayStr && ['pending', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered'].includes(o.status);
  });

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mt-4 mb-6 px-1">
        <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">
          My Orders
        </h1>
        <p className="text-sm font-medium text-slate-400 mt-1">
          Manage your active plans & tracking
        </p>
      </div>

      {/* Track Today's Order Banner — shows when today has an active/scheduled order */}
      {(activeDelivery || hasTodayOrder) && (
        <Link href="/track" className="block mb-6">
          <div className={`relative overflow-hidden rounded-3xl px-5 py-4 flex items-center gap-4 shadow-sm transition-all duration-200 active:scale-[0.98] ${
            activeDelivery
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : 'bg-gradient-to-r from-brand to-indigo-500'
          }`}>
            {/* Subtle shine overlay */}
            <div className="absolute inset-0 bg-white/5 rounded-3xl pointer-events-none" />
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              activeDelivery ? 'bg-white/20' : 'bg-white/20'
            }`}>
              {activeDelivery
                ? <Navigation className="w-5 h-5 text-white animate-pulse" />
                : <Navigation className="w-5 h-5 text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-[14px] leading-tight">
                {activeDelivery ? '🚴 Your food is on the way!' : '📦 Track Today\'s Order'}
              </p>
              <p className="text-white/80 text-[11px] font-semibold mt-0.5">
                {activeDelivery ? `Partner: ${activeDelivery.partnerName}` : 'Tap to see live delivery status'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/70 shrink-0" />
          </div>
        </Link>
      )}

      {/* Active Delivery Tracking Map (inline, only shows when driver is live) */}
      {activeDelivery && (
        <div className="mb-10">
          <h3 className="font-bold text-slate-900 mb-3 px-1">Live Tracking</h3>
          <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center animate-pulse">
                  <Navigation className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 leading-tight">Your food is on the way!</h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Partner: {activeDelivery.partnerName} ({activeDelivery.partnerPhone})</p>
                </div>
              </div>
            </div>
            <DeliveryMap 
              markers={[{
                id: activeDelivery.id,
                lat: activeDelivery.partnerLocation.lat,
                lng: activeDelivery.partnerLocation.lng,
                title: activeDelivery.partnerName,
                subtitle: 'On the way'
              }]}
            />
          </div>
        </div>
      )}

      {/* Upcoming Scheduled Deliveries */}
      {upcomingDeliveries.length > 0 && (
        <div className="mb-10">
          <h3 className="font-bold text-slate-900 mb-3 px-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand" />
            Upcoming Schedule
          </h3>
          <div className="space-y-3">
          {upcomingDeliveries.map((delivery) => {
              const isLunch = delivery.meal?.type === 'lunch' || delivery.scheduledSlot !== '8pm';
              const isProjected = !!delivery.isProjected;
              const isSwapRequested = swappedIds.has(delivery.id);
              const swapOk = !isSwapRequested && canSwap(delivery);
              const skipOk = canSkip(delivery);
              const isSkipping = skipping === delivery.id;
              const isSwapping = swapping === delivery.id;

              return (
                <div key={delivery.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">
                  {/* Top row */}
                  <div className="p-4 pb-3 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${isLunch ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                      {isLunch ? '☀️' : '🌙'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 text-[13px] leading-tight truncate">
                        {delivery.meal?.name || (isLunch ? 'Lunch' : 'Dinner')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-bold text-slate-500">{formatDeliveryDate(delivery)}</span>
                        <span className="text-slate-300 text-[10px]">·</span>
                        <span className="text-[11px] font-bold text-slate-500">{getSlotLabel(delivery)}</span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0 ${
                      isProjected
                        ? 'bg-white/80 text-slate-400 border border-slate-200'
                        : isSwapRequested
                          ? 'bg-blue-50 text-blue-500 border border-blue-100'
                          : delivery.status === 'skipped'
                            ? 'bg-slate-100 text-slate-500 border border-slate-200'
                            : delivery.status === 'ready'
                              ? 'bg-emerald-500 text-white'
                              : delivery.status === 'preparing'
                                ? 'bg-orange-400 text-white'
                                : isLunch
                                  ? 'bg-amber-400 text-white'
                                  : 'bg-indigo-400 text-white'
                    }`}>
                      {isProjected ? '⏳' : isSwapRequested ? '🔄 Swap Out' : delivery.status === 'skipped' ? 'Skipped' : delivery.status === 'ready' ? '✓ Ready' : delivery.status === 'preparing' ? 'Preparing' : 'Scheduled'}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="mx-4 h-px bg-black/5" />

                  {/* Action buttons */}
                  <div className="p-3">
                    <div className="flex gap-2">
                      {isSwapRequested ? (
                        <button
                          disabled={isSwapping}
                          onClick={() => handleCancelSwap(delivery)}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 bg-red-50 text-red-600 hover:bg-red-100 active:scale-95"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {isSwapping ? 'Cancelling...' : 'Cancel Swap'}
                        </button>
                      ) : delivery.status === 'skipped' ? (
                        <button
                          disabled={isSkipping}
                          onClick={() => handleUndoSkip(delivery)}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {isSkipping ? 'Cancelling...' : 'Cancel Skip'}
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={!swapOk || isSwapping || isSkipping}
                            onClick={() => handleSwap(delivery)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 ${
                              swapOk && !isSwapping && !isSkipping
                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95'
                                : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed'
                            }`}
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            {isSwapping ? 'Requesting...' : 'Swap'}
                          </button>
                          <button
                            disabled={!skipOk || isSkipping || isSwapping}
                            onClick={() => handleSkip(delivery)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 ${
                              skipOk && !isSkipping && !isSwapping
                                ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 active:scale-95'
                                : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed'
                            }`}
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                            {isSkipping ? 'Processing...' : 'Skip +0.5CR'}
                          </button>
                        </>
                      )}
                    </div>
                    {/* Add Countdown Timer below buttons */}
                    <CountdownTimer 
                      delivery={delivery} 
                      actionType={(isSwapRequested || delivery.status === 'skipped') ? 'undo_skip' : 'skip_swap'} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="pill-container mb-8">
        <button 
          className={`pill ${activeTab === 'active' ? 'active' : ''}`} 
          onClick={() => setActiveTab('active')}
        >
          <Box className="w-4 h-4" />
          Active
        </button>
        <button 
          className={`pill ${activeTab === 'history' ? 'active' : ''}`} 
          onClick={() => setActiveTab('history')}
        >
          <History className="w-4 h-4" />
          History
        </button>
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={activeTab === 'active' ? '📦' : '📋'}
          title={activeTab === 'active' ? 'No active subscriptions' : 'No cancelled plans'}
          description={activeTab === 'active' ? 'Browse vendors to find a meal plan' : 'Cancelled plans will appear here'}
          action={activeTab === 'active' ? <Link href="/dashboard" className="btn-primary inline-flex mt-4 px-8 py-4">Browse Vendors</Link> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {filtered.map((order) => {
            const isActive = order.status !== 'cancelled';
            return (
              <div key={order.id} className="card !p-0 overflow-hidden group">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:scale-105 transition-transform">
                        {isActive ? <Utensils className="w-6 h-6 text-brand" /> : <History className="w-6 h-6 text-slate-300" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-[17px] leading-tight">{order.vendorName}</h4>
                        <p className="text-xs font-medium text-slate-400 mt-1">{order.planTitle}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                      isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {isActive ? 'Active' : 'Cancelled'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50/50 border border-slate-100 rounded-2xl p-4 mb-5">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> Rate
                      </p>
                      <p className="text-sm font-black text-slate-900">₹{order.planPrice}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Utensils className="w-3 h-3" /> Meal
                      </p>
                      <p className="text-sm font-black text-slate-900 truncate">{formatMeal(order.meal_type)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Started
                      </p>
                      <p className="text-sm font-black text-slate-900">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex gap-3">
                      <button 
                        className="flex-1 bg-rose-50 text-rose-500 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-colors" 
                        onClick={() => handleCancel(order.id)}
                      >
                        Cancel Plan
                      </button>
                      <Link 
                        href={`/vendor/detail?id=${order.vendor_id}`} 
                        className="flex-1 bg-slate-900 text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        View Vendor <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Swap Modal */}
      {isSwapModalOpen && selectedDeliveryForSwap && user?.location && (
        <SwapVendorModal
          isOpen={isSwapModalOpen}
          onClose={() => {
            setIsSwapModalOpen(false);
            setSelectedDeliveryForSwap(null);
          }}
          userLocation={user.location}
          userId={user.id}
          delivery={selectedDeliveryForSwap}
          onSwapSuccess={handleSwapSuccess}
        />
      )}
    </div>
  );
}
