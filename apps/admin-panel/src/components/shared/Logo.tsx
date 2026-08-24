'use client';

import { useState } from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 36 }: LogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {!imgError ? (
        <img
          src="/logo.png"
          alt="Dabzzo Admin"
          style={{ height: `${size}px`, width: 'auto' }}
          className="object-contain rounded-xl"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center gap-1.5 font-extrabold text-xl tracking-tight text-slate-900">
          <span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-sm font-black shadow-xs">D</span>
          <span>Dabzzo <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin</span></span>
        </div>
      )}
    </div>
  );
}
