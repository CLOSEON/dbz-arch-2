'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, MessageSquare, Ticket, Truck, Package } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/admin/dashboard',
    label: 'Overview',
    icon: (active: boolean) => <LayoutDashboard className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/admin/vendors',
    label: 'Vendors',
    icon: (active: boolean) => <Users className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/admin/delivery',
    label: 'Logistics',
    icon: (active: boolean) => <Truck className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    icon: (active: boolean) => <Package className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/admin/support',
    label: 'Tickets',
    icon: (active: boolean) => <MessageSquare className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/admin/subscriptions',
    label: 'Subs',
    icon: (active: boolean) => <Ticket className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ['Overview', 'Vendors', 'Logistics', 'Subs'].includes(item.label)
);

interface AdminNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function AdminNav({ variant = 'bottom' }: AdminNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-1.5 px-4">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isDash = item.href.endsWith('/dashboard');
          const active = isDash ? pathname === item.href || pathname === item.href + '/' : pathname.startsWith(item.href);
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/95 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isDash = item.href.endsWith('/dashboard');
          const active = isDash ? pathname === item.href || pathname === item.href + '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 transition-all focus-visible:ring-4 focus-visible:ring-brand/10',
                active ? 'text-brand' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              {item.icon(active)}
              <span className={cn('max-w-full truncate text-[10px] font-black leading-none tracking-normal', active ? 'text-brand' : 'text-slate-400')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
