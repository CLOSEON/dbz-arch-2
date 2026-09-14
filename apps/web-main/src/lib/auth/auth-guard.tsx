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

  // Role strings the app actually writes, beyond the UserRole union.
  //
  // functions/src/authTriggers.ts onUserCreate seeds every new account with
  // role 'customer' -- as a custom claim and in users/{uid} -- while the client
  // writes 'user'. So a real account carries either string depending on which
  // path created it. firestore.rules already pairs them (role in ['user',
  // 'customer']); this guard did not, so a 'customer' failed every allowedRoles
  // list, was refused /dashboard and bounced straight back to /login. That is
  // the 'stuck on the login page after signing in' report: the welcome toast
  // fired because sign-in genuinely succeeded, and the redirect then failed the
  // destination's guard.
  //
  // verifyRider writes role 'delivery_agent' for the same reason.
  const ROLE_ALIASES: Record<string, string[]> = {
    user: ['customer'],
    delivery: ['delivery_agent'],
  };

  const matchesRole = (allowed: string) =>
    allowed === userRole || (ROLE_ALIASES[allowed] || []).includes(userRole);

  const isAllowed =
    !allowedRoles || allowedRoles.length === 0 || isSuper || allowedRoles.some(matchesRole);

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
