'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getActiveOffers } from '@/lib/offers';
import { getImageUrl } from '@/lib/storage';
import { Offer } from '@/types';
import {
  Store,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  ShieldCheck,
  CalendarCheck,
  Flame,
  Sparkles,
} from 'lucide-react';
import { triggerHapticSelection, triggerHapticImpact, ImpactStyle } from '@/lib/haptics';

interface OffersCarouselProps {
  activeDelivery?: any;
  activeSubs?: any[];
  firstName?: string;
  greetingText?: string;
}

export type CarouselItem =
  | {
      id: string;
      kind: 'delivery';
      data: any;
    }
  | {
      id: string;
      kind: 'subscription';
      data: any;
    }
  | {
      id: string;
      kind: 'offer';
      data: Offer;
    }
  | {
      id: string;
      kind: 'highlight';
      tag: string;
      title: string;
      description: string;
      ctaText: string;
      ctaAction: 'kitchens' | 'orders';
    };

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0.88,
    scale: 0.985,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: 'spring' as const, stiffness: 300, damping: 32, mass: 0.8 },
      opacity: { duration: 0.22 },
      scale: { duration: 0.22 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0.88,
    scale: 0.985,
    transition: {
      x: { type: 'spring' as const, stiffness: 300, damping: 32, mass: 0.8 },
      opacity: { duration: 0.22 },
      scale: { duration: 0.22 },
    },
  }),
};

