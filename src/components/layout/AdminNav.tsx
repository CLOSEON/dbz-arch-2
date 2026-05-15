'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, MessageSquare, Ticket, Settings } from 'lucide-react';

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

interface AdminNavProps {
  variant?: 'bottom' | 'sidebar';
}

export function AdminNav({ variant = 'bottom' }: AdminNavProps) {
  const pathname = usePathname();

  if (variant === 'sidebar') {
    return (
      <nav className="flex flex-col gap-1.5 px-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 safe-area-pb">
      <div className="max-w-md mx-auto flex">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-3 gap-1 transition-all',
                active ? 'text-brand' : 'text-slate-400'
              )}
            >
              {item.icon(active)}
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', active ? 'text-brand' : 'text-slate-400')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
