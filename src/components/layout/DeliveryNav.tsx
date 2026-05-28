'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Truck, Wallet, MapPin } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/delivery/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/driver/pickup', label: 'Pickup', icon: Truck },
  { href: '/driver/deliveries', label: 'Active Runs', icon: MapPin },
  { href: '/delivery/earnings', label: 'Earnings', icon: Wallet },
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
                'group relative flex items-center gap-3 rounded-[1.2rem] px-4 py-3.5 text-sm font-bold transition-all duration-200',
                active
                  ? 'bg-white text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'
                  : 'text-slate-400 hover:bg-slate-50/80 hover:text-slate-600'
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand" />}
              <item.icon className={cn('h-5 w-5', active ? 'text-brand' : 'text-slate-400')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-md px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        <div className="grid grid-cols-4 gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname === item.href + '/' || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-[1.2rem] px-2 py-2.5 transition-all',
                  active ? 'bg-brand/10 text-brand' : 'text-slate-400'
                )}
              >
                <item.icon className={cn('h-5 w-5', active ? 'text-brand' : 'text-slate-400')} />
                <span className={cn('mt-1 text-[10px] font-bold tracking-tight', active ? 'text-brand' : 'text-slate-400')}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
