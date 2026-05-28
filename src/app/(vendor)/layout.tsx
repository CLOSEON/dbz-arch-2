import { AuthGuard } from '@/lib/auth';
import { VendorNav } from '@/components/layout/VendorNav';
import { Toaster } from '@/components/shared/Toaster';
import Image from 'next/image';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['vendor']}>
      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 h-screen sticky top-0 bg-white border-r border-slate-100 z-50">
          <div className="p-6 flex items-center">
            <Image src="/assets/dabzo-logo.svg" alt="Dabzo" width={80} height={48} priority />
          </div>
          <VendorNav variant="sidebar" />
        </aside>

        <main className="flex-1 w-full pb-24 md:pb-6">
          <div className="page-shell-vendor pt-4">
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
