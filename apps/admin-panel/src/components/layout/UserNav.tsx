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
              onClick={triggerHapticSelection}
              className={cn(
                'group relative flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5',
                active 
                  ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/70' 
                  : 'text-slate-400 hover:bg-slate-50/80 hover:text-slate-600'
              )}
            >
              {active && (
                <div className="absolute left-0 w-1 h-6 bg-brand rounded-r-full pulse-ring" />
              )}
              <div className={cn(
                "transition-all duration-300",
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
    <nav className="fixed bottom-4 left-4 right-4 z-40 border border-slate-200/40 bg-white/95 px-3 py-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl rounded-[2rem] animate-fade-in">
      <div className="max-w-md mx-auto flex items-center justify-around">
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
                'group flex min-h-[50px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1 transition-all duration-300 outline-none select-none touch-none focus-visible:ring-4 focus-visible:ring-brand/10 relative',
                active ? 'text-brand' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <item.icon className={cn('h-5 w-5 transition-transform duration-300', active ? 'scale-110 -translate-y-0.5' : 'group-hover:scale-105')} strokeWidth={2.4} />
              <span className={cn(
                'text-[9px] font-black uppercase tracking-[0.1em] transition-opacity duration-200',
                active ? 'opacity-100' : 'opacity-65'
              )}>
                {item.label}
              </span>
              {active && (
                <div className="absolute bottom-0 w-1.5 h-1.5 bg-brand rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
