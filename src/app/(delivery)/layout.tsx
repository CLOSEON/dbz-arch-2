import { AuthGuard } from '@/lib/auth';
import { DeliveryNav } from '@/components/layout/DeliveryNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkBanner } from '@/components/shared/NetworkBanner';

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['delivery', 'admin']}>
      <div className="min-h-screen bg-[linear-gradient(180deg,#fff9f5_0%,#f8fafc_100%)]">
        <NetworkBanner />
        <ErrorBoundary>
          <main className="page-shell pt-4 flex-1">
            {children}
          </main>
        </ErrorBoundary>
        <DeliveryNav />
      </div>
    </AuthGuard>
  );
}
