'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Delivery } from '@/types';

// Fix for default marker icons in Leaflet with Next.js
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// A component to recenter the map when the user's location changes
function RecenterAutomatically({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
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
  if (typeof window === 'undefined') return null;

  // Default to New Delhi or a central location if no markers/center provided
  const defaultLat = 28.6139; 
  const defaultLng = 77.2090;

  // Use provided center, or the first marker, or default
  const mapLat = centerLat || (markers.length > 0 ? markers[0].lat : defaultLat);
  const mapLng = centerLng || (markers.length > 0 ? markers[0].lng : defaultLng);

  return (
    <div className="w-full h-64 rounded-3xl overflow-hidden shadow-sm border border-slate-100 z-0 relative">
      <MapContainer 
        center={[mapLat, mapLng]} 
        zoom={13} 
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {centerLat && centerLng && (
          <RecenterAutomatically lat={centerLat} lng={centerLng} />
        )}

        {markers.map(m => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={customIcon}>
            <Popup>
              <div className="text-xs">
                <p className={`font-bold ${m.isCurrentLocation ? 'text-brand' : 'text-slate-900'}`}>{m.title}</p>
                {m.subtitle && <p className="text-slate-500 mt-1">{m.subtitle}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
