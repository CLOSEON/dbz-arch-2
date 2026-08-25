'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MapPin, Search, Crosshair, Loader2, X, ArrowRight } from 'lucide-react';

export function HeroSection() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  // Hydrate stored location from previous session
  useEffect(() => {
    try {
      const savedLoc = localStorage.getItem('dabzzo_landing_location');
      if (savedLoc) setLocation(savedLoc);
    } catch {
      // Storage unavailable fallback
    }
  }, []);

  // GPS Location detection & reverse geocoding
  const handleDetectLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('Geolocation not supported');
      setTimeout(() => setLocationStatus(null), 3000);
      return;
    }

    setIsLocating(true);
    setLocationStatus('Locating...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                'Accept-Language': 'en',
                'User-Agent': 'Dabzzo/1.0 (dabzzo.in)',
              },
            }
          );
          const data = await r.json();
          const addr = data.address || {};
          const locality =
            addr.suburb ||
            addr.neighbourhood ||
            addr.residential ||
            addr.village ||
            addr.town ||
            addr.county ||
            '';
          const city =
            addr.city ||
            addr.city_district ||
            addr.state_district ||
            addr.state ||
            '';
          const formatted =
            [locality, city].filter(Boolean).join(', ') ||
            data.display_name?.split(',').slice(0, 2).join(',') ||
            'Current Location';

          setLocation(formatted);
          setLocationStatus('Located!');
          try {
            localStorage.setItem('dabzzo_landing_location', formatted);
            localStorage.setItem(
              'dabzzo_landing_coords',
              JSON.stringify({ lat: latitude, lng: longitude })
            );
          } catch {
            // ignore storage errors
          }
        } catch {
          setLocation('Current Location');
          setLocationStatus('Located!');
        } finally {
          setIsLocating(false);
          setTimeout(() => setLocationStatus(null), 2500);
        }
      },
      () => {
        setIsLocating(false);
        setLocationStatus('Permission denied');
        setTimeout(() => setLocationStatus(null), 3000);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  // Search submission -> redirects to login page
  const handleSearch = (e?: FormEvent) => {
    if (e) e.preventDefault();
    try {
      if (location) localStorage.setItem('dabzzo_landing_location', location);
      if (searchQuery) localStorage.setItem('dabzzo_landing_search', searchQuery);
    } catch {
      // ignore storage errors
    }

    const params = new URLSearchParams();
    if (location.trim()) params.set('loc', location.trim());
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    const targetUrl = params.toString() ? `/login?${params.toString()}` : '/login';
    router.push(targetUrl);
  };

  const handleCardClick = (category: string) => {
    router.push(`/login?category=${encodeURIComponent(category)}`);
  };

  return (
    <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-32 overflow-hidden text-white min-h-[90vh] flex items-center justify-center">
      {/* Background Image & Overlay */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1585937421612-70a008356fbe?q=80&w=3000&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90" />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          <h1 className="text-5xl lg:text-7xl xl:text-[5.5rem] font-black tracking-tight leading-[1.05] mb-6 drop-shadow-sm">
            Order daily meals.<br />
            Discover local chefs.<br />
            Dabzzo it!
          </h1>

          <p className="text-lg lg:text-2xl text-white/90 mb-12 max-w-3xl mx-auto font-medium">
            We partner with local chefs to bring you authentic, everyday food.
          </p>

          {/* Search Bar - Dynamic Location & Search Form */}
          <form
            onSubmit={handleSearch}
            className="max-w-4xl mx-auto bg-white p-2 rounded-2xl sm:rounded-full shadow-2xl flex flex-col sm:flex-row items-center gap-2 border border-white/20 transition-all duration-200 focus-within:ring-4 focus-within:ring-brand/20"
          >
            {/* Location Input & GPS Tracker */}
            <div className="flex-1 flex items-center gap-3 px-4 py-3.5 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-slate-200/80 relative">
              <button
                type="button"
                onClick={handleDetectLocation}
                title="Detect my current location"
                disabled={isLocating}
                className="flex items-center gap-1 text-brand hover:text-brand-650 transition-colors p-1 -m-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 shrink-0"
              >
                {isLocating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                ) : (
                  <MapPin className="w-5 h-5 text-brand shrink-0" />
                )}
              </button>

              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={isLocating ? 'Detecting your location...' : 'Enter your delivery location'}
                className="w-full bg-transparent border-none focus:outline-none text-slate-900 placeholder:text-slate-500 font-medium text-base sm:text-lg min-w-0"
              />

              {location ? (
                <button
                  type="button"
                  onClick={() => setLocation('')}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  aria-label="Clear location"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isLocating}
                  className="hidden md:flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-brand transition-colors bg-slate-100 px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wider"
                >
                  <Crosshair className="w-3 h-3 text-brand" />
                  {locationStatus || 'Locate Me'}
                </button>
              )}
            </div>

            {/* Food / Kitchen Search Input */}
            <div className="flex-[1.4] flex items-center gap-3 px-4 py-3.5 w-full sm:w-auto">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for kitchens, thalis, or meals"
                className="w-full bg-transparent border-none focus:outline-none text-slate-900 placeholder:text-slate-500 font-medium text-base sm:text-lg min-w-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Submit / Find Food Action Button */}
            <button
              type="submit"
              className="w-full sm:w-auto px-8 sm:px-10 py-4 bg-slate-900 text-white rounded-xl sm:rounded-full font-black text-lg hover:bg-slate-800 active:scale-95 transition-all duration-200 shrink-0 flex items-center justify-center gap-2 shadow-lg shadow-black/10 group cursor-pointer"
            >
              <span>Find Food</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          {/* Feature Cards below search (Swiggy style) */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { id: 'meal-plans', title: 'MEAL PLANS', desc: 'Weekly & Monthly', discount: 'UPTO 20% OFF' },
              { id: 'thalis',     title: 'FRESH THALIS', desc: 'From Local Chefs', discount: 'FREE DELIVERY' },
              { id: 'diet',       title: 'DIET FOOD', desc: 'Healthy & Keto', discount: 'CUSTOM MACROS' },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                onClick={() => handleCardClick(card.id)}
                className="bg-white rounded-3xl p-6 text-left cursor-pointer hover:scale-105 active:scale-98 transition-all duration-200 shadow-xl shadow-black/5 border border-white/50 group"
              >
                <h3 className="text-2xl font-black text-slate-900 leading-none mb-1 group-hover:text-brand transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm font-bold text-slate-500 mb-2">{card.desc}</p>
                <p className="text-brand font-black text-sm uppercase tracking-wider">{card.discount}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
