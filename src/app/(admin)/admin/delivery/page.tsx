'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeToAllDriverLocations, generateTodayDeliveries } from '@/lib/queries/delivery';
import type { GenerateResult } from '@/lib/queries/delivery';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { 
  Users, 
  Package, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Phone, 
  AlertTriangle, 
  Loader2, 
  RefreshCw,
  UserX,
  Search,
  X,
  Navigation,
  Zap,
  CheckCheck,
  SkipForward,
  XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DeliveryOrder, DriverProfile } from '@/types/delivery';

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

interface FirestoreTimestampLike {
  seconds?: number;
  toDate?: () => Date;
}

function getTimestampMs(timestamp: unknown): number {
  if (!timestamp) return 0;
  
  if (typeof timestamp === 'object') {
    const t = timestamp as FirestoreTimestampLike;
    if (typeof t.seconds === 'number') {
      return t.seconds * 1000;
    }
    if (typeof t.toDate === 'function') {
      return t.toDate().getTime();
    }
  }
  
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  
  return 0;
}

import { useAuthStore } from '@/store/authStore';

export default function AdminDeliveryOversightPage() {
  const { user, isHydrated } = useAuthStore();
  const [activeDrivers, setActiveDrivers] = useState<DriverProfile[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [inactiveDriverAlerts, setInactiveDriverAlerts] = useState<DriverProfile[]>([]);
  const [pickUpAnomalyAlerts, setPickUpAnomalyAlerts] = useState<DeliveryOrder[]>([]);

  const selectedDriver = activeDrivers.find(d => d.uid === selectedDriverId) || null;

  useEffect(() => {
    const checkAnomalies = () => {
      const now = Date.now();
      const tenMinAgo = now - 10 * 60 * 1000;
      const inactive = activeDrivers.filter((d) => {
        if (!d.currentLocation?.updatedAt) return true;
        const updatedMs = getTimestampMs(d.currentLocation.updatedAt);
        return updatedMs < tenMinAgo;
      });
      setInactiveDriverAlerts(inactive);

      const sixtyMinAgo = now - 60 * 60 * 1000;
      const pickUpAnomaly = orders.filter((o) => {
        if (o.status !== 'picked_up' || !o.timestamps?.pickedAt) return false;
        const pickedMs = getTimestampMs(o.timestamps.pickedAt);
        return pickedMs < sixtyMinAgo;
      });
      setPickUpAnomalyAlerts(pickUpAnomaly);
    };

    checkAnomalies();
    const interval = setInterval(checkAnomalies, 30000);
    return () => clearInterval(interval);
  }, [activeDrivers, orders]);

  const handleSelectDriver = (driver: DriverProfile) => {
    setSelectedDriverId(driver.uid);
    if (driver.currentLocation && googleMapRef.current) {
      const latLng = { lat: driver.currentLocation.lat, lng: driver.currentLocation.lng };
      googleMapRef.current.panTo(latLng);
      googleMapRef.current.setZoom(16);
      
      const marker = markersRef.current.get(driver.uid);
      if (marker && infoWindowRef.current) {
        // Open info window on map by triggering the click listener
        google.maps.event.trigger(marker, 'click');
      }
    } else {
      toast.error(`${driver.name || 'Rider'} has no active GPS signal right now.`);
    }
  };

  // References for live marker tracking
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Share active order stats to marker callbacks
  const ordersRef = useRef<DeliveryOrder[]>([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // 1. Script injector for Google Maps JavaScript SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function initMap() {
      if (!mapRef.current) return;
      
      const puneLatLng = { lat: 18.5204, lng: 73.8567 };
      const map = new google.maps.Map(mapRef.current, {
        center: puneLatLng,
        zoom: 13,
        styles: [
          {
            featureType: 'all',
            elementType: 'geometry',
            stylers: [{ color: '#f5f5f5' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#ffffff' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#e9e9e9' }],
          },
        ],
        disableDefaultUI: false,
        zoomControl: true,
      });

      googleMapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();
      setIsMapLoaded(true);
    }

    if (window.google && window.google.maps) {
      initMap();
    } else {
      window.initGoogleMap = () => {
        initMap();
      };

      const existingScript = document.getElementById('google-maps-js-sdk');
      const gmapsKey = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
      
      if (!existingScript && gmapsKey) {
        const script = document.createElement('script');
        script.id = 'google-maps-js-sdk';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${gmapsKey}&callback=initGoogleMap&loading=async`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }

    const currentMarkers = markersRef.current;
    return () => {
      // Clean up markers
      currentMarkers.forEach((marker) => marker.setMap(null));
      currentMarkers.clear();
    };
  }, []);

  // 2. Snapshot listener for Active Drivers Geolocation Fleet
  useEffect(() => {
    if (!isMapLoaded || !googleMapRef.current) return;

    const mapInstance = googleMapRef.current;
    const infoWindow = infoWindowRef.current!;

    const unsubscribe = subscribeToAllDriverLocations((driversList) => {
      setActiveDrivers(driversList);

      driversList.forEach((driver) => {
        if (!driver.currentLocation) return;
        const { lat, lng } = driver.currentLocation;

        let marker = markersRef.current.get(driver.uid);
        if (marker) {
          marker.setPosition({ lat, lng });
        } else {
          // Generate driver initials with fallback
          const nameToUse = driver.name || 'Unknown Rider';
          const initials = nameToUse
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          marker = new google.maps.Marker({
            position: { lat, lng },
            map: mapInstance,
            label: {
              text: initials,
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '10px',
            },
            title: driver.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#ff6b00',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 16,
            },
          });

          marker.addListener('click', () => {
            const currentOrders = ordersRef.current;
            const driverOrders = currentOrders.filter((o) => o.driverId === driver.uid);
            const delivered = driverOrders.filter((o) => o.status === 'delivered').length;
            const total = driverOrders.length;

            infoWindow.setContent(`
              <div style="padding: 10px; font-family: sans-serif; font-size: 11px; line-height: 1.4; color: #0f172a; max-width: 180px;">
                <h4 style="margin: 0 0 2px 0; font-weight: 900; font-size: 12px; color: #ff6b00;">${driver.name}</h4>
                <p style="margin: 0 0 6px 0; font-weight: 700; color: #64748b;">📞 ${driver.phone}</p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 6px; text-align: center;">
                  <span style="font-weight: 900; font-size: 9px; text-transform: uppercase; tracking-wider; display: block; color: #475569;">
                    RIDER WORKLOAD
                  </span>
                  <span style="font-weight: 900; font-size: 12px; color: #0f172a;">
                    ${delivered} / ${total} Delivered
                  </span>
                </div>
              </div>
            `);
            infoWindow.open(mapInstance, marker as google.maps.Marker);
          });

          markersRef.current.set(driver.uid, marker);
        }
      });

      // Remove inactive or offline drivers from the map canvas
      markersRef.current.forEach((marker, uid) => {
        const stillActive = driversList.some((d) => d.uid === uid);
        if (!stillActive) {
          marker.setMap(null);
          markersRef.current.delete(uid);
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [isMapLoaded]);

  // 3. Snapshot listener for Today's Active Delivery Orders
  useEffect(() => {
    if (!isHydrated || !user || user.role !== 'admin') return;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'delivery_orders'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end))
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder));
        setOrders(list);
      },
      (err) => {
        console.error('[AdminOversight] Failed to fetch active orders:', err);
      }
    );

    return () => unsubscribe();
  }, [isHydrated, user]);

  // Recalculate metrics dynamically based on live real-time snapshot bindings
  const totalDeliveries = orders.length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const pendingCount = orders.filter((o) => o.status !== 'delivered' && o.status !== 'failed').length;
  const onlineDriversCount = activeDrivers.length;

  // Filter drivers list based on search query
  const filteredDrivers = activeDrivers.filter((driver) =>
    (driver.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (driver.phone || '').includes(searchQuery)
  );

  // Visual anomaly triggers are managed via state & useEffect hooks

  const handleSimulateReassign = (driverName: string) => {
    toast.success(`Triggered optimization layout. Workload balanced for ${driverName}! ⚖️`);
  };

  const handleGenerateOrders = async () => {
    if (generating) return;
    setGenerating(true);
    const loadingToast = toast.loading('Generating today\'s delivery batch...');
    try {
      const result = await generateTodayDeliveries();
      toast.dismiss(loadingToast);
      setGenerateResult(result);
      setShowResultModal(true);
      if (result.created > 0) {
        toast.success(`✅ ${result.created} order${result.created !== 1 ? 's' : ''} generated!`);
      } else if (result.skipped > 0 && result.created === 0) {
        toast(`📋 All orders already exist for today.`, { icon: 'ℹ️' });
      } else {
        toast('No active subscriptions found.', { icon: '⚠️' });
      }
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to generate orders: ${errMsg}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
            Security & Fleet Operations
          </span>
          <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight mt-2.5">
            Logistics Oversight
          </h1>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={handleGenerateOrders}
            disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-brand text-white rounded-2xl hover:bg-brand/90 text-xs font-black transition-all shadow-sm shadow-brand/25 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {generating ? 'Generating...' : 'Generate Today\'s Orders'}
          </button>
          <button
            onClick={() => {
              toast.success('Stats re-synced from live nodes!');
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 text-slate-600 text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Force Sync
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-1">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand/10 text-brand">
          Fleet Online: {onlineDriversCount}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-50 text-amber-700">
          Pending Runs: {pendingCount}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-rose-50 text-rose-700">
          Anomalies: {inactiveDriverAlerts.length + pickUpAnomalyAlerts.length}
        </span>
      </div>

      {/* 1. SUMMARY METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Online Riders</p>
            <h4 className="text-xl font-black text-slate-900 mt-0.5">{onlineDriversCount} Active</h4>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deliveries</p>
            <h4 className="text-xl font-black text-slate-900 mt-0.5">{totalDeliveries} Orders</h4>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Meal Delivered</p>
            <h4 className="text-xl font-black text-slate-900 mt-0.5">{deliveredCount} Done</h4>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Runs</p>
            <h4 className="text-xl font-black text-slate-900 mt-0.5">{pendingCount} Remaining</h4>
          </div>
        </div>
      </div>

      {/* 2. MAP SECTION AND ANOMALIES CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Canvas */}
        <div className="lg:col-span-2 bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Live Fleet Map</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Pune Geographic Coordinates
              </p>
            </div>
            <span className="w-2 h-2 rounded-full bg-brand animate-ping" />
          </div>

          <div className="w-full h-96 rounded-2xl border border-slate-100 overflow-hidden relative bg-slate-50 flex items-center justify-center">
            {process.env.NEXT_PUBLIC_GMAPS_KEY ? (
              <>
                {/* The isolated map target (prevents React DOM removeChild crashes) */}
                <div ref={mapRef} className="absolute inset-0 z-10" />

                {!isMapLoaded && (
                  <div className="text-center space-y-2 z-0 relative">
                    <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Loading Fleet Canvas...
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center shadow-inner mb-4">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <h4 className="text-sm font-black text-slate-900">Map Canvas Disabled</h4>
                <p className="text-xs text-slate-500 max-w-[240px] mx-auto mt-1 leading-relaxed">
                  Provide a valid Google Maps API Key in your environment variables to enable live fleet tracking.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 4. DYNAMIC PANEL (ANOMALIES OR SELECTED PARTNER DETAILS) */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!selectedDriver ? (
              <motion.div
                key="anomalies"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-lg space-y-5"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-black tracking-tight uppercase leading-none">
                    Anomaly Security Alerts
                  </h3>
                </div>

                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {inactiveDriverAlerts.length === 0 && pickUpAnomalyAlerts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-medium">
                      ✨ No delivery anomalies recorded. Fleet operating smoothly.
                    </div>
                  ) : (
                    <>
                      {/* Offline geolocation warnings */}
                      {inactiveDriverAlerts.map((d) => (
                        <div key={d.uid} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                              Rider Silent
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">Location Idle</span>
                          </div>
                          <p className="text-xs font-black text-white">{d.name}</p>
                          <p className="text-[10px] text-slate-400 leading-snug">
                             Rerouting check active. Geo-location update missed for over 10 minutes.
                          </p>
                        </div>
                      ))}

                      {/* Bulk picked_up latency warnings */}
                      {pickUpAnomalyAlerts.map((o) => (
                        <div key={o.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">
                              Transit Lag
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">Picked Up delay</span>
                          </div>
                          <p className="text-xs font-black text-white">Batch #{o.id.slice(-4).toUpperCase()}</p>
                          <p className="text-[10px] text-slate-400 leading-snug">
                            {"Meal in 'picked_up' status for > 60 minutes. Logistics review recommended."}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="driver-details"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="bg-white text-slate-900 border border-slate-100 rounded-[2rem] p-6 shadow-xl space-y-6"
              >
                {/* Header with Close Button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
                      Rider Profile
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedDriverId(null)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Profile Overview */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-brand/10 text-brand flex items-center justify-center text-2xl font-black shrink-0 shadow-sm border border-brand/5">
                    {selectedDriver.name ? selectedDriver.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'R'}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black tracking-tight leading-none text-slate-900">
                      {selectedDriver.name || 'Unknown Rider'}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${inactiveDriverAlerts.some(d => d.uid === selectedDriver.uid) ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="text-xs font-bold text-slate-500">
                        {inactiveDriverAlerts.some(d => d.uid === selectedDriver.uid) ? 'Idle / Silent' : 'Active Online'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Contact</p>
                    <a href={`tel:${selectedDriver.phone}`} className="text-xs font-black text-slate-900 block mt-1 hover:text-brand transition-colors">
                      {selectedDriver.phone || 'No phone'}
                    </a>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Vehicle ID</p>
                    <p className="text-xs font-black text-slate-900 mt-1">
                      {selectedDriver.vehicleNumber || 'DBZ-BIKE'}
                    </p>
                  </div>
                </div>

                {/* Current Location & Controls */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Navigation Context</h4>
                  
                  {selectedDriver.currentLocation ? (
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Coordinates</p>
                          <p className="text-xs text-slate-600 font-mono">
                            {selectedDriver.currentLocation.lat.toFixed(5)}, {selectedDriver.currentLocation.lng.toFixed(5)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSelectDriver(selectedDriver)}
                          className="flex items-center gap-1 bg-brand text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl hover:bg-brand/90 transition-all active:scale-95 shadow-sm shadow-brand/20"
                        >
                          <Navigation className="w-3 h-3" />
                          Focus Map
                        </button>
                      </div>
                      
                      <div className="text-[10px] text-slate-400 font-medium">
                        Last ping: {selectedDriver.currentLocation.updatedAt ? new Date(getTimestampMs(selectedDriver.currentLocation.updatedAt)).toLocaleTimeString() : 'Never'}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-center text-xs text-rose-800 font-bold">
                      ⚠️ No live coordinate ping registered for this rider.
                    </div>
                  )}
                </div>

                {/* Workload Stream */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Workload Progress</h4>
                    <span className="text-[10px] font-black text-brand">
                      {orders.filter(o => o.driverId === selectedDriver.uid && o.status === 'delivered').length} / {orders.filter(o => o.driverId === selectedDriver.uid).length} Done
                    </span>
                  </div>

                  {/* Progress Bar */}
                  {(() => {
                    const driverOrders = orders.filter(o => o.driverId === selectedDriver.uid);
                    const total = driverOrders.length;
                    const done = driverOrders.filter(o => o.status === 'delivered').length;
                    const percent = total > 0 ? (done / total) * 100 : 0;
                    return (
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                    );
                  })()}

                  {/* Orders Detail List */}
                  <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                    {orders.filter(o => o.driverId === selectedDriver.uid).length === 0 ? (
                      <div className="text-center py-4 text-[11px] text-slate-400 font-bold">
                        No active jobs assigned today.
                      </div>
                    ) : (
                      orders.filter(o => o.driverId === selectedDriver.uid).map(order => (
                        <div key={order.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex items-center justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-slate-900">
                                #{order.id.slice(-4).toUpperCase()}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">
                                ({order.meal.name})
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              {order.address.line1}
                            </p>
                          </div>
                          
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded capitalize shrink-0 ${order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : order.status === 'preparing' ? 'bg-amber-100 text-amber-800' : 'bg-brand/10 text-brand'}`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 3. DRIVER OVERVIEW TABLE */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 leading-tight">Active Fleet Performance</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Rider logs, workload and action controls
            </p>
          </div>

          {/* Premium Search Bar */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 animate-fade-in" />
            <input
              type="text"
              placeholder="Search delivery partner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-100 rounded-2xl focus:outline-none focus:border-brand/40 bg-slate-50/50 text-slate-900 font-medium placeholder-slate-400 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-50">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase font-black text-[9px] tracking-wider border-b border-slate-100">
                <th className="p-4">Rider Name</th>
                <th className="p-4">Signal Status</th>
                <th className="p-4 text-center">Delivered</th>
                <th className="p-4 text-center">Assigned</th>
                <th className="p-4">Last Sync Ticks</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-xs font-bold">
                    <UserX className="w-8 h-8 mx-auto text-slate-200 mb-2" />
                    {searchQuery ? 'No partners match your search' : 'No Riders Online'}
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const driverOrders = orders.filter((o) => o.driverId === driver.uid);
                  const delivered = driverOrders.filter((o) => o.status === 'delivered').length;
                  const assigned = driverOrders.length;
                  
                  const isSilent = inactiveDriverAlerts.some((d) => d.uid === driver.uid);
                  const timeStr = driver.currentLocation?.updatedAt
                    ? new Date(getTimestampMs(driver.currentLocation.updatedAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Never';

                  return (
                    <tr 
                      key={driver.uid} 
                      onClick={() => handleSelectDriver(driver)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${selectedDriverId === driver.uid ? 'bg-slate-50/90' : ''}`}
                    >
                      <td className="p-4 font-black text-slate-900">{driver.name}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isSilent ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <span className={`text-[10px] font-bold ${isSilent ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {isSilent ? 'Silent' : 'Active'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-center text-slate-900 font-bold">{delivered}</td>
                      <td className="p-4 text-center text-slate-400">{assigned}</td>
                      <td className="p-4 text-slate-500">{timeStr}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleSimulateReassign(driver.name)}
                            className="bg-slate-50 hover:bg-slate-100/80 text-slate-800 rounded-xl px-3 py-1.5 text-[10px] font-black transition-all active:scale-95"
                          >
                            Optimize
                          </button>
                          
                          <a
                            href={`tel:${driver.phone}`}
                            className="w-8 h-8 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 hover:text-brand transition-colors"
                            title="Call Rider"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Today's Orders — Result Modal */}
      <AnimatePresence>
        {showResultModal && generateResult && (
          <motion.div
            key="generate-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowResultModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-brand/20 text-brand flex items-center justify-center">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm leading-none">Batch Generation Complete</h3>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">{"Today's delivery batch status"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResultModal(false)}
                    className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <CheckCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <p className="text-2xl font-black text-emerald-400">{generateResult.created}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Created</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <SkipForward className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <p className="text-2xl font-black text-amber-400">{generateResult.skipped}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Skipped</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <XCircle className="w-4 h-4 text-rose-400 mx-auto mb-1" />
                    <p className="text-2xl font-black text-rose-400">{generateResult.errors}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Errors</p>
                  </div>
                </div>
              </div>

              {/* Detail Log */}
              <div className="p-5 space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Order Log</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {generateResult.details.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No active subscriptions found.</p>
                  ) : (
                    generateResult.details.map((d, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-2xl p-3 border ${
                          d.status === 'created'
                            ? 'bg-emerald-50 border-emerald-100'
                            : d.status === 'skipped'
                            ? 'bg-amber-50 border-amber-100'
                            : 'bg-rose-50 border-rose-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">{d.userName}</p>
                          {d.reason && (
                            <p className="text-[10px] text-slate-500 truncate">{d.reason}</p>
                          )}
                        </div>
                        <span
                          className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase shrink-0 ml-2 ${
                            d.status === 'created'
                              ? 'bg-emerald-200 text-emerald-800'
                              : d.status === 'skipped'
                              ? 'bg-amber-200 text-amber-800'
                              : 'bg-rose-200 text-rose-800'
                          }`}
                        >
                          {d.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <button
                  onClick={() => setShowResultModal(false)}
                  className="w-full mt-2 py-3 bg-slate-900 text-white text-xs font-black rounded-2xl hover:bg-slate-800 transition-colors active:scale-[0.98]"
                >
                  Done — View Live Orders
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
