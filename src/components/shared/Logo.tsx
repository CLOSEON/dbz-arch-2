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
        src="/icon.png"
        alt="Dabzzo"
        width={size}
        height={size}
        className="object-contain rounded-xl shadow-xs w-auto h-9"
        priority
      />
    </div>
  );
}
