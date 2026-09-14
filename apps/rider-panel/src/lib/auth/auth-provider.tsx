'use client';
// Per-app wrapper; the provider itself lives in @dabzzo/shared-auth.
// This app provisions the superadmin account as a delivery rider so one
// account can exercise the rider portal.
import { AuthProvider as SharedAuthProvider } from '@dabzzo/shared-auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider
      superadmin={{
        role: 'delivery',
        fallbackName: 'Delivery Partner',
        applyToExistingDoc: (data, authUser) => {
          // verification_status is deliberately NOT forced to 'verified'.
          // Rider verification is a real-world check (licence, vehicle, KYC)
          // and this overwrote it unconditionally on every sign-in, silently
          // reverting any admin decision. Portal access does not depend on it:
          // the dashboard gate short-circuits on isSuper.
          data.name = data.name || authUser.displayName || 'Delivery Partner';
          data.phone = data.phone || authUser.phoneNumber || '';
          data.vehicle_type = data.vehicle_type || 'Motorcycle';
          data.vehicle_number = data.vehicle_number || '';
        },
        newProfileExtras: () => ({
          vehicle_type: 'Motorcycle',
          vehicle_number: '',
        }),
      }}
    >
      {children}
    </SharedAuthProvider>
  );
}
