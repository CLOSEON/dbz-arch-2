'use client';

import Image from 'next/image';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 40 }: { className?: string, size?: number }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image src="/assets/dabzzo-logo.png" alt="Dabzzo" width={size} height={size * 0.6} priority />
    </div>
  );
}
