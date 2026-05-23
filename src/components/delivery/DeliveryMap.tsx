'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function RecenterAutomatically({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], 13);
  }, [lat, lng, map]);

  return null;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  isCurrentLocation?: boolean;
}

interface DeliveryMapProps {
  markers: MapMarker[];
  centerLat?: number;
  centerLng?: number;
}

export default function DeliveryMap({ markers, centerLat, centerLng }: DeliveryMapProps) {
  if (typeof window === 'undefined') {
    return (
      <div className="flex h-64 items-center justify-center rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 text-center">
        <p className="text-sm font-semibold text-slate-500">Loading route map…</p>
      </div>
    );
  }

  const validMarkers = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
  const defaultLat = 28.6139;
  const defaultLng = 77.209;

  const mapLat = Number.isFinite(centerLat) ? centerLat! : validMarkers[0]?.lat ?? defaultLat;
  const mapLng = Number.isFinite(centerLng) ? centerLng! : validMarkers[0]?.lng ?? defaultLng;

  if (!Number.isFinite(mapLat) || !Number.isFinite(mapLng)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 text-center">
        <div>
          <p className="text-sm font-bold text-slate-900">Map unavailable</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Location data is still syncing. Your route will appear automatically once it is available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
      <MapContainer center={[mapLat, mapLng]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {Number.isFinite(centerLat) && Number.isFinite(centerLng) && (
          <RecenterAutomatically lat={centerLat!} lng={centerLng!} />
        )}

        {validMarkers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={customIcon}>
            <Popup>
              <div className="text-xs">
                <p className={marker.isCurrentLocation ? 'font-bold text-brand' : 'font-bold text-slate-900'}>
                  {marker.title}
                </p>
                {marker.subtitle && <p className="mt-1 text-slate-500">{marker.subtitle}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
