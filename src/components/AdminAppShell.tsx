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
      <div className="min-h-screen bg-slate-50/60 flex flex-col md:flex-row antialiased">
        {/* Fixed Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-200/80 z-40 shadow-[1px_0_12px_rgba(15,23,42,0.03)] overflow-y-auto">
          <div className="p-6 flex items-center border-b border-slate-100 shrink-0">
            <Logo size={34} />
          </div>
          <div className="py-4 flex-1">
            <AdminNav variant="sidebar" />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 w-full overflow-x-hidden pb-24 md:pb-12">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <AdminNav variant="bottom" />
        </div>
      </div>
    </AuthGuard>
  );
}
