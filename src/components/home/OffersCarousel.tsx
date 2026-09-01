'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getActiveOffers } from '@/lib/offers';
import { getImageUrl } from '@/lib/storage';
import { Offer } from '@/types';
import { BadgePercent, Store, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { triggerHapticSelection, triggerHapticImpact, ImpactStyle } from '@/lib/haptics';

export function OffersCarousel() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch active offers
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

  // Update active dot based on scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current || offers.length <= 1) return;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const newIndex = Math.round(scrollLeft / width);
      setCurrentIndex(Math.min(Math.max(0, newIndex), offers.length - 1));
    }
  }, [offers.length]);

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

  // Next / Previous buttons for Instagram-like navigation
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentIndex < offers.length - 1) {
      scrollToIndex(currentIndex + 1);
    }
  };

  // ─── 1. Loading Skeleton State ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full mb-5">
        <div className="w-full aspect-[16/9] max-h-[220px] rounded-3xl bg-slate-200/80 animate-pulse border border-slate-200/60 shadow-xs" />
      </div>
    );
  }

  // ─── 2. Empty State ──────────────────────────────────────────────────────────
  if (offers.length === 0) {
    return null;
  }

  return (
    <section className="relative w-full mb-6 select-none group" aria-label="Promotional Offers">
      {/* ════════════════════════════════════════
          INSTAGRAM-STYLE CAROUSEL CONTAINER
      ════════════════════════════════════════ */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-sm border border-slate-200/80 bg-slate-950 aspect-[16/9] max-h-[240px]">
        {/* Horizontal Scroll Area (Snap-to-card swipe) */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {offers.map((offer, idx) => {
            const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
            const bannerUrl = getImageUrl(offer.imageUrl);

            const slideInner = (
              <div className="relative w-full h-full overflow-hidden bg-slate-900">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt={offer.title || 'Promotional Offer'}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading={idx === 0 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex flex-col justify-between p-5 text-white">
                    <div className="flex items-center gap-1.5">
                      <BadgePercent className="w-4 h-4 text-brand" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Featured Offer
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug line-clamp-2">
                      {offer.title}
                    </h3>
                    {isKitchenLink && (
                      <div className="inline-flex items-center gap-1 text-xs font-bold text-brand">
                        <span>Explore Kitchen</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                )}

                {/* Gradient vignette at bottom for readability */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                {/* Deep-link action button */}
                {isKitchenLink && (
                  <div className="absolute bottom-3 right-3 z-10">
                    <div className="px-3 py-1.5 rounded-full bg-black/75 hover:bg-brand text-white backdrop-blur-md text-[11px] font-bold flex items-center gap-1.5 shadow-md border border-white/15 transition-all duration-200">
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
                    {slideInner}
                  </Link>
                ) : (
                  <div className="w-full h-full cursor-default">
                    {slideInner}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ════════════════════════════════════════
            INSTAGRAM-STYLE COUNTER BADGE (e.g. 1/3)
        ════════════════════════════════════════ */}
        {offers.length > 1 && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none">
            <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-black text-[10px] tracking-wider border border-white/10 shadow-xs">
              {currentIndex + 1}/{offers.length}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            DESKTOP ARROW CONTROLS (Swipe Left/Right)
        ════════════════════════════════════════ */}
        {offers.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous slide"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {currentIndex < offers.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next slide"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md border border-white/10 active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* ════════════════════════════════════════
          INSTAGRAM-STYLE PAGINATION DOTS
      ════════════════════════════════════════ */}
      {offers.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {offers.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`transition-all duration-300 rounded-full ${
                i === currentIndex
                  ? 'w-5 h-1.5 bg-brand'
                  : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
