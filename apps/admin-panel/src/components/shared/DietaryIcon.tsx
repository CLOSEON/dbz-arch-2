'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function VegIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 inline-block", className)}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" stroke="#16A34A" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="5" fill="#16A34A" />
    </svg>
  );
}

export function NonVegIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 inline-block", className)}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" stroke="#E11D48" strokeWidth="2.5" />
      <polygon points="12,6.5 17.5,17 6.5,17" fill="#E11D48" />
    </svg>
  );
}

export function DietaryBadge({ type, size = 14, showLabel = true, className = '' }: { type: 'veg' | 'non_veg' | 'both'; size?: number; showLabel?: boolean; className?: string }) {
  if (type === 'veg') {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold", className)}>
        <VegIcon size={size} />
        {showLabel && <span>Pure Veg</span>}
      </span>
    );
  }
  if (type === 'non_veg') {
    return (
      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold", className)}>
        <NonVegIcon size={size} />
        {showLabel && <span>Non-Veg</span>}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold", className)}>
      <VegIcon size={size} />
      <NonVegIcon size={size} />
      {showLabel && <span>Veg & Non-Veg</span>}
    </span>
  );
}
