'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { subscribeToAgentDeliveries } from '@/lib/queries/delivery';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useDeliveryNavigation } from '@/hooks/useDeliveryNavigation';
import { Camera, CheckCircle2, Clock, Loader2, MapPinOff, Navigation, Sparkles, Truck } from 'lucide-react';
import Image from 'next/image';
import { getImageUrl, uploadImage } from '@/lib/storage';
import { updateUser } from '@/lib/queries/users';
import { LocationTracker } from '@/lib/delivery/locationTracker';
import dynamic from 'next/dynamic';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { agentPayoutConverter, AgentPayout, riderPaymentConverter, RiderPayment } from '@/types/payout';
import toast from 'react-hot-toast';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-[1.5rem] border border-slate-100 bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <span className="text-xs font-semibold text-slate-500">Loading route map…</span>
      </div>
    </div>
  ),
});

export default function DeliveryDashboard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const addToast = useUiStore((s) => s.addToast);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);
  const setAgentOrders = useDeliveryStore((s) => s.setAgentOrders);
  const lastSynced = useDeliveryStore((s) => s.lastSynced);
  const setLastSynced = useDeliveryStore((s) => s.setLastSynced);

  const [loading, setLoading] = useState(true);
  const [loadingImage, setLoadingImage] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'checking' | 'active' | 'unavailable'>('checking');
  const [dailyPayouts, setDailyPayouts] = useState<AgentPayout[]>([]);
  const [todayTripPayments, setTodayTripPayments] = useState<RiderPayment[]>([]);

  const { navigateTo } = useDeliveryNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribeDeliveries = subscribeToAgentDeliveries(user.id, (orders, fromCache) => {
      setAgentOrders(orders);
      setLastSynced(fromCache ? new Date() : null);
      setLoading(false);
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // Fetch payouts by agentId only to avoid composite index requirement, filter date client-side
    const payoutsQuery = query(
      collection(db, 'agent_payouts').withConverter(agentPayoutConverter),
      where('agentId', '==', user.id)
    );

    const unsubscribePayouts = onSnapshot(payoutsQuery, (snap) => {
      const todayPayouts = snap.docs
        .map((doc) => doc.data())
        .filter((payout) => {
          const payoutDate = payout.date.toDate();
          return payoutDate >= start && payoutDate <= end;
        });
      setDailyPayouts(todayPayouts);
    });

    // Also subscribe to trip-level rider_payments for today
    const tripPaymentsQuery = query(
      collection(db, 'rider_payments').withConverter(riderPaymentConverter),
      where('riderId', '==', user.id)
    );
    const unsubscribeTripPayments = onSnapshot(tripPaymentsQuery, (snap) => {
      const todayPayments = snap.docs
        .map((doc) => doc.data())
        .filter((p) => {
          const d = p.calculatedAt?.toDate();
          return d && d >= start && d <= end;
        });
      setTodayTripPayments(todayPayments);
    });

    const startGPS = async () => {
      try {
        setGpsStatus('active');
        await LocationTracker.startTracking(
          user.id,
          user.name,
          user.phone,
          (lat, lng) => {
            setCurrentLocation({ lat, lng });
          }
        );
      } catch (error) {
        console.error('[DeliveryDashboard] GPS error', error);
        setGpsStatus('unavailable');
      }
    };

    startGPS();

    return () => {
      unsubscribeDeliveries();
      unsubscribePayouts();
      unsubscribeTripPayments();
      LocationTracker.stopTracking();
    };
  }, [setAgentOrders, setLastSynced, user?.id]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoadingImage(true);

    try {
      const url = await uploadImage(file);
      if (url) {
        await updateUser(user.id, { image: url });
        setUser({ ...user, image: url });
        addToast('Profile image updated! 📸', 'success');
      }
    } catch {
      addToast('Image upload failed', 'error');
    } finally {
      setLoadingImage(false);
    }
  }

  // Prefer trip-level payments (new system); fall back to legacy agent_payouts
  const hasTripPayments = todayTripPayments.length > 0;
  const totalEarnings = hasTripPayments
    ? todayTripPayments.reduce((sum, p) => sum + p.totalPayment, 0)
    : dailyPayouts.reduce((sum, p) => sum + p.amount, 0);
  const totalBaseEarnings = todayTripPayments.reduce((sum, p) => sum + p.basePayment, 0);
  const totalTiffinBonus = todayTripPayments.reduce((sum, p) => sum + p.tiffinBonus, 0);
  const totalDistanceKm = todayTripPayments.reduce((sum, p) => sum + p.totalDistanceKm, 0);
  const pendingPayouts = hasTripPayments
    ? todayTripPayments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.totalPayment, 0)
    : dailyPayouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const completedDeliveries = hasTripPayments
    ? todayTripPayments.reduce((sum, p) => sum + p.deliveredCount, 0)
    : dailyPayouts.length;
  const activeRuns = agentOrders.filter((order) => order.status !== 'delivered' && order.status !== 'failed_attempt');

  const validMarkers = [
    ...(currentLocation
      ? [
          {
            id: 'current-user',
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            title: 'You are here',
            isCurrentLocation: true,
          },
        ]
      : []),
    ...agentOrders
      .filter((order) => order.status !== 'delivered')
      .map((order) => ({
        id: order.id,
        lat: order.address?.lat,
        lng: order.address?.lng,
        title: `Customer ${order.customerId.slice(-4)}`,
        subtitle: order.address?.line1 || '',
      }))
      .filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng)),
  ];

  return (
    <div className="animate-fade-in space-y-5 pb-8">
      <div className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            Delivery cockpit
          </div>
          <h1 className="mt-3 text-[28px] font-black tracking-tight text-slate-900 sm:text-[32px]">Deliveries</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Your active route, payouts, and current tasks in one place.</p>
          {lastSynced && (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-500">
              <Clock className="h-3 w-3" />
              Offline sync at {lastSynced.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-14 h-14 overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] border border-slate-50 flex items-center justify-center hover:scale-[1.05] active:scale-[0.97] transition-all duration-300 shrink-0"
          >
            {user?.image ? (
              <Image src={getImageUrl(user.image)} alt={user.name || 'Profile'} fill className="object-cover" />
            ) : (
              <Image src="/assets/dabzo-logo.png" alt="Dabzo" width={48} height={48} priority className="object-contain" />
            )}

            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Camera className="h-4 w-4 text-white" />
            </span>

            {loadingImage && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/85">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              </span>
            )}
          </button>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />

          <button type="button" onClick={logout} className="btn-outline text-[10px]">
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-brand">
          Active runs: {activeRuns.length}
        </span>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
          Delivered: {completedDeliveries}
        </span>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
          Pending: ₹{pendingPayouts}
        </span>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Live route</p>
              <p className="mt-1 text-sm font-bold text-slate-900">Map and live positioning</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                gpsStatus === 'active'
                  ? 'bg-emerald-50 text-emerald-600'
                  : gpsStatus === 'checking'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-rose-50 text-rose-600'
              }`}
            >
              {gpsStatus === 'active' ? 'GPS live' : gpsStatus === 'checking' ? 'Checking' : 'Unavailable'}
            </span>
          </div>
        </div>
        <div className="p-3">
          <DeliveryMap centerLat={currentLocation?.lat} centerLng={currentLocation?.lng} markers={validMarkers} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Today&apos;s earnings</p>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-emerald-600">₹{totalEarnings.toFixed(2)}</p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Deliveries</p>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 shrink-0">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-slate-900">{completedDeliveries}</p>
        </div>

        {/* Earnings breakdown — shown only when trip payments exist (no placeholders) */}
        {hasTripPayments && (
          <div className="card col-span-2 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Earnings breakdown</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Base pay ({totalDistanceKm.toFixed(2)} km × ₹10)</span>
              <span className="font-black text-slate-900">₹{totalBaseEarnings.toFixed(2)}</span>
            </div>
            {totalTiffinBonus > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Tiffin bonus (&gt;14 tiffins)</span>
                <span className="font-black text-emerald-600">+₹{totalTiffinBonus.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-emerald-600">₹{totalEarnings.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="card col-span-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending payout</p>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-amber-600">₹{pendingPayouts.toFixed(2)}</p>
        </div>
      </div>


    </div>
  );
}
