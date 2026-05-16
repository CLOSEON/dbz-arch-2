'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Vendor } from '@/types';
import { getImageUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';

interface VendorCardProps {
  vendor: Vendor;
  index?: number;
}

export function VendorCard({ vendor, index = 0 }: VendorCardProps) {
  const prices = [vendor.rate_lunch, vendor.rate_dinner, vendor.rate_both]
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const rating = vendor.rating_avg ? Number(vendor.rating_avg).toFixed(1) : null;

  return (
    <Link
      href={`/vendor/detail?id=${vendor.id}`}
      className="card !p-0 block overflow-hidden active:scale-[0.98] transition-all duration-200"
    >
      <div className="relative h-44 bg-slate-50">
        {vendor.image ? (
          <Image
            src={getImageUrl(vendor.image)}
            alt={vendor.name}
            fill
            className="object-cover"
            sizes="(max-width: 500px) 100vw, 500px"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-100">
            <span className="text-4xl opacity-40">🍱</span>
          </div>
        )}
        
        {/* Premium Rating Badge */}
        {rating && (
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_4px_15px_rgba(0,0,0,0.1)] border border-white/50">
            <span className="text-brand text-xs">★</span>
            <span className="text-slate-900 text-xs font-bold leading-none">{rating}</span>
          </div>
        )}

        {/* Status Badge */}
        {vendor.is_approved && (
          <div className="absolute top-3 left-3 bg-emerald-500/90 backdrop-blur-md px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm border border-white/20">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[9px] font-black uppercase tracking-widest leading-none">Verified</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-slate-900 text-[17px] leading-tight tracking-tight">
              {vendor.name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100/50">
                {vendor.cuisine_type || 'Home Style'}
              </p>
              <div className="w-1 h-1 rounded-full bg-slate-200" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {vendor.subscriberCount ?? 0} subscribers
              </p>
            </div>
          </div>
          {startingPrice && (
            <div className="text-right">
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-0.5">Starts at</p>
              <p className="text-[17px] font-black text-brand leading-none">₹{startingPrice}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
