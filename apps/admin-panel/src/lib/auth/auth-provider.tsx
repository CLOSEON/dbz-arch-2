'use client';
// Per-app wrapper; the provider itself lives in @dabzzo/shared-auth.
// This app provisions the superadmin account as an admin.
import { AuthProvider as SharedAuthProvider } from '@dabzzo/shared-auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider superadmin={{ role: 'admin', fallbackName: 'Superadmin' }}>
      {children}
    </SharedAuthProvider>
  );
}
