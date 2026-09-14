'use client';

// Thin wrapper: the actual role-check logic lives in @dabzzo/shared-auth,
// consolidated from 4 previously-drifted per-app copies — see
// IMPLEMENTATION_PLAN.md Phase 1 and packages/shared-auth's auth-guard.tsx
// header comment. Only this app's own store hook and loading-screen copy
// belong here.
//
// Note: this app's guard previously duplicated its role-check logic once
// inline in a useEffect and once again in the render bail-out (two copies
// that happened to stay in sync, but could easily have drifted). The shared
// component computes isAllowed once and uses it in both places.

import { AuthGuard as SharedAuthGuard } from '@dabzzo/shared-auth';
import { useAuthStore } from '@/store/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  return (
    <SharedAuthGuard
      user={user}
      isHydrated={isHydrated}
      allowedRoles={allowedRoles}
      loadingLabel="Opening Delivery Portal…"
      bgClassName="bg-ivory"
    >
      {children}
    </SharedAuthGuard>
  );
}
