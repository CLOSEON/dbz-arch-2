'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeToAllDriverLocations } from '@/lib/queries/delivery';
import { approveUserRole, requestRoleDetails, rejectUserRole } from '@/lib/queries/users';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { 
  Users, 
  AlertTriangle, 
  Loader2, 
  RefreshCw,
  X,
  Navigation,
  Truck,
  IndianRupee,
  Route,
  MapPin,
  XCircle,
  FileText,
  Search,
  ShieldCheck,
  Check,
  Ban,
  Clock,
  Phone,
  UserCheck,
  Plus,
  PackageOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DriverProfile, RiderTrip } from '@/types/delivery';
import { riderPaymentConverter, RiderPayment } from '@/types/payout';
import type { Order, AppUser } from '@/types';
import { MissedDeliveryModal } from '@/components/admin/MissedDeliveryModal';
import { useAuthStore } from '@/store/authStore';

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-unsafe-declaration-merging, no-var */
declare global {
  interface Window {
    google?: typeof google;
    initGoogleMap?: () => void;
  }
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-unsafe-declaration-merging, no-var */

function getTimestampMs(timestamp: any): number {
  if (!timestamp) return 0;
  if (timestamp.seconds) return timestamp.seconds * 1000;
  if (timestamp.toDate) return timestamp.toDate().getTime();
  if (typeof timestamp === 'string') return new Date(timestamp).getTime();
  return 0;
}

export default function AdminDeliveryOversightPage() {
  const { user, isHydrated } = useAuthStore();
  const isAdmin = user?.role === 'admin' || (user as any)?.is_superadmin === true || user?.email?.toLowerCase().trim() === 'closeon.st@gmail.com';

  const [activeDrivers, setActiveDrivers] = useState<DriverProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [riderTrips, setRiderTrips] = useState<RiderTrip[]>([]);
  const [payments, setPayments] = useState<RiderPayment[]>([]);

  // Real-time Registered Riders list for Fleet Management
  const [allRiders, setAllRiders] = useState<AppUser[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'online' | 'requested' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [showDevActions, setShowDevActions] = useState(false);
  
  // Info Request Modal
  const [infoModalRider, setInfoModalRider] = useState<AppUser | null>(null);
  const [infoNote, setInfoNote] = useState('');
  const [infoFields, setInfoFields] = useState('Vehicle Reg, Driving License');

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  
  const [inactiveDriverAlerts, setInactiveDriverAlerts] = useState<DriverProfile[]>([]);
  const [pickUpAnomalyAlerts, setPickUpAnomalyAlerts] = useState<Order[]>([]);
  const [resolveOrder, setResolveOrder] = useState<Order | null>(null);

  const selectedDriver = activeDrivers.find(d => d.uid === selectedDriverId) || null;

  // Real-time Fleet Listener
  useEffect(() => {
    if (!isHydrated || !user || !isAdmin) return;
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      const rawRiders = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppUser))
        .filter(u => u.role === 'delivery' || (u as any).roles?.delivery || u.phone === '+919900990044' || u.phone === '+919930577000');
      
      // Deduplicate by unique phone number or email (keeping active primary account)
      const seen = new Set<string>();
      const deduped: AppUser[] = [];
      
      const sorted = [...rawRiders].sort((a, b) => {
        if (a.email && !b.email) return -1;
        if (!a.email && b.email) return 1;
        return 0;
      });

      for (const r of sorted) {
        const key = r.phone || r.email || r.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(r);
        }
      }

      setAllRiders(deduped);
    }, err => console.warn("Admin Riders listener error:", err.message));
    return () => unsub();
  }, [isHydrated, user, isAdmin]);

  // Payments
  useEffect(() => {
    if (!isHydrated || !user || !isAdmin) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'rider_payments').withConverter(riderPaymentConverter),
      where('calculatedAt', '>=', Timestamp.fromDate(startOfDay))
    );
    const unsub = onSnapshot(q, snap => setPayments(snap.docs.map(d => d.data())));
    return () => unsub();
  }, [isHydrated, user, isAdmin]);

  // Anomalies
  useEffect(() => {
    const checkAnomalies = () => {
      const now = Date.now();
      const tenMinAgo = now - 10 * 60 * 1000;
      const inactive = activeDrivers.filter((d) => {
        if (!d.currentLocation?.updatedAt) return true;
        return getTimestampMs(d.currentLocation.updatedAt) < tenMinAgo;
      });
      setInactiveDriverAlerts(inactive);

      const sixtyMinAgo = now - 60 * 60 * 1000;
      const pickUpAnomaly = orders.filter((o) => {
        if (o.status !== 'picked_up' || !o.updated_at) return false;
        return getTimestampMs(o.updated_at) < sixtyMinAgo;
      });
      setPickUpAnomalyAlerts(pickUpAnomaly);
    };

    checkAnomalies();
    const interval = setInterval(checkAnomalies, 30000);
    return () => clearInterval(interval);
  }, [activeDrivers, orders]);

  // Map Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Sync state to refs for marker callbacks
  const ordersRef = useRef<Order[]>([]);
  const tripsRef = useRef<RiderTrip[]>([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { tripsRef.current = riderTrips; }, [riderTrips]);

  const handleSelectDriver = (driver: DriverProfile) => {
    setSelectedDriverId(driver.uid);
    if (driver.currentLocation && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: driver.currentLocation.lat, lng: driver.currentLocation.lng });
      googleMapRef.current.setZoom(16);
      const marker = markersRef.current.get(driver.uid);
      if (marker && infoWindowRef.current) google.maps.event.trigger(marker, 'click');
    } else {
      toast.error(`${driver.name || 'Rider'} has no active GPS signal right now.`);
    }
  };

  // Google Maps init
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function initMap() {
      if (!mapRef.current) return;
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 18.5204, lng: 73.8567 },
        zoom: 13,
        styles: [
          { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e9e9e9' }] },
        ],
      });
      googleMapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();
      setIsMapLoaded(true);
    }
    if (window.google?.maps) initMap();
    else {
      window.initGoogleMap = initMap;
      const key = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
      if (!document.getElementById('google-maps-js-sdk') && key) {
        const script = document.createElement('script');
        script.id = 'google-maps-js-sdk';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initGoogleMap&loading=async`;
        script.async = true;
        document.head.appendChild(script);
      }
    }
    const mRef = markersRef.current;
    return () => { mRef.forEach(m => m.setMap(null)); mRef.clear(); };
  }, []);

  // Location listener & Marker updates
  useEffect(() => {
    if (!isHydrated || !user || !isAdmin) return;
    const unsub = subscribeToAllDriverLocations((driversList) => {
      setActiveDrivers(driversList);
      if (isMapLoaded && googleMapRef.current) {
        driversList.forEach((driver) => {
          if (!driver.currentLocation) return;
          const { lat, lng } = driver.currentLocation;
          let marker = markersRef.current.get(driver.uid);
          if (marker) {
            marker.setPosition({ lat, lng });
          } else {
            marker = new google.maps.Marker({
              position: { lat, lng },
              map: googleMapRef.current,
              label: { text: (driver.name || 'R').slice(0, 2).toUpperCase(), color: '#ffffff', fontSize: '10px' },
              icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#ff6b00', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2, scale: 16 }
            });
            marker.addListener('click', () => {
              const drvTrips = tripsRef.current.filter(t => t.riderId === driver.uid).map(t => t.id);
              const drvOrders = ordersRef.current.filter(o => o.rider_trip_id && drvTrips.includes(o.rider_trip_id));
              const delivered = drvOrders.filter(o => o.status === 'delivered').length;
              
              infoWindowRef.current!.setContent(`
                <div style="padding: 10px; font-family: sans-serif; font-size: 11px;">
                  <h4 style="margin: 0 0 2px 0; font-weight: 900; color: #ff6b00;">${driver.name}</h4>
                  <p style="margin: 0 0 6px 0; color: #64748b;">📞 ${driver.phone}</p>
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; text-align: center;">
                    <span style="font-size: 9px; color: #475569;">WORKLOAD</span><br/>
                    <span style="font-weight: bold;">${delivered} / ${drvOrders.length} Done</span>
                  </div>
                </div>
              `);
              infoWindowRef.current!.open(googleMapRef.current!, marker as google.maps.Marker);
            });
            markersRef.current.set(driver.uid, marker);
          }
        });
        markersRef.current.forEach((marker, uid) => {
          if (!driversList.some(d => d.uid === uid)) { marker.setMap(null); markersRef.current.delete(uid); }
        });
      }
    });
    return () => unsub();
  }, [isMapLoaded, isHydrated, user, isAdmin]);

  // Data Listeners: Orders and RiderTrips for today
  useEffect(() => {
    if (!isHydrated || !user || !isAdmin) return;
    const todayStr = new Date().toISOString().split('T')[0];

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('date', '==', todayStr)), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    }, err => console.warn("Admin Orders listener error:", err.message));

    const start = new Date(); start.setHours(0,0,0,0);
    const unsubTrips = onSnapshot(query(collection(db, 'rider_trips'), where('createdAt', '>=', Timestamp.fromDate(start))), snap => {
      setRiderTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderTrip)));
    }, err => console.warn("Admin Trips listener error:", err.message));

    return () => { unsubOrders(); unsubTrips(); };
  }, [isHydrated, user, isAdmin]);

  // Admin Actions on Riders
  const handleApproveRider = async (rider: AppUser) => {
    try {
      await approveUserRole(rider.id, rider.phone, rider.name || 'Rider', 'delivery');
      toast.success(`Approved & Verified Rider ${rider.name || rider.phone}! 🎉`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve rider');
    }
  };

  const handleRevokeApproval = async (rider: AppUser) => {
    if (!confirm(`Are you sure you want to un-approve ${rider.name || rider.phone}? They will be locked until approved again.`)) return;
    try {
      const userRef = doc(db, 'users', rider.id);
      await updateDoc(userRef, {
        is_approved: false,
        verification_status: 'pending',
        updated_at: Timestamp.now()
      });
      toast.success(`Approval revoked for ${rider.name || rider.phone}. Account set to Pending.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke approval');
    }
  };

  const handleQuickApproveByPhone = async () => {
    const phoneInput = prompt('Enter Rider Phone Number (+91...):', '+919900990044');
    if (!phoneInput) return;

    try {
      const targetRider = allRiders.find(r => r.phone === phoneInput.trim());
      if (targetRider) {
        await approveUserRole(targetRider.id, targetRider.phone, targetRider.name || 'Rider', 'delivery');
        toast.success(`Rider ${targetRider.name || targetRider.phone} Approved & Verified! 🎉`);
      } else {
        const { getAllUsers } = await import('@/lib/queries/users');
        const usersList = await getAllUsers();
        const found = usersList.find(u => u.phone === phoneInput.trim());
        if (found) {
          await approveUserRole(found.id, found.phone, found.name || 'Rider', 'delivery');
          toast.success(`User ${found.name || found.phone} set to Delivery role & Approved! 🎉`);
        } else {
          toast.error(`No user registered with phone number ${phoneInput.trim()}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve rider by phone');
    }
  };

  const handleSendInfoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!infoModalRider || !infoNote.trim()) {
      toast.error('Please enter a note for the rider');
      return;
    }

    try {
      const fields = infoFields.split(',').map(s => s.trim()).filter(Boolean);
      await requestRoleDetails(infoModalRider.id, infoModalRider.phone, fields, infoNote.trim());
      toast.success(`Info requested from ${infoModalRider.name || infoModalRider.phone}`);
      setInfoModalRider(null);
      setInfoNote('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to request info');
    }
  };

  const handleRejectRider = async (rider: AppUser) => {
    const reason = prompt(`Reason for rejecting ${rider.name || rider.phone}:`, 'Documentation incomplete or invalid');
    if (!reason) return;

    try {
      await rejectUserRole(rider.id, rider.phone, reason);
      toast.success(`Rejected rider application for ${rider.name || rider.phone}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject rider');
    }
  };

  const pendingCount = orders.filter((o) => ['vendor_notified', 'vendor_preparing', 'vendor_ready', 'rider_assigned', 'rider_en_route_pickup'].includes(o.status)).length;
  const tiffinsInTransit = orders.filter((o) => o.status === 'picked_up' || o.status === 'out_for_delivery').length;
  
  const avgPaymentPerRider = new Set(payments.map(p => p.riderId)).size > 0 
    ? payments.reduce((sum, p) => sum + p.totalPayment, 0) / new Set(payments.map(p => p.riderId)).size 
    : 0;
  const avgTripDistance = payments.length > 0 
    ? payments.reduce((sum, p) => sum + p.totalDistanceKm, 0) / payments.length 
    : 0;

  if (!isHydrated) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  const getDriverOrders = (uid: string) => {
    const drvTrips = riderTrips.filter(t => t.riderId === uid).map(t => t.id);
    return orders.filter(o => o.rider_trip_id && drvTrips.includes(o.rider_trip_id));
  };

  // Filtered Riders List
  const filteredRiders = allRiders.filter(r => {
    const isOnline = activeDrivers.some(d => d.uid === r.id);
    const matchesSearch = 
      (r.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.phone || '').includes(searchQuery) ||
      (r.vehicle_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.license_number || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'pending') {
      return !r.is_approved && r.verification_status !== 'rejected' && r.verification_status !== 'details_requested';
    }
    if (filterTab === 'online') {
      return isOnline;
    }
    if (filterTab === 'requested') {
      return r.verification_status === 'details_requested';
    }
    if (filterTab === 'rejected') {
      return r.is_rejected || r.verification_status === 'rejected';
    }
    return true;
  });

  const pendingApprovalCount = allRiders.filter(r => !r.is_approved && r.verification_status !== 'rejected' && r.verification_status !== 'details_requested').length;
  const detailsRequestedCount = allRiders.filter(r => r.verification_status === 'details_requested').length;
  const rejectedRidersCount = allRiders.filter(r => r.is_rejected || r.verification_status === 'rejected').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-28 p-4 md:p-6 overflow-hidden">
      {/* Top Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">Security & Logistics</span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">Logistics & Fleet Control</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Approve Rider Button */}
          <button 
            onClick={handleQuickApproveByPhone}
            className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all rounded-xl text-xs font-black shadow-xs flex items-center gap-2"
          >
            <UserCheck className="w-4 h-4" /> Quick Approve Rider
          </button>

          {/* Master 1-Click Auto Dispatch */}
          <button 
            onClick={async () => {
              setIsDispatching(true);
              const toastId = toast.loading('Step 1/3: Generating daily deliveries...');
              try {
                const { generateTodayDeliveries, forceFormBatches, forceAssignRiders } = await import('@/lib/queries/delivery');
                
                const genRes = await generateTodayDeliveries();
                toast.loading(`Step 2/3: Forming kitchen batches (${genRes.created || 0} orders)...`, { id: toastId });
                
                const batchRes = await forceFormBatches();
                toast.loading(`Step 3/3: Auto-assigning fleet (${batchRes.batchesCreated || 0} batches)...`, { id: toastId });
                
                const assignRes = await forceAssignRiders();
                toast.success(`🎉 Auto-Dispatch Completed! Assigned ${assignRes.assignedCount || 0} batches to riders.`, { id: toastId, duration: 4000 });
              } catch (err: any) {
                toast.error(err.message || 'Auto-dispatch failed', { id: toastId });
              } finally {
                setIsDispatching(false);
              }
            }}
            disabled={isDispatching}
            className="h-10 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white transition-all rounded-xl text-xs font-black shadow-xs flex items-center gap-2 disabled:opacity-50"
          >
            {isDispatching ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : <RefreshCw className="w-4 h-4 text-brand" />}
            {isDispatching ? 'Dispatching Fleet...' : 'Auto-Dispatch Fleet'}
          </button>

          {/* Consolidated Advanced Controls Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowDevActions(prev => !prev)}
              className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-all rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5"
            >
              <Route className="w-3.5 h-3.5 text-slate-400" />
              Advanced
              <span className="text-[10px] text-slate-400">▾</span>
            </button>

            {showDevActions && (
              <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 animate-fade-in space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1.5">Manual Step Execution</p>
                <button
                  onClick={async () => {
                    setShowDevActions(false);
                    const { generateTestDeliveryFn } = await import('@/lib/queries/delivery');
                    toast.promise(generateTestDeliveryFn(), {
                      loading: 'Generating test flow...',
                      success: (res: any) => res.message || 'Test flow generated',
                      error: 'Failed to generate test flow'
                    });
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-800 hover:bg-purple-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                  1-Click Simulation Flow
                </button>
                <button
                  onClick={async () => {
                    setShowDevActions(false);
                    const { generateTodayDeliveries } = await import('@/lib/queries/delivery');
                    toast.promise(generateTodayDeliveries(), {
                      loading: 'Generating deliveries...',
                      success: (res: any) => `Generated: ${res.created}, Skipped: ${res.skipped}`,
                      error: 'Failed to generate deliveries'
                    });
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-800 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Generate Deliveries Only
                </button>
                <button
                  onClick={async () => {
                    setShowDevActions(false);
                    const { forceFormBatches } = await import('@/lib/queries/delivery');
                    toast.promise(forceFormBatches(), {
                      loading: 'Forming batches...',
                      success: (res: any) => res.debugStr || `Batches created: ${res.batchesCreated}`,
                      error: 'Failed to form batches'
                    });
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-800 hover:bg-indigo-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <PackageOpen className="w-3.5 h-3.5 text-indigo-600" />
                  Form Batches Only
                </button>
                <button
                  onClick={async () => {
                    setShowDevActions(false);
                    const { forceAssignRiders } = await import('@/lib/queries/delivery');
                    toast.promise(forceAssignRiders(), {
                      loading: 'Assigning riders...',
                      success: (res: any) => res.message || 'Riders assigned',
                      error: 'Failed to assign riders'
                    });
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-800 hover:bg-emerald-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  Assign Available Fleet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, title: 'Fleet Online', val: activeDrivers.length, unit: `of ${allRiders.length} Total`, bg: 'bg-emerald-50 text-emerald-700' },
          { icon: Truck, title: 'In Transit', val: tiffinsInTransit, unit: 'Tiffins', bg: 'bg-blue-50 text-blue-700' },
          { icon: Route, title: 'Avg Trip Distance', val: avgTripDistance.toFixed(1), unit: 'km', bg: 'bg-indigo-50 text-indigo-700' },
          { icon: IndianRupee, title: 'Avg Pay per Rider', val: `₹${avgPaymentPerRider.toFixed(0)}`, unit: '/ day', bg: 'bg-amber-50 text-amber-700' }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-200/80 p-4 md:p-5 rounded-2xl shadow-xs flex items-center gap-4 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}><s.icon className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{s.title}</p>
              <h4 className="text-xl font-extrabold text-slate-900 leading-none mt-1 truncate">{s.val} <span className="text-xs font-medium text-slate-500">{s.unit}</span></h4>
            </div>
          </div>
        ))}
      </div>

      {/* Map & Security Alerts Section */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between px-1 mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-extrabold text-slate-900">Live GPS Fleet Map</h3>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {activeDrivers.length} GPS Active
            </span>
          </div>
          <div className="h-80 rounded-2xl bg-slate-50 border border-slate-200 relative flex items-center justify-center overflow-hidden">
            {process.env.NEXT_PUBLIC_GMAPS_KEY ? (
              <div ref={mapRef} className="absolute inset-0" />
            ) : (
              <div className="text-center text-slate-500 p-4">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-bold">Google Maps Live Tracker</p>
                <p className="text-[11px] text-slate-400 mt-1">Configure NEXT_PUBLIC_GMAPS_KEY to view real-time GPS routes</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <AnimatePresence mode="wait">
            {!selectedDriver ? (
              <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">Security & Delay Alerts</h3>
                </div>
                <div className="space-y-3">
                  {(inactiveDriverAlerts.length === 0 && pickUpAnomalyAlerts.length === 0) ? (
                    <p className="text-xs text-slate-400 text-center py-12">No delivery anomalies detected today.</p>
                  ) : (
                    <>
                      {inactiveDriverAlerts.map(d => (
                        <div key={d.uid} className="bg-white/10 border border-white/10 rounded-2xl p-3.5">
                          <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">Rider Inactive</span>
                          <p className="text-xs font-bold mt-1.5 text-white">{d.name}</p>
                          <p className="text-[10px] text-slate-400">GPS Signal lost &gt; 10m.</p>
                        </div>
                      ))}
                      {pickUpAnomalyAlerts.map(o => (
                        <div key={o.id} className="bg-white/10 border border-white/10 rounded-2xl p-3.5">
                          <span className="text-[9px] font-black uppercase text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">Transit Lag</span>
                          <p className="text-xs font-bold mt-1.5 text-white">Order #{o.id.slice(-6)}</p>
                          <p className="text-[10px] text-slate-400">Picked up &gt; 60m ago.</p>
                          <button 
                            onClick={() => setResolveOrder(o)}
                            className="mt-2.5 w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-xl transition-colors"
                          >
                            Resolve Issue
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="driver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">Selected Rider</span>
                  <button onClick={() => setSelectedDriverId(null)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{selectedDriver.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">{selectedDriver.phone}</p>
                <div className="mt-5">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Delivery Workload</h4>
                  {(() => {
                    const drvOrders = getDriverOrders(selectedDriver.uid);
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>Progress</span>
                          <span className="text-slate-900">{drvOrders.filter(o => o.status === 'delivered').length} / {drvOrders.length}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                          <div className="h-full bg-slate-900 transition-all" style={{ width: `${drvOrders.length ? (drvOrders.filter(o => o.status === 'delivered').length / drvOrders.length) * 100 : 0}%` }} />
                        </div>
                        
                        {drvOrders.length > 0 && (
                          <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                            {drvOrders.map(o => (
                              <div key={o.id} className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400">Order #{o.id.slice(-4)}</p>
                                  <p className="text-xs font-bold text-slate-800">{o.status.replace(/_/g, ' ')}</p>
                                </div>
                                {o.status !== 'delivered' && (
                                  <button
                                    onClick={() => setResolveOrder(o)}
                                    className="px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-700 rounded-lg shadow-xs hover:bg-slate-50"
                                  >
                                    Manage
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── FULL FLEET MANAGEMENT SECTION ───────────────────────────────────── */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-700" /> Fleet Verification & Partner Controls
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Approve, inspect, and manage rider partner accounts, vehicle details, and active status.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleQuickApproveByPhone}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Approve Rider by Phone
            </button>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto scrollbar-none max-w-full">
              {[
                { key: 'all', label: 'All', count: allRiders.length },
                { key: 'pending', label: 'Pending Approval', count: pendingApprovalCount, alert: pendingApprovalCount > 0 },
                { key: 'online', label: 'Active Online', count: activeDrivers.length },
                { key: 'requested', label: 'Info Requested', count: detailsRequestedCount },
                { key: 'rejected', label: 'Rejected', count: rejectedRidersCount },
              ].map((tab) => {
                const active = filterTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilterTab(tab.key as any)}
                    className={`px-3.5 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 shrink-0 ${
                      active 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {tab.count}
                    </span>
                    {tab.alert && !active && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search fleet by name, phone (+91...), vehicle number, or license #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Riders Table / Cards Grid */}
        {filteredRiders.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-600">No riders match the selected filter or search.</p>
            <button
              onClick={handleQuickApproveByPhone}
              className="px-4 py-2 bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" /> Approve Rider by Phone Number
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRiders.map((rider) => {
              const isOnline = activeDrivers.some(d => d.uid === rider.id);
              const liveProfile = activeDrivers.find(d => d.uid === rider.id);
              const isApproved = rider.is_approved === true || rider.verification_status === 'verified';
              const isInfoReq = rider.verification_status === 'details_requested';
              const isRejected = rider.is_rejected || rider.verification_status === 'rejected';

              const riderOrders = getDriverOrders(rider.id);
              const completedCount = riderOrders.filter(o => o.status === 'delivered').length;

              return (
                <div 
                  key={rider.id}
                  className={`bg-white border rounded-2xl p-4 transition-all hover:shadow-md relative overflow-hidden w-full min-w-0 flex flex-col justify-between gap-3.5 ${
                    !isApproved && !isRejected && !isInfoReq 
                      ? 'border-amber-300 ring-2 ring-amber-400/20 bg-amber-50/10' 
                      : 'border-slate-200/80'
                  }`}
                >
                  {/* Rider Card Header */}
                  <div className="flex items-start justify-between gap-2 w-full min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-slate-700 text-xs">
                          {(rider.name || 'R').slice(0, 2).toUpperCase()}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-xs md:text-sm text-slate-900 tracking-tight leading-tight truncate">
                          {rider.name || 'Unnamed Rider'}
                        </h4>
                        <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                          <Phone className="w-3 h-3 shrink-0" /> <span className="truncate">{rider.phone}</span>
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 whitespace-nowrap">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </span>
                      ) : isInfoReq ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/80 whitespace-nowrap">
                          <FileText className="w-3 h-3" /> Info Req
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/80 whitespace-nowrap">
                          <XCircle className="w-3 h-3" /> Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80 whitespace-nowrap">
                          <Clock className="w-3 h-3" /> Pending Review
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rider Details Grid */}
                  <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 space-y-2 text-xs text-slate-600 w-full min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[9.5px] shrink-0">Vehicle Reg:</span>
                      <span className="font-bold text-slate-800 truncate text-[11px] text-right">{rider.vehicle_number || 'Not submitted'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[9.5px] shrink-0">License #:</span>
                      <span className="font-bold text-slate-800 truncate text-[11px] text-right">{rider.license_number || 'Not submitted'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[9.5px] shrink-0">Tasks Today:</span>
                      <span className="font-bold text-slate-800 truncate text-[11px] text-right">{completedCount} / {riderOrders.length} delivered</span>
                    </div>
                    {liveProfile?.currentLocation && (
                      <div className="flex items-center justify-between gap-2 min-w-0 text-emerald-700 font-bold pt-1.5 border-t border-slate-200/50">
                        <span className="uppercase text-[9.5px] text-slate-400 shrink-0">GPS Location:</span>
                        <span className="truncate text-[11px] text-right">{liveProfile.currentLocation.lat.toFixed(4)}, {liveProfile.currentLocation.lng.toFixed(4)}</span>
                      </div>
                    )}
                  </div>

                  {/* Admin Note if requested info */}
                  {rider.admin_note && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 text-[11px] text-amber-900 w-full min-w-0">
                      <span className="font-bold text-[9px] uppercase tracking-wider block text-amber-700">Admin Note:</span>
                      <p className="truncate mt-0.5">{rider.admin_note}</p>
                    </div>
                  )}

                  {/* Admin Actions Bar - Explicit Approval Controls */}
                  <div className="flex items-center gap-1.5 w-full pt-1">
                    {!isApproved ? (
                      <button
                        onClick={() => handleApproveRider(rider)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve Rider ⚡
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevokeApproval(rider)}
                        className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1"
                        title="Revoke Approval"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-500" /> Revoke
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setInfoModalRider(rider);
                        setInfoNote(rider.admin_note || 'Please upload clear vehicle RC & driving license.');
                      }}
                      className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                      title="Request Info / Note"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-[11px]">Note</span>
                    </button>

                    {!isRejected && (
                      <button
                        onClick={() => handleRejectRider(rider)}
                        className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                        title="Reject Rider"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-500" />
                        <span className="text-[11px]">Reject</span>
                      </button>
                    )}

                    {liveProfile && (
                      <button
                        onClick={() => handleSelectDriver(liveProfile)}
                        className="px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                        title="Focus on Map"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Track</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Missed Delivery Modal */}
      {resolveOrder && (
        <MissedDeliveryModal
          isOpen={!!resolveOrder}
          onClose={() => setResolveOrder(null)}
          order={resolveOrder as any}
          activeDrivers={activeDrivers}
          onSuccess={() => setResolveOrder(null)}
        />
      )}

      {/* Info Request Modal */}
      {infoModalRider && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> Request Details from Rider
              </h3>
              <button onClick={() => setInfoModalRider(null)} className="p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Send a custom detail request to <strong className="text-slate-800">{infoModalRider.name || infoModalRider.phone}</strong>. This note will appear on their app screen.
            </p>

            <form onSubmit={handleSendInfoRequest} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Requested Information Fields</label>
                <input
                  type="text"
                  value={infoFields}
                  onChange={(e) => setInfoFields(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Vehicle RC, Driving License, Clear Photo"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message / Note for Rider</label>
                <textarea
                  value={infoNote}
                  onChange={(e) => setInfoNote(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 h-24"
                  placeholder="e.g. Please upload a clear photo of your driving license number and vehicle registration plate."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInfoModalRider(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Send Request Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
