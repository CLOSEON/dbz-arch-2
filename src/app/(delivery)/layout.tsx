import { AuthGuard } from '@/lib/auth';
import { DeliveryNav } from '@/components/layout/DeliveryNav';
import { Toaster } from '@/components/shared/Toaster';

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['delivery', 'admin']}>
      <div className="min-h-screen">
        <main className="page-shell pt-4 pb-24">
          {children}
        </main>
        <DeliveryNav />
      </div>
    </AuthGuard>
  );
}
