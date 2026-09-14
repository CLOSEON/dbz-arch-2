'use client';

import { useEffect, useState, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

interface Location {
  lat: number;
  lng: number;
}

interface LiveTrackerMapProps {
  riderLocation: Location | null;
  destination: Location | null;
  riderName?: string;
}

function Directions({ origin, destination }: { origin: Location; destination: Location }) {
  const map = useMap();
  const [polyline, setPolyline] = useState<google.maps.Polyline>();

  useEffect(() => {
    if (!map) return;
    
    // Draw a simple straight line instead of calling Directions API
    // This avoids "REQUEST_DENIED" / "API not enabled" errors for new API keys
    const line = new google.maps.Polyline({
      map,
      path: [origin, destination],
      strokeColor: '#6366f1',
      strokeWeight: 4,
      strokeOpacity: 0.8,
      geodesic: true
    });
    
    setPolyline(line);

    return () => {
      line.setMap(null);
    };
  }, [map, origin, destination]);

  return null;
}

export default function LiveTrackerMap({ riderLocation, destination, riderName }: LiveTrackerMapProps) {
  const mapKey = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
  
  if (!mapKey) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[2rem] border border-slate-100 bg-slate-50 text-center shadow-inner">
        <p className="text-sm font-semibold text-slate-500">Google Maps key missing</p>
      </div>
    );
  }

  const center = riderLocation || destination || { lat: 28.6139, lng: 77.2090 };

  return (
    <div className="w-full h-72 rounded-[2rem] overflow-hidden relative shadow-lg shadow-brand/10 border-4 border-white">
      <APIProvider apiKey={mapKey}>
        <Map
          defaultCenter={center}
          defaultZoom={15}
          mapId="e8d538df0b457c11" // Requires Map ID for AdvancedMarkers
          disableDefaultUI
          gestureHandling="greedy"
        >
          {riderLocation && (
            <AdvancedMarker position={riderLocation} zIndex={100}>
              <div className="relative flex items-center justify-center">
                <div className="absolute w-12 h-12 bg-brand/30 rounded-full animate-ping" />
                <div className="w-10 h-10 bg-brand text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10 text-lg">
                  🛵
                </div>
              </div>
            </AdvancedMarker>
          )}

          {destination && (
            <AdvancedMarker position={destination}>
              <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white text-sm">
                🏠
              </div>
            </AdvancedMarker>
          )}

          {riderLocation && destination && (
            <Directions origin={riderLocation} destination={destination} />
          )}
        </Map>
      </APIProvider>
      
      {/* Floating Call Action */}
      {riderName && (
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-white flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-slate-800">{riderName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
