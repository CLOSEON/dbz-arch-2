'use client';

import { useEffect, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'framer-motion';

interface Location {
  lat: number;
  lng: number;
}

interface Stop {
  id: string;
  label: string;
  emoji: string;
  location: Location;
  done?: boolean;
}

interface LiveDeliveryMapProps {
  riderLocation: Location | null;
  stops?: Stop[];              // ordered list: pickups then dropoffs
  /** if true, shows all stops & route (Rider nav view) */
  navMode?: boolean;
  riderName?: string;
  className?: string;
}

// ── Smoothly interpolates the route polyline ──────────────────────────────────
function RouteRenderer({ waypoints }: { waypoints: Location[] }) {
  const map = useMap();
  const [polyline, setPolyline] = useState<google.maps.Polyline>();

  useEffect(() => {
    if (!map || waypoints.length < 2) return;

    // Draw straight lines through the waypoints to avoid
    // Directions API "REQUEST_DENIED" errors for local test keys.
    const line = new google.maps.Polyline({
      map,
      path: waypoints,
      strokeColor: '#ff6b00',
      strokeWeight: 5,
      strokeOpacity: 0.85,
      geodesic: true
    });
    
    setPolyline(line);

    return () => {
      line.setMap(null);
    };
  }, [map, waypoints]);

  return null;
}

// ── Auto-pan the map as rider moves ──────────────────────────────────────────
function MapPanner({ center, navMode }: { center: Location; navMode: boolean }) {
  const map = useMap();
  const prevCenter = useRef<Location | null>(null);

  useEffect(() => {
    if (!map) return;
    const prev = prevCenter.current;
    // Only pan if rider actually moved > 5m
    if (
      prev &&
      Math.abs(prev.lat - center.lat) < 0.00005 &&
      Math.abs(prev.lng - center.lng) < 0.00005
    )
      return;
    prevCenter.current = center;
    if (navMode) {
      map.panTo(center);
    } else {
      map.panTo(center);
    }
  }, [center, navMode, map]);

  return null;
}

// ── Animated rider marker with smooth CSS transition ─────────────────────────
function AnimatedRiderMarker({ location, riderName }: { location: Location; riderName?: string }) {
  return (
    <AdvancedMarker position={location} zIndex={200}>
      <div className="relative flex flex-col items-center">
        {/* Pulsing ring */}
        <div className="absolute w-14 h-14 rounded-full bg-brand/20 animate-ping" />
        {/* Bike bubble */}
        <div
          className="relative w-12 h-12 bg-brand text-white rounded-full flex items-center justify-center shadow-xl border-3 border-white z-10 text-xl"
          style={{ border: '3px solid white', transition: 'all 0.8s ease' }}
        >
          🛵
        </div>
        {/* Name label */}
        {riderName && (
          <div className="mt-1.5 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-md border border-slate-100 whitespace-nowrap">
            <span className="text-[10px] font-black text-slate-800">{riderName}</span>
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
}

// ── Stop marker ───────────────────────────────────────────────────────────────
function StopMarker({ stop }: { stop: Stop }) {
  return (
    <AdvancedMarker position={stop.location} zIndex={100}>
      <div className="relative flex flex-col items-center">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-lg transition-all ${
            stop.done ? 'bg-emerald-500 opacity-60 scale-90' : 'bg-slate-900'
          }`}
        >
          {stop.done ? '✓' : stop.emoji}
        </div>
        <div className="mt-1 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full shadow-sm border border-slate-100 whitespace-nowrap">
          <span className="text-[9px] font-black text-slate-700">{stop.label}</span>
        </div>
      </div>
    </AdvancedMarker>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LiveDeliveryMap({
  riderLocation,
  stops = [],
  navMode = false,
  riderName,
  className = '',
}: LiveDeliveryMapProps) {
  const mapKey = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
  const [mapReady, setMapReady] = useState(false);

  if (!mapKey) {
    return (
      <div className={`flex items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-center ${className}`} style={{ minHeight: 240 }}>
        <p className="text-sm font-semibold text-slate-400">Map unavailable</p>
      </div>
    );
  }

  const center =
    riderLocation ||
    stops.find((s) => !s.done)?.location ||
    stops[0]?.location ||
    { lat: 21.1458, lng: 79.0882 };

  // Build route waypoints: rider → active stops (in order)
  const activeStops = stops.filter((s) => !s.done);
  const routeWaypoints: Location[] = riderLocation
    ? [riderLocation, ...activeStops.map((s) => s.location)]
    : activeStops.map((s) => s.location);

  const mapHeight = navMode ? 400 : 260;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative overflow-hidden rounded-3xl shadow-xl border-2 border-white ${className}`}
        style={{ height: mapHeight }}
      >
        {/* LIVE badge */}
        <div className="absolute top-3 left-3 z-[999] flex items-center gap-1.5 bg-red-500 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          Live
        </div>

        {/* Nav mode legend */}
        {navMode && stops.length > 0 && (
          <div className="absolute top-3 right-3 z-[999] bg-white/90 backdrop-blur rounded-2xl shadow-lg px-3 py-2 space-y-1 max-w-[160px]">
            {stops.map((stop) => (
              <div key={stop.id} className="flex items-center gap-1.5">
                <span className={`text-xs ${stop.done ? 'opacity-40' : ''}`}>{stop.emoji}</span>
                <span className={`text-[10px] font-bold truncate ${stop.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {stop.label}
                </span>
                {stop.done && <span className="text-emerald-500 text-[10px] font-black">✓</span>}
              </div>
            ))}
          </div>
        )}

        <APIProvider apiKey={mapKey} onLoad={() => setMapReady(true)}>
          <Map
            defaultCenter={center}
            defaultZoom={navMode ? 13 : 15}
            mapId="e8d538df0b457c11"
            disableDefaultUI={!navMode}
            gestureHandling={navMode ? 'greedy' : 'none'}
            className="w-full h-full"
          >
            {/* Route polyline */}
            {mapReady && routeWaypoints.length >= 2 && (
              <RouteRenderer waypoints={routeWaypoints} />
            )}

            {/* Auto-pan */}
            {riderLocation && mapReady && (
              <MapPanner center={riderLocation} navMode={navMode} />
            )}

            {/* Rider marker */}
            {riderLocation && (
              <AnimatedRiderMarker location={riderLocation} riderName={navMode ? riderName : undefined} />
            )}

            {/* Stop markers */}
            {stops.map((stop) => (
              <StopMarker key={stop.id} stop={stop} />
            ))}
          </Map>
        </APIProvider>
      </motion.div>
    </AnimatePresence>
  );
}
