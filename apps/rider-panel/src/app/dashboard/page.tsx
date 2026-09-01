'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { 
  Camera, 
  Navigation, 
  MapPin, 
  PackageOpen, 
  Truck, 
  Store, 
  LogOut, 
  Phone, 
  X, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  ShieldCheck,
  Compass,
  ListOrdered,
  AlertCircle
} from 'lucide-react';
import Image from 'next/image';
import { getImageUrl, uploadImage } from '@/lib/storage';
import { updateUser } from '@/lib/queries/users';
import toast from 'react-hot-toast';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, updateDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import { SwipeToConfirm } from '@/components/ui/SwipeToConfirm';
import { PendingVerificationScreen } from '@/components/shared/PendingVerificationScreen';
import { VegIcon, NonVegIcon, DietaryBadge } from '@/components/shared/DietaryIcon';
import { generateBoxTag } from '@/lib/boxTag';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

export default function RiderDashboard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const activeTrip = useDeliveryStore((s) => s.activeTrip);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);

  const isSuper = user?.email?.toLowerCase().trim() === 'closeon.st@gmail.com' || (user as any)?.is_superadmin === true;
  const isRiderRole = user?.role === 'delivery' || user?.role === 'admin' || isSuper;
  const isVerifiedRider = isSuper || ((user?.is_approved === true || user?.verification_status === 'verified') && user?.is_rejected !== true && (user as any)?.is_suspended !== true && user?.verification_status !== 'rejected' && user?.verification_status !== 'details_requested');

  const [isMounting, setIsMounting] = useState(true);
  const [loadingImage, setLoadingImage] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [viewTab, setViewTab] = useState<'active' | 'itinerary'>('active');
  const failedOrdersRef = useRef<Set<string>>(new Set());

  // Vendor Pickup OTP modal & Count
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [vendorOTP, setVendorOTP] = useState('');
  const [verifyingOTP, setVerifyingOTP] = useState(false);
  const [currentVendorId, setCurrentVendorId] = useState<string | null>(null);
  const [pickupStep, setPickupStep] = useState<'otp' | 'count'>('otp');
  const [vendorDeclaredCount, setVendorDeclaredCount] = useState<number>(0);
  const [riderConfirmedCount, setRiderConfirmedCount] = useState<string>('');

  // Customer Drop-off OTP modal
  const [showDropoffModal, setShowDropoffModal] = useState(false);
  const [dropoffOTP, setDropoffOTP] = useState('');
  const [verifyingDropoffOTP, setVerifyingDropoffOTP] = useState(false);
  const [currentDropoffOrderId, setCurrentDropoffOrderId] = useState<string | null>(null);

  const [unavailabilityStartTimes, setUnavailabilityStartTimes] = useState<Record<string, number>>({});
  const [nowTick, setNowTick] = useState(Date.now());
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photoProof, setPhotoProof] = useState<File | null>(null);
  const [uploadingPhotoProof, setUploadingPhotoProof] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Offline-First Sync Loop
  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function syncOfflineQueue() {
      if (!navigator.onLine) return;
      const queue = JSON.parse(localStorage.getItem('offline_deliveries') || '[]');
      if (queue.length === 0) return;

      const successfulSyncs: string[] = [];

      for (const item of queue) {
        try {
          await updateDoc(doc(db, 'orders', item.orderId), {
            status: 'delivered',
            delivery_photo_url: item.photoUrl || null,
            updated_at: new Date(),
            'timestamps.deliveredAt': new Date(),
            delivery_method: item.photoUrl ? 'photo_proof_offline' : 'otp_offline'
          });
          successfulSyncs.push(item.orderId);
        } catch (err) {
          console.error('[Offline Sync] Failed to sync order:', item.orderId, err);
        }
      }

      const remaining = queue.filter((item: any) => !successfulSyncs.includes(item.orderId));
      localStorage.setItem('offline_deliveries', JSON.stringify(remaining));
      if (successfulSyncs.length > 0) {
        toast.success(`Synced ${successfulSyncs.length} offline deliveries! 📶`);
      }
    }

    const interval = setInterval(syncOfflineQueue, 15000);
    window.addEventListener('online', syncOfflineQueue);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', syncOfflineQueue);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounting(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Customer unavailability countdown handler
  useEffect(() => {
    const expired = Object.entries(unavailabilityStartTimes).filter(
      ([, start]) => Date.now() - start >= 600_000
    );
    expired.forEach(([orderId]) => {
      void handleCustomerUnavailable(orderId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  // Sync isOnline state from Firestore
  useEffect(() => {
    if (!user?.id) return;
    const profileRef = doc(db, 'driver_profiles', user.id);
    const unsub = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.isActive === 'boolean') {
          setIsOnline(data.isActive);
        }
      }
    }, () => { /* silently fail */ });
    return () => unsub();
  }, [user?.id]);

  const handleToggleOnline = useCallback(async (newValue: boolean) => {
    setIsOnline(newValue);
    if (!user?.id) return;
    try {
      await updateDoc(doc(db, 'driver_profiles', user.id), {
        isActive: newValue,
        lastActive: new Date()
      });
    } catch {
      try {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'driver_profiles', user.id), {
          id: user.id,
          isActive: newValue,
          lastActive: new Date()
        }, { merge: true });
      } catch (e) {
        console.warn('Could not update online status:', e);
      }
    }
  }, [user?.id]);

  // Customer profiles for drop-off enrichment
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, { name: string; phone?: string; image?: string; address?: string }>>({});

  useEffect(() => {
    if (!agentOrders.length) return;
    const customerIds = [...new Set(agentOrders.map(o => (o as any).customerId || (o as any).user_id).filter(Boolean))];
    if (!customerIds.length) return;
    Promise.all(
      customerIds.map(async (id: string) => {
        const snap = await getDoc(doc(db, 'users', id));
        if (snap.exists()) {
          const d = snap.data();
          return [id, { name: d.name || d.displayName || 'Customer', phone: d.phone || d.phone_number, image: d.image, address: d.address || d.location_address }] as const;
        }
        return null;
      })
    ).then(results => {
      const map: Record<string, { name: string; phone?: string; image?: string; address?: string }> = {};
      results.forEach(r => { if (r) map[r[0]] = r[1]; });
      setCustomerProfiles(map);
    }).catch(err => {
      console.error('[RiderDashboard] Failed to fetch customer profiles:', err);
    });
  }, [agentOrders]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setLoadingImage(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        await updateUser(user.id, { image: url });
        setUser({ ...user, image: url });
        toast.success('Profile image updated!');
      }
    } catch {
      toast.error('Image upload failed');
    } finally {
      setLoadingImage(false);
    }
  }

  const [riderLocation, setRiderLocation] = useState<{lat: number, lng: number} | null>(null);
  const [vendors, setVendors] = useState<any[]>([]);

  // GPS watch position & push to Firestore
  useEffect(() => {
    const pushLocation = (loc: {lat: number, lng: number}) => {
      setRiderLocation(loc);
      if (user?.id) {
        import('firebase/firestore').then(({ doc: d, setDoc }) => {
          setDoc(d(db, 'driver_profiles', user.id), {
            id: user.id,
            isActive: true,
            currentLocation: loc,
            lastActive: new Date()
          }, { merge: true }).catch(err => console.warn('Failed to update driver location:', err.message));
        });
      }
    };

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => pushLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn("Geolocation warning:", err.message);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [user?.id]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'vendor'));
        const snap = await getDocs(q);
        setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("[RiderDashboard] Failed to fetch vendors:", err);
      }
    };
    if (user?.id) fetchVendors();
  }, [user?.id]);

  function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }

  // ── Vendor Pickup OTP Verify & Confirm ───────────────────────────────────
  const handleOTPVerify = async () => {
    if (!activeTrip || !currentVendorId || vendorOTP.length !== 4) return;
    setVerifyingOTP(true);
    try {
      const tripRef = doc(db, 'rider_trips', activeTrip.id);
      const tripSnap = await getDoc(tripRef);
      if (!tripSnap.exists()) throw new Error('Trip not found');
      const tripData = tripSnap.data();

      let isValid = false;
      const batchIds = tripData.batch_ids || [];
      let batchDocs: any[] = [];
      
      if (batchIds.length > 0) {
        batchDocs = await Promise.all(batchIds.map((id: string) => getDoc(doc(db, 'batches', id))));
        const validOTPs = batchDocs.map(d => String(d.data()?.pickup_otp)).filter(Boolean);
        isValid = validOTPs.includes(String(vendorOTP));
      }

      if (!isValid && tripData.pickupStops) {
        const vendorStop = tripData.pickupStops.find((s: any) => s.vendorId === currentVendorId);
        if (vendorStop && String(vendorStop.pickupOTP) === String(vendorOTP)) {
          isValid = true;
        }
      }

      if (!isValid) {
        toast.error("Invalid Pickup OTP. Please check with the kitchen chef.");
        return;
      }

      const vendorStop = tripData.pickupStops?.find((s: any) => s.vendorId === currentVendorId);
      const expectedCount = vendorStop?.expectedTiffinCount || 0;
      setVendorDeclaredCount(expectedCount);
      setRiderConfirmedCount(String(expectedCount));
      setPickupStep('count');

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to verify OTP');
    } finally {
      setVerifyingOTP(false);
    }
  };

  const handleCountConfirm = async () => {
    if (!activeTrip || !currentVendorId) return;
    const confirmedCountInt = parseInt(riderConfirmedCount, 10);
    if (isNaN(confirmedCountInt) || confirmedCountInt < 0) {
      toast.error("Please enter a valid tiffin count.");
      return;
    }

    setVerifyingOTP(true);
    try {
      const tripRef = doc(db, 'rider_trips', activeTrip.id);
      const tripSnap = await getDoc(tripRef);
      if (!tripSnap.exists()) throw new Error('Trip not found');
      const tripData = tripSnap.data();

      const batch = writeBatch(db);

      const pickupStops = tripData.pickupStops || [];
      let justCompletedVendorId: string | null = null;
      let allPickupsCompleted = true;

      const updatedStops = pickupStops.map((stop: any) => {
        if (stop.status !== 'completed' && stop.vendorId === currentVendorId && !justCompletedVendorId) {
          justCompletedVendorId = stop.vendorId;
          return { ...stop, status: 'completed', confirmedCount: confirmedCountInt };
        }
        if (stop.status !== 'completed') allPickupsCompleted = false;
        return stop;
      });

      const newTripStatus = allPickupsCompleted ? 'pickup_complete' : 'picking_up';
      
      batch.update(tripRef, {
        pickupStops: updatedStops,
        status: newTripStatus,
        updatedAt: new Date()
      });

      let assignedOrderIds: string[] = tripData.assignedOrderIds || [];
      if (assignedOrderIds.length === 0 && tripData.dropoffStops) {
        assignedOrderIds = tripData.dropoffStops.map((s: any) => s.orderId).filter(Boolean);
      }

      for (const oId of assignedOrderIds) {
        const oData = agentOrders.find(o => o.id === oId) as any;
        if (oData && (oData.vendor_id === justCompletedVendorId || oData.vendorId === justCompletedVendorId)) {
          batch.update(doc(db, 'orders', oId), {
            status: allPickupsCompleted ? 'out_for_delivery' : 'picked_up',
            updated_at: new Date()
          });
        } else if (oData && allPickupsCompleted) {
          batch.update(doc(db, 'orders', oId), {
            status: 'out_for_delivery',
            updated_at: new Date()
          });
        }
      }

      await batch.commit();

      toast.success(allPickupsCompleted ? 'All Kitchen Pickups Done! Proceeding to Customer Drop-offs 🚀' : 'Kitchen Pickup Completed! Proceeding to next stop.');
      setShowOTPModal(false);
      setVendorOTP('');
      setPickupStep('otp');
      setCurrentVendorId(null);

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to confirm pickup');
    } finally {
      setVerifyingOTP(false);
    }
  };

  // ── Customer Drop-off Handlers ───────────────────────────────────────────
  const handleDropoffOTPVerify = async () => {
    if (!activeTrip || !currentDropoffOrderId || dropoffOTP.length !== 4) return;
    setVerifyingDropoffOTP(true);
    try {
      const orderRef = doc(db, 'orders', currentDropoffOrderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');
      
      const orderData = orderSnap.data();
      const expectedOTP = orderData.delivery_otp || orderData.otp;

      if (expectedOTP && String(expectedOTP) !== String(dropoffOTP)) {
        toast.error('Invalid Customer Drop-off OTP. Please verify with customer.');
        return;
      }

      try {
        await updateDoc(orderRef, {
          status: 'delivered',
          updated_at: new Date(),
          'timestamps.deliveredAt': new Date(),
          delivery_method: 'otp'
        });

        const remainingDrops = agentOrders.filter(o => o.id !== currentDropoffOrderId && o.status !== 'delivered' && o.status !== 'failed');
        if (remainingDrops.length === 0) {
          await updateDoc(doc(db, 'rider_trips', activeTrip.id), {
            status: 'completed',
            updatedAt: new Date()
          });
        }
        toast.success('Delivery completed! 🎉');
      } catch {
        const queue = JSON.parse(localStorage.getItem('offline_deliveries') || '[]');
        queue.push({ orderId: currentDropoffOrderId, timestamp: Date.now() });
        localStorage.setItem('offline_deliveries', JSON.stringify(queue));
        toast.success('Offline: Delivery queued for auto-sync! 📶');
      }

      setShowDropoffModal(false);
      setDropoffOTP('');
      setCurrentDropoffOrderId(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to complete delivery');
    } finally {
      setVerifyingDropoffOTP(false);
    }
  };

  const handleCustomerUnavailable = useCallback(async (orderId: string) => {
    if (!activeTrip) return;
    if (failedOrdersRef.current.has(orderId)) return;
    failedOrdersRef.current.add(orderId);
    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      if (!orderSnap.exists()) throw new Error('Order not found');
      
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'orders', orderId), {
        status: 'failed',
        failure_reason: 'customer_unavailable',
        updated_at: new Date()
      });

      const reviewRef = doc(collection(db, 'failed_delivery_reviews'));
      batch.set(reviewRef, {
        order_id: orderId,
        batch_id: orderSnap.data().batch_id || null,
        rider_id: activeTrip.riderId,
        failed_at: new Date(),
        reviewed: false
      });

      const remainingDrops = agentOrders.filter(o => o.id !== orderId && o.status !== 'delivered' && o.status !== 'failed');
      if (remainingDrops.length === 0) {
        batch.update(doc(db, 'rider_trips', activeTrip.id), {
          status: 'completed',
          updatedAt: new Date()
        });
      }

      await batch.commit();
      toast.error('Delivery marked as failed (Customer Unavailable)');
      
      setUnavailabilityStartTimes(prev => {
        const newTimers = { ...prev };
        delete newTimers[orderId];
        return newTimers;
      });

    } catch (err: any) {
      console.error(err);
      failedOrdersRef.current.delete(orderId);
      toast.error(err.message || 'Failed to mark as unavailable');
    }
  }, [activeTrip, agentOrders]);

  // ── Derive Ordered Route Itinerary ───────────────────────────────────────
  // STRICT RULE: All Vendor Pickups FIRST (1..N) ➔ All Customer Drop-offs NEXT (N+1..M)
  const pickupStopsList = activeTrip?.pickupStops || [];
  const pendingPickups = pickupStopsList.filter((s: any) => s.status !== 'completed');
  
  let remainingDrops = agentOrders.filter(o => o.status !== 'delivered' && o.status !== 'failed');
  if (activeTrip?.dropStops) {
    remainingDrops.sort((a, b) => {
      const stopA = activeTrip!.dropStops!.find((s: any) => s.orderId === a.id);
      const stopB = activeTrip!.dropStops!.find((s: any) => s.orderId === b.id);
      return (stopA?.sequence || 999) - (stopB?.sequence || 999);
    });
  }

  let currentState = 'IDLE';
  let nextPickup: any = null;

  if (activeTrip) {
    if (pendingPickups.length > 0) {
      currentState = 'ASSIGNED';
      nextPickup = pendingPickups[0];
    } else if (remainingDrops.length > 0) {
      currentState = 'DELIVERING';
    }
  }

  const completedDropsCount = agentOrders.filter(o => o.status === 'delivered').length;
  const totalDropsCount = agentOrders.length;
  const totalPickupsCount = pickupStopsList.length;
  const completedPickupsCount = pickupStopsList.filter((s: any) => s.status === 'completed').length;
  
  const totalTasks = totalPickupsCount + totalDropsCount;
  const completedTasks = completedPickupsCount + completedDropsCount;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Compile Map Markers in sequence
  const mapMarkers: any[] = [];
  if (riderLocation) {
    mapMarkers.push({
      id: 'rider',
      lat: riderLocation.lat,
      lng: riderLocation.lng,
      title: 'Your Location',
      isCurrentLocation: true
    });
  }

  pickupStopsList.forEach((stop: any, idx: number) => {
    const v = vendors.find(ven => ven.id === stop.vendorId);
    const lat = stop.location?.lat || v?.location?.lat;
    const lng = stop.location?.lng || v?.location?.lng;
    if (lat && lng) {
      mapMarkers.push({
        id: `pickup-${stop.vendorId || idx}`,
        lat,
        lng,
        title: `Pickup #${idx + 1}: ${v?.kitchen_name || v?.name || 'Kitchen'}`,
        subtitle: stop.status === 'completed' ? 'Picked Up ✓' : 'Kitchen Pickup'
      });
    }
  });

  remainingDrops.forEach((order, idx) => {
    const addressData = (order as any).address || (order as any).delivery_address;
    const custId = (order as any).customerId || (order as any).user_id || '';
    const cust = customerProfiles[custId];
    if (addressData?.lat && addressData?.lng) {
      mapMarkers.push({
        id: `drop-${order.id}`,
        lat: addressData.lat,
        lng: addressData.lng,
        title: `Drop #${totalPickupsCount + idx + 1}: ${cust?.name || 'Customer'}`,
        subtitle: addressData.line1 || 'Customer Doorstep'
      });
    }
  });

  if (isMounting) {
    return (
      <div className="space-y-6 pb-6 animate-pulse px-2">
        <div className="h-20 bg-white border border-slate-200/80 rounded-3xl" />
        <div className="h-48 bg-white border border-slate-200/80 rounded-3xl" />
        <div className="h-64 bg-white border border-slate-200/80 rounded-3xl" />
      </div>
    );
  }

  if (user && (!isRiderRole || !isVerifiedRider)) {
    return <PendingVerificationScreen role="delivery" />;
  }

  return (
    <div className="space-y-6 pb-28 text-slate-900 max-w-xl mx-auto px-2 sm:px-0">
      {/* ── Salary Shift Header Card ──────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-xs overflow-hidden shrink-0 border border-slate-100"
            >
              {user?.image ? (
                <Image src={getImageUrl(user.image)} alt={user.name || ''} fill className="object-cover" />
              ) : (
                <span>{(user?.name || 'TR').slice(0, 2).toUpperCase()}</span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-black text-base text-slate-900 leading-tight truncate">{user?.name || 'Test Delivery'}</h1>
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Salary Fleet
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400" /> {user?.phone || '+919900990044'} • {user?.vehicle_type || 'Motorcycle'}
              </p>
            </div>
          </div>

          {/* Online Toggle & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => handleToggleOnline(!isOnline)}
              className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-xs ${
                isOnline 
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20' 
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </button>
            <button 
              onClick={() => logout()} 
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 bg-slate-50 border border-slate-200/80 rounded-xl transition-colors" 
              title="Log Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Shift Task Progress Bar */}
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Shift Progress</span>
            <span className="text-slate-900 font-black">{completedTasks} / {totalTasks} Completed ({progressPct}%)</span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-brand transition-all duration-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />

      {/* ── Segmented Tab Switch (Active Next Stop vs Complete Route) ────────── */}
      {activeTrip && (
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs flex">
          <button 
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              viewTab === 'active' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-900'
            }`} 
            onClick={() => setViewTab('active')}
          >
            <Compass className="w-4 h-4" />
            Active Stop
          </button>
          <button 
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              viewTab === 'itinerary' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-900'
            }`} 
            onClick={() => setViewTab('itinerary')}
          >
            <ListOrdered className="w-4 h-4" />
            Route Sequence ({totalTasks})
          </button>
        </div>
      )}

      {/* ── Viewport Content ────────────────────────────────────────────────── */}
      {!isOnline ? (
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-slate-200/80 shadow-xs">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-400">
            <Truck size={32} />
          </div>
          <h2 className="font-black text-xl text-slate-900 mb-1">You are Offline</h2>
          <p className="text-xs font-medium text-slate-500 max-w-xs mb-6 leading-relaxed">
            Go online to receive and navigate daily tiffin dispatch routes from nearby cloud kitchens.
          </p>
          <button 
            onClick={() => handleToggleOnline(true)} 
            className="px-6 py-3 bg-brand text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-brand/20 active:scale-95 transition-all"
          >
            Go Online Now
          </button>
        </div>
      ) : currentState === 'IDLE' ? (
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-slate-200/80 shadow-xs space-y-4">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center text-brand">
            <Truck size={32} />
          </div>
          <div>
            <h2 className="font-black text-xl text-slate-900 mb-1">Waiting for Next Dispatch</h2>
            <p className="text-xs font-medium text-slate-500 max-w-xs mx-auto leading-relaxed">
              You are online and ready on shift. Admin auto-dispatch will assign your optimized batch routes here.
            </p>
          </div>
        </div>
      ) : viewTab === 'itinerary' ? (
        /* ── Complete Route Itinerary View (Pickups 1..N ➔ Drop-offs N+1..M) ── */
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-brand" /> Optimized Route Itinerary
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Pickups First ➔ Deliveries Next
            </span>
          </div>

          <div className="space-y-3">
            {/* Phase 1: Pickups */}
            {pickupStopsList.map((stop: any, idx: number) => {
              const v = vendors.find(ven => ven.id === stop.vendorId);
              const isDone = stop.status === 'completed';
              const isCurrent = currentState === 'ASSIGNED' && nextPickup?.vendorId === stop.vendorId;
              const lat = stop.location?.lat || v?.location?.lat;
              const lng = stop.location?.lng || v?.location?.lng;
              const phone = stop.vendorPhone || v?.phone;

              return (
                <div 
                  key={`itinerary-pickup-${idx}`} 
                  className={`bg-white rounded-3xl p-4 border transition-all ${
                    isCurrent 
                      ? 'border-brand ring-2 ring-brand/20 shadow-md' 
                      : isDone 
                      ? 'border-slate-200/60 opacity-60 bg-slate-50/50' 
                      : 'border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${
                        isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-brand/10 text-brand'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-5 h-5" /> : `P${idx + 1}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-brand">Phase 1: Kitchen Pickup</span>
                          {isCurrent && <span className="text-[9px] font-black uppercase tracking-wider bg-brand text-white px-2 py-0.2 rounded-full">Current Stop</span>}
                        </div>
                        <h4 className="font-black text-sm text-slate-900 leading-tight truncate mt-0.5">
                          {v?.kitchen_name || v?.name || `Kitchen ${stop.vendorId?.slice(-4)}`}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                          {v?.address || 'Kitchen Address on record'}
                        </p>
                      </div>
                    </div>

                    {/* Quick Call & Navigate Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {phone && (
                        <a 
                          href={`tel:${phone}`}
                          className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center active:scale-95 transition-all shadow-xs"
                          title="Call Kitchen"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      {lat && lng && (
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center active:scale-95 transition-all shadow-xs"
                          title="Navigate"
                        >
                          <Navigation className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Phase 2: Drop-offs */}
            {agentOrders.map((order: any, idx: number) => {
              const custId = order.customerId || order.user_id || '';
              const cust = customerProfiles[custId];
              const addressData = order.address || order.delivery_address;
              const isDone = order.status === 'delivered';
              const isCurrent = currentState === 'DELIVERING' && remainingDrops[0]?.id === order.id;
              const lat = addressData?.lat;
              const lng = addressData?.lng;
              const phone = cust?.phone || order.customerPhone;

              return (
                <div 
                  key={`itinerary-drop-${order.id}`} 
                  className={`bg-white rounded-3xl p-4 border transition-all ${
                    isCurrent 
                      ? 'border-brand ring-2 ring-brand/20 shadow-md' 
                      : isDone 
                      ? 'border-slate-200/60 opacity-60 bg-slate-50/50' 
                      : 'border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${
                        isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-5 h-5" /> : `D${idx + 1}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Phase 2: Customer Drop-off</span>
                          {isCurrent && <span className="text-[9px] font-black uppercase tracking-wider bg-brand text-white px-2 py-0.2 rounded-full">Current Stop</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <h4 className="font-black text-sm text-slate-900 leading-tight truncate">
                            {cust?.name || `Customer ${custId.slice(-4)}`}
                          </h4>
                          <span className="text-[10px] font-mono font-black bg-slate-900 text-amber-400 px-2 py-0.5 rounded-md tracking-wider">
                            {generateBoxTag({
                              customerName: cust?.name,
                              vendorName: 'Kitchen',
                              sequenceNumber: idx + 1,
                              planType: (order as any).plan_type || 'weekly',
                              cycleNumber: (order as any).cycle_number || 1
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                          {addressData?.line1 || cust?.address || 'Doorstep Address'}
                        </p>
                      </div>
                    </div>

                    {/* Quick Call & Navigate Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {phone && (
                        <a 
                          href={`tel:${phone}`}
                          className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center active:scale-95 transition-all shadow-xs"
                          title="Call Customer"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      {(lat && lng) ? (
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center active:scale-95 transition-all shadow-xs"
                          title="Navigate"
                        >
                          <Navigation className="w-4 h-4" />
                        </a>
                      ) : (addressData?.line1 || cust?.address) ? (
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressData?.line1 || cust?.address || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center active:scale-95 transition-all shadow-xs"
                          title="Navigate"
                        >
                          <Navigation className="w-4 h-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : currentState === 'ASSIGNED' && nextPickup ? (
        /* ── Phase 1: Current Active Kitchen Pickup Card ───────────────────── */
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_rgba(15,23,42,0.04)] space-y-5 animate-fade-in">
          {/* Card Tag */}
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-amber-50 text-brand border border-amber-200/80 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" /> Stop 1: Kitchen Pickup
            </span>
            <span className="text-xs font-black text-slate-900">
              {completedPickupsCount + 1} of {totalPickupsCount} Kitchens
            </span>
          </div>

          {/* Kitchen Info */}
          <div>
            <h2 className="font-black text-xl text-slate-900 leading-tight">
              {vendors.find(v => v.id === nextPickup.vendorId)?.kitchen_name || 
               vendors.find(v => v.id === nextPickup.vendorId)?.name || 
               `Kitchen ${nextPickup.vendorId?.slice(-4)}`}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              {vendors.find(v => v.id === nextPickup.vendorId)?.address || 'Address on record with Dabzzo'}
            </p>
          </div>

          {/* Expected Quantity Badge */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Tiffins to Collect</p>
              <p className="font-black text-base text-slate-900 mt-0.5">{nextPickup.expectedTiffinCount || agentOrders.length} Tiffins</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                <VegIcon size={14} /> <span>Veg</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                <NonVegIcon size={14} /> <span>Non-Veg</span>
              </span>
            </div>
          </div>

          {/* Direct 1-Tap Action Buttons (Call & Navigate) */}
          <div className="grid grid-cols-2 gap-3">
            {nextPickup.vendorPhone && (
              <a 
                href={`tel:${nextPickup.vendorPhone}`} 
                className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 active:scale-95 transition-all"
              >
                <Phone size={16} /> Call Kitchen
              </a>
            )}
            {nextPickup.location?.lat && nextPickup.location?.lng ? (
              <a 
                href={`https://www.google.com/maps/dir/?api=1&destination=${nextPickup.location.lat},${nextPickup.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
              >
                <Navigation size={16} /> Navigate
              </a>
            ) : (
              <button 
                onClick={() => toast.error('Kitchen coordinates not found')}
                className="py-3.5 bg-slate-100 text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Navigation size={16} /> No GPS
              </button>
            )}
          </div>

          {/* Main Confirmation Slider */}
          <div className="pt-1">
            <SwipeToConfirm
              key={`pickup-${nextPickup.vendorId}-${showOTPModal}`}
              onConfirm={() => {
                setCurrentVendorId(nextPickup.vendorId);
                setShowOTPModal(true);
              }}
              text="Swipe: Arrived & Enter Pickup OTP"
              confirmText="Arrived"
              disabled={isUpdating}
              className="w-full"
            />
          </div>
        </div>
      ) : currentState === 'DELIVERING' && remainingDrops.length > 0 ? (
        /* ── Phase 2: Current Active Customer Drop-off Card ─────────────────── */
        (() => {
          const currentOrder = remainingDrops[0] as any;
          const custId = currentOrder?.customerId || currentOrder?.user_id || '';
          const cust = customerProfiles[custId];
          const addressData = currentOrder?.address || currentOrder?.delivery_address;
          const phone = cust?.phone || currentOrder?.customerPhone;
          const mealType = currentOrder?.meal_type || currentOrder?.meal?.type || 'Lunch';

          return (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-[0_4px_24px_rgba(15,23,42,0.04)] space-y-5 animate-fade-in">
              {/* Card Tag */}
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1.5">
                  <PackageOpen className="w-3.5 h-3.5" /> Next Drop: #{completedDropsCount + 1}
                </span>
                <span className="text-xs font-black text-slate-900">
                  {completedDropsCount + 1} of {totalDropsCount} Deliveries
                </span>
              </div>

              {/* Customer Info */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-black text-xl text-slate-900 leading-tight">
                    {cust?.name || `Customer ${custId.slice(-4)}`}
                  </h2>
                  <span className="text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl">
                    {mealType}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  {addressData?.line1 || cust?.address || 'Doorstep delivery address on record'}
                </p>
                {addressData?.landmark && (
                  <p className="text-xs text-brand font-bold mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Landmark: {addressData.landmark}
                  </p>
                )}
              </div>

              {/* Tiffin Box Tag Banner for Rider Zero-Mismatch Match */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between border border-slate-800 shadow-md">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    🏷️ Match Tiffin Box Tag From Bag
                  </span>
                  <div className="text-2xl font-mono font-black text-white tracking-widest mt-0.5">
                    {generateBoxTag({
                      customerName: cust?.name,
                      vendorName: 'Kitchen',
                      sequenceNumber: completedDropsCount + 1,
                      planType: currentOrder?.plan_type || 'weekly',
                      cycleNumber: currentOrder?.cycle_number || 1
                    })}
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                    Handover this exact tagged container to customer
                  </p>
                </div>
                <DietaryBadge type={currentOrder?.meal_type === 'non_veg' ? 'non_veg' : 'veg'} size={16} />
              </div>

              {/* Direct 1-Tap Action Buttons (Call & Navigate) */}
              <div className="grid grid-cols-2 gap-3">
                {phone ? (
                  <a 
                    href={`tel:${phone}`} 
                    className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    <Phone size={16} /> Call Customer
                  </a>
                ) : (
                  <button 
                    disabled 
                    className="py-3.5 bg-slate-100 text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <Phone size={16} /> No Phone
                  </button>
                )}
                {addressData?.lat && addressData?.lng ? (
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${addressData.lat},${addressData.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
                  >
                    <Navigation size={16} /> Navigate
                  </a>
                ) : (addressData?.line1 || cust?.address) ? (
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressData?.line1 || cust?.address || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
                  >
                    <Navigation size={16} /> Navigate
                  </a>
                ) : null}
              </div>

              {/* Completion & Customer Unavailable Handlers */}
              <div className="space-y-2.5 pt-1">
                <SwipeToConfirm
                  key={`drop-${currentOrder.id}-${showDropoffModal}`}
                  onConfirm={() => {
                    setCurrentDropoffOrderId(currentOrder.id);
                    setShowDropoffModal(true);
                  }}
                  text="Swipe: Arrived & Complete Delivery"
                  confirmText="Arrived"
                  disabled={isUpdating}
                  className="w-full"
                />

                <button
                  onClick={() => {
                    if (unavailabilityStartTimes[currentOrder.id]) {
                      handleCustomerUnavailable(currentOrder.id);
                    } else {
                      setUnavailabilityStartTimes(prev => ({ ...prev, [currentOrder.id]: Date.now() }));
                    }
                  }}
                  disabled={isUpdating}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    unavailabilityStartTimes[currentOrder.id] 
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 animate-pulse' 
                      : 'bg-slate-50 text-slate-400 hover:text-slate-600 border border-slate-200/60'
                  }`}
                >
                  {(() => {
                    const start = unavailabilityStartTimes[currentOrder.id];
                    if (!start) return <>Customer Not Answering (10m Timer)</>;
                    const remaining = Math.max(0, 600 - Math.floor((nowTick - start) / 1000));
                    const m = Math.floor(remaining / 60);
                    const s = remaining % 60;
                    if (remaining === 0) return <>Mark as Customer Unavailable</>;
                    return <>Confirm Customer Unavailable ({m}:{s.toString().padStart(2, '0')})</>;
                  })()}
                </button>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* ── Live Route GPS Map ──────────────────────────────────────────────── */}
      {isOnline && (
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-brand" /> Live Route Map
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              GPS Navigation Active
            </span>
          </div>

          <div className="rounded-2xl overflow-hidden border border-slate-100 h-64">
            <DeliveryMap markers={mapMarkers} />
          </div>
        </div>
      )}

      {/* ── Vendor Handover OTP Modal ────────────────────────────────────────── */}
      {showOTPModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg text-slate-900">
                {pickupStep === 'otp' ? 'Kitchen Handover OTP' : 'Verify Tiffin Quantity'}
              </h3>
              <button 
                onClick={() => { setShowOTPModal(false); setPickupStep('otp'); setVendorOTP(''); }}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            {pickupStep === 'otp' ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Ask the kitchen chef for the 4-digit pickup code displayed on their vendor terminal.
                </p>
                <input 
                  type="text" 
                  maxLength={4}
                  value={vendorOTP}
                  onChange={(e) => setVendorOTP(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • •"
                  className="w-full text-center tracking-[0.5em] text-2xl font-black py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-brand"
                  autoFocus
                />
                <button
                  disabled={vendorOTP.length !== 4 || verifyingOTP}
                  onClick={handleOTPVerify}
                  className="w-full py-3.5 bg-brand hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-brand/20 transition-all flex items-center justify-center gap-2"
                >
                  {verifyingOTP ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Code'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Expected from kitchen: <strong className="text-slate-900 font-black">{vendorDeclaredCount} tiffins</strong>. Enter the actual count received.
                </p>
                <input 
                  type="number"
                  value={riderConfirmedCount}
                  onChange={(e) => setRiderConfirmedCount(e.target.value)}
                  className="w-full text-center text-2xl font-black py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-brand"
                  autoFocus
                />
                <button
                  disabled={!riderConfirmedCount || verifyingOTP}
                  onClick={handleCountConfirm}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {verifyingOTP ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Tiffins & Depart'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Customer Drop-off OTP Modal ─────────────────────────────────────── */}
      {showDropoffModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg text-slate-900">Doorstep Verification</h3>
              <button 
                onClick={() => { setShowDropoffModal(false); setDropoffOTP(''); setShowPhotoUpload(false); }}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Enter the 4-digit code provided by the customer at doorstep.
              </p>
              <input 
                type="text" 
                maxLength={4}
                value={dropoffOTP}
                onChange={(e) => setDropoffOTP(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • •"
                className="w-full text-center tracking-[0.5em] text-2xl font-black py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-brand"
                autoFocus
              />
              <button
                disabled={dropoffOTP.length !== 4 || verifyingDropoffOTP}
                onClick={handleDropoffOTPVerify}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
              >
                {verifyingDropoffOTP ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
