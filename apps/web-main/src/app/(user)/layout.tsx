import { AuthGuard } from '@/lib/auth';
import { UserNav } from '@/components/layout/UserNav';
import { Toaster } from '@/components/shared/Toaster';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  // Partner roles are admitted deliberately.
  //
  // The login page routes vendor and delivery to /dashboard (see its `paths`
  // map), but this guard admitted only 'user', so a partner signing in was sent
  // somewhere that immediately bounced them back to /login -- an endless
  // /login -> /dashboard -> /login loop that reads as a frozen login screen.
  //
  // This is the least-privileged surface in the product: a customer's own
  // subscriptions and orders, all of which Firestore rules already scope to
  // request.auth.uid. Admitting a kitchen owner who also wants to order food
  // grants nothing they could not already reach. Privileged surfaces are
  // unaffected -- the admin routes get their own guard.
  return (
    <AuthGuard allowedRoles={['user', 'vendor', 'delivery', 'admin']}>
      <div className="min-h-screen bg-[#FEFCE8]">
        {/*
          No px-* here — each child page manages its own horizontal padding.
          The dashboard hero goes full-bleed; other pages use px-4/px-5 on their root div.
          safe-area-inset-top is handled inside the hero section of the dashboard.
        */}
        <main
          className="mx-auto max-w-md"
          style={{ paddingBottom: 'max(8rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </main>
        <UserNav />
      </div>
    </AuthGuard>
  );
}

