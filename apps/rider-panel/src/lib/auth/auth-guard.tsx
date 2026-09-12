'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (allowedRoles && allowedRoles.length > 0) {
      const isSuper = user.email?.toLowerCase().trim() === 'closeon.st@gmail.com' || (user as any).is_superadmin === true;
      const userRole = (user.role as string) || '';
      const hasDeliveryRole = userRole === 'delivery' || userRole === 'delivery_agent' || (user as any).roles?.delivery;
      
      const isAllowed = isSuper || allowedRoles.includes(userRole) || (allowedRoles.includes('delivery') && hasDeliveryRole);
      
      if (!isAllowed) {
        router.replace('/login');
        return;
      }
    }
  }, [user, isHydrated, router, allowedRoles]);

  if (!isHydrated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ivory">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Opening Delivery Portal…</p>
        </div>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isSuper = user.email?.toLowerCase().trim() === 'closeon.st@gmail.com' || (user as any).is_superadmin === true;
    const userRole = (user.role as string) || '';
    const hasDeliveryRole = userRole === 'delivery' || userRole === 'delivery_agent' || (user as any).roles?.delivery;
    const isAllowed = isSuper || allowedRoles.includes(userRole) || (allowedRoles.includes('delivery') && hasDeliveryRole);
    if (!isAllowed) return null;
  }

  return <>{children}</>;
}
