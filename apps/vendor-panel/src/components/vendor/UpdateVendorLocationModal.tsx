'use client';

import { useState, useEffect } from 'react';
import { X, MapPin, Check, Loader2, Sparkles, Compass } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface UpdateVendorLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: any;
  onSuccess?: (newLocation: { address: string; lat: number; lng: number }) => void;
}

const NAGPUR_PRESETS = [
  { name: 'Gandhibagh / Mahal', address: 'Gandhibagh, Mahal, Nagpur', lat: 21.1472, lng: 79.1050 },
  { name: 'Nandanvan', address: 'Nandanvan Colony, Nagpur', lat: 21.1250, lng: 79.1280 },
  { name: 'Sitabuldi / Main', address: 'Sitabuldi, Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Dharampeth', address: 'Dharampeth, Nagpur', lat: 21.1410, lng: 79.0620 },
  { name: 'Pratap Nagar / IT', address: 'Pratap Nagar, Nagpur', lat: 21.1120, lng: 79.0550 },
  { name: 'Manish Nagar / Besa', address: 'Manish Nagar, Besa, Nagpur', lat: 21.0850, lng: 79.0850 },
  { name: 'Sadar / Chaoni', address: 'Sadar, Chaoni, Nagpur', lat: 21.1680, lng: 79.0820 },
  { name: 'Medical Square', address: 'Medical Square, Nagpur', lat: 21.1310, lng: 79.1000 },
];

export function UpdateVendorLocationModal({
  isOpen,
  onClose,
  vendor,
  onSuccess,
}: UpdateVendorLocationModalProps) {
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (vendor) {
      const currentAddress = vendor.address || vendor.location?.address || '';
      const currentLat = vendor.location?.lat ?? vendor.lat ?? 21.1472;
      const currentLng = vendor.location?.lng ?? vendor.lng ?? 79.1050;
      setAddress(currentAddress);
      setLat(String(currentLat));
      setLng(String(currentLng));
    }
  }, [vendor, isOpen]);

  if (!isOpen || !vendor) return null;

  const handleApplyPreset = (preset: typeof NAGPUR_PRESETS[0]) => {
    setAddress(preset.address);
    setLat(String(preset.lat));
    setLng(String(preset.lng));
    toast.success(`Selected ${preset.name}`);
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude.toFixed(6)));
        setLng(String(pos.coords.longitude.toFixed(6)));
        setIsLocating(false);
        toast.success('Current device GPS coordinates detected! 📍');
      },
      (err) => {
        setIsLocating(false);
        toast.error(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddress = address.trim();
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    if (!cleanAddress) {
      toast.error('Please provide an address for this kitchen');
      return;
    }
    if (isNaN(numLat) || isNaN(numLng)) {
      toast.error('Please provide valid numerical GPS coordinates (lat, lng)');
      return;
    }

    setIsSaving(true);
    try {
      const vendorRef = doc(db, 'users', vendor.id);
      const updatePayload = {
        address: cleanAddress,
        location: {
          lat: numLat,
          lng: numLng,
          address: cleanAddress,
          updated_at: Date.now(),
        },
        lat: numLat,
        lng: numLng,
        updated_at: serverTimestamp(),
      };

      await updateDoc(vendorRef, updatePayload);

      toast.success(`Updated location for ${vendor.kitchen_name || vendor.name || 'Kitchen'}! 🎉`);
      if (onSuccess) {
        onSuccess({ address: cleanAddress, lat: numLat, lng: numLng });
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update vendor location:', err);
      toast.error(err.message || 'Failed to update location');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-brand flex items-center justify-center shrink-0">
              <MapPin className="w-6 h-6 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Superadmin Power
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight mt-0.5">
                Update Kitchen Location
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate max-w-xs">
                {vendor.kitchen_name || vendor.name || 'Vendor'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Address */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Kitchen Address / Landmark
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Gandhibagh, Mahal, Nagpur"
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
              required
            />
          </div>

          {/* Quick Presets for Nagpur */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Fast Nagpur Area Presets
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Tap to autofill</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NAGPUR_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  onClick={() => handleApplyPreset(preset)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 border border-slate-200/80 text-slate-700 transition-all active:scale-95 cursor-pointer"
                >
                  📍 {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Coordinates Row */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                Latitude (lat)
              </label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="21.1472"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                Longitude (lng)
              </label>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="79.1050"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                required
              />
            </div>
          </div>

          {/* Auto-detect GPS button */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleDetectGPS}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand/80 transition-colors cursor-pointer"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Locating Device…</span>
                </>
              ) : (
                <>
                  <Compass className="w-3.5 h-3.5" />
                  <span>Use Device Current GPS</span>
                </>
              )}
            </button>

            <span className="text-[10px] text-slate-400 font-medium">
              Used for automated rider pickup routing
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-brand hover:bg-[#C2410C] shadow-md shadow-brand/20 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Location</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
