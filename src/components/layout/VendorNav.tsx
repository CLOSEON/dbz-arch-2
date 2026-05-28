'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Tag, MessageSquare, UserCircle, ClipboardList } from 'lucide-react';

const NAV_ITEMS = [
  {
    href: '/vendor/dashboard',
    label: 'Dashboard',
    icon: (active: boolean) => <LayoutDashboard className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/vendor/orders',
    label: 'Orders',
    icon: (active: boolean) => <ClipboardList className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/vendor/subscribers',
    label: 'Subscribers',
    icon: (active: boolean) => <Users className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/vendor/discounts',
    label: 'Discounts',
    icon: (active: boolean) => <Tag className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/vendor/reviews',
    label: 'Reviews',
    icon: (active: boolean) => <MessageSquare className={cn("w-5 h-5", active ? "text-brand" : "text-slate-400")} />,
  },
  {
    href: '/vendor/profile',
    label: 'Profile',
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
      <nav className="flex flex-col gap-1.5 px-4">
        {NAV_ITEMS.map((item) => {
          const isDash = item.href.includes('dashboard');
          const active = isDash 
            ? pathname === item.href || pathname === item.href + '/'
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

  // Mobile Bottom Nav - Only show essential 4 items to prevent clutter
  const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(item => 
    ['Dashboard', 'Orders', 'Subscribers', 'Profile'].includes(item.label)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/70 bg-white/90 px-3 py-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl pb-safe animate-fade-in">
      <div className="max-w-3xl mx-auto flex items-center justify-around">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isDash = item.href.includes('dashboard');
          const active = isDash 
            ? pathname === item.href || pathname === item.href + '/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1 transition-all duration-300 outline-none select-none touch-none focus-visible:ring-4 focus-visible:ring-brand/10',
                active ? 'text-brand' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className={cn(
                "transition-transform duration-300",
                active ? "scale-110 -translate-y-0.5" : "hover:scale-110 hover:-translate-y-0.5"
              )}>
                {item.icon(active)}
              </div>
              <span className={cn(
                'overflow-hidden whitespace-nowrap text-[10px] font-black uppercase tracking-[0.08em] transition-all duration-300',
                active ? 'max-h-4 opacity-100' : 'max-h-0 opacity-0'
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
