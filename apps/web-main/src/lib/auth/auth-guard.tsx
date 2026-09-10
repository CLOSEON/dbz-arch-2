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

  const isSuper = user?.email?.toLowerCase().trim() === 'closeon.st@gmail.com' || (user as any)?.is_superadmin === true;
  const userRole = (user?.role as string) || '';
  const isAllowed = !allowedRoles || allowedRoles.length === 0 || isSuper || allowedRoles.includes(userRole);

  useEffect(() => {
    if (!isHydrated) return;

    if (!user || !isAllowed) {
      router.replace('/login');
      return;
    }
  }, [user, isHydrated, isAllowed, router]);

  if (!isHydrated || !user || !isAllowed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ivory">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Opening Dabzzo…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
