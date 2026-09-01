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
        <div className="relative w-full h-full flex flex-col justify-between p-4.5 bg-slate-950 text-white rounded-2xl sm:rounded-3xl overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
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
            <p className="text-slate-400 text-xs mt-1 capitalize">
              Status: {activeDelivery.status?.replace(/_/g, ' ') || 'Preparing'}
            </p>
          </div>
          <div className="mt-3">
            <Link
              href="/track"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-brand text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-brand-650 transition-all duration-200 active:scale-[0.98]"
            >
              Track Live Delivery
            </Link>
          </div>
        </div>
      );
    }

    if (activeSubs.length > 0) {
      return (
        <div className="relative w-full h-full flex flex-col justify-between p-4.5 bg-slate-950 text-white rounded-2xl sm:rounded-3xl overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
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
            <p className="text-slate-400 text-xs mt-1">
              Your kitchen meals are scheduled and tracking automatically.
            </p>
          </div>
          <div className="mt-3">
            <Link
              href="/orders"
              onClick={triggerHapticSelection}
              className="block w-full text-center py-2 bg-white/10 text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white/15 transition-all duration-200 active:scale-[0.98] border border-white/5"
            >
              Manage Weekly Planner
            </Link>
          </div>
        </div>
      );
    }

    // Default Permanent Brand Card
    return (
      <div className="relative w-full h-full flex flex-col justify-between p-4.5 bg-black/20 backdrop-blur-md border border-white/15 text-white rounded-2xl sm:rounded-3xl overflow-hidden">
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
          CAROUSEL CARD WRAPPER
      ════════════════════════════════════════ */}
      <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg border border-white/15 min-h-[148px] sm:min-h-[160px] aspect-[16/8.5] max-h-[190px] bg-black/30">
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
          {/* SLIDE 0: Permanent Info / Subscription / Delivery Slide */}
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
                  <div className="w-full h-full bg-slate-900 flex flex-col justify-between p-4.5 text-white">
                    <div className="flex items-center gap-1.5">
                      <BadgePercent className="w-4 h-4 text-brand" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Featured Offer
                      </span>
                    </div>
                    <h3 className="text-base font-black tracking-tight leading-snug line-clamp-2">
                      {offer.title}
                    </h3>
                  </div>
                )}

                {/* Subtle bottom shadow vignette */}
                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                {/* Deep-link action button */}
                {isKitchenLink && (
                  <div className="absolute bottom-2.5 right-2.5 z-10">
                    <div className="px-3 py-1 rounded-full bg-black/75 hover:bg-brand text-white backdrop-blur-md text-[10.5px] font-bold flex items-center gap-1.5 shadow-md border border-white/15 transition-all duration-200">
                      <Store className="w-3 h-3 text-amber-300" />
                      <span>View Kitchen</span>
                      <ArrowRight className="w-3 h-3 text-white/80" />
                    </div>
                  </div>
                )}
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
            INSTAGRAM-STYLE COUNTER (e.g. 1/2)
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none">
            <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white font-black text-[9.5px] tracking-wider border border-white/10 shadow-xs">
              {currentIndex + 1}/{totalSlides}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            DESKTOP ARROW CONTROLS
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════
          PAGINATION DOTS
      ════════════════════════════════════════ */}
      {totalSlides > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`transition-all duration-300 rounded-full ${
                i === currentIndex
                  ? 'w-4 h-1.5 bg-white shadow-xs'
                  : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
