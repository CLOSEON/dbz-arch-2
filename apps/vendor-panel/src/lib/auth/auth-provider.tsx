'use client';
// Per-app wrapper; the provider itself lives in @dabzzo/shared-auth.
// This app provisions the superadmin account as a verified "Test Vendor" so
// one account can exercise the kitchen portal. NOTE: this seeds placeholder
// compliance/rating data into Firestore and is not gated to non-production —
// see IMPLEMENTATION_PLAN.md, flagged for a decision.
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
          verification_status: 'verified',
        },
        applyToExistingDoc: (data) => {
          data.name = data.name || 'Test Vendor';
          data.kitchen_name = data.kitchen_name || 'Test Vendor';
          data.phone = data.phone || TEST_VENDOR_PHONE;
          data.verification_status = 'verified';
          data.capacity = data.capacity || 10;
          data.subscriberCount = data.subscriberCount || 2;
          data.rate_onetime = data.rate_onetime || 150;
          data.cuisine_type = data.cuisine_type || 'Home Style';
        },
        newProfileExtras: () => ({
          name: 'Test Vendor',
          kitchen_name: 'Test Vendor',
          phone: TEST_VENDOR_PHONE,
          capacity: 10,
          subscriberCount: 2,
          fssai_license: 'FSSAI-12345678901234',
          address: 'Sector 62, Noida, Uttar Pradesh',
          rate_onetime: 150,
          rate_lunch_weekly: 900,
          rate_lunch_monthly: 3600,
          rate_dinner_weekly: 900,
          rate_dinner_monthly: 3600,
          rate_both_weekly: 1750,
          rate_both_monthly: 6800,
          cuisine_type: 'Home Style',
          bio: 'Authentic home cooked homestyle meals prepared fresh daily.',
          rating: 4.5,
          rating_avg: 4.5,
          review_count: 14,
        }),
      }}
    >
      {children}
    </SharedAuthProvider>
  );
}
