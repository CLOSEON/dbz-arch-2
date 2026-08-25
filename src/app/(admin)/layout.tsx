import { AuthGuard } from '@/lib/auth';
import { AdminNav } from '@/components/layout/AdminNav';
import Image from 'next/image';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-ivory flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 h-screen sticky top-0 bg-white/90 backdrop-blur-xl border-r border-slate-200/70 z-50 shadow-[12px_0_40px_rgba(15,23,42,0.04)]">
          <div className="p-6 flex items-center border-b border-slate-100">
            <Image src="/logo-admin.png" alt="Dabzzo Admin" width={40} height={40} priority className="h-10 w-10 rounded-xl object-contain shadow-xs" />
            <span className="ml-3 text-lg font-black text-slate-900">Dabzzo <span className="text-xs font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Admin</span></span>
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
