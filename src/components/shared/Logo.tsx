'use client';

import Image from 'next/image';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 36 }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.png"
        alt="Dabzzo"
        width={Math.round(size * 1.8)}
        height={Math.round(size * 1.8)}
        className="object-contain rounded-xl shadow-sm h-9 w-auto"
        priority
      />
    </div>
  );
}
