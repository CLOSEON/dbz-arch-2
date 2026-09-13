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
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

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
