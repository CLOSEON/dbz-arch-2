'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/lib/auth';
import { UserNav } from '@/components/layout/UserNav';

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
    <AuthGuard allowedRoles={['user', 'admin']}>
      <div className="min-h-screen bg-[#FEFCE8]">
        <main
          className="mx-auto max-w-md"
          style={{ paddingBottom: 'max(8rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </main>
        <UserNav />
      </div>
    </AuthGuard>
  );
}
