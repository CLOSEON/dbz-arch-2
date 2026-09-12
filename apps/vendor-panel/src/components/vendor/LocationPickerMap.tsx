'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  onLocationSelect: (lat: number, lng: number) => void;
  kitchenName?: string;
}

// Crisp Chef Hat Pin
function createKitchenIcon(name?: string) {
  return L.divIcon({
    className: 'dabzzo-kitchen-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); cursor: grab;">
        <div style="background: linear-gradient(135deg, #F97316, #EA580C); color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(234,88,12,0.45); border: 2.5px solid white;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>
            <line x1="6" y1="17" x2="18" y2="17"/>
          </svg>
        </div>
        <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #EA580C; margin-top: -1px;"></div>
        <div style="background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); color: white; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 8px; margin-top: 2px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
          ${name || 'Kitchen'}
        </div>
      </div>
    `,
    iconSize: [38, 56],
    iconAnchor: [19, 56],
  });
}

function MapController({ lat, lng, onLocationSelect }: { lat: number; lng: number; onLocationSelect: (lat: number, lng: number) => void }) {
  const map = useMap();

  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], map.getZoom() < 14 ? 15 : map.getZoom(), { animate: true, duration: 0.8 });
    }
  }, [lat, lng, map]);

  return null;
}

export default function LocationPickerMap({
  lat,
  lng,
  onLocationSelect,
  kitchenName = 'Kitchen',
}: LocationPickerMapProps) {
  const markerRef = useRef<L.Marker>(null);
  const icon = useMemo(() => createKitchenIcon(kitchenName), [kitchenName]);

  const validLat = Number.isFinite(lat) ? lat : 21.1472;
  const validLng = Number.isFinite(lng) ? lng : 79.1050;

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          onLocationSelect(pos.lat, pos.lng);
        }
      },
    }),
    [onLocationSelect]
  );

  return (
    <div className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-slate-200/90 shadow-inner group">
      {/* Floating Instructions Banner */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-[1000] pointer-events-none flex items-center justify-between">
        <div className="bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-lg border border-white/10 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span>Tap anywhere on map or drag pin to choose spot</span>
        </div>
      </div>

      <MapContainer
        center={[validLat, validLng]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          draggable={true}
          eventHandlers={eventHandlers}
          position={[validLat, validLng]}
          ref={markerRef}
          icon={icon}
        />
        <MapController lat={validLat} lng={validLng} onLocationSelect={onLocationSelect} />
      </MapContainer>
    </div>
  );
}
