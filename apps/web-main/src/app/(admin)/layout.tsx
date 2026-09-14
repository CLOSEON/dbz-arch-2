import { AuthGuard } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // This group previously had NO layout and no guard of its own, and none of
  // its three pages checked a role. The only thing gating /admin/dashboard,
  // /admin/offers and /admin/users was UserAppShell in the ROOT layout, whose
  // list is ['user', 'admin'] -- so any signed-in customer could open the admin
  // screens. Firestore rules still refused the underlying reads, so this was an
  // authorization gap in the UI rather than a data breach, but the screens are
  // not supposed to render at all for a customer.
  //
  // Route-group authorization belongs to the route group, the way admin-panel,
  // vendor-panel and rider-panel each own theirs via their AppShell. A guard in
  // the root layout cannot tell /admin/users from /orders.
  //
  // 'admin' alone is correct: computeIsAllowed short-circuits for the superadmin
  // (hardcoded email or is_superadmin), and treats role === 'superadmin' as
  // extended membership of 'admin', so all three privileged identities pass.
  return <AuthGuard allowedRoles={['admin']}>{children}</AuthGuard>;
}
