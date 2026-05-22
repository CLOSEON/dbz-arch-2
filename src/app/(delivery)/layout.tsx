import { AuthGuard } from '@/lib/auth';
import { DeliveryNav } from '@/components/layout/DeliveryNav';
import { Toaster } from '@/components/shared/Toaster';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkBanner } from '@/components/shared/NetworkBanner';

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['delivery', 'admin']}>
      <div className="min-h-screen flex flex-col">
        <NetworkBanner />
        <ErrorBoundary>
          <main className="page-shell pt-4 pb-24 flex-1">
            {children}
          </main>
        </ErrorBoundary>
        <DeliveryNav />
      </div>
    </AuthGuard>
  );
}
