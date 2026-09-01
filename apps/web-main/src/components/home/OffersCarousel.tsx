'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getActiveOffers } from '@/lib/offers';
import { getImageUrl } from '@/lib/storage';
import { Offer } from '@/types';
import { Store, ArrowRight, ChevronLeft, ChevronRight, BadgePercent } from 'lucide-react';
import { triggerHapticSelection, triggerHapticImpact, ImpactStyle } from '@/lib/haptics';

interface OffersCarouselProps {
  activeDelivery?: any;
  activeSubs?: any[];
}

export function OffersCarousel({ activeDelivery, activeSubs = [] }: OffersCarouselProps) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch active promotional offers
  useEffect(() => {
    let isMounted = true;
    async function loadOffers() {
      try {
        const data = await getActiveOffers();
        if (isMounted) {
          setOffers(data);
        }
      } catch (err) {
        console.warn('[OffersCarousel] Failed to load offers:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadOffers();
    return () => {
      isMounted = false;
    };
  }, []);

  // Total slides: 1 permanent info card + N active promotional offer banners
  const totalSlides = 1 + offers.length;

  // Update active index on manual scroll/touch
  const handleScroll = useCallback(() => {
    if (!containerRef.current || totalSlides <= 1) return;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const newIndex = Math.round(scrollLeft / width);
      setCurrentIndex(Math.min(Math.max(0, newIndex), totalSlides - 1));
    }
  }, [totalSlides]);

  // Programmatic scroll to specific slide
  const scrollToIndex = useCallback((index: number) => {
    if (!containerRef.current) return;
    triggerHapticImpact(ImpactStyle.Light);
    const container = containerRef.current;
    const width = container.clientWidth;
    container.scrollTo({
      left: index * width,
      behavior: 'smooth',
    });
    setCurrentIndex(index);
  }, []);

  // ─── Auto-Switching Banner Rotation (every 4.5s) ─────────────────────────────
  useEffect(() => {
    if (totalSlides <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const nextIndex = (prev + 1) % totalSlides;
        if (containerRef.current) {
          const width = containerRef.current.clientWidth;
          containerRef.current.scrollTo({
            left: nextIndex * width,
            behavior: 'smooth',
          });
        }
        return nextIndex;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [totalSlides, isPaused]);

  // Manual Left / Right arrow navigation
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : totalSlides - 1;
    scrollToIndex(prev);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const next = (currentIndex + 1) % totalSlides;
    scrollToIndex(next);
  };

  // ─── 1. Permanent Default Slide ─────────────────────────────────────────────
  const renderPermanentSlide = () => {
    if (activeDelivery) {
      return (
        <div className="relative w-full h-full flex flex-col justify-between p-4 sm:p-4.5 bg-slate-950/90 backdrop-blur-md text-white rounded-2xl sm:rounded-3xl">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Live Delivery Status
                </span>
              </div>
              <span className="text-[9.5px] font-bold text-white/50 uppercase">Today</span>
            </div>
            <p className="text-white font-bold text-base leading-tight truncate">
              {activeDelivery.partnerName || 'Your Kitchen'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5 capitalize">
              Status: {activeDelivery.status?.replace(/_/g, ' ') || 'Preparing'}
            </p>
          </div>
          <div className="mt-2.5">
            <Link
              href="/track"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-brand text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-brand-650 transition-all duration-200 active:scale-[0.98] shadow-xs"
            >
              Track Live Delivery
            </Link>
          </div>
        </div>
      );
    }

    if (activeSubs.length > 0) {
      return (
        <div className="relative w-full h-full flex flex-col justify-between p-4 sm:p-4.5 bg-slate-950/90 backdrop-blur-md text-white rounded-2xl sm:rounded-3xl">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  Subscription Active
                </span>
              </div>
              <span className="text-[9.5px] font-bold text-white/50 uppercase">
                {activeSubs.length} Active Plan{activeSubs.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-white font-bold text-base leading-tight truncate">
              {activeSubs[0].meal_type
                ? `${activeSubs[0].meal_type.charAt(0).toUpperCase() + activeSubs[0].meal_type.slice(1)} Subscriptions`
                : 'Daily Meals'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              Your kitchen meals are scheduled and tracking automatically.
            </p>
          </div>
          <div className="mt-2.5">
            <Link
              href="/orders"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-white/10 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white/15 transition-all duration-200 active:scale-[0.98] border border-white/10"
            >
              Manage Weekly Planner
            </Link>
          </div>
        </div>
      );
    }

    // Default Glassmorphic Brand Card (Blended with hero)
    return (
      <div className="relative w-full h-full flex flex-col justify-between p-4 sm:p-4.5 bg-black/15 backdrop-blur-md text-white rounded-2xl sm:rounded-3xl">
        <div>
          <span className="rounded-md px-2 py-0.5 text-[9.5px] font-bold tracking-wider uppercase bg-white/15 text-white inline-block">
            Premium Meal Service
          </span>
          <h2 className="mt-2 text-base font-bold text-white leading-snug">
            Healthy Home Tiffins. Pause or Swap Anytime.
          </h2>
          <p className="mt-1 text-[11.5px] text-white/80 leading-relaxed font-normal line-clamp-2">
            Switch kitchens easily if you want a change, or pause when you are away.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative w-full select-none group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* ════════════════════════════════════════
          BLENDED HERO CARD FRAME
      ════════════════════════════════════════ */}
      <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-white/20 bg-black/15 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.08)] h-[145px] sm:h-[155px]">
        {/* Horizontal Scroll Snap Area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* SLIDE 0: Permanent Info / Status Slide */}
          <div className="w-full h-full shrink-0 snap-center snap-always">
            {renderPermanentSlide()}
          </div>

          {/* SLIDES 1..N: Promotional Offer Banners */}
          {offers.map((offer, idx) => {
            const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
            const bannerUrl = getImageUrl(offer.imageUrl);

            const promoSlide = (
              <div className="relative w-full h-full overflow-hidden bg-slate-950">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt={offer.title || 'Promotional Offer'}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900/90 flex flex-col justify-between p-4 text-white">
                    <div className="flex items-center gap-1.5">
                      <BadgePercent className="w-4 h-4 text-brand" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Special Offer
                      </span>
                    </div>
                    <h3 className="text-base font-black tracking-tight leading-snug line-clamp-2">
                      {offer.title}
                    </h3>
                  </div>
                )}

                {/* Soft top & bottom gradient vignettes */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />

                {/* Offer Title & Action Pill */}
                <div className="absolute inset-x-3.5 bottom-3 flex items-center justify-between gap-2 z-10">
                  <span className="text-xs font-bold text-white/90 drop-shadow-sm truncate max-w-[55%]">
                    {offer.title}
                  </span>

                  {isKitchenLink && (
                    <div className="px-3 py-1 rounded-full bg-white/95 hover:bg-white text-slate-900 backdrop-blur-md text-[10.5px] font-black tracking-tight flex items-center gap-1 shadow-md transition-all active:scale-95 shrink-0">
                      <Store className="w-3 h-3 text-brand" />
                      <span>View Kitchen</span>
                      <ArrowRight className="w-3 h-3 text-slate-700" />
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <div
                key={offer.id}
                className="w-full h-full shrink-0 snap-center snap-always"
              >
                {isKitchenLink ? (
                  <Link
                    href={`/vendor/detail?id=${offer.linkedKitchenId}`}
                    onClick={triggerHapticSelection}
                    className="block w-full h-full cursor-pointer"
                    aria-label={`View offer: ${offer.title}`}
                  >
                    {promoSlide}
                  </Link>
                ) : (
                  <div className="w-full h-full cursor-default">
                    {promoSlide}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ════════════════════════════════════════
            INTEGRATED COUNTER BADGE (e.g. 1/2)
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none">
            <div className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-white/90 font-bold text-[9px] tracking-wider border border-white/10 shadow-2xs">
              {currentIndex + 1}/{totalSlides}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            INTEGRATED BOTTOM PAGINATION DOTS (Inside Card)
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-md border border-white/10 pointer-events-auto">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`transition-all duration-300 rounded-full ${
                  i === currentIndex
                    ? 'w-3.5 h-1 bg-white shadow-2xs'
                    : 'w-1 h-1 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════
            DESKTOP CHEVRON CONTROLS (Hover only)
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous slide"
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next slide"
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
