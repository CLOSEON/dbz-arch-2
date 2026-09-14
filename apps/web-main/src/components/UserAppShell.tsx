'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/lib/auth';

// Roles the ROOT shell admits. Route groups now own their own authorization:
// (admin)/layout.tsx gates /admin/* to 'admin', and (user)/layout.tsx gates the
// customer group. So this list is no longer the admin gate -- but it IS still
// the only guard on /custom-plan and /subscription-active, which sit outside
// every route group.
//
// `undefined` on purpose: this shell checks AUTHENTICATION, not role. AuthGuard
// still refuses a null user, so every page below stays behind a login -- it just
// no longer second-guesses which role belongs on which route.
//
// The alternative was enumerating ['user', 'vendor', 'delivery', 'admin'] to keep
// /custom-plan and /subscription-active listed explicitly. Rejected: a role list
// in the ROOT layout has to be correct for every route at once, and going stale
// is exactly what caused the /login -> /dashboard -> /login loop for vendors and
// the fourth role string ('delivery_agent') the login map never mentions. Those
// two subscription pages now accept any signed-in role; Firestore rules already
// scope subscription reads and writes to request.auth.uid, so a rider opening
// them sees only their own data.
const ROOT_SHELL_ROLES: string[] | undefined = undefined;

export function UserAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const isPublicPage = 
    pathname === '/' || 
    pathname === '' || 
    pathname.startsWith('/login') || 
    pathname.startsWith('/register') || 
    pathname.startsWith('/main');

  if (isPublicPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard allowedRoles={ROOT_SHELL_ROLES}>
      <div className="min-h-dvh bg-[#FEFCE8] w-full">
        <main
          className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"
          style={{ paddingBottom: 'max(8rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
