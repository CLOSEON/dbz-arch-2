'use client';

// Thin wrapper: the actual role-check logic lives in @dabzzo/shared-auth,
// consolidated from 4 previously-drifted per-app copies — see
// IMPLEMENTATION_PLAN.md Phase 1 and packages/shared-auth's auth-guard.tsx
// header comment. Only this app's own store hook and loading-screen copy
// belong here.

import { AuthGuard as SharedAuthGuard } from '@dabzzo/shared-auth';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  return (
    <SharedAuthGuard
      user={user}
      isHydrated={isHydrated}
      allowedRoles={allowedRoles}
      loadingLabel="Loading Admin Console…"
      bgClassName="bg-slate-950"
    >
      {children}
    </SharedAuthGuard>
  );
}
