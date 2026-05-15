/**
 * DABZO AUTH GUARD — Role-Based Route Protection
 * 
 * Protects routes by checking:
 * 1. User is authenticated (redirects to /login if not)
 * 2. User has the required role (redirects to correct dashboard if not)
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  vendor: '/vendor/dashboard',
  delivery: '/delivery/dashboard',
  user: '/dashboard',
};

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    // Wait for hydration before making routing decisions
    if (!isHydrated) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      const target = ROLE_DASHBOARDS[user.role] || '/dashboard';
      router.replace(target);
    }
  }, [user, isHydrated, router, allowedRoles]);

  // Show loading while hydrating or if user doesn't have access
  if (!isHydrated || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ivory">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Verifying access…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
