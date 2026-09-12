'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Dabzzo role-gate — SINGLE SOURCE OF TRUTH ────────────────────────────────
//
// Previously forked 4 ways (one per app) and had drifted: each app had grown
// its own extended-membership rule (admin-panel: role==='superadmin' or
// roles.admin===true; vendor-panel: roles.vendor.status==='verified' or
// roles.vendor===true; rider-panel: role==='delivery_agent' or roles.delivery),
// but each guard only applied ITS OWN app's rule — so e.g. a user with
// role==='superadmin' (not the hardcoded email, not is_superadmin===true) could
// pass admin-panel's guard but be locked out of vendor-panel/rider-panel even
// though both call sites pass allowedRoles={['vendor'|'delivery', 'admin']}.
// See IMPLEMENTATION_PLAN.md Phase 1 for the full per-app diff this was built
// from. Consolidated here: every extended-membership rule applies to every
// role in `allowedRoles`, not just "this app's" role — a deliberate, documented
// widening of access (never a narrowing) versus the old per-app forks.
//
// The component itself doesn't know about any app's Zustand store (kept
// dependency-free of app-local path aliases like `@/store/authStore`) — each
// app's own `src/lib/auth/auth-guard.tsx` is a thin wrapper that reads its
// store and forwards `user`/`isHydrated` here, plus its own loading-screen copy.

export interface AuthGuardUser {
  email?: string | null;
  role?: string | null;
  is_superadmin?: boolean;
  roles?: Record<string, unknown> | null;
}

export interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  user: AuthGuardUser | null;
  isHydrated: boolean;
  /** Loading-screen copy — each app kept its own wording. */
  loadingLabel?: string;
  /** Loading-screen background — admin-panel uses a dark shell, others ivory. */
  bgClassName?: string;
}

const SUPERADMIN_EMAIL = 'closeon.st@gmail.com';

function normalizeEmail(email?: string | null): string {
  return (email || '').toLowerCase().trim();
}

function isSuperUser(user: AuthGuardUser | null): boolean {
  if (!user) return false;
  return normalizeEmail(user.email) === SUPERADMIN_EMAIL || user.is_superadmin === true;
}

function hasExtendedRoleMembership(user: AuthGuardUser | null, role: string): boolean {
  if (!user) return false;
  const roles = user.roles as Record<string, unknown> | undefined;
  switch (role) {
    case 'admin':
      return user.role === 'superadmin' || roles?.admin === true;
    case 'vendor': {
      const vendor = roles?.vendor as { status?: string } | boolean | undefined;
      return (typeof vendor === 'object' && vendor?.status === 'verified') || vendor === true;
    }
    case 'delivery': {
      // verifyRider (functions/src/adminManagementTriggers.ts) writes
      // roles.rider.status while setting role 'delivery' -- the roles-map key
      // and the role string genuinely differ for riders, unlike vendors.
      // roles.delivery is checked too, but nothing in the codebase writes it;
      // it is kept only in case legacy documents carry it.
      const rider = roles?.rider as { status?: string } | boolean | undefined;
      return (
        user.role === 'delivery_agent' ||
        (typeof rider === 'object' && rider?.status === 'verified') ||
        rider === true ||
        Boolean(roles?.delivery)
      );
    }
    default:
      return false;
  }
}

export function computeIsAllowed(user: AuthGuardUser | null, allowedRoles?: string[]): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (isSuperUser(user)) return true;
  const userRole = user?.role || '';
  if (allowedRoles.includes(userRole)) return true;
  return allowedRoles.some((r) => hasExtendedRoleMembership(user, r));
}

export function AuthGuard({
  children,
  allowedRoles,
  user,
  isHydrated,
  loadingLabel = 'Opening Dabzzo…',
  bgClassName = 'bg-ivory',
}: AuthGuardProps) {
  const router = useRouter();
  const isAllowed = computeIsAllowed(user, allowedRoles);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user || !isAllowed) {
      router.replace('/login');
    }
  }, [user, isHydrated, isAllowed, router]);

  if (!isHydrated || !user || !isAllowed) {
    return (
      <div className={`flex items-center justify-center min-h-dvh ${bgClassName}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">{loadingLabel}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
