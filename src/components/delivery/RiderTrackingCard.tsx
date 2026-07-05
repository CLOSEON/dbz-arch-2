'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Custom map icons ──────────────────────────────────────────────────────────

function createSvgIcon(svgHtml: string, size: [number, number], anchor: [number, number]) {
  return L.divIcon({ html: svgHtml, className: '', iconSize: size, iconAnchor: anchor });
}

const riderIcon = createSvgIcon(
  `<div style="
    width:40px;height:40px;border-radius:50%;background:#ff6b00;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(255,107,0,.45);
    border:3px solid white;font-size:18px;
  ">🛵</div>`,
  [40, 40], [20, 20]
);

const destIcon = createSvgIcon(
  `<div style="
    width:36px;height:36px;border-radius:50%;background:#1e293b;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(0,0,0,.25);
    border:3px solid white;font-size:16px;
  ">📍</div>`,
  [36, 36], [18, 36]
);

function MapMover({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], 15, { animate: true, duration: 1 }); }, [lat, lng, map]);
  return null;
}

// ── Pulsing ring animation component ─────────────────────────────────────────
function PulseRing({ color = '#ff6b00' }: { color?: string }) {
  return (
    <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: color }} />
  );
}

// ── Status step config ────────────────────────────────────────────────────────
export type TrackingStatus = 'preparing' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'failed_attempt' | 'cancelled';

