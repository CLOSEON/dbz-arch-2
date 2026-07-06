'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeToAllDriverLocations } from '@/lib/queries/delivery';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
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
  MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DriverProfile, RiderTrip } from '@/types/delivery';
import { riderPaymentConverter, RiderPayment } from '@/types/payout';
import type { Order } from '@/types';

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-unsafe-declaration-merging, no-var */
declare global {
  namespace google {
    namespace maps {
      interface Map {
        panTo(latLng: { lat: number; lng: number }): void;
        setZoom(zoom: number): void;
      }
      interface Marker {
        setMap(map: Map | null): void;
        setPosition(latLng: { lat: number; lng: number }): void;
        addListener(event: string, handler: () => void): void;
      }
      interface InfoWindow {
        setContent(content: string): void;
        open(map: Map, marker: Marker): void;
      }
      class Map {
        constructor(el: HTMLElement | null, options: unknown);
      }
      class Marker {
        constructor(options: unknown);
      }
      class InfoWindow {
        constructor();
      }
      var SymbolPath: {
        CIRCLE: unknown;
      };
      var event: {
        trigger(instance: unknown, eventName: string, ...args: unknown[]): void;
      };
    }
  }
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

import { useAuthStore } from '@/store/authStore';

export default function AdminDeliveryOversightPage() {
  const { user, isHydrated } = useAuthStore();
  const [activeDrivers, setActiveDrivers] = useState<DriverProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [riderTrips, setRiderTrips] = useState<RiderTrip[]>([]);
  const [payments, setPayments] = useState<RiderPayment[]>([]);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  
  const [inactiveDriverAlerts, setInactiveDriverAlerts] = useState<DriverProfile[]>([]);
  const [pickUpAnomalyAlerts, setPickUpAnomalyAlerts] = useState<Order[]>([]);

  const selectedDriver = activeDrivers.find(d => d.uid === selectedDriverId) || null;

  // Payments
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'rider_payments').withConverter(riderPaymentConverter),
      where('calculatedAt', '>=', startOfDay)
    );
    const unsub = onSnapshot(q, snap => setPayments(snap.docs.map(d => d.data())));
    return () => unsub();
  }, [user]);

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
    if (!isMapLoaded || !googleMapRef.current) return;
    const unsub = subscribeToAllDriverLocations((driversList) => {
      setActiveDrivers(driversList);
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
    });
    return () => unsub();
  }, [isMapLoaded]);

  // Data Listeners: Orders and RiderTrips for today
  useEffect(() => {
    if (!isHydrated || !user || user.role !== 'admin') return;
    const todayStr = new Date().toISOString().split('T')[0];

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('date', '==', todayStr)), snap => {
      setOrders(snap.docs.map(d => d.data() as Order));
    });

    // RiderTrips don't have a 'date' field, but their assigned orders do, or we can just fetch active ones.
    // For simplicity, fetch all RiderTrips created since start of today.
    const start = new Date(); start.setHours(0,0,0,0);
    const unsubTrips = onSnapshot(query(collection(db, 'rider_trips'), where('createdAt', '>=', start)), snap => {
      setRiderTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderTrip)));
    });

    return () => { unsubOrders(); unsubTrips(); };
  }, [isHydrated, user]);

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

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-28 md:space-y-6 md:pb-8 p-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">Security & Fleet</span>
          <h1 className="text-3xl font-black text-slate-900 mt-2">Logistics Oversight</h1>
        </div>
        <button onClick={() => toast.success('Stats synced!')} className="h-10 px-4 bg-white border border-slate-100 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2">
          <RefreshCw className="w-3 h-3" /> Force Sync
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-brand/10 text-brand">Fleet Online: {activeDrivers.length}</span>
        <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-amber-50 text-amber-700">Pending Setup: {pendingCount}</span>
        <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-rose-50 text-rose-700">Anomalies: {inactiveDriverAlerts.length + pickUpAnomalyAlerts.length}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, title: 'Riders Active', val: activeDrivers.length, unit: 'Online', bg: 'bg-brand/10 text-brand' },
          { icon: Truck, title: 'In Transit', val: tiffinsInTransit, unit: 'Tiffins', bg: 'bg-slate-50 text-slate-400' },
          { icon: Route, title: 'Avg Trip', val: avgTripDistance.toFixed(1), unit: 'km', bg: 'bg-emerald-50 text-emerald-500' },
          { icon: IndianRupee, title: 'Avg Pay', val: `₹${avgPaymentPerRider.toFixed(0)}`, unit: '/ rider', bg: 'bg-amber-50 text-amber-500' }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-100 p-5 rounded-[2rem] shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${s.bg}`}><s.icon className="w-6 h-6" /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.title}</p>
              <h4 className="text-xl font-black text-slate-900 leading-none mt-1">{s.val} <span className="text-sm">{s.unit}</span></h4>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between px-2 mb-4">
            <h3 className="text-sm font-black text-slate-900">Live Fleet Map</h3>
            <span className="w-2 h-2 rounded-full bg-brand animate-ping" />
          </div>
          <div className="h-96 rounded-2xl bg-slate-50 border border-slate-100 relative flex items-center justify-center overflow-hidden">
            {process.env.NEXT_PUBLIC_GMAPS_KEY ? (
              <div ref={mapRef} className="absolute inset-0" />
            ) : (
              <div className="text-center text-slate-400"><MapPin className="w-8 h-8 mx-auto mb-2" />No API Key</div>
            )}
          </div>
        </div>

        <div>
          <AnimatePresence mode="wait">
            {!selectedDriver ? (
              <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-slate-900 text-white rounded-[2rem] p-6">
                <div className="flex items-center gap-2 mb-5">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-black uppercase tracking-wider">Security Alerts</h3>
                </div>
                <div className="space-y-3">
                  {(inactiveDriverAlerts.length === 0 && pickUpAnomalyAlerts.length === 0) ? (
                    <p className="text-xs text-slate-400 text-center py-8">No anomalies detected.</p>
                  ) : (
                    <>
                      {inactiveDriverAlerts.map(d => (
                        <div key={d.uid} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                          <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">Rider Silent</span>
                          <p className="text-xs font-black mt-2">{d.name}</p>
                          <p className="text-[10px] text-slate-400">Offline for &gt; 10m.</p>
                        </div>
                      ))}
                      {pickUpAnomalyAlerts.map(o => (
                        <div key={o.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                          <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">Transit Lag</span>
                          <p className="text-xs font-black mt-2">Order {o.id.slice(-6)}</p>
                          <p className="text-[10px] text-slate-400">Picked up &gt; 60m ago.</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="driver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">Rider Profile</span>
                  <button onClick={() => setSelectedDriverId(null)} className="p-1.5 hover:bg-slate-100 rounded-full"><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <h3 className="text-lg font-black">{selectedDriver.name}</h3>
                <p className="text-xs font-bold text-slate-500 mt-1">{selectedDriver.phone}</p>
                <div className="mt-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Workload</h4>
                  {(() => {
                    const drvOrders = getDriverOrders(selectedDriver.uid);
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Progress</span>
                          <span className="text-brand">{drvOrders.filter(o => o.status === 'delivered').length} / {drvOrders.length}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand transition-all" style={{ width: `${drvOrders.length ? (drvOrders.filter(o => o.status === 'delivered').length / drvOrders.length) * 100 : 0}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
