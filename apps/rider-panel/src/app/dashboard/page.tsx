'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { Camera, Navigation, MapPin, Search, PackageOpen, Truck, Store, LogOut, Phone, X, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { getImageUrl, uploadImage } from '@/lib/storage';
import { updateUser } from '@/lib/queries/users';
import toast from 'react-hot-toast';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, updateDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import { SwipeToConfirm } from '@/components/ui/SwipeToConfirm';

const DeliveryMap = dynamic(() => import('@/components/delivery/DeliveryMap'), { ssr: false });

import { PendingVerificationScreen } from '@/components/shared/PendingVerificationScreen';

export default function RiderDashboard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const activeTrip = useDeliveryStore((s) => s.activeTrip);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);

  const isRiderRole = user?.role === 'delivery' || user?.role === 'admin';
  const isVerifiedRider = user?.is_approved === true && user?.verification_status === 'verified';

  if (user && (!isRiderRole || !isVerifiedRider)) {
    return <PendingVerificationScreen role="delivery" />;
  }

  const [isMounting, setIsMounting] = useState(true);
  const [loadingImage, setLoadingImage] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const failedOrdersRef = useRef<Set<string>>(new Set()); // Fix 10: prevent double-fire

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

  // Offline-First Sync Loop
  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function syncOfflineQueue() {
      if (!navigator.onLine) return;
      const queue = JSON.parse(localStorage.getItem('offline_deliveries') || '[]');
      if (queue.length === 0) return;

      console.log(`[Offline Sync] Found ${queue.length} deliveries to sync.`);
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

    const interval = setInterval(syncOfflineQueue, 15000); // Check every 15s
    window.addEventListener('online', syncOfflineQueue);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', syncOfflineQueue);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounting(false), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fix 10: auto-fail expired customer unavailability timers from a useEffect (not render)
  useEffect(() => {
    const expired = Object.entries(unavailabilityStartTimes).filter(
      ([, start]) => Date.now() - start >= 600_000
    );
    expired.forEach(([orderId]) => {
      void handleCustomerUnavailable(orderId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  // Fix 1: Real-time today earnings from rider_payments
  useEffect(() => {
    if (!user?.id) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'rider_payments'),
      where('riderId', '==', user.id),
      orderBy('calculatedAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      let total = 0;
      snap.docs.forEach(d => {
        const p = d.data();
        const t = p.calculatedAt?.toDate?.()?.getTime?.() || 0;
        if (t >= startOfToday.getTime()) total += p.totalPayment || 0;
      });
      setTodayEarnings(total);
    }, () => { /* silently fail — rider may have no payments yet */ });
    return () => unsub();
  }, [user?.id]);

  // Fix 2: Sync isOnline state from Firestore on mount
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

  // Fix 2: Toggle online state and persist to Firestore
  const handleToggleOnline = useCallback(async (newValue: boolean) => {
    setIsOnline(newValue);
    if (!user?.id) return;
    try {
      await updateDoc(doc(db, 'driver_profiles', user.id), {
        isActive: newValue,
        lastActive: new Date()
      });
    } catch {
      // If driver_profiles doc doesn't exist yet, create it
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Customer profiles for drop-off enrichment ─────────────────────────────
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
      console.error('[RiderDashboard] Failed to update driver profile:', err);
      toast.error('Failed to update your location. Please check permissions.');
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

  // ── GPS: watch position & push to Firestore ───────────────────────────────
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
          }, { merge: true }).catch(err => console.warn('Failed to update driver profile:', err.message));
        });
      }
    };

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => pushLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn("Geolocation error, retrying...", err.message);
          // Only show toast if it's not a timeout or position unavailable so we don't spam the user on desktop
          if (err.code !== err.TIMEOUT && err.code !== err.POSITION_UNAVAILABLE) {
            toast.error("GPS Signal Lost. Please ensure location services are enabled.");
          }
        },
        // We removed the short timeout, giving the device more time to get a real lock
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      toast.error("Geolocation is not supported by your browser");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'vendor'));
        const snap = await getDocs(q);
        setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("[RiderDashboard] Failed to fetch vendors:", err);
        toast.error("Failed to load vendor details");
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

  const mapMarkers: any[] = [];
  if (riderLocation) {
    mapMarkers.push({
      id: 'rider', lat: riderLocation.lat, lng: riderLocation.lng,
      title: 'You are here', isCurrentLocation: true
    });
  }
  
  const vendorsWithDistance = vendors
    .filter(v => v.location?.lat && v.location?.lng)
    .map(v => ({
      ...v,
      dist: riderLocation ? getDistance(riderLocation.lat, riderLocation.lng, v.location.lat, v.location.lng) : Infinity
    }))
    .sort((a, b) => a.dist - b.dist);

  vendorsWithDistance.forEach((v, idx) => {
    const isClosest = riderLocation && idx === 0;
    mapMarkers.push({
      id: v.id,
      lat: v.location.lat,
      lng: v.location.lng,
      title: v.business_name || v.name || 'Kitchen',
      subtitle: riderLocation ? `${v.dist.toFixed(1)} km away ${isClosest ? '(⭐ Closest)' : ''}` : 'Kitchen',
    });
  });

  // ── Vendor Pickup OTP Verify & Confirm ───────────────────────────────────
  const handleOTPVerify = async () => {
    if (!activeTrip || !currentVendorId || vendorOTP.length !== 4) return;
    setVerifyingOTP(true);
    try {
      const tripRef = doc(db, 'rider_trips', activeTrip.id);
      const tripSnap = await getDoc(tripRef);
      if (!tripSnap.exists()) throw new Error('Trip not found');
      const tripData = tripSnap.data();

      // 1. Verify OTP
      let isValid = false;
      const batchIds = tripData.batch_ids || [];
      let batchDocs: any[] = [];
      
      // Check batch OTPs
      if (batchIds.length > 0) {
        batchDocs = await Promise.all(batchIds.map((id: string) => getDoc(doc(db, 'batches', id))));
        const validOTPs = batchDocs.map(d => String(d.data()?.pickup_otp)).filter(Boolean);
        isValid = validOTPs.includes(String(vendorOTP));
      }

      // Check pickupStops OTPs directly (for test orders without batches)
      if (!isValid && tripData.pickupStops) {
        const vendorStop = tripData.pickupStops.find((s: any) => s.vendorId === currentVendorId);
        if (vendorStop && String(vendorStop.pickupOTP) === String(vendorOTP)) {
          isValid = true;
        }
      }

      if (!isValid) {
        toast.error("Invalid Pickup OTP. Please check with the vendor.");
        return;
      }

      // Instead of completing, transition to count confirmation
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
      toast.error("Please enter a valid count.");
      return;
    }

    setVerifyingOTP(true);
    try {
      const tripRef = doc(db, 'rider_trips', activeTrip.id);
      const tripSnap = await getDoc(tripRef);
      if (!tripSnap.exists()) throw new Error('Trip not found');
      const tripData = tripSnap.data();

      const batchIds = tripData.batch_ids || [];
      const batchDocs = batchIds.length > 0 ? await Promise.all(batchIds.map((id: string) => getDoc(doc(db, 'batches', id)))) : [];

      const batch = writeBatch(db);

      // Record discrepancy if mismatched
      if (confirmedCountInt !== vendorDeclaredCount) {
        const discrepancyRef = doc(collection(db, 'pickup_discrepancies'));
        batch.set(discrepancyRef, {
          batch_id: batchIds[0] || 'unknown',
          rider_trip_id: activeTrip.id,
          vendor_declared_count: vendorDeclaredCount,
          rider_confirmed_count: confirmedCountInt,
          flagged_at: new Date(),
          resolved: false
        });
        toast.error(`Discrepancy flagged! Expected ${vendorDeclaredCount}, got ${confirmedCountInt}. Ops notified.`, { duration: 5000 });
      }

      // 2. Mark pickup stop as completed
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

      // 3. Update all assigned orders
      let assignedOrderIds: string[] = tripData.assignedOrderIds || [];
      if (assignedOrderIds.length === 0 && tripData.dropoffStops) {
        assignedOrderIds = tripData.dropoffStops.map((s: any) => s.orderId).filter(Boolean);
      }

      for (const oId of assignedOrderIds) {
        const oData = agentOrders.find(o => o.id === oId) as any;
        // If the order belongs to the vendor we just picked up from, advance its status
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

      // 4. Mark batch(es) completed for this vendor
      for (const b of batchDocs) {
        if (b.data()?.vendor_id === justCompletedVendorId) {
          batch.update(doc(db, 'batches', b.id), { status: 'completed', updated_at: new Date() });
        }
      }

      await batch.commit();
      toast.success("Pickup confirmed! 🎉 Heading to customer.");
      setShowOTPModal(false);
      setPickupStep('otp');
      setVendorOTP('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to confirm pickup');
    } finally {
      setVerifyingOTP(false);
    }
  };

  // ── Customer Drop-off OTP Verify & Complete ───────────────────────────────
  const handleDropoffVerify = async () => {
    if (!activeTrip || !currentDropoffOrderId || dropoffOTP.length !== 4) return;
    setVerifyingDropoffOTP(true);
    try {
      // 1. Verify OTP against order document
      const orderSnap = await getDoc(doc(db, 'orders', currentDropoffOrderId));
      if (!orderSnap.exists()) throw new Error('Order not found');
      const orderData = orderSnap.data();
      const expectedOTP = orderData?.otp;

      if (!expectedOTP || expectedOTP !== dropoffOTP) {
        toast.error("Invalid Drop-off OTP. Please check with the customer.");
        return;
      }

      // Try online update
      try {
        // 2. Mark order as delivered
        await updateDoc(doc(db, 'orders', currentDropoffOrderId), {
          status: 'delivered',
          updated_at: new Date(),
          'timestamps.deliveredAt': new Date()
        });

        // 3. Check if all drops done → complete the trip
        const remainingDrops = agentOrders.filter(o => o.id !== currentDropoffOrderId && o.status !== 'delivered' && o.status !== 'failed');
        if (remainingDrops.length === 0) {
          await updateDoc(doc(db, 'rider_trips', activeTrip.id), {
            status: 'completed',
            updatedAt: new Date()
          });
        }
        toast.success('Delivery completed! 🎉');
      } catch (networkErr) {
        // Queue for offline sync
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

  const handlePhotoProofSubmit = async () => {
    if (!activeTrip || !currentDropoffOrderId || !photoProof) return;
    setUploadingPhotoProof(true);
    try {
      let photoUrl = '';
      
      if (navigator.onLine) {
        // Online: upload immediately
        const uploadedUrl = await uploadImage(photoProof, `delivery_proofs/${currentDropoffOrderId}`);
        if (!uploadedUrl) throw new Error('Photo upload failed');
        photoUrl = uploadedUrl;
        
        await updateDoc(doc(db, 'orders', currentDropoffOrderId), {
          status: 'delivered',
          delivery_photo_url: photoUrl,
          updated_at: new Date(),
          'timestamps.deliveredAt': new Date(),
          delivery_method: 'photo_proof'
        });

        const remainingDrops = agentOrders.filter(o => o.id !== currentDropoffOrderId && o.status !== 'delivered' && o.status !== 'failed');
        if (remainingDrops.length === 0) {
          await updateDoc(doc(db, 'rider_trips', activeTrip.id), {
            status: 'completed',
            updatedAt: new Date()
          });
        }
        toast.success('Delivery completed with Photo Proof! 🎉');
      } else {
        // Fix 7: Offline — compress image before storing to avoid localStorage quota
        const compressImage = (file: File): Promise<string> =>
          new Promise((resolve, reject) => {
            const img = new window.Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
              const MAX = 800;
              const scale = Math.min(1, MAX / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(objectUrl);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = objectUrl;
          });

        try {
          const compressed = await compressImage(photoProof);
          const queue = JSON.parse(localStorage.getItem('offline_deliveries') || '[]');
          queue.push({
            orderId: currentDropoffOrderId,
            photoUrl: compressed,
            timestamp: Date.now(),
          });
          localStorage.setItem('offline_deliveries', JSON.stringify(queue));
        } catch {
          // If even compressed doesn't fit, queue without photo
          const queue = JSON.parse(localStorage.getItem('offline_deliveries') || '[]');
          queue.push({ orderId: currentDropoffOrderId, timestamp: Date.now() });
          localStorage.setItem('offline_deliveries', JSON.stringify(queue));
        }
        toast.success('Offline: Delivery queued for sync! 📶');
      }

      setShowDropoffModal(false);
      setDropoffOTP('');
      setCurrentDropoffOrderId(null);
      setPhotoProof(null);
      setShowPhotoUpload(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to complete delivery with photo');
    } finally {
      setUploadingPhotoProof(false);
    }
  };

  const handleCustomerUnavailable = useCallback(async (orderId: string) => {
    if (!activeTrip) return;
    // Fix 10: prevent double-fire
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

      // Check if all drops done → complete the trip
      const remainingDrops = agentOrders.filter(o => o.id !== orderId && o.status !== 'delivered' && o.status !== 'failed');
      if (remainingDrops.length === 0) {
        batch.update(doc(db, 'rider_trips', activeTrip.id), {
          status: 'completed',
          updatedAt: new Date()
        });
      }

      await batch.commit();
      toast.error('Delivery marked as failed (Customer Unavailable)');
      
      // Cleanup timer if exists
      setUnavailabilityStartTimes(prev => {
        const newTimers = { ...prev };
        delete newTimers[orderId];
        return newTimers;
      });

    } catch (err: any) {
      console.error(err);
      failedOrdersRef.current.delete(orderId); // allow retry on error
      toast.error(err.message || 'Failed to mark as unavailable');
    }
  }, [activeTrip, agentOrders]);

  // ── Derive UI state ───────────────────────────────────────────────────────
  let currentState = 'IDLE';
  let nextPickup: any = null;
  let remainingDrops = agentOrders.filter(o => o.status !== 'delivered' && o.status !== 'failed');

  if (activeTrip?.dropStops) {
    remainingDrops.sort((a, b) => {
      const stopA = activeTrip!.dropStops!.find((s: any) => s.orderId === a.id);
      const stopB = activeTrip!.dropStops!.find((s: any) => s.orderId === b.id);
      return (stopA?.sequence || 999) - (stopB?.sequence || 999);
    });
  }

  if (activeTrip) {
    const pendingPickups = activeTrip.pickupStops?.filter((s: any) => s.status !== 'completed');
    if (pendingPickups && pendingPickups.length > 0) {
      currentState = 'ASSIGNED';
      nextPickup = pendingPickups[0];
    } else if (remainingDrops.length > 0) {
      currentState = 'DELIVERING';
    }
  }

  if (isMounting) {
    return (
      <div className="space-y-6 pb-6 animate-pulse px-2">
        {/* Header Shimmer */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white border border-slate-100 rounded-full" />
            <div className="space-y-2">
              <div className="h-4 w-28 bg-white border border-slate-100 rounded" />
              <div className="h-3 w-16 bg-white border border-slate-100 rounded" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-16 h-8 bg-white border border-slate-100 rounded-full" />
            <div className="w-8 h-8 bg-white border border-slate-100 rounded-full" />
          </div>
        </div>
        
        {/* Map Shimmer */}
        <div>
          <div className="w-full h-48 bg-white border border-slate-100 rounded-3xl" />
        </div>

        {/* Card Shimmer */}
        <div>
          <div className="w-full h-56 bg-white bg-white border border-slate-100 rounded-3xl p-6 space-y-4 flex flex-col justify-center">
            <div className="h-4 w-1/3 bg-slate-50 border border-slate-100 rounded mx-auto" />
            <div className="h-8 w-2/3 bg-slate-50 border border-slate-100 rounded mx-auto" />
            <div className="h-4 w-1/2 bg-slate-50 border border-slate-100 rounded mx-auto" />
            <div className="flex gap-3 pt-4">
              <div className="flex-1 h-12 bg-slate-50 border border-slate-100 rounded-2xl" />
              <div className="flex-1 h-12 bg-slate-50 border border-slate-100 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const completedCount = agentOrders.filter(o => o.status === 'delivered').length;
  const totalCount = agentOrders.length;
  const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="space-y-6 pb-24 text-slate-900">
      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-12 h-12 overflow-hidden rounded-full border border-slate-100 bg-white"
          >
            {user?.image ? (
              <Image src={getImageUrl(user.image)} alt={user.name || ''} fill className="object-cover" />
            ) : (
              <UserPlaceholder name={user?.name} />
            )}
            {loadingImage && <div className="absolute inset-0 bg-slate-100 flex items-center justify-center" />}
          </button>
          <div>
            <h1 className="font-black text-slate-900 leading-none">{user?.name}</h1>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">₹{todayEarnings.toFixed(2)} Today</p>
          </div>
          {totalCount > 0 && (
            <div className="relative w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-full shadow-inner shrink-0" title={`${completedCount}/${totalCount} Completed`}>
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  className="text-slate-100"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  className="text-brand transition-all duration-500 ease-out"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                />
              </svg>
              <span className="absolute text-[9px] font-black text-slate-800">{completedCount}/{totalCount}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
          <button 
            onClick={() => handleToggleOnline(!isOnline)}
            className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-all ${isOnline ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-white text-slate-500 border border-slate-100'}`}
          >
            {isOnline ? 'Online' : 'Offline'}
          </button>
          <button onClick={() => logout()} className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 bg-white border border-slate-100 rounded-full transition-colors" title="Log Out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />

      <div className="px-2">
        {!isOnline ? (
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-slate-100">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 text-slate-500 border border-slate-100">
              <Truck size={32} />
            </div>
            <h2 className="font-black text-xl text-slate-900 mb-1">You are offline</h2>
            <p className="text-sm font-medium text-slate-500 mb-6">Go online to start receiving delivery trips.</p>
            <button onClick={() => setIsOnline(true)} className="btn-primary w-full max-w-[200px]">Go Online</button>
          </div>
        ) : currentState === 'IDLE' ? (
          <div className="relative overflow-hidden bg-white border border-slate-100 rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] shadow-2xl">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-emerald-400 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-emerald-400 animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }} />
            </div>
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mb-4 text-emerald-600 z-10 shadow-inner">
              <Truck size={32} />
            </div>
            <h2 className="font-black text-xl text-slate-900 mb-2 z-10">Ready for Pickup</h2>
            <p className="text-sm font-medium text-slate-500 z-10">You&apos;re online and available. Trips are assigned automatically.</p>
          </div>
        ) : currentState === 'ASSIGNED' && nextPickup ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-1 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="bg-gradient-to-b from-brand/5 via-brand/5 to-white rounded-t-[22px] p-6 text-center border-b border-slate-100">
              <span className="inline-block px-3.5 py-1.5 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest rounded-full mb-4">
                Pickup Requested
              </span>
              <h2 className="font-black text-2xl text-slate-900 mb-1">
                {vendors.find(v => v.id === nextPickup.vendorId)?.business_name || 
                 vendors.find(v => v.id === nextPickup.vendorId)?.name || 
                 `Vendor ${nextPickup.vendorId?.slice(-4)}`}
              </h2>
              <p className="text-slate-500 font-bold text-sm flex items-center justify-center gap-1.5">
                <Navigation size={14} className="text-brand" /> {(nextPickup.distanceKm ?? 0).toFixed(1)} km away
              </p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {nextPickup.vendorPhone && (
                  <a href={`tel:${nextPickup.vendorPhone}`} className="flex-1 py-3 bg-slate-50 text-indigo-600 border  rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors">
                    <Phone size={18} /> Call
                  </a>
                )}
                {nextPickup.location?.lat && nextPickup.location?.lng && (
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${nextPickup.location.lat},${nextPickup.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 bg-slate-50 text-blue-600 border  rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <Navigation size={18} /> Navigate
                  </a>
                )}
              </div>
              <SwipeToConfirm
                key={`pickup-${nextPickup.vendorId}-${showOTPModal}`}
                onConfirm={() => {
                  setCurrentVendorId(nextPickup.vendorId);
                  setShowOTPModal(true);
                }}
                text="Swipe: Arrived at Kitchen"
                confirmText="Arrived"
                disabled={isUpdating}
                className="w-full mt-2"
              />
            </div>
          </div>
        ) : currentState === 'DELIVERING' ? (
          <div className="space-y-4">
            <h2 className="font-black text-xl text-slate-900 px-2 flex items-center gap-2">
              <PackageOpen className="text-brand" /> Drop-offs ({remainingDrops.length})
            </h2>
            <div className="space-y-3">
              {remainingDrops.map((order, idx) => {
                const custId = (order as any).customerId || (order as any).user_id || '';
                const cust = customerProfiles[custId];
                const addressData = (order as any).address || (order as any).delivery_address;
                return (
                <div key={order.id} className="bg-white border border-slate-100 rounded-[24px] shadow-2xl overflow-hidden flex flex-col">
                  {/* Customer header */}
                  <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-xl shrink-0 text-slate-900">
                      🏠
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[10px] font-black shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-black text-slate-900 text-base leading-tight truncate">
                          {cust?.name || `Customer …${custId.slice(-4)}`}
                        </span>
                      </div>
                      <p className="text-slate-900/60 text-xs font-medium truncate mb-0.5">
                        {addressData?.line1 || cust?.address || 'No Address provided'}
                      </p>
                      {cust?.phone && (
                        <p className="text-emerald-600 text-xs font-bold tracking-wide">
                          {cust.phone}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cust?.phone && (
                        <a
                          href={`tel:${cust.phone}`}
                          className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-900 flex items-center justify-center shadow-lg active:scale-95 transition-all shrink-0"
                        >
                          <Phone size={20} />
                        </a>
                      )}
                      {(addressData?.lat || cust?.address || addressData?.line1) ? (
                        <a
                          href={addressData?.lat && addressData?.lng 
                            ? `https://www.google.com/maps/dir/?api=1&destination=${addressData.lat},${addressData.lng}` 
                            : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressData?.line1 || cust?.address || '')}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-12 h-12 rounded-2xl bg-blue-500 text-slate-900 flex items-center justify-center shadow-lg active:scale-95 transition-all shrink-0"
                        >
                          <Navigation size={20} />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* Address detail + CTA */}
                  <div className="p-4 bg-white flex flex-col gap-4 border-t border-slate-100">
                    {addressData?.line2 && (
                      <div className="flex items-start gap-2">
                        <MapPin size={14} className="text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-slate-500 text-xs font-medium leading-relaxed">
                          {addressData.line2}
                          {addressData?.landmark && ` · Near ${addressData.landmark}`}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => {
                          if (unavailabilityStartTimes[order.id]) {
                            handleCustomerUnavailable(order.id);
                          } else {
                            setUnavailabilityStartTimes(prev => ({ ...prev, [order.id]: Date.now() }));
                          }
                        }}
                        disabled={isUpdating}
                        className={`flex-1 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all border ${unavailabilityStartTimes[order.id] ? 'bg-red-950/40 text-red-400 border-red-900/60 hover:bg-red-900/40' : 'bg-orange-950/20 text-orange-400 border-orange-900/20 hover:bg-orange-950/40'}`}
                      >
                        {(() => {
                          const start = unavailabilityStartTimes[order.id];
                          if (!start) return <>Customer Unavailable</>;
                          const remaining = Math.max(0, 600 - Math.floor((nowTick - start) / 1000));
                          // Fix 10: auto-fail handled by useEffect, NOT render function
                          const m = Math.floor(remaining / 60);
                          const s = remaining % 60;
                          if (remaining === 0) return <>Timing out...</>;
                          return <>Confirm Skip ({m}:{s.toString().padStart(2, '0')})</>;
                        })()}
                      </button>
                      <SwipeToConfirm
                        key={`${order.id}-${showDropoffModal}`}
                        onConfirm={() => {
                          setCurrentDropoffOrderId(order.id);
                          setDropoffOTP('');
                          setShowDropoffModal(true);
                        }}
                        text="Swipe to Deliver"
                        confirmText="Verifying..."
                        disabled={isUpdating || !!unavailabilityStartTimes[order.id]}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-2">
        <div className="overflow-hidden p-0 h-48 relative rounded-3xl border border-slate-100 bg-white shadow-2xl">
          <DeliveryMap 
            markers={mapMarkers} 
            centerLat={riderLocation?.lat} 
            centerLng={riderLocation?.lng} 
          />
          <div className="absolute top-3 left-3 bg-slate-100 border border-slate-100 backdrop-blur-xl px-3 py-1.5 rounded-full shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
              <MapPin size={12} className="text-brand" /> Live Map
            </span>
          </div>
        </div>
      </div>

      {/* ── Vendor Pickup OTP Modal ── */}
      {showOTPModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 rounded-[32px] w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => { setShowOTPModal(false); setVendorOTP(''); setVerifyingOTP(false); }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-500 hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Store size={32} />
            </div>
            {pickupStep === 'otp' ? (
              <>
                <h3 className="text-2xl font-black text-slate-900 text-center mb-2">Vendor Pickup</h3>
                <p className="text-slate-500 text-sm font-medium text-center mb-8">
                  Please ask the vendor for the 4-digit pickup OTP to confirm you are receiving the correct tiffins.
                </p>
                <input 
                  type="text" 
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={vendorOTP}
                  onChange={(e) => setVendorOTP(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0000"
                  disabled={verifyingOTP}
                  className="w-full text-center text-4xl tracking-[0.5em] font-mono font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 focus:border-brand focus:ring-0 transition-colors mb-6 disabled:opacity-60"
                />
                <button 
                  onClick={handleOTPVerify}
                  disabled={vendorOTP.length !== 4 || verifyingOTP}
                  className="w-full py-4 bg-brand text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 disabled:opacity-50 transition-all"
                >
                  {verifyingOTP ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...</>
                  ) : 'Verify OTP'}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-black text-slate-900 text-center mb-2">Confirm Count</h3>
                <p className="text-slate-500 text-sm font-medium text-center mb-8">
                  Vendor declared <strong className="text-slate-900">{vendorDeclaredCount}</strong> tiffins. Please confirm the actual number you received.
                </p>
                <input 
                  type="number" 
                  value={riderConfirmedCount}
                  onChange={(e) => setRiderConfirmedCount(e.target.value)}
                  placeholder="Actual count"
                  disabled={verifyingOTP}
                  className="w-full text-center text-4xl font-mono font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 focus:border-brand focus:ring-0 transition-colors mb-6 disabled:opacity-60"
                />
                <button 
                  onClick={handleCountConfirm}
                  disabled={riderConfirmedCount === '' || verifyingOTP}
                  className="w-full py-4 bg-brand text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 disabled:opacity-50 transition-all"
                >
                  {verifyingOTP ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                  ) : 'Confirm Pickup'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Customer Drop-off OTP Modal ── */}
      {showDropoffModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-100 rounded-[32px] w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => { 
                setShowDropoffModal(false); 
                setDropoffOTP(''); 
                setVerifyingDropoffOTP(false); 
                setShowPhotoUpload(false);
                setPhotoProof(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X size={18} />
            </button>

            {showPhotoUpload ? (
              <div className="space-y-6">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <Camera size={32} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 text-center mb-2">Photo Proof</h3>
                <p className="text-slate-500 text-sm font-medium text-center mb-4">
                  Take a clear photo of the tiffin dropped off at the customer's door.
                </p>
                
                <input 
                  type="file" 
                  ref={photoInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoProof(file);
                  }}
                />

                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-slate-200 hover:border-brand rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50 overflow-hidden relative"
                >
                  {photoProof ? (
                    <Image 
                      src={URL.createObjectURL(photoProof)} 
                      alt="Tiffin Proof" 
                      fill 
                      className="object-cover"
                    />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-400 animate-pulse" />
                      <span className="text-xs font-bold text-slate-500">Capture / Select Photo</span>
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowPhotoUpload(false); setPhotoProof(null); }}
                    className="flex-1 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all active:scale-[0.98] border border-slate-100"
                  >
                    Back to OTP
                  </button>
                  <button
                    onClick={handlePhotoProofSubmit}
                    disabled={!photoProof || uploadingPhotoProof}
                    className="flex-1 py-3.5 bg-emerald-500 text-slate-950 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50 transition-all text-xs"
                  >
                    {uploadingPhotoProof ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> Uploading...
                      </>
                    ) : 'Complete Drop'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <PackageOpen size={32} />
                </div>
                {(() => {
                  const currentDropoffOrder = agentOrders.find(o => o.id === currentDropoffOrderId);
                  const dropoffCustId = currentDropoffOrder ? ((currentDropoffOrder as any).customerId || (currentDropoffOrder as any).user_id) : '';
                  const dropoffCust = customerProfiles[dropoffCustId];
                  return (
                    <>
                      <h3 className="text-2xl font-black text-slate-900 text-center mb-2">Drop-off for {dropoffCust?.name || 'Customer'}</h3>
                      <p className="text-slate-500 text-sm font-medium text-center mb-8">
                        Ask {dropoffCust?.name || 'the customer'} for their 4-digit Handover PIN to complete this delivery.
                      </p>
                    </>
                  );
                })()}
                <input 
                  type="text" 
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={dropoffOTP}
                  onChange={(e) => setDropoffOTP(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0000"
                  disabled={verifyingDropoffOTP}
                  className="w-full text-center text-4xl tracking-[0.5em] font-mono font-black text-slate-900 bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 focus:border-emerald-500 focus:ring-0 transition-colors mb-4 disabled:opacity-60"
                />
                <button 
                  onClick={handleDropoffVerify}
                  disabled={dropoffOTP.length !== 4 || verifyingDropoffOTP}
                  className="w-full py-4 bg-emerald-500 text-slate-950 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50 transition-all mb-3 text-sm"
                >
                  {verifyingDropoffOTP ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...</>
                  ) : 'Verify OTP & Complete Delivery'}
                </button>
                <button
                  onClick={() => setShowPhotoUpload(true)}
                  className="w-full py-2.5 bg-slate-50 border border-slate-200/50 hover:bg-slate-100 rounded-2xl font-bold text-xs text-slate-600 transition-all uppercase tracking-wider"
                >
                  Cannot get OTP? Deliver with Photo
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserPlaceholder({ name }: { name?: string | null }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <div className="w-full h-full flex items-center justify-center bg-brand/10 text-brand font-black text-lg">
      {initial}
    </div>
  );
}
