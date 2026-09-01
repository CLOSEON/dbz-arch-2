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
        <div className="relative w-full h-full flex flex-col justify-between px-5 sm:px-6 py-4 bg-black/25 text-white">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Live Delivery Status
                </span>
              </div>
              <span className="text-[9.5px] font-bold text-white/60 uppercase">Today</span>
            </div>
            <p className="text-white font-bold text-base leading-tight truncate">
              {activeDelivery.partnerName || 'Your Kitchen'}
            </p>
            <p className="text-amber-100/80 text-xs mt-0.5 capitalize">
              Status: {activeDelivery.status?.replace(/_/g, ' ') || 'Preparing'}
            </p>
          </div>
          <div className="mt-2.5">
            <Link
              href="/track"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-slate-950/90 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-slate-900 transition-all duration-200 active:scale-[0.98] shadow-xs border border-white/10"
            >
              Track Live Delivery
            </Link>
          </div>
        </div>
      );
    }

    if (activeSubs.length > 0) {
      return (
        <div className="relative w-full h-full flex flex-col justify-between px-5 sm:px-6 py-4 bg-black/25 text-white">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-300" />
                <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">
                  Subscription Active
                </span>
              </div>
              <span className="text-[9.5px] font-bold text-white/60 uppercase">
                {activeSubs.length} Active Plan{activeSubs.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-white font-bold text-base leading-tight truncate">
              {activeSubs[0].meal_type
                ? `${activeSubs[0].meal_type.charAt(0).toUpperCase() + activeSubs[0].meal_type.slice(1)} Subscriptions`
                : 'Daily Meals'}
            </p>
            <p className="text-amber-100/80 text-xs mt-0.5">
              Your kitchen meals are scheduled and tracking automatically.
            </p>
          </div>
          <div className="mt-2.5">
            <Link
              href="/orders"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-white/15 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white/20 transition-all duration-200 active:scale-[0.98] border border-white/15"
            >
              Manage Weekly Planner
            </Link>
          </div>
        </div>
      );
    }

    // Default Glassmorphic Brand Card
    return (
      <div className="relative w-full h-full flex flex-col justify-between px-5 sm:px-6 py-4 bg-gradient-to-b from-black/10 via-black/15 to-black/25 text-white">
        <div>
          <span className="rounded-md px-2 py-0.5 text-[9.5px] font-bold tracking-wider uppercase bg-white/20 text-white inline-block">
            Premium Meal Service
          </span>
          <h2 className="mt-2 text-base sm:text-lg font-bold text-white leading-snug">
            Healthy Home Tiffins. Pause or Swap Anytime.
          </h2>
          <p className="mt-1 text-[11.5px] text-white/85 leading-relaxed font-normal line-clamp-2">
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
          FULL-BLEED HERO CAROUSEL FRAME
      ════════════════════════════════════════ */}
      <div className="relative w-full overflow-hidden h-[160px] sm:h-[170px] bg-[#E68A00]">
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
          <div className="w-full h-full shrink-0 snap-start snap-always">
            {renderPermanentSlide()}
          </div>

          {/* SLIDES 1..N: Promotional Offer Banners */}
          {offers.map((offer, idx) => {
            const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
            const bannerUrl = getImageUrl(offer.imageUrl);

            const promoSlide = (
              <div className="relative w-full h-full overflow-hidden bg-[#E68A00]">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt={offer.title || 'Promotional Offer'}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    style={{
                      WebkitMaskImage:
                        'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 15%, black 35%)',
                      maskImage:
                        'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 15%, black 35%)',
                    }}
                    loading="eager"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex flex-col justify-between px-5 sm:px-6 py-4 text-white">
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

                {/* ── Seamless Multi-Stop Warm Orange Top Blend ── */}
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#E68A00] via-[#E68A00]/50 to-transparent pointer-events-none z-10" />

                {/* ── Soft Edge Vignette ── */}
                <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#E68A00]/40 to-transparent pointer-events-none z-10" />
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#E68A00]/40 to-transparent pointer-events-none z-10" />

                {/* ── Bottom Dark Shadow for Legibility ── */}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none z-10" />

                {/* Offer Title & Action Pill */}
                <div className="absolute inset-x-5 sm:inset-x-6 bottom-3 flex items-center justify-between gap-2 z-20">
                  <span className="text-xs sm:text-sm font-black text-white drop-shadow-md truncate max-w-[55%]">
                    {offer.title}
                  </span>

                  {isKitchenLink && (
                    <div className="px-3.5 py-1.5 rounded-full bg-white text-slate-950 backdrop-blur-md text-[11px] font-black tracking-tight flex items-center gap-1.5 shadow-lg active:scale-95 shrink-0 transition-transform hover:bg-white/95">
                      <Store className="w-3.5 h-3.5 text-[#E68A00]" />
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
                className="w-full h-full shrink-0 snap-start snap-always"
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
          <div className="absolute top-2.5 right-4 sm:right-6 z-20 pointer-events-none">
            <div className="px-2 py-0.5 rounded-full bg-black/45 backdrop-blur-md text-white/90 font-bold text-[9px] tracking-wider border border-white/10 shadow-2xs">
              {currentIndex + 1}/{totalSlides}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            INTEGRATED BOTTOM PAGINATION DOTS
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 pointer-events-auto">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`transition-all duration-300 rounded-full ${
                  i === currentIndex
                    ? 'w-4 h-1 bg-white shadow-2xs'
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
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next slide"
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
