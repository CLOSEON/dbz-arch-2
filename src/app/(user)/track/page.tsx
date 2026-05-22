'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { subscribeToMyDelivery } from '@/lib/queries/delivery';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { 
  ChefHat, 
  Truck, 
  MapPin, 
  CheckCircle2, 
  Phone, 
  Navigation, 
  Clock, 
  ShieldCheck, 
  MessageSquare, 
  AlertTriangle,
  UserCheck,
  Star,
  Loader2
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { DeliveryOrder, DeliveryStatus } from '@/types/delivery';

// Dynamically import Leaflet Map to bypass SSR restrictions
const MapWrapper = dynamic(() => import('@/components/delivery/DeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center animate-pulse gap-2">
      <CompassIcon className="w-8 h-8 text-slate-300 animate-spin" />
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hydrating Live Map</span>
    </div>
  ),
});

function CompassIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

export default function CustomerTrackPage() {
  const user = useAuthStore((s) => s.user);

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Status index mapping
  const statusSteps: { key: DeliveryStatus; label: string; icon: any }[] = [
    { key: 'preparing', label: 'Preparing', icon: ChefHat },
    { key: 'picked_up', label: 'Picked up', icon: Truck },
    { key: 'out_for_delivery', label: 'En Route', icon: Navigation },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  ];

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getTodayDateString();

  // 1. Snapshot Subscription for active delivery order
  useEffect(() => {
    if (!user?.id) return;

    setLoading(true);
    const unsubscribe = subscribeToMyDelivery(user.id, today, (deliveryOrder) => {
      setOrder(deliveryOrder);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // 2. Snapshot Subscription for Order Notifications
  useEffect(() => {
    if (!order?.id) return;

    const notifRef = collection(db, 'delivery_orders', order.id, 'notifications');
    const q = query(notifRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timeString: data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }) : 'Just Now',
        };
      });
      setNotifications(list);
    });

    return () => unsubscribe();
  }, [order?.id]);

  // Find active step index
  const currentStepIndex = order
    ? statusSteps.findIndex((step) => step.key === order.status)
    : 0;

  // Driver phone dialer using Capacitor native plugin pattern
  const handleCallDriver = (phone: string) => {
    try {
      if (Capacitor.isNativePlatform() && (Capacitor as any).Plugins?.Phone) {
        (Capacitor as any).Plugins.Phone.call({ number: phone });
      } else {
        window.open(`tel:${phone}`, '_self');
      }
    } catch (err) {
      window.open(`tel:${phone}`, '_self');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 pb-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Connecting Real-time GPS...
          </p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 pt-16 pb-24">
        <div className="bg-white rounded-[2rem] p-10 text-center border border-slate-100 shadow-sm flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-4">
            <Clock className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-black text-slate-900 text-base">No Deliveries Today</p>
          <p className="text-xs text-slate-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
            Your tiffin order is not active or hasn't started dispatching yet for the {today} session.
          </p>
        </div>
      </div>
    );
  }

  // Check map visibility constraints (status >= 'out_for_delivery')
  const isMapVisible = order.status === 'out_for_delivery' || order.status === 'delivered';
  const driverLoc = order.driverLocation;

  return (
    <main className="min-h-screen bg-slate-50 pb-28 animate-fade-in">
      {/* Title */}
      <div className="pt-8 pb-4 px-6 max-w-md mx-auto">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
          Live Dispatch
        </span>
        <h1 className="text-[28px] font-black text-slate-900 tracking-tight leading-tight mt-2.5">
          Track Delivery
        </h1>
      </div>

      <div className="px-6 space-y-6 max-w-md mx-auto">
        {/* 1. STATUS STEPPER */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-5">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Transit Progress
            </span>
            <span className="text-[10px] font-black uppercase text-brand bg-brand/5 px-2 py-0.5 rounded">
              {order.status.replace('_', ' ')}
            </span>
          </div>

          <div className="relative flex justify-between items-center">
            {/* Background Line */}
            <div className="absolute left-4 right-4 h-1 bg-slate-100 top-4 -z-10 rounded-full" />
            
            {/* Animated Highlight Line */}
            <div className="absolute left-4 right-4 h-1 top-4 -z-10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(currentStepIndex / (statusSteps.length - 1)) * 100}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-brand"
              />
            </div>

            {statusSteps.map((step, idx) => {
              const StepIcon = step.icon;
              const isPast = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              
              return (
                <div key={step.key} className="flex flex-col items-center">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.15 : 1,
                      backgroundColor: isPast || isActive ? 'var(--color-brand, #ff6b00)' : '#f8fafc',
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center border shadow-sm transition-colors ${
                      isPast || isActive 
                        ? 'border-brand text-white bg-brand' 
                        : 'border-slate-100 text-slate-300 bg-slate-50'
                    }`}
                  >
                    <StepIcon className="w-4 h-4" />
                  </motion.div>
                  <span className={`text-[9px] font-black uppercase tracking-wider mt-2.5 ${
                    isActive ? 'text-brand' : isPast ? 'text-slate-600' : 'text-slate-300'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. ORDER INFO CARD */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Active Meal Subscription
              </p>
              <h3 className="text-base font-black text-slate-900 mt-1">
                {order.meal.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                  order.meal.type === 'lunch' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {order.meal.type}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <span className="text-[10px] text-slate-500 font-bold">
                  Slotted ETA: {order.meal.type === 'lunch' ? '1:30 PM' : '8:30 PM'}
                </span>
              </div>
            </div>
            
            <div className="w-12 h-12 rounded-2xl bg-brand/5 text-brand flex items-center justify-center font-black text-lg shadow-inner">
              🍱
            </div>
          </div>

          {/* Secure OTP proof-of-delivery notice */}
          {order.status !== 'delivered' && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Handover PIN code
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">Provide code to driver at door</p>
                </div>
              </div>
              <span className="text-lg font-black tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100/40 px-3 py-1 rounded-xl">
                {order.otp}
              </span>
            </div>
          )}
        </div>

        {/* 3. LIVE MAP SECTION */}
        {isMapVisible ? (
          driverLoc ? (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                Live Transit Tracking
              </span>
              {/* Load dynamically responsive Leaflet wrapper */}
              <MapWrapper
                centerLat={driverLoc.lat}
                centerLng={driverLoc.lng}
                markers={[
                  {
                    id: 'driver',
                    lat: driverLoc.lat,
                    lng: driverLoc.lng,
                    title: 'Your Tiffin Driver',
                    subtitle: 'En route with your hot meal',
                  },
                  {
                    id: 'customer',
                    lat: order.address.lat,
                    lng: order.address.lng,
                    title: 'Your Location',
                    subtitle: order.address.line1,
                    isCurrentLocation: true,
                  },
                ]}
              />
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 text-center flex flex-col items-center justify-center shadow-sm">
              <Navigation className="w-10 h-10 text-slate-200 mb-2 animate-bounce" />
              <p className="text-xs font-bold text-slate-900">Routing GPS Booting...</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Map will be available once the driver begins driving to your drop point.
              </p>
            </div>
          )
        ) : (
          <div className="bg-white rounded-3xl p-6 border border-slate-100 text-center flex flex-col items-center justify-center shadow-sm">
            <Clock className="w-10 h-10 text-slate-200 mb-2" />
            <p className="text-xs font-bold text-slate-900">Map unavailable until transit</p>
            <p className="text-[10px] text-slate-400 mt-1">
              Live updates will unlock as soon as your driver picks up the box.
            </p>
          </div>
        )}

        {/* 4. DRIVER INFO CARD */}
        {currentStepIndex >= 1 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                  <UserCheck className="w-6 h-6 text-brand" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Assigned Partner
                  </span>
                  <h4 className="text-sm font-black text-slate-900 leading-tight mt-0.5">
                    Dabzo Rider Fleet
                  </h4>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-[10px] text-slate-500 font-bold">4.8 Rating</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleCallDriver('+919999999999')}
                className="w-12 h-12 rounded-2xl bg-brand hover:bg-brand-600 text-white flex items-center justify-center shadow-md shadow-brand/20 active:scale-95 transition-all"
                title="Call Rider"
              >
                <Phone className="w-5 h-5" />
              </button>
            </div>

            <div className="border-t border-slate-50 pt-3 flex justify-between text-xs">
              <span className="font-bold text-slate-400">Vehicle Registration:</span>
              <span className="font-black text-slate-700">DL 3C AB 8291</span>
            </div>
          </div>
        )}

        {/* 5. NOTIFICATION FEED */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Live Logs & Broadcasts
            </h2>
          </div>

          {notifications.length === 0 ? (
            <div className="bg-white rounded-3xl p-5 text-center border border-slate-100 text-slate-400 text-[10px] font-bold shadow-sm">
              No delivery alerts broadcasted yet.
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {notifications.map((notif, index) => (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`rounded-2xl p-4 border shadow-sm flex items-start gap-3 ${
                      notif.type === 'delay_alert'
                        ? 'bg-amber-50/70 border-amber-100 text-amber-900'
                        : 'bg-white border-slate-100 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      notif.type === 'delay_alert' ? 'bg-amber-500 text-white animate-bounce' : 'bg-slate-50 text-slate-400'
                    }`}>
                      {notif.type === 'delay_alert' ? (
                        <AlertTriangle className="w-4.5 h-4.5" />
                      ) : (
                        <Clock className="w-4.5 h-4.5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {notif.type === 'delay_alert' ? 'Delay alert' : 'Order Update'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0">
                          {notif.timeString}
                        </span>
                      </div>
                      <p className="text-xs font-medium leading-relaxed mt-1">
                        {notif.message}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
