'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Truck, Wallet, HeadphonesIcon } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/delivery/dashboard',
    label: 'Deliveries',
    icon: LayoutDashboard,
  },
  {
    href: '/delivery/earnings',
    label: 'Earnings',
    icon: Wallet,
  },
  {
    href: '/delivery/support',
    label: 'Support',
    icon: HeadphonesIcon,
  },
];

export function DeliveryNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-100 safe-area-pb">
      <div className="max-w-md mx-auto flex">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
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
