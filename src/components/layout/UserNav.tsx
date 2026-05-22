'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M21 8V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
        <path d="M17 11V3a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v8" />
        <path d="M14 11h-4" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: '/track',
    label: 'Track',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 2a10 10 0 0 0-10 10c0 5.25 10 10 10 10s10-4.75 10-10a10 10 0 0 0-10-10z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

interface UserNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function UserNav({ variant = 'bottom' }: UserNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-1.5 px-4">
        {NAV_ITEMS.map((item) => {
          const isHome = item.href === '/dashboard';
          const active = isHome 
            ? pathname === '/dashboard' || pathname === '/dashboard/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 font-bold text-sm relative',
                active 
                  ? 'bg-white text-slate-900 shadow-[0_10px_25px_rgba(0,0,0,0.04)] scale-[1.02]' 
                  : 'text-slate-400 hover:bg-slate-50/80 hover:text-slate-600'
              )}
            >
              {active && (
                <div className="absolute left-0 w-1 h-6 bg-brand rounded-r-full" />
              )}
              <div className={cn(
                "transition-transform duration-300",
                active ? "scale-110" : "group-hover:scale-105"
              )}>
                {item.icon(active)}
              </div>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-6 py-3 pb-safe animate-fade-in shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
      <div className="max-w-3xl mx-auto flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isHome = item.href === '/dashboard';
          const active = isHome 
            ? pathname === '/dashboard' || pathname === '/dashboard/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center py-1 gap-1 transition-all duration-200 outline-none select-none touch-none',
                active ? 'text-brand' : 'text-slate-400'
              )}
            >
              <div className={cn(
                "transition-transform duration-200",
                active ? "scale-110" : ""
              )}>
                {item.icon(active)}
              </div>
              <span className={cn(
                'text-[10px] font-black uppercase tracking-widest transition-opacity duration-200',
                active ? 'opacity-100' : 'opacity-60'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
