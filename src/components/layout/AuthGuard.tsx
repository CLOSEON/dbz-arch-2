'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      switch (user.role) {
        case 'admin':    router.replace('/admin/dashboard'); break;
        case 'vendor':   router.replace('/vendor/dashboard'); break;
        case 'delivery': router.replace('/delivery/dashboard'); break;
        default:         router.replace('/dashboard'); break;
      }
    }
  }, [user, router, allowedRoles]);

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ivory">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-sm text-slate-500">Verifying access…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
