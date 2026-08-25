'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChefHat, Star } from 'lucide-react';
import type { Vendor } from '@/types';
import { getImageUrl } from '@/lib/storage';

interface VendorCardProps {
  vendor: Vendor;
}

export function VendorCard({ vendor }: VendorCardProps) {
  const prices = [
    vendor.rate_lunch_weekly, vendor.rate_lunch_monthly, vendor.rate_lunch,
    vendor.rate_dinner_weekly, vendor.rate_dinner_monthly, vendor.rate_dinner,
    vendor.rate_both_weekly, vendor.rate_both_monthly, vendor.rate_both,
    vendor.rate_onetime,
  ].filter((p): p is number => typeof p === 'number' && p > 0);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const ratingValue = vendor.rating_avg || vendor.rating || 4.5;
  const rating = Number(ratingValue).toFixed(1);
  
  const subCount = vendor.subscriberCount || 0;
  const capacity = vendor.capacity;
  const hasCapacityLimit = typeof capacity === 'number' && capacity > 0;
  const remainingSlots = hasCapacityLimit && capacity !== null ? Math.max(0, capacity - subCount) : null;
  const isAtCapacity = hasCapacityLimit && remainingSlots !== null && remainingSlots <= 0;

  return (
    <Link
      href={`/vendor/detail?id=${vendor.id}`}
      className="card interactive-card group !p-0 block overflow-hidden rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] active:scale-[0.99]"
    >
      <div className="relative h-44 overflow-hidden bg-slate-100">
        {vendor.image ? (
          <Image
            src={getImageUrl(vendor.image)}
            alt={vendor.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 500px) 100vw, 500px"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-slate-100 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-xs border border-slate-200/60 mb-1.5">
              <ChefHat className="w-6 h-6 text-slate-400 stroke-[1.5]" />
            </div>
            <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
              Home Kitchen
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/40 to-transparent" />
        
        {/* Rating Badge */}
        <div className="absolute top-3.5 right-3.5 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border border-white/80 transition-all duration-200">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
          <span className="text-slate-900 text-xs font-bold leading-none">{rating}</span>
        </div>

        {/* Verified Badge */}
        {vendor.is_approved && (
          <div className="absolute top-3.5 left-3.5 bg-emerald-600/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border border-white/20">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[9.5px] font-black uppercase tracking-wider leading-none">Verified</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0 pr-4 flex-1">
            <h3 className="truncate font-black text-slate-900 text-[17px] leading-tight tracking-tight transition-colors duration-200 group-hover:text-brand">
              {vendor.name}
            </h3>
            <div className="flex min-w-0 flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/70">
                {vendor.cuisine_type || 'Home Style'}
              </span>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <div>
                {hasCapacityLimit ? (
                  isAtCapacity ? (
                    <span className="text-rose-600 font-extrabold text-[10px] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                      Sold Out
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-bold text-[10.5px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      {remainingSlots} of {capacity} left
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 font-bold text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                    Unlimited slots
                  </span>
                )}
              </div>
            </div>
          </div>

          {startingPrice && (
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em] mb-0.5">Starts at</p>
              <p className="text-[18px] font-black text-brand leading-none">₹{startingPrice}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
