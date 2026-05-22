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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-2 py-3 pb-safe animate-fade-in shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
      <div className="max-w-3xl mx-auto flex items-center justify-around">
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
                'flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all duration-200 outline-none select-none touch-none',
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
                'text-[9px] font-black uppercase tracking-widest transition-opacity duration-200',
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
