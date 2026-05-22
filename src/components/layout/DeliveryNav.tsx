'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Truck, Wallet, HeadphonesIcon, MapPin } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/delivery/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/driver/pickup',
    label: 'Pickup',
    icon: Truck,
  },
  {
    href: '/driver/deliveries',
    label: 'Active Runs',
    icon: MapPin,
  },
  {
    href: '/delivery/earnings',
    label: 'Earnings',
    icon: Wallet,
  },
];

interface DeliveryNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function DeliveryNav({ variant = 'bottom' }: DeliveryNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-1.5 px-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname === item.href + '/' || pathname.startsWith(item.href + '/');
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
                <item.icon className={cn('w-5 h-5', active ? 'text-brand' : 'text-slate-400')} />
              </div>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-100 safe-area-pb">
      <div className="max-w-3xl mx-auto flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname === item.href + '/' || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-3 gap-0.5 transition-colors duration-150',
                active ? 'text-brand' : 'text-slate-400'
              )}
            >
              <item.icon className={cn('w-6 h-6', active ? 'text-brand' : 'text-slate-400')} />
              <span className={cn('text-[10px] font-semibold', active ? 'text-brand' : 'text-slate-400')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
