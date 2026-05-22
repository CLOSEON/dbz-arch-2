'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { LocationTracker } from '@/lib/delivery/locationTracker';
import { verifyDeliveryOTP, updateDeliveryStatus } from '@/lib/queries/delivery';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { useDeliveryNavigation } from '@/hooks/useDeliveryNavigation';
import { 
  Navigation, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  Phone,
  Compass,
  Milestone
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DeliveryOrder, DeliveryStatus } from '@/types/delivery';

export default function DriverDeliveriesPage() {
  const user = useAuthStore((s) => s.user);
  const vendorOrders = useDeliveryStore((s) => s.vendorOrders);
  const setVendorOrders = useDeliveryStore((s) => s.setVendorOrders);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const { navigateTo } = useDeliveryNavigation();

  // Forms & Actions local state
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [otpErrors, setOtpErrors] = useState<Record<string, string>>({});
  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  // Filter & setup subscriptions
  const assignedOrders = vendorOrders.filter((o) => o.driverId === user?.id);

  // Monitor network connectivity changes
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

    // 1. Kick off throttled background live location updates
    LocationTracker.startTracking(user.id, user.name, user.phone).catch((err) => {
      console.error('[Deliveries] Failed to start location tracker:', err);
    });

    // 2. Setup real-time listener for today's orders assigned to this driver
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'delivery_orders'),
      where('driverId', '==', user.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder))
          .filter((order) => {
            if (!order.createdAt) return false;
            const ms = (order.createdAt as any).seconds
              ? (order.createdAt as any).seconds * 1000
              : new Date(order.createdAt as any).getTime();
            return ms >= start.getTime() && ms <= end.getTime();
          });
        setVendorOrders(list);
      },
      (err) => {
        console.error('[Deliveries] Query subscription error:', err);
        toast.error('Sync failed. Reconnecting...');
      }
    );

    // 3. Clear tracking on unmount
    return () => {
      LocationTracker.stopTracking().catch(console.error);
      unsubscribe();
    };
  }, [user?.id]);

  // Derived states
  const totalOrders = assignedOrders.length;
  const deliveredOrdersCount = assignedOrders.filter((o) => o.status === 'delivered').length;
  const deliveryProgressPct = totalOrders > 0 ? (deliveredOrdersCount / totalOrders) * 100 : 0;

  // Sorting: active deliveries at the top, completed/delivered at the bottom
  const sortedOrders = [...assignedOrders].sort((a, b) => {
    const isADelivered = a.status === 'delivered';
    const isBDelivered = b.status === 'delivered';
    if (isADelivered && !isBDelivered) return 1;
    if (!isADelivered && isBDelivered) return -1;
    return 0;
  });

  const handleOtpChange = (orderId: string, val: string) => {
    const cleanVal = val.replace(/\D/g, '').slice(0, 4); // Only digits, max 4
    setOtpValues((prev) => ({ ...prev, [orderId]: cleanVal }));
    setOtpErrors((prev) => ({ ...prev, [orderId]: '' })); // Clear error on change
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
      const res = await verifyDeliveryOTP(orderId, otp);
      if (res.success) {
        toast.success('Meal delivered successfully! 🎉');
        setExpandedId(null);
        setOtpValues((prev) => ({ ...prev, [orderId]: '' }));
      } else {
        setOtpErrors((prev) => ({
          ...prev,
          [orderId]: res.error || 'Wrong OTP — ask customer to check their app',
        }));
      }
    } catch (err: any) {
      setOtpErrors((prev) => ({
        ...prev,
        [orderId]: err.message || 'Verification failure. Please retry.',
      }));
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  const getStatusBadge = (status: DeliveryStatus) => {
    const config: Record<DeliveryStatus, { text: string; style: string }> = {
      pending: { text: 'Pending', style: 'bg-slate-50 text-slate-600 border-slate-200' },
      preparing: { text: 'Preparing', style: 'bg-amber-50 text-amber-600 border-amber-100' },
      picked_up: { text: 'Picked Up', style: 'bg-blue-50 text-blue-600 border-blue-100' },
      out_for_delivery: { text: 'In Transit', style: 'bg-orange-50 text-orange-600 border-orange-100 animate-pulse' },
      delivered: { text: 'Delivered', style: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
      failed: { text: 'Failed', style: 'bg-rose-50 text-rose-600 border-rose-100' },
      failed_attempt: { text: 'Failed Attempt', style: 'bg-rose-100 text-rose-700 border-rose-200' },
    };

    const item = config[status] || config.preparing;
    return (
      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border ${item.style}`}>
        {item.text}
      </span>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-28 animate-fade-in">
      {/* Offline Alert Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-amber-500 text-white px-6 py-3.5 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg sticky top-0 z-50 border-b border-amber-600/40"
          >
            <AlertTriangle className="w-4 h-4 animate-bounce text-amber-100" />
            Connection Lost. Operating Offline.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Tracking Header */}
      <div className="bg-gradient-to-b from-brand/10 to-slate-50 pt-8 pb-6 px-6 border-b border-slate-100">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
              Live Deliveries Fleet
            </span>
            <h1 className="text-[28px] font-black text-slate-900 tracking-tight mt-2.5">
              Today's Route
            </h1>
          </div>
          
          <div className="text-right">
            <span className="text-sm font-black text-slate-800">
              {deliveredOrdersCount} <span className="text-slate-400">/ {totalOrders}</span>
            </span>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Delivered
            </p>
          </div>
        </div>

        {/* SATISFYING PROGRESS BAR */}
        <div className="max-w-md mx-auto mt-5">
          <div className="w-full h-2.5 bg-slate-200/65 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${deliveryProgressPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-brand rounded-full shadow-[0_2px_8px_rgba(255,107,0,0.2)]"
            />
          </div>
        </div>
      </div>

      <div className="px-6 space-y-4 max-w-md mx-auto mt-4">
        {totalOrders === 0 ? (
          <div className="bg-gradient-to-b from-white to-slate-50 rounded-[2rem] p-10 text-center border border-slate-100 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-brand/10 rounded-full animate-ping opacity-50"></div>
              <div className="relative w-full h-full bg-white rounded-full flex items-center justify-center shadow-lg border border-slate-100 z-10">
                <Compass className="w-8 h-8 text-brand animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">No Route Active</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-[240px] mx-auto leading-relaxed">
              You're all caught up! New assignments will appear here automatically when kitchens hand over orders.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOrders.map((order) => {
              const isExpanded = expandedId === order.id;
              const isDelivered = order.status === 'delivered';
              const isTransit = order.status === 'out_for_delivery';
              
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl border transition-all duration-300 overflow-hidden shadow-sm ${
                    isExpanded ? 'border-brand/40 ring-1 ring-brand/10' : 'border-slate-100 hover:border-slate-200'
                  } ${isDelivered ? 'opacity-85' : ''}`}
                >
                  {/* Card Header Row */}
                  <div
                    onClick={() => !isDelivered && setExpandedId(isExpanded ? null : order.id)}
                    className={`p-4 sm:p-5 flex items-center justify-between cursor-pointer ${
                      isDelivered ? 'cursor-default bg-slate-50/50' : 'active:bg-slate-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors shrink-0 ${
                        isDelivered ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'
                      }`}>
                        {isDelivered ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <MapPin className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-xs sm:text-sm font-black leading-tight truncate ${isDelivered ? 'text-slate-500 line-through' : 'text-slate-950'}`}>
                          #{order.id.slice(-6).toUpperCase()}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5 truncate max-w-[120px] sm:max-w-[180px]">
                          {order.meal.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      {!isDelivered && (
                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Section */}
                  <AnimatePresence initial={false}>
                    {isExpanded && !isDelivered && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden border-t border-slate-50 bg-slate-50/30"
                      >
                        <div className="p-5 space-y-4">
                          {/* Address & Landmark Information */}
                          <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Milestone className="w-3.5 h-3.5 text-slate-300" />
                              Drop Point Details
                            </span>
                            <p className="text-xs text-slate-700 font-black leading-relaxed mt-1">
                              {order.address.line1}
                            </p>
                            {order.address.landmark && (
                              <p className="text-[10px] text-brand font-bold bg-brand/5 px-2 py-0.5 rounded inline-block mt-1">
                                Landmark: {order.address.landmark}
                              </p>
                            )}
                          </div>

                          {/* Navigation & Action Triggers */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                if (order.status !== 'out_for_delivery') {
                                  updateDeliveryStatus(order.id, 'out_for_delivery', user?.id).catch(console.error);
                                }
                                navigateTo(`${order.address.lat},${order.address.lng}`);
                              }}
                              className="w-full bg-slate-900 text-white rounded-2xl py-3 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              Navigate GPS
                            </button>
                            
                            <a
                              href="tel:+919999999999" // Fallback phone connection
                              className="w-full bg-white border border-slate-100 hover:border-slate-200 text-slate-600 rounded-2xl py-3 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              Call Customer
                            </a>
                          </div>

                          {/* OTP verification block */}
                          <div className="border-t border-slate-100 pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                Proof of Delivery OTP
                              </label>
                              <span className="text-[9px] text-slate-400 font-medium">4-Digit Code</span>
                            </div>

                            <div className="flex gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                placeholder="0 0 0 0"
                                value={otpValues[order.id] || ''}
                                onChange={(e) => handleOtpChange(order.id, e.target.value)}
                                className="bg-white border border-slate-100 focus:border-brand rounded-2xl px-4 py-3.5 text-center text-sm font-black tracking-widest text-slate-900 placeholder:text-slate-300 placeholder:tracking-normal w-28 focus:outline-none focus:ring-1 focus:ring-brand/10 transition-colors shadow-sm"
                              />

                              <button
                                onClick={() => handleConfirmDelivery(order.id)}
                                disabled={submittingIds[order.id] || (otpValues[order.id]?.length !== 4)}
                                className="flex-1 bg-brand text-white rounded-2xl text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md shadow-brand/20 disabled:opacity-50 disabled:shadow-none"
                              >
                                {submittingIds[order.id] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Confirm Delivery'
                                )}
                              </button>
                            </div>

                            {/* OTP Validation Failure Display */}
                            {otpErrors[order.id] && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-rose-50 border border-rose-100 rounded-2xl p-3 flex items-start gap-2 text-rose-700"
                              >
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold leading-tight">
                                  {otpErrors[order.id]}
                                </p>
                              </motion.div>
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
