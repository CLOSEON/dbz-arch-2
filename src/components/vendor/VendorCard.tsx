'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Vendor } from '@/types';
import { getImageUrl } from '@/lib/storage';

interface VendorCardProps {
  vendor: Vendor;
}

export function VendorCard({ vendor }: VendorCardProps) {
  const prices = [vendor.rate_lunch, vendor.rate_dinner, vendor.rate_both]
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const rating = vendor.rating_avg ? Number(vendor.rating_avg).toFixed(1) : null;

  return (
    <Link
      href={`/vendor/detail?id=${vendor.id}`}
      className="card group !p-0 block overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.10)] active:scale-[0.99]"
    >
      <div className="relative h-44 bg-slate-100">
        {vendor.image ? (
          <Image
            src={getImageUrl(vendor.image)}
            alt={vendor.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 500px) 100vw, 500px"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-100">
            <span className="text-4xl opacity-40">🍱</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/35 to-transparent" />
        
        {/* Premium Rating Badge */}
        {rating && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.12)] border border-white/70">
            <span className="text-brand text-xs">★</span>
            <span className="text-slate-900 text-xs font-bold leading-none">{rating}</span>
          </div>
        )}

        {/* Status Badge */}
        {vendor.is_approved && (
          <div className="absolute top-3 left-3 bg-emerald-600/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border border-white/20">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[9px] font-black uppercase tracking-widest leading-none">Verified</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0 pr-4">
            <h3 className="truncate font-black text-slate-950 text-[17px] leading-tight tracking-tight">
              {vendor.name}
            </h3>
            <div className="flex min-w-0 flex-wrap items-center gap-2 mt-2">
              <p className="max-w-full truncate text-[10px] font-black text-slate-500 uppercase tracking-[0.12em] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/70">
                {vendor.cuisine_type || 'Home Style'}
              </p>
              <div className="w-1 h-1 rounded-full bg-slate-200" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                {vendor.subscriberCount ?? 0} subscribers
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
