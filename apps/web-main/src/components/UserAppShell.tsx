'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/lib/auth';

// Roles this ROOT shell admits.
//
// `undefined` on purpose: the shell checks AUTHENTICATION, not role. AuthGuard
// still refuses a null user, so every page below stays behind a login -- it just
// no longer second-guesses which role belongs on which route.
//
// It previously listed ['user', 'admin'], which was wrong in both directions. Too
// narrow: mounted in the ROOT layout it also wrapped /dashboard, so it rejected
// the vendor and delivery roles the login page sends there, and widening the
// (user) group layout alone could not fix that. Too wide: it named 'user', and it
// was the ONLY guard on the (admin) route group, so any signed-in customer could
// open the admin screens. A role list in the root layout has to be correct for
// every route at once, which is exactly what went stale here.
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
      <div className="min-h-screen bg-[#FEFCE8] w-full">
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
