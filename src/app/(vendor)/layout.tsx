import { AuthGuard } from '@/lib/auth';
import { VendorNav } from '@/components/layout/VendorNav';
import Image from 'next/image';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['vendor']}>
      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 h-screen sticky top-0 bg-white/90 backdrop-blur-xl border-r border-slate-200/70 z-50 shadow-[12px_0_40px_rgba(15,23,42,0.04)]">
          <div className="p-6 flex items-center border-b border-slate-100">
            <Image src="/assets/dabzo-logo.png" alt="Dabzo" width={120} height={72} priority className="object-contain" />
          </div>
          <VendorNav variant="sidebar" />
        </aside>

        <main className="flex-1 w-full pb-24 md:pb-6">
          <div className="page-shell-vendor">
            {children}
          </div>
        </main>

        {/* Mobile Nav */}
        <div className="md:hidden">
          <VendorNav variant="bottom" />
        </div>
      </div>
    </AuthGuard>
  );
}
