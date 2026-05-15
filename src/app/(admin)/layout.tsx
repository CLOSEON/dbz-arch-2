import { AuthGuard } from '@/lib/auth';
import { AdminNav } from '@/components/layout/AdminNav';
import { Toaster } from '@/components/shared/Toaster';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-ivory flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 h-screen sticky top-0 bg-white border-r border-slate-100 z-50">
          <div className="p-6">
            <h2 className="text-xl font-black text-brand tracking-tighter">Dabzo Admin</h2>
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