interface Step { key: TrackingStatus; label: string; emoji: string; desc: string; etaLabel: string }
const STEPS: Step[] = [
  { key: 'preparing',        label: 'Preparing',    emoji: '👨‍🍳', desc: 'Kitchen is packing your tiffin',    etaLabel: 'Preparing order'       },
  { key: 'picked_up',        label: 'Picked Up',    emoji: '📦', desc: 'Rider has collected your order',    etaLabel: 'Rider on the way'       },
  { key: 'out_for_delivery', label: 'En Route',     emoji: '🛵', desc: 'Rider is heading to your door',     etaLabel: 'Arriving soon'          },
  { key: 'delivered',        label: 'Delivered',    emoji: '✅', desc: 'Tiffin delivered. Enjoy!',          etaLabel: 'Order complete'         },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface RiderTrackingCardProps {
  status: TrackingStatus;
  mealName: string;
  mealType: 'lunch' | 'dinner' | 'both';
  riderName?: string;
  riderPhone?: string;
  riderRating?: number;
  vehicleNumber?: string;
  otp?: string;
  driverLocation?: { lat: number; lng: number };
  destLocation?: { lat: number; lng: number };
  onCallRider?: (phone: string) => void;
  className?: string;
}

export function RiderTrackingCard({
  status,
  mealName,
  mealType,
  riderName = 'Dabzo Rider',
  riderPhone,
  riderRating = 4.8,
  vehicleNumber,
  otp,
  driverLocation,
  destLocation,
  onCallRider,
  className = '',
}: RiderTrackingCardProps) {
  const [revealOtp, setRevealOtp] = useState(false);

  const stepIndex = STEPS.findIndex(s => s.key === status);
  const activeStep = STEPS[Math.max(0, stepIndex)] ?? STEPS[0];
  const isDelivered = status === 'delivered';
  const isCancelled = status === 'cancelled';
  const showMap = (status === 'out_for_delivery' || status === 'delivered') && driverLocation;
  const showRider = stepIndex >= 1;
  const etaText = mealType === 'lunch' ? '1:00 PM' : '8:00 PM';

  return (
    <div className={`space-y-4 ${className}`}>

      {/* ── ETA Hero Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-3xl p-6 ${isDelivered ? 'bg-emerald-500' : isCancelled ? 'bg-red-500' : 'bg-slate-900'}`}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-white"
              style={{ width: 80 + i * 60, height: 80 + i * 60, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
            />
          ))}
        </div>

        <div className="relative z-10">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">
            {isCancelled ? 'Order Cancelled' : isDelivered ? 'Delivered!' : 'Estimated Arrival'}
          </p>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-4xl font-black text-white leading-none">
              {isDelivered ? '🎉' : isCancelled ? '😔' : etaText}
            </span>
            {!isDelivered && !isCancelled && (
              <span className="text-white/50 text-sm font-bold mb-0.5">today</span>
            )}
          </div>

          {/* Animated status pill */}
          <div className="flex items-center gap-2">
            <motion.div
              key={status}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isDelivered ? 'bg-white/20' : 'bg-white/10'}`}
            >
              <span className="text-sm">{activeStep.emoji}</span>
              <span className="text-white text-[11px] font-black uppercase tracking-wider">{activeStep.label}</span>
            </motion.div>
            {!isDelivered && !isCancelled && (
              <div className="flex gap-1 ml-1">
                {[0,1,2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Progress Steps ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="relative flex items-start justify-between">
          {/* Track line */}
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-100" />
          <motion.div
            className="absolute top-5 left-5 h-0.5 bg-brand origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: stepIndex / (STEPS.length - 1) }}
            style={{ width: 'calc(100% - 40px)', transformOrigin: 'left' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {STEPS.map((step, idx) => {
            const isDone = idx < stepIndex;
            const isNow = idx === stepIndex;
            return (
              <div key={step.key} className="flex flex-col items-center gap-2 relative z-10">
                <motion.div
                  animate={{ scale: isNow ? [1, 1.12, 1] : 1 }}
                  transition={{ duration: 1.5, repeat: isNow ? Infinity : 0 }}
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center text-base border-2 transition-all
                    ${isDone ? 'bg-brand border-brand text-white'
                    : isNow  ? 'bg-brand/10 border-brand text-brand'
                    :          'bg-white border-slate-200 text-slate-300'}`}
                >
                  {isNow && <PulseRing />}
                  <span>{isDone ? '✓' : step.emoji}</span>
                </motion.div>
                <span className={`text-[9px] font-black uppercase tracking-wide text-center leading-tight max-w-[52px]
                  ${isNow ? 'text-brand' : isDone ? 'text-slate-600' : 'text-slate-300'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current step description */}
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-center text-xs text-slate-500 font-medium mt-5 pt-4 border-t border-slate-50"
          >
            {activeStep.desc}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* ── Live Map ── */}
      <AnimatePresence>
        {showMap && driverLocation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm"
          >
            <div className="relative">
              {/* Live badge */}
              <div className="absolute top-3 left-3 z-[999] flex items-center gap-1.5 bg-red-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                Live
              </div>
              <MapContainer
                center={[driverLocation.lat, driverLocation.lng]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: 240, width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapMover lat={driverLocation.lat} lng={driverLocation.lng} />
                <Marker position={[driverLocation.lat, driverLocation.lng]} icon={riderIcon}>
                  <Popup><span className="text-xs font-bold">🛵 {riderName}</span></Popup>
                </Marker>
                {destLocation && (
                  <Marker position={[destLocation.lat, destLocation.lng]} icon={destIcon}>
                    <Popup><span className="text-xs font-bold">📍 Your location</span></Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </motion.div>
        )}

        {!showMap && !isDelivered && !isCancelled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-3xl border border-dashed border-slate-200 p-6 flex flex-col items-center justify-center gap-2 text-center"
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-3xl"
            >
              🛵
            </motion.div>
            <p className="text-xs font-bold text-slate-700">Map unlocks when rider picks up</p>
            <p className="text-[10px] text-slate-400">Live GPS tracking will appear here</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rider Info Card ── */}
      <AnimatePresence>
        {showRider && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Your Rider</p>
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="relative w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center text-2xl shrink-0 border border-brand/10 shadow-inner">
                🛵
                {status === 'out_for_delivery' && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-black text-slate-900 text-sm leading-tight">{riderName}</h4>
                {vehicleNumber && (
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{vehicleNumber}</p>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`text-[10px] ${i < Math.round(riderRating) ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                  ))}
                  <span className="text-[10px] font-bold text-slate-400 ml-0.5">{riderRating}</span>
                </div>
              </div>

              {riderPhone && onCallRider && (
                <button
                  onClick={() => onCallRider(riderPhone)}
                  className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shadow-lg shadow-brand/30 active:scale-95 transition-all shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.68 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── OTP / Handover ── */}
      {!isDelivered && !isCancelled && otp && (
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Handover PIN</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Share with rider at your door</p>
            </div>
            {revealOtp ? (
              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-2xl font-black tracking-[0.3em] text-emerald-600 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl"
              >
                {otp}
              </motion.span>
            ) : (
              <button
                onClick={() => setRevealOtp(true)}
                className="px-4 py-2 bg-brand text-white text-xs font-black rounded-xl shadow-md shadow-brand/20 active:scale-95 transition-all"
              >
                Reveal PIN
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Delivered celebration ── */}
      <AnimatePresence>
        {isDelivered && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center"
          >
            <div className="text-4xl mb-2">🎉</div>
            <h3 className="font-black text-emerald-800 text-lg">Enjoy your meal!</h3>
            <p className="text-emerald-600 text-xs font-medium mt-1">{mealName} has been delivered</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
