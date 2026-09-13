/**
 * Firestore security rules tests.
 *
 * These exist because rules previously had no coverage at all, so the only way
 * to check a change was to deploy to production and click through the app.
 * That is how the partner-onboarding bug shipped: isValidUserWrite refused
 * every customer -> vendor role change, which silently broke kitchen and rider
 * registration for every user, and in turn the vendor dashboard.
 *
 * Run: npm run test:rules   (from the repo root)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));

const CUSTOMER = 'user_customer';
const VENDOR = 'user_vendor';
const ADMIN = 'user_admin';

let testEnv;
const results = [];

/** Run one case, recording pass/fail rather than aborting the whole file. */
async function it(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: String(err?.message || err).split('\n')[0].slice(0, 130) });
  }
}

/** Seed documents with rules bypassed, so setup can't be blocked by the rules under test. */
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: 'dabzofb-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(here, 'firestore.rules'), 'utf8'),
    },
  });

  // ── The bug this suite was written for ────────────────────────────────────
  await it('a customer may apply to become a vendor (self-service onboarding)', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => {
      // onUserCreate stamps 'customer' on every new sign-in.
      await setDoc(doc(db, 'users', CUSTOMER), { role: 'customer', name: 'Cust' });
    });
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', CUSTOMER),
        { role: 'vendor', kitchen_name: 'SRV Kitchens', is_approved: false },
        { merge: true })
    );
  });

  await it('a customer may apply to become a rider', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', CUSTOMER), { role: 'delivery', is_approved: false }, { merge: true })
    );
  });

  // ── The guard that must survive that change ───────────────────────────────
  await it('an applicant may NOT approve themselves', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(
      setDoc(doc(db, 'users', CUSTOMER), { role: 'vendor', is_approved: true }, { merge: true })
    );
  });

  await it('a user may NOT make themselves admin via role', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(setDoc(doc(db, 'users', CUSTOMER), { role: 'admin' }, { merge: true }));
  });

  await it('a user may NOT make themselves admin via roles.admin', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(
      setDoc(doc(db, 'users', CUSTOMER), { roles: { admin: true } }, { merge: true })
    );
  });

  await it('a user may NOT make themselves admin via is_superadmin', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(
      setDoc(doc(db, 'users', CUSTOMER), { is_superadmin: true }, { merge: true })
    );
  });

  await it('a vendor may NOT demote or rewrite another user', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => {
      await setDoc(doc(db, 'users', VENDOR), { role: 'vendor' });
      await setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' });
    });
    const db = testEnv.authenticatedContext(VENDOR).firestore();
    await assertFails(setDoc(doc(db, 'users', CUSTOMER), { role: 'vendor' }, { merge: true }));
  });

  // ── The downstream chain that broke the vendor dashboard ──────────────────
  await it('an unregistered customer CANNOT list batches', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(getDocs(query(collection(db, 'batches'), where('vendor_id', '==', CUSTOMER))));
  });

  await it('a vendor CAN list batches once role is vendor (no approval needed)', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => {
      await setDoc(doc(db, 'users', VENDOR), { role: 'vendor', is_approved: false });
    });
    const db = testEnv.authenticatedContext(VENDOR).firestore();
    await assertSucceeds(getDocs(query(collection(db, 'batches'), where('vendor_id', '==', VENDOR))));
  });

  await it('a vendor CAN list rider_trips', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', VENDOR), { role: 'vendor' }));
    const db = testEnv.authenticatedContext(VENDOR).firestore();
    await assertSucceeds(getDocs(query(collection(db, 'rider_trips'), where('status', '==', 'active'))));
  });

  await it('an unauthenticated caller cannot read a user document', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'customer' }));
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', CUSTOMER)));
  });

  // ── Brand-new signup: no users/{uid} document exists yet ──────────────────
  // This is the email/password path. With Google, returning users already have
  // a document; a first-time signup has none until onUserCreate writes one.
  await it('a brand-new user can READ their own not-yet-created doc', async () => {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('brand_new_uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'brand_new_uid')));
  });

  await it('a brand-new user can CREATE their own profile document', async () => {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('brand_new_uid').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'brand_new_uid'), {
        id: 'brand_new_uid',
        email: 'new@example.com',
        name: 'New Person',
        role: 'user',
        phone: '',
      })
    );
  });

  await it('a brand-new user creating a profile with undefined-ish fields', async () => {
    // AuthProvider's optimistic write includes keys set to undefined; the SDK
    // strips those, but the shape is worth pinning.
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('brand_new_uid').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'brand_new_uid'), { role: 'user', name: 'X' }, { merge: true })
    );
  });

  await it("AuthProvider's exact new-user profile write is permitted", async () => {
    // Mirrors the object AuthProvider now writes on first sign-in, so a future
    // change to that shape fails here rather than in production.
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('brand_new_uid').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'brand_new_uid'), {
        id: 'brand_new_uid',
        email: 'new@example.com',
        name: 'new',
        phone: '',
        role: 'user',
        is_approved: true,
        created_at: serverTimestamp(),
      }, { merge: true })
    );
  });

  // ── Subscription creation writes a payments doc client-side ───────────────
  // NOTE: the payments write lives in activateExternalSubscription, which is an
  // ADMIN function for recording offline payments -- not the customer path.
  // Keeping the case documents that a customer correctly CANNOT write payments.
  await it('a customer CANNOT write a payments doc (admin-only ledger)', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'user' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(
      setDoc(doc(db, 'payments', 'pay_1'), {
        id: 'pay_1',
        user_id: CUSTOMER,
        subscription_id: 'sub_1',
        amount: 4500,
      })
    );
  });

  await it('a customer can create their own subscription', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'user' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'subscriptions', 'sub_1'), {
        id: 'sub_1', user_id: CUSTOMER, vendor_id: 'v1', status: 'active',
      })
    );
  });

  // ── The ACTUAL customer subscribe path (createSubscription) ───────────────
  await it('a customer can create their swap allowance on subscribe', async () => {
    await testEnv.clearFirestore();
    await seed(async (db) => setDoc(doc(db, 'users', CUSTOMER), { role: 'user' }));
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'subscription_swap_allowances', 'sub_1'), {
        subscription_id: 'sub_1', user_id: CUSTOMER,
        free_swaps_total: 2, free_swaps_used: 0,
      }, { merge: true })
    );
  });

  await it('a customer CANNOT reset an existing allowance (anti free-swap abuse)', async () => {
    // This MUST stay denied: being able to set free_swaps_used back to 0 would
    // mean unlimited free swaps. Re-subscribe resets are done by the
    // onSubscriptionCreated Cloud Function with the Admin SDK instead.
    await testEnv.clearFirestore();
    await seed(async (db) => {
      await setDoc(doc(db, 'users', CUSTOMER), { role: 'user' });
      await setDoc(doc(db, 'subscription_swap_allowances', 'sub_1'), {
        subscription_id: 'sub_1', user_id: CUSTOMER, free_swaps_used: 1,
      });
    });
    const db = testEnv.authenticatedContext(CUSTOMER).firestore();
    await assertFails(
      setDoc(doc(db, 'subscription_swap_allowances', 'sub_1'), {
        subscription_id: 'sub_1', user_id: CUSTOMER, free_swaps_used: 0,
      }, { merge: true })
    );
  });

  await testEnv.cleanup();

  // ── Report ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log('');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (!r.ok) console.log(`        ${r.err}`);
  }
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
