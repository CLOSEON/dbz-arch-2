'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, UserCircle, ClipboardList, UtensilsCrossed } from 'lucide-react';
import { triggerHapticSelection } from '@/lib/haptics';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (active: boolean) => <LayoutDashboard className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/menu',
    label: 'Daily Menu',
    icon: (active: boolean) => <ClipboardList className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/profile',
    label: 'Kitchen Profile',
    icon: (active: boolean) => <UserCircle className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
];

interface VendorNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function VendorNav({ variant = 'bottom' }: VendorNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-2 px-4 py-4">
        {NAV_ITEMS.map((item) => {
          const isDash = item.href === '/dashboard';
          const active = isDash 
            ? pathname === item.href || pathname === item.href + '/'
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
                "transition-transform duration-200",
                active ? "scale-105" : "group-hover:scale-105"
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
    <nav 
      className="fixed left-4 right-4 z-40 border border-slate-200/80 bg-white/95 px-4 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.1)] backdrop-blur-xl rounded-[2rem] animate-fade-in"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isDash = item.href === '/dashboard';
          const active = isDash 
            ? pathname === item.href || pathname === item.href + '/'
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
              <div className={cn(
                "transition-transform duration-200",
                active ? "scale-110 -translate-y-0.5" : "group-hover:scale-105"
              )}>
                {item.icon(active)}
              </div>
              <span className="text-[10px] uppercase tracking-wider">
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