export function OffersCarousel({
  activeDelivery,
  activeSubs = [],
  firstName = 'there',
  greetingText = 'Good morning',
}: OffersCarouselProps) {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const isDraggingRef = useRef(false);

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

  // ─── Build Round-Robin Objects Array ──────────────────────────────────────────
  const slides: CarouselItem[] = useMemo(() => {
    const list: CarouselItem[] = [];

    // 1. Live delivery status (top priority if user has an active order)
    if (activeDelivery) {
      list.push({
        id: 'active-delivery',
        kind: 'delivery',
        data: activeDelivery,
      });
    }

    // 2. Active tiffin subscription (if user has active meal plans)
    if (activeSubs.length > 0) {
      list.push({
        id: 'active-sub',
        kind: 'subscription',
        data: activeSubs[0],
      });
    }

    // 3. All promotional offers configured by admin
    offers.forEach((offer) => {
      list.push({
        id: `offer-${offer.id}`,
        kind: 'offer',
        data: offer,
      });
    });

    // 4. Curated culinary highlights so there is always a rich set of 3+ objects
    //    cycling in the round-robin continuous rotation
    if (list.length < 3) {
      list.push({
        id: 'highlight-ghar-ka-khana',
        kind: 'highlight',
        tag: 'Dabzzo Fresh',
        title: 'Authentic Ghar Ka Khana, Cooked Daily',
        description: 'Prepared in certified local home kitchens with pure ingredients & zero preservatives.',
        ctaText: 'Explore Kitchens',
        ctaAction: 'kitchens',
      });
    }

    if (list.length < 3) {
      list.push({
        id: 'highlight-flexible-plans',
        kind: 'highlight',
        tag: 'Flexible Tiffins',
        title: 'Pause, Swap, or Cancel in 1 Tap',
        description: 'Heading out of town? Pause your daily meals instantly with zero cancellation penalties.',
        ctaText: 'Manage Plans',
        ctaAction: 'orders',
      });
    }

    return list;
  }, [activeDelivery, activeSubs, offers]);

  const totalSlides = slides.length;

  // Compute the current active slide index in circular modulo space
  const activeIndex = useMemo(() => {
    if (totalSlides === 0) return 0;
    return ((step % totalSlides) + totalSlides) % totalSlides;
  }, [step, totalSlides]);

  // Round-robin pagination step: always moves in the intended direction
  const paginate = useCallback(
    (newDirection: number) => {
      if (totalSlides <= 1) return;
      setDirection(newDirection);
      setStep((prev) => prev + newDirection);
    },
    [totalSlides]
  );

  // Jump directly to a specific slide taking the shortest circular route
  const goToSlide = useCallback(
    (targetIndex: number) => {
      if (targetIndex === activeIndex || totalSlides <= 1) return;
      triggerHapticImpact(ImpactStyle.Light);
      const forwardSteps = (targetIndex - activeIndex + totalSlides) % totalSlides;
      const backwardSteps = (activeIndex - targetIndex + totalSlides) % totalSlides;
      if (forwardSteps <= backwardSteps) {
        setDirection(1);
        setStep((prev) => prev + forwardSteps);
      } else {
        setDirection(-1);
        setStep((prev) => prev - backwardSteps);
      }
    },
    [activeIndex, totalSlides]
  );

  // ─── Continuous Round-Robin Auto-Advance Timer (every 4.5s) ───────────────────
  useEffect(() => {
    if (totalSlides <= 1 || isPaused) return;

    const timer = setInterval(() => {
      paginate(1);
    }, 4500);

    return () => clearInterval(timer);
  }, [totalSlides, isPaused, paginate]);

  // Current active slide object
  const currentItem = slides[activeIndex];

  // ─── Slide Renderers ────────────────────────────────────────────────────────
  const renderSlideContent = (item: CarouselItem) => {
    if (!item) return null;

    // A. LIVE ORDER IN PROGRESS
    if (item.kind === 'delivery') {
      const delivery = item.data;
      return (
        <div className="relative w-full h-full flex flex-col justify-between p-4.5 sm:p-5 bg-gradient-to-br from-[#0F1E17] via-[#12231B] to-[#0A1610] text-white">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                  Live Order In Progress
                </span>
              </div>
              <span className="text-[9.5px] font-semibold text-white/60 uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded-full">
                Today
              </span>
            </div>
            <p className="text-white font-extrabold text-lg sm:text-xl leading-tight truncate">
              {delivery.partnerName || 'Your Kitchen'}
            </p>
            <p className="text-emerald-100/70 text-xs mt-0.5 capitalize font-medium">
              Status: {delivery.status?.replace(/_/g, ' ') || 'Preparing fresh meal'}
            </p>
          </div>

          <div className="mt-2.5">
            <Link
              href="/track"
              onClick={() => {
                if (isDraggingRef.current) return;
                triggerHapticSelection();
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-gradient-to-r from-brand to-amber-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-95 transition-all duration-200 active:scale-[0.98] shadow-md shadow-brand/20"
            >
              <span>Track Live Delivery</span>
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </Link>
          </div>
        </div>
      );
    }

    // B. ACTIVE SUBSCRIPTION
    if (item.kind === 'subscription') {
      const sub = item.data;
      return (
        <div className="relative w-full h-full flex flex-col justify-between p-4.5 sm:p-5 bg-gradient-to-br from-[#1E1710] via-[#241B12] to-[#140E08] text-white">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                  Subscription Active
                </span>
              </div>
              <span className="text-[9px] font-semibold text-white/70 uppercase tracking-wider bg-white/10 px-2.5 py-0.5 rounded-full">
                {activeSubs.length} Active Plan{activeSubs.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-white font-extrabold text-lg sm:text-xl leading-tight truncate">
              {sub.meal_type
                ? `${sub.meal_type.charAt(0).toUpperCase() + sub.meal_type.slice(1)} Tiffin Scheduled`
                : 'Daily Meals Scheduled'}
            </p>
            <p className="text-amber-100/70 text-xs mt-0.5 font-medium">
              Your home kitchen meals are scheduled and tracking automatically.
            </p>
          </div>

          <div className="mt-2.5">
            <Link
              href="/orders"
              onClick={() => {
                if (isDraggingRef.current) return;
                triggerHapticSelection();
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-white/15 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-white/20 transition-all duration-200 active:scale-[0.98] border border-white/20 shadow-sm backdrop-blur-md"
            >
              <span>Manage Meal Planner</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/80" />
            </Link>
          </div>
        </div>
      );
    }

    // C. PROMOTIONAL OFFER BANNER
    if (item.kind === 'offer') {
      const offer = item.data;
      const isKitchenLink = offer.linkType === 'kitchen' && Boolean(offer.linkedKitchenId);
      const bannerUrl = getImageUrl(offer.imageUrl);

      const content = (
        <div className="relative w-full h-full overflow-hidden bg-[#1A1009]">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt={offer.title || 'Promotional Offer'}
              className="w-full h-full object-cover object-center pointer-events-none select-none transition-transform duration-700 ease-out"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#26150C] via-[#1B0F08] to-[#120A05] flex flex-col justify-between p-4.5 sm:p-5 text-white">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full px-2.5 py-0.5 text-[9.5px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Featured Offer
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight leading-snug line-clamp-2">
                {offer.title}
              </h3>
            </div>
          )}

          {/* Gentle, balanced bottom scrim for crisp text readability */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none z-10" />

          {/* Clean bottom title & action pill */}
          <div className="absolute inset-x-4 bottom-3 flex items-center justify-between gap-3 z-20">
            <span className="text-xs sm:text-sm font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] truncate max-w-[62%]">
              {offer.title}
            </span>

            {isKitchenLink && (
              <div className="px-3.5 py-1.5 rounded-full bg-white text-slate-950 text-[11px] font-extrabold tracking-tight flex items-center gap-1.5 shadow-md shrink-0 transition-transform active:scale-95 border border-white/60 hover:bg-slate-50">
                <Store className="w-3.5 h-3.5 text-brand" />
                <span>View Kitchen</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-700" />
              </div>
            )}
          </div>
        </div>
      );

      if (isKitchenLink) {
        return (
          <Link
            href={`/vendor/detail?id=${offer.linkedKitchenId}`}
            onClick={(e) => {
              if (isDraggingRef.current) {
                e.preventDefault();
                return;
              }
              triggerHapticSelection();
            }}
            className="block w-full h-full cursor-pointer"
            aria-label={`View offer: ${offer.title}`}
          >
            {content}
          </Link>
        );
      }

      return <div className="w-full h-full cursor-default">{content}</div>;
    }

    // D. CURATED CULINARY HIGHLIGHTS (Clean human design, no AI buzzwords)
    const highlight = item;
    return (
      <div className="relative w-full h-full flex flex-col justify-between p-4 sm:p-5 bg-gradient-to-br from-[#24150D] via-[#1B1009] to-[#120A05] text-white">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-full px-2.5 py-0.5 text-[9px] font-extrabold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
              {highlight.tag}
            </span>
            {firstName && firstName !== 'there' && (
              <span className="text-[10px] font-semibold tracking-wider text-amber-200/80 uppercase">
                {greetingText}, {firstName}!
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-black text-white leading-snug tracking-tight">
            {highlight.title}
          </h2>
          <p className="mt-1 text-xs text-amber-100/75 leading-relaxed font-normal line-clamp-2 max-w-[95%]">
            {highlight.description}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-amber-300/90">
            <ChefHat className="w-3.5 h-3.5 text-amber-400" />
            <span>Verified Local Home Kitchens</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isDraggingRef.current) return;
              triggerHapticImpact(ImpactStyle.Light);
              if (highlight.ctaAction === 'orders') {
                router.push('/orders');
              } else {
                const target = document.getElementById('nearest-kitchens');
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth' });
                } else {
                  window.scrollTo({ top: 380, behavior: 'smooth' });
                }
              }
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full transition-all border border-white/20 active:scale-95"
          >
            <span>{highlight.ctaText}</span>
            <ArrowRight className="w-3 h-3 text-amber-300" />
          </button>
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
          ROUND-ROBIN CONTINUOUS HERO DISPLAY
      ════════════════════════════════════════ */}
      <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.14)] border border-white/20 bg-[#160D07] h-[165px] sm:h-[180px]">
        {/* Animated Slide Canvas */}
        <div className="relative w-full h-full overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag={totalSlides > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragStart={() => {
                isDraggingRef.current = true;
              }}
              onDragEnd={(_e, { offset, velocity }) => {
                setTimeout(() => {
                  isDraggingRef.current = false;
                }, 80);
                if (offset.x < -35 || velocity.x < -350) {
                  triggerHapticImpact(ImpactStyle.Light);
                  paginate(1);
                } else if (offset.x > 35 || velocity.x > 350) {
                  triggerHapticImpact(ImpactStyle.Light);
                  paginate(-1);
                }
              }}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            >
              {renderSlideContent(currentItem)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ════════════════════════════════════════
            CLEAN SEGMENTED PILL INDICATORS
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 pointer-events-auto">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(i);
                }}
                aria-label={`Go to slide ${i + 1}`}
                className={`transition-all duration-300 rounded-full ${
                  i === activeIndex
                    ? 'w-5 h-1.5 bg-white shadow-xs'
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════
            MINIMAL DESKTOP CHEVRONS (Hover only)
        ════════════════════════════════════════ */}
        {totalSlides > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHapticImpact(ImpactStyle.Light);
                paginate(-1);
              }}
              aria-label="Previous slide"
              className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 border border-white/10 active:scale-95 shadow-md"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHapticImpact(ImpactStyle.Light);
                paginate(1);
              }}
              aria-label="Next slide"
              className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-md items-center justify-center transition-all opacity-0 group-hover:opacity-100 border border-white/10 active:scale-95 shadow-md"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
