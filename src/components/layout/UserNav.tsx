'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, Package, UserCircle } from 'lucide-react';
import { triggerHapticSelection } from '@/lib/haptics';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: Home,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: Package,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: UserCircle,
  },
];

interface UserNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function UserNav({ variant = 'bottom' }: UserNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-1.5 px-4 py-4">
        {NAV_ITEMS.map((item) => {
          const isHome = item.href === '/dashboard';
          const active = isHome 
            ? pathname === '/dashboard' || pathname === '/dashboard/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={triggerHapticSelection}
              className={cn(
                'group relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-200',
                active 
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' 
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <div className={cn(
                "transition-all duration-200",
                active ? "text-brand scale-110" : "text-slate-400 group-hover:scale-110 group-hover:text-slate-600"
              )}>
                <item.icon className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav 
      className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm sm:max-w-md z-40 border border-slate-200/80 bg-white/95 px-4 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl rounded-[2.5rem] animate-fade-in"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
    >
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isHome = item.href === '/dashboard';
          const active = isHome 
            ? pathname === '/dashboard' || pathname === '/dashboard/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={triggerHapticSelection}
              className={cn(
                'group flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 transition-all duration-200 outline-none select-none touch-manipulation relative',
                active ? 'text-brand font-black' : 'text-slate-400 hover:text-slate-600 font-bold'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform duration-200', active ? 'scale-110 -translate-y-0.5' : 'group-hover:scale-105')} strokeWidth={2.4} />
              <span className={cn(
                'text-[9px] uppercase tracking-wider transition-opacity duration-200',
                active ? 'opacity-100' : 'opacity-70'
              )}>
                {item.label}
              </span>
              {active && (
                <div className="w-1.5 h-1.5 bg-brand rounded-full mt-0.5 shadow-sm shadow-brand/40" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
