'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { updateUser } from '@/lib/queries/users';
import { uploadImage, getImageUrl } from '@/lib/storage';
import Image from 'next/image';
import { MapPin } from 'lucide-react';

export function VendorProfileCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || '',
    cuisine_type: user?.cuisine_type || '',
    phone: user?.phone || '',
    image: user?.image || '',
  });
  
  const [syncingLoc, setSyncingLoc] = useState(false);
  const [locError, setLocError] = useState('');

  // Auto-sync location every 60 seconds if we have their permission / they've synced before
  // (Removed per request: one-time sync is sufficient for the kitchen location)

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
          const locationData = { lat, lng, updated_at: Date.now() };
          
          await updateUser(user.id, { location: locationData });
          setUser({ ...user, location: locationData });
          addToast('Location synced successfully! 📍', 'success');
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

  // Sync state when user hydrates (critical for mobile app restarts)
  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        cuisine_type: user.cuisine_type || '',
        phone: user.phone || '',
        image: user.image || '',
      });
    }
  }, [user]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        setProfile({ ...profile, image: url });
        // Auto-save image update
        if (user) {
          await updateUser(user.id, { image: url });
          setUser({ ...user, image: url });
          addToast('Profile image updated! 📸', 'success');
        }
      } else {
        addToast('Upload failed. Check your internet or CORS settings.', 'error');
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

    setLoading(true);
    try {
      await updateUser(user.id, {
        name: profile.name.trim(),
        cuisine_type: profile.cuisine_type.trim(),
        phone: profile.phone.trim(),
      });
      setUser({
        ...user,
        name: profile.name.trim(),
        cuisine_type: profile.cuisine_type.trim(),
        phone: profile.phone.trim(),
      });
      addToast('Profile updated! 🔥', 'success');
    } catch (err) {
      addToast('Update failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-bold text-slate-900 mb-1">Your Profile</h3>
      <p className="text-sm text-slate-500 mb-6">Update your business info</p>

      <div className="space-y-5">
        {/* Profile Image */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="relative w-full aspect-[2/1] rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-brand/30 transition-colors group"
        >
          {profile.image ? (
            <>
              <Image 
                src={getImageUrl(profile.image)} 
                alt="Profile" 
                fill 
                className="object-cover transition-transform group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full">
                  Change Photo
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-brand/5 flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Upload Cover Image
              </span>
            </>
          )}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Business Name
            </label>
            <input
              className="input"
              placeholder="Your kitchen name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Cuisine Type
            </label>
            <input
              className="input"
              placeholder="e.g. Home Style, North Indian, Jain"
              value={profile.cuisine_type}
              onChange={(e) => setProfile({ ...profile, cuisine_type: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              WhatsApp Number
            </label>
            <input
              className="input"
              placeholder="e.g. 9876543210"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>

          <div className="pt-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Live Location Tracking
            </label>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">Vendor Location</p>
                <p className="text-xs text-slate-500 mt-0.5 max-w-[200px]">
                  {user?.location ? 'Your kitchen location is registered.' : 'Sync your kitchen location for accurate delivery routes.'}
                </p>
                {locError && <p className="text-xs text-rose-500 mt-1">{locError}</p>}
              </div>
              
              <button
                onClick={handleSyncLocation}
                disabled={syncingLoc}
                className="btn-primary w-full sm:w-auto text-xs py-2 px-4 whitespace-nowrap flex items-center justify-center gap-2"
              >
                {syncingLoc ? (
                  <div className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
                {user?.location ? 'Update Location' : 'Sync Location'}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full btn-primary py-3.5 h-auto text-sm"
        >
          {loading ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
