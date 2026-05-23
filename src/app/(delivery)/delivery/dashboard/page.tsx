'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { subscribeToAgentDeliveries } from '@/lib/queries/delivery';
import { useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryActionBar } from '@/components/delivery/DeliveryActionBar';
import { useDeliveryNavigation } from '@/hooks/useDeliveryNavigation';
import { Truck, Navigation, Clock, CheckCircle2, Loader2, Camera, MapPinOff } from 'lucide-react';
import Image from 'next/image';
import { uploadImage, getImageUrl } from '@/lib/storage';
import { updateUser } from '@/lib/queries/users';
import { Geolocation } from '@capacitor/geolocation';
import dynamic from 'next/dynamic';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { AgentPayout, agentPayoutConverter } from '@/types/payout';
import toast from 'react-hot-toast';

// Dynamically import the map to prevent SSR issues with Leaflet
const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center animate-pulse">
      <Navigation className="w-8 h-8 text-slate-300" />
    </div>
  )
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
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Real GPS Status from Capacitor
  const [gpsStatus, setGpsStatus] = useState<'checking' | 'active' | 'unavailable'>('checking');
  
  // Agent Payouts State
  const [dailyPayouts, setDailyPayouts] = useState<AgentPayout[]>([]);

  const { navigateTo } = useDeliveryNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    // 1. Subscribe to Agent Deliveries
    const unsubscribeDeliveries = subscribeToAgentDeliveries(user.id, (orders, fromCache) => {
      setAgentOrders(orders);
      setLastSynced(fromCache ? new Date() : null);
      setLoading(false);
    });

    // 2. Subscribe to Agent Payouts for Today
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const payoutsQuery = query(
      collection(db, 'agent_payouts').withConverter(agentPayoutConverter),
      where('agentId', '==', user.id),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    );

    const unsubscribePayouts = onSnapshot(payoutsQuery, (snap) => {
      const payouts = snap.docs.map(d => d.data());
      setDailyPayouts(payouts);
    });

    // 3. Real Capacitor Geolocation Watch
    let watchId: string | null = null;
    const startGPS = async () => {
      try {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const req = await Geolocation.requestPermissions();
          if (req.location !== 'granted') {
            setGpsStatus('unavailable');
            return;
          }
        }
        
        watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
          if (err || !position) {
            setGpsStatus('unavailable');
            return;
          }
          setGpsStatus('active');
          setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        });
      } catch (error) {
        console.error("GPS Error", error);
        setGpsStatus('unavailable');
      }
    };
    startGPS();

    return () => {
      unsubscribeDeliveries();
      unsubscribePayouts();
      if (watchId !== null) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [user?.id, setAgentOrders, setLastSynced]); 

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
    } catch (err) {
      addToast('Image upload failed', 'error');
    } finally {
      setLoadingImage(false);
    }
  }

  // Calculate earnings from the canonical payouts collection
  const totalEarnings = dailyPayouts.reduce((sum, p) => sum + p.amount, 0);
  const pendingPayouts = dailyPayouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const completedDeliveries = dailyPayouts.length;

  const activeRuns = agentOrders.filter(d => d.status !== 'delivered' && d.status !== 'failed_attempt');

  return (
    <div className="space-y-6 pb-6 animate-fade-in z-0">
      {/* Header */}
      <div className="flex items-start justify-between mt-4 px-1 gap-3">
        <div>
          <h1 className="text-[32px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight">
            Deliveries
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Your assigned tasks for today
          </p>
          {lastSynced && (
            <p className="text-xs font-bold text-amber-500 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Offline (Last Synced: {lastSynced.toLocaleTimeString()})
            </p>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-3 z-10">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center text-white text-xl font-bold shadow-md overflow-hidden cursor-pointer group shrink-0"
          >
            {user?.image ? (
              <Image 
                src={getImageUrl(user.image)} 
                alt={user.name || 'Profile'} 
                fill 
                className="object-cover" 
              />
            ) : (
              <span>{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
            )}
            
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>

            {loadingImage && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageChange} 
          />
          <button
            onClick={logout}
            className="btn-outline text-[9px] py-1 px-3"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-1">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
          Active Runs: {activeRuns.length}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600">
          Delivered: {completedDeliveries}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-50 text-amber-600">
          Pending: ₹{pendingPayouts}
        </span>
      </div>

      {/* Map Integration */}
      <DeliveryMap 
        centerLat={currentLocation?.lat || undefined} 
        centerLng={currentLocation?.lng || undefined} 
        markers={[
          ...(currentLocation ? [{
            id: 'current-user',
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            title: 'You are here',
            isCurrentLocation: true
          }] : []),
          ...agentOrders.filter(d => d.status !== 'delivered').map(d => ({
            id: d.id,
            lat: d.address?.lat || 0,
            lng: d.address?.lng || 0,
            title: `Customer ${d.customerId.slice(-4)}`,
            subtitle: d.address?.line1 || ''
          })).filter(m => m.lat && m.lng)
        ]}
      />

      {/* Live Tracking Status */}
      <div className={`border rounded-3xl p-4 flex items-center justify-between ${gpsStatus === 'active' ? 'bg-emerald-50 border-emerald-100' : gpsStatus === 'checking' ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${gpsStatus === 'active' ? 'bg-emerald-500 animate-pulse' : gpsStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`}>
            {gpsStatus === 'unavailable' ? <MapPinOff className="w-4 h-4 text-white" /> : <Navigation className="w-4 h-4 text-white" />}
          </div>
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider ${gpsStatus === 'active' ? 'text-emerald-700' : gpsStatus === 'checking' ? 'text-amber-700' : 'text-rose-700'}`}>
              {gpsStatus === 'active' ? 'GPS Active' : gpsStatus === 'checking' ? 'GPS Checking...' : 'GPS Unavailable'}
            </p>
            <p className={`text-[10px] font-medium ${gpsStatus === 'active' ? 'text-emerald-600' : gpsStatus === 'checking' ? 'text-amber-600' : 'text-rose-600'}`}>
              {gpsStatus === 'active' ? 'Tracking your live location' : gpsStatus === 'checking' ? 'Requesting permissions' : 'Location services denied'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(i => <div key={i} className={`w-1 h-1 rounded-full ${gpsStatus === 'active' ? 'bg-emerald-300' : gpsStatus === 'checking' ? 'bg-amber-300' : 'bg-rose-300'}`} />)}
        </div>
      </div>

      {/* Stats - Breakdown Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Earnings</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-3xl font-black text-emerald-600 leading-none">₹{totalEarnings}</h3>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deliveries</p>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-3xl font-black text-slate-900 leading-none">{completedDeliveries}</h3>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Payout</p>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-3xl font-black text-amber-500 leading-none">₹{pendingPayouts}</h3>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 ml-1">Current Tasks</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-white rounded-3xl animate-pulse shadow-sm border border-slate-50" />
            ))}
          </div>
        ) : activeRuns.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center text-center shadow-sm border border-slate-50">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Truck className="w-8 h-8 text-slate-200" />
            </div>
            <p className="font-bold text-slate-900">All caught up!</p>
            <p className="text-xs text-slate-400 mt-1">No pending deliveries assigned to you.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeRuns.map((delivery) => (
              <div key={delivery.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 group">
                <div className="flex justify-between items-start gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand flex items-center justify-center shadow-sm">
                      <Navigation className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">Order: {delivery.id.slice(-6)}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{delivery.meal?.name || 'Meal'}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    delivery.status === 'picked_up' || delivery.status === 'out_for_delivery' ? 'bg-brand-50 text-brand' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {delivery.status.replace('_', ' ')}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4 ml-1">
                  <div className="flex items-start gap-2">
                    <Navigation className="w-3 h-3 text-slate-300 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-500 font-medium leading-tight">{delivery.address?.line1}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                    <p className="text-xs text-slate-500 font-medium">{delivery.meal?.type === 'lunch' ? 'Lunch Slot' : 'Dinner Slot'}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <DeliveryActionBar orderId={delivery.id} status={delivery.status} />
                  <button 
                    onClick={() => {
                      const lat = delivery.address?.lat;
                      const lng = delivery.address?.lng;
                      if (typeof lat === 'number' && typeof lng === 'number') {
                        navigateTo(`${lat},${lng}`);
                        return;
                      }
                      if (delivery.address?.line1) {
                        navigateTo(delivery.address.line1);
                        return;
                      }
                      toast.error('No location found for this order');
                    }}
                    className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-brand-50 hover:text-brand transition-colors border border-slate-100"
                    title="GPS Navigation"
                  >
                    <Navigation className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
