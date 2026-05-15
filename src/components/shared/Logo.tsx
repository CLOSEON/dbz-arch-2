'use client';

import Image from 'next/image';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 40 }: LogoProps) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <Image
        src="/logo.png"
        alt="Dabzo Logo"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}
