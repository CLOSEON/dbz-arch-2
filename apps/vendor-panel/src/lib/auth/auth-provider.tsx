'use client';
// Per-app wrapper; the provider itself lives in @dabzzo/shared-auth.
// This app provisions the superadmin account as a "Test Vendor" so one account
// can exercise the kitchen portal.
//
// It writes OPERATIONAL defaults only (rates, capacity, cuisine). It must not
// write compliance or reputation data: no FSSAI licence, no
// verification_status 'verified', no ratings or review counts. Those are
// claims about the real world, and this account has not earned any of them.
//
// Access does not depend on them either — the dashboard gate short-circuits on
// `isSuper`, so the superadmin gets in regardless.
import { AuthProvider as SharedAuthProvider } from '@dabzzo/shared-auth';

const TEST_VENDOR_PHONE = '+919900990022';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider
      superadmin={{
        role: 'vendor',
        fallbackName: 'Test Vendor',
        fallbackPhone: TEST_VENDOR_PHONE,
        optimisticExtras: {
          kitchen_name: 'Test Vendor',
        },
        applyToExistingDoc: (data) => {
          data.name = data.name || 'Test Vendor';
          data.kitchen_name = data.kitchen_name || 'Test Vendor';
          data.phone = data.phone || TEST_VENDOR_PHONE;
          // verification_status is deliberately NOT forced to 'verified' here.
          // It was overwritten unconditionally, so even an admin marking this
          // account pending or rejected was silently reverted on next sign-in.
          data.capacity = data.capacity || 10;
          data.rate_onetime = data.rate_onetime || 150;
          data.cuisine_type = data.cuisine_type || 'Home Style';
        },
        newProfileExtras: () => ({
          name: 'Test Vendor',
          kitchen_name: 'Test Vendor',
          phone: TEST_VENDOR_PHONE,
          capacity: 10,
          // No fssai_license, no address, no ratings: fabricated compliance and
          // reputation data has no business in the production users collection.
          rate_onetime: 150,
          rate_lunch_weekly: 900,
          rate_lunch_monthly: 3600,
          rate_dinner_weekly: 900,
          rate_dinner_monthly: 3600,
          rate_both_weekly: 1750,
          rate_both_monthly: 6800,
          cuisine_type: 'Home Style',
        }),
      }}
    >
      {children}
    </SharedAuthProvider>
  );
}
