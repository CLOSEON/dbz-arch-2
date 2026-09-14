'use client';

// Thin wrapper: the actual role-check logic lives in @dabzzo/shared-auth,
// consolidated from 4 previously-drifted per-app copies — see
// IMPLEMENTATION_PLAN.md Phase 1 and packages/shared-auth's auth-guard.tsx
// header comment. Only this app's own store hook and loading-screen copy
// belong here.

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
      loadingLabel="Opening Kitchen Portal…"
      bgClassName="bg-ivory"
    >
      {children}
    </SharedAuthGuard>
  );
}
