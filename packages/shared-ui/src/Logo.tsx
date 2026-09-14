'use client';

import { useState } from 'react';

// Shared brand mark. The four apps' copies of this component differed only in
// branding — image path, alt text, and the colours/label of the text fallback
// shown if the image fails to load. Those are now props, so the markup and the
// error-fallback behaviour live in one place while each portal keeps its own
// identity. See IMPLEMENTATION_PLAN.md Phase 1.

export interface LogoProps {
  className?: string;
  size?: number;
  /** Image served from the app's own /public. */
  src?: string;
  alt?: string;
  /** Tailwind bg class for the fallback badge, e.g. "bg-amber-600". */
  badgeClassName?: string;
  /** Optional portal name rendered after "Dabzzo" in the fallback. */
  label?: string;
  /** Tailwind text colour class for that label. */
  labelClassName?: string;
}

export function Logo({
  className = '',
  size = 36,
  src = '/icon.png',
  alt = 'Dabzzo',
  badgeClassName = 'bg-amber-600',
  label,
  labelClassName = 'text-slate-500',
}: LogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {!imgError ? (
        <img
          src={src}
          alt={alt}
          style={{ height: `${size}px`, width: 'auto' }}
          className="object-contain rounded-xl shadow-xs"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center gap-1.5 font-extrabold text-xl tracking-tight text-slate-900">
          <span
            className={`w-8 h-8 rounded-xl ${badgeClassName} text-white flex items-center justify-center text-sm font-black shadow-xs`}
          >
            D
          </span>
          <span>
            Dabzzo
            {label ? (
              <>
                {' '}
                <span className={`text-xs font-bold ${labelClassName} uppercase tracking-wider`}>
                  {label}
                </span>
              </>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
}
