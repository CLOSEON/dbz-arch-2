'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { updateUser } from '@/lib/queries/users';
import { uploadImage, getImageUrl } from '@/lib/storage';
import Image from 'next/image';
import { MapPin, ChefHat, Tag, Phone, Navigation, Loader2, Sparkles, CheckCircle2, UploadCloud } from 'lucide-react';
import { motion } from 'framer-motion';
import { reverseGeocode } from '@/lib/geo';

export function VendorProfileCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || '',
    cuisine_type: user?.cuisine_type || '',
    phone: user?.phone || '',
    address: user?.address || (user?.location as any)?.address || '',
    capacity: user?.capacity !== undefined && user?.capacity !== null ? String(user.capacity) : '',
    image: user?.image || '',
  });
  
  const [syncingLoc, setSyncingLoc] = useState(false);
  const [locError, setLocError] = useState('');

  // Sync state when user hydrates (critical for mobile app restarts)
  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        cuisine_type: user.cuisine_type || '',
        phone: user.phone || '',
        address: user.address || (user.location as any)?.address || '',
        capacity: user.capacity !== undefined && user.capacity !== null ? String(user.capacity) : '',
        image: user.image || '',
      });
    }
  }, [user]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSyncLocation() {
    if (!user) return;
    setSyncingLoc(true);
    setLocError('');

    if (!('geolocation' in navigator)) {
      setLocError('Geolocation not supported by browser');
      setSyncingLoc(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const geo = await reverseGeocode(lat, lng);
          const locationData = { 
            lat, 
            lng, 
            address: geo.completeAddress,
            updated_at: Date.now() 
          };
          
          const updates: any = { 
            location: locationData,
          };
          if (geo.completeAddress) {
            updates.address = geo.completeAddress;
            setProfile(prev => ({ ...prev, address: geo.completeAddress }));
          }

          await updateUser(user.id, updates);
          setUser({ ...user, ...updates });
          addToast('Kitchen location & address auto-filled! 📍', 'success');
        } catch (err) {
          setLocError('Failed to save location to database');
          addToast('Failed to save location', 'error');
        } finally {
          setSyncingLoc(false);
        }
      },
      (error) => {
        setLocError('Please enable location permissions in your browser');
        addToast('Location permission denied', 'error');
        setSyncingLoc(false);
      },
      { enableHighAccuracy: true }
    );
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const url = await uploadImage(file, `uploads/vendors/${user?.id}`);
      if (url) {
        setProfile({ ...profile, image: url });
        if (user) {
          await updateUser(user.id, { image: url });
          setUser({ ...user, image: url });
          addToast('Cover image updated successfully! 📸', 'success');
        }
      } else {
        addToast('Upload failed. Check format or size.', 'error');
      }
    } catch (err) {
      addToast('Image upload failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    if (!profile.name.trim()) {
      addToast('Business name is required', 'warning');
      return;
    }

    const capacityNum = profile.capacity.trim() ? parseInt(profile.capacity, 10) : undefined;
    if (capacityNum !== undefined && (isNaN(capacityNum) || capacityNum < 0)) {
      addToast('Capacity limit must be a positive number', 'warning');
      return;
    }

    setLoading(true);
    try {
      await updateUser(user.id, {
        name: profile.name.trim(),
        kitchen_name: profile.name.trim(), // Keep kitchen_name in sync
        cuisine_type: profile.cuisine_type.trim(),
        phone: profile.phone.trim(),
        capacity: capacityNum,
      });
      setUser({
        ...user,
        name: profile.name.trim(),
        kitchen_name: profile.name.trim(),
        cuisine_type: profile.cuisine_type.trim(),
        phone: profile.phone.trim(),
        capacity: capacityNum,
      });
      addToast('Kitchen details saved! 🔥', 'success');
    } catch (err) {
      addToast('Update failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-card space-y-6">
      {/* Decorative Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center font-bold">
            🏪
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Kitchen Profile</h3>
            <p className="text-xs font-semibold text-slate-400">Manage business details and logo banner</p>
          </div>
        </div>

        {user?.is_approved ? (
          <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED PARTNER
          </span>
        ) : (
          <span className="text-[10px] font-black text-amber-500 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
            AWAITING REVIEW
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Profile Image Cover */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="relative w-full aspect-[2.2/1] rounded-3xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-brand/40 hover:shadow-inner transition-all group"
        >
          {profile.image ? (
            <>
              <Image 
                src={getImageUrl(profile.image)} 
                alt="Profile" 
                fill 
                className="object-cover transition-transform duration-500 group-hover:scale-105" 
                unoptimized
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                <UploadCloud className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full">
                  Change Photo
                </span>
              </div>
            </>
          ) : (
            <div className="text-center p-4">
              <div className="w-12 h-12 rounded-full bg-brand/5 flex items-center justify-center mb-2 mx-auto">
                <UploadCloud className="w-6 h-6 text-brand" />
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                Upload Cover Banner
              </span>
              <p className="text-[9px] text-slate-400 font-semibold mt-1">High-quality landscape image recommended</p>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageChange} 
        />

        <div className="grid grid-cols-1 gap-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-1 flex items-center gap-1.5">
              <ChefHat className="w-3.5 h-3.5 text-slate-400" /> Kitchen / Brand Name
            </label>
            <input
              type="text"
              placeholder="Your kitchen name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 focus:bg-white focus:shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> Cuisine Types & Specialty
            </label>
            <input
              type="text"
              placeholder="e.g. North Indian, Jain Specials, Homestyle"
              value={profile.cuisine_type}
              onChange={(e) => setProfile({ ...profile, cuisine_type: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 focus:bg-white focus:shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> Business WhatsApp Number
            </label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 focus:bg-white focus:shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-1 flex items-center gap-1.5">
              🎚️ Daily Tiffin Capacity Limit
            </label>
            <input
              type="number"
              min="1"
              placeholder="No limit (unlimited)"
              value={profile.capacity}
              onChange={(e) => setProfile({ ...profile, capacity: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand/40 focus:bg-white focus:shadow-sm transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1 font-semibold pl-1">
              Set the maximum number of active subscriptions your kitchen can support. Leave blank for no limit.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-50">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Kitchen Location GPS
            </label>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Geographic Tracking</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5 max-w-[240px]">
                  {user?.location 
                    ? `Registered coordinates: ${user.location.lat.toFixed(5)}, ${user.location.lng.toFixed(5)}` 
                    : 'Sync your kitchen location coordinates for accurate rider dispatch routes.'
                  }
                </p>
                {locError && <p className="text-[10px] text-rose-500 font-bold mt-1">⚠️ {locError}</p>}
              </div>
              
              <button
                type="button"
                onClick={handleSyncLocation}
                disabled={syncingLoc}
                className="py-2.5 px-4 bg-white border border-slate-250 text-slate-700 hover:bg-slate-50 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1.5 shadow-sm active:scale-95 shrink-0"
              >
                {syncingLoc ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 text-brand" />
                )}
                {user?.location ? 'Update GPS' : 'Sync Location'}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-4 bg-brand text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors active:scale-95 shadow-lg shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save Profile Details
        </button>
      </div>
    </div>
  );
}
