'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getActiveOffers } from '@/lib/offers';
import { getImageUrl } from '@/lib/storage';
import { Offer } from '@/types';
import { BadgePercent, Store, ArrowRight } from 'lucide-react';
import { triggerHapticSelection } from '@/lib/haptics';

export function OffersCarousel() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOffers() {
      try {
        const active = await getActiveOffers();
        if (isMounted) {
          setOffers(active);
        }
      } catch (err) {
        console.warn('[OffersCarousel] Could not load offers:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadOffers();

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync pagination indicator with horizontal scroll position
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, offsetWidth } = scrollRef.current;
    if (offsetWidth === 0) return;
    const cardWidth = Math.min(window.innerWidth * 0.82, 360);
    const index = Math.round(scrollLeft / (cardWidth + 12));
    setActiveIndex(Math.min(Math.max(0, index), Math.max(0, offers.length - 1)));
  };

  // ─── 1. Loading Skeleton State (Zero Layout Shift) ──────────────────────────
  if (loading) {
    return (
      <section className="mb-5 animate-fade-in" aria-label="Promotions loading">
        <div className="flex gap-3 overflow-x-hidden -mx-5 px-5 sm:-mx-6 sm:px-6 pb-1">
          {/* Main compact 16:9 skeleton card */}
          <div className="w-[82vw] max-w-[320px] sm:max-w-[360px] md:max-w-[400px] shrink-0 aspect-[16/9] rounded-2xl sm:rounded-3xl bg-slate-200/75 animate-pulse border border-slate-200/60 shadow-2xs" />
          {/* Peeking secondary skeleton card */}
          <div className="w-[82vw] max-w-[320px] sm:max-w-[360px] md:max-w-[400px] shrink-0 aspect-[16/9] rounded-2xl sm:rounded-3xl bg-slate-200/40 animate-pulse border border-slate-200/40 shadow-2xs" />
        </div>
      </section>
    );
  }

  // ─── 2. Empty State: Collapse completely ────────────────────────────────────
  if (offers.length === 0) {
    return null;
  }

  // ─── 3. Active Offers Carousel ──────────────────────────────────────────────
  return (
    <section className="mb-5 animate-fade-in" aria-label="Special Offers">
      {/* Scrollable Container with Snap-to-Card and Peeking */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-5 px-5 sm:-mx-6 sm:px-6 pb-1 pt-0.5 touch-pan-x"
        style={{
          scrollPaddingLeft: '1.25rem',
          scrollPaddingRight: '1.25rem',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {offers.map((offer, idx) => {
          const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
          const bannerUrl = getImageUrl(offer.imageUrl);

          // Card visual structure
          const cardContent = (
            <div className="relative w-full h-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-900 shadow-[0_4px_20px_rgba(15,23,42,0.06)] border border-slate-100/90 group transition-all duration-300">
              {/* 16:9 Banner Image */}
              {bannerUrl ? (
                <img
                  src={bannerUrl}
                  alt={offer.title || 'Promotional Offer'}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
              ) : (
                <div className="w-full h-full bg-slate-900 flex flex-col justify-between p-4 sm:p-5 text-white">
                  <div className="flex items-center gap-1.5">
                    <BadgePercent className="w-4 h-4 text-brand" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                      Exclusive Deal
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-black tracking-tight leading-snug line-clamp-2">
                    {offer.title}
                  </h3>
                  {isKitchenLink && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-100">
                      <span>Order Now</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  )}
                </div>
              )}

              {/* Deep-link action pill overlay if kitchen is linked */}
              {bannerUrl && isKitchenLink && (
                <div className="absolute bottom-2.5 right-2.5 bg-slate-950/80 hover:bg-slate-950 text-white backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] sm:text-[11px] font-bold shadow-md transition-all duration-200 group-hover:bg-brand">
                  <Store className="w-3 h-3 text-amber-300 group-hover:text-white" />
                  <span>View Kitchen</span>
                  <ArrowRight className="w-2.5 h-2.5 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                </div>
              )}
            </div>
          );

          return (
            <div
              key={offer.id}
              className="w-[82vw] max-w-[320px] sm:max-w-[360px] md:max-w-[400px] shrink-0 snap-start aspect-[16/9]"
            >
              {isKitchenLink ? (
                <Link
                  href={`/vendor/detail?id=${offer.linkedKitchenId}`}
                  onClick={triggerHapticSelection}
                  aria-label={`View offer: ${offer.title}`}
                  className="block w-full h-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 rounded-2xl sm:rounded-3xl transition-transform duration-200 active:scale-[0.98] cursor-pointer"
                >
                  {cardContent}
                </Link>
              ) : (
                <div className="w-full h-full select-none cursor-default">
                  {cardContent}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Synchronized Pagination Dots (when multiple offers exist) */}
      {offers.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-1.5">
          {offers.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-4 bg-brand shadow-xs'
                  : 'w-1 bg-slate-300/80'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
