import { AuthGuard } from '@/lib/auth';
import { UserNav } from '@/components/layout/UserNav';
import { Toaster } from '@/components/shared/Toaster';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['user']}>
      <div className="min-h-screen">
        <main className="page-shell pt-4">
          {children}
        </main>
        <UserNav />
      </div>
    </AuthGuard>
  );
}
