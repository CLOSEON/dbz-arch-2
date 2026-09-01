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

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.clientWidth * 0.82;
    if (itemWidth > 0) {
      const newIndex = Math.round(scrollLeft / itemWidth);
      setActiveIndex(Math.min(Math.max(0, newIndex), offers.length - 1));
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 mb-3">
        <div className="w-full aspect-[16/9] max-h-[175px] sm:max-h-[190px] rounded-3xl bg-slate-100/90 animate-pulse border border-slate-200/50 shadow-xs" />
      </div>
    );
  }

  if (offers.length === 0) {
    return null;
  }

  return (
    <section className="w-full mb-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none px-4 py-1"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {offers.map((offer, idx) => {
          const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
          const bannerUrl = getImageUrl(offer.imageUrl);

          const cardContent = (
            <div className="relative w-full h-full overflow-hidden rounded-3xl bg-slate-900 shadow-sm border border-slate-100 group">
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
                  <Store className="w-3 text-amber-300 group-hover:text-white" />
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
