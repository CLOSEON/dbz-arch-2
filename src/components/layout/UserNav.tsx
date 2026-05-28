'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, MapPin, Package, UserCircle } from 'lucide-react';

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
  {
    href: '/track',
    label: 'Track',
    icon: MapPin,
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
                'group relative flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-300',
                active 
                  ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/70' 
                  : 'text-slate-400 hover:bg-slate-50/80 hover:text-slate-600'
              )}
            >
              {active && (
                <div className="absolute left-0 w-1 h-6 bg-brand rounded-r-full" />
              )}
              <div className={cn(
                "transition-all duration-300",
                active ? "text-brand" : "text-slate-400 group-hover:text-slate-600"
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/70 bg-white/90 px-4 py-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl pb-safe animate-fade-in">
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
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 transition-all duration-200 outline-none select-none touch-none focus-visible:ring-4 focus-visible:ring-brand/10',
                active ? 'text-brand' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <item.icon className="h-5 w-5" strokeWidth={2.4} />
              <span className={cn(
                'text-[10px] font-black uppercase tracking-[0.08em] transition-opacity duration-200',
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
