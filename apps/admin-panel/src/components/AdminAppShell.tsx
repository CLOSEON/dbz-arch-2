'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/lib/auth';
import { AdminNav } from '@/components/layout/AdminNav';
import { Logo } from '@/components/shared/Logo';

export function AdminAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const isAuthPage = 
    pathname.startsWith('/login') || 
    pathname.startsWith('/register') || 
    pathname.startsWith('/admin-login');

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 h-screen sticky top-0 bg-white/90 backdrop-blur-xl border-r border-slate-200/70 z-50 shadow-[12px_0_40px_rgba(15,23,42,0.04)]">
          <div className="p-6 flex items-center border-b border-slate-100">
            <Logo size={36} />
          </div>
          <AdminNav variant="sidebar" />
        </aside>

        <main className="flex-1 w-full pb-24 md:pb-6">
          <div className="page-shell-admin">
            {children}
          </div>
        </main>

        {/* Mobile Nav */}
        <div className="md:hidden">
          <AdminNav variant="bottom" />
        </div>
      </div>
    </AuthGuard>
  );
}
