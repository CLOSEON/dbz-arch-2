import { AuthGuard } from '@/lib/auth';
import { UserNav } from '@/components/layout/UserNav';
import { Toaster } from '@/components/shared/Toaster';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['user']}>
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

