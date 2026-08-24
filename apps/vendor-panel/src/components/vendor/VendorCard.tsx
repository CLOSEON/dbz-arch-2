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
      className="card interactive-card group !p-0 block overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.12)] active:scale-[0.99]"
    >
      <div className="relative h-44 bg-slate-100">
        {vendor.image ? (
          <Image
            src={getImageUrl(vendor.image)}
            alt={vendor.name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            sizes="(max-width: 500px) 100vw, 500px"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-100 text-slate-400">
            <ChefHat className="w-10 h-10 stroke-[1.5] opacity-50" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/35 to-transparent" />
        
        {/* Premium Rating Badge */}
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.12)] border border-white/70 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_26px_rgba(255,204,0,0.22)]">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <span className="text-slate-900 text-xs font-bold leading-none">{rating}</span>
        </div>

        {/* Status Badge */}
        {vendor.is_approved && (
          <div className="absolute top-3 left-3 bg-emerald-600/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border border-white/20 transition-all duration-300 group-hover:-translate-y-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[9px] font-black uppercase tracking-widest leading-none">Verified</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0 pr-4">
            <h3 className="truncate font-black text-slate-950 text-[17px] leading-tight tracking-tight transition-colors duration-300 group-hover:text-brand">
              {vendor.name}
            </h3>
            <div className="flex min-w-0 flex-wrap items-center gap-2 mt-2">
              <p className="max-w-full truncate text-[10px] font-black text-slate-500 uppercase tracking-[0.12em] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/70">
                {vendor.cuisine_type || 'Home Style'}
              </p>
              <div className="w-1 h-1 rounded-full bg-slate-200" />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]">
                {hasCapacityLimit ? (
                  isAtCapacity ? (
                    <span className="text-rose-500 font-extrabold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg">
                      Sold Out
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                      {remainingSlots} of {capacity} left
                    </span>
                  )
                ) : (
                  <span className="text-slate-400 font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">
                    Unlimited slots
                  </span>
                )}
              </p>
            </div>
          </div>
          {startingPrice && (
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.14em] mb-1">Starts at</p>
              <p className="text-[17px] font-black text-brand leading-none">₹{startingPrice}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
