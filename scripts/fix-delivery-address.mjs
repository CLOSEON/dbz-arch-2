#!/usr/bin/env node
/**
 * fix-delivery-address.mjs — backfills coordinates onto orders that lack them.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 * Run scripts/audit-delivery-address.mjs first. If it reports zero orders
 * needing repair, do not run this at all.
 *
 * Background: `orders.delivery_address` is expected to be
 * `{ line1, lat, lng }` — that is what functions/src/deliveryTriggers.ts
 * writes, and what the 2 km swap-candidate search and rider dispatch both read
 * (`delivery_address.lat` / `.lng`). An order whose delivery_address is a bare
 * string, or an object without numeric coordinates, is invisible to both: the
 * read yields undefined and the candidate is skipped with no error.
 *
 * Coordinates are recovered, in order of preference:
 *   1. the order's own `address` field, if it already carries lat/lng
 *   2. the customer's saved `location` on their `users` document
 * Orders with neither are reported and left untouched — this script will not
 * invent a location.
 *
 * The original value is preserved on the document as
 * `delivery_address_original` so the change is reversible.
 *
 * Usage:
 *   node scripts/fix-delivery-address.mjs              # dry run
 *   node scripts/fix-delivery-address.mjs --limit 50   # dry run, first 50
 *   node scripts/fix-delivery-address.mjs --apply      # actually write
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const limitArg = argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(argv[limitArg + 1]) : Infinity;

if (!getApps().length) initializeApp({ projectId: 'dabzofb' });
const db = getFirestore();

const hasCoords = (v) =>
  v && typeof v === 'object' && typeof v.lat === 'number' && typeof v.lng === 'number';

async function main() {
  console.log(
    APPLY
      ? '*** APPLY MODE — this will write to production Firestore ***\n'
      : 'DRY RUN — no writes. Pass --apply to actually make these changes.\n'
  );

  const snap = await db.collection('orders').get();
  const candidates = snap.docs.filter((d) => !hasCoords(d.data().delivery_address));

  if (!candidates.length) {
    console.log(`Scanned ${snap.size} orders. All already have coordinates — nothing to do.`);
    return;
  }
  console.log(`Scanned ${snap.size} orders; ${candidates.length} lack coordinates.\n`);

  // Resolve customer locations in bulk.
  const userIds = [
    ...new Set(candidates.map((d) => d.data().user_id || d.data().customerId).filter(Boolean)),
  ];
  const userLoc = new Map();
  for (let i = 0; i < userIds.length; i += 30) {
    const docs = await Promise.all(
      userIds.slice(i, i + 30).map((id) => db.collection('users').doc(id).get())
    );
    for (const u of docs) {
      if (u.exists && hasCoords(u.data().location)) userLoc.set(u.id, u.data().location);
    }
  }

  const planned = [];
  const skipped = [];

  for (const doc of candidates) {
    if (planned.length >= LIMIT) break;
    const d = doc.data();
    const uid = d.user_id || d.customerId;

    let coords = null;
    let source = null;
    if (hasCoords(d.address)) {
      coords = { lat: d.address.lat, lng: d.address.lng };
      source = 'order.address';
    } else if (uid && userLoc.has(uid)) {
      const l = userLoc.get(uid);
      coords = { lat: l.lat, lng: l.lng };
      source = 'user.location';
    }

    if (!coords) {
      skipped.push({ id: doc.id, reason: 'no coordinates available', user_id: uid });
      continue;
    }

    // Preserve whatever line1 text we can find.
    const existing = d.delivery_address;
    const line1 =
      (typeof existing === 'string' && existing.trim()) ||
      (existing && typeof existing === 'object' && existing.line1) ||
      (d.address && typeof d.address === 'object' && d.address.line1) ||
      (typeof d.address === 'string' ? d.address : '') ||
      '';

    planned.push({
      id: doc.id,
      source,
      before: existing,
      after: { line1, lat: coords.lat, lng: coords.lng },
    });
  }

  console.log(`Planned repairs: ${planned.length}`);
  console.log(`Skipped (unrepairable): ${skipped.length}\n`);

  for (const p of planned.slice(0, 15)) {
    console.log(`  ${p.id}  via ${p.source}`);
    console.log(`      before: ${JSON.stringify(p.before)}`);
    console.log(`      after : ${JSON.stringify(p.after)}`);
  }
  if (planned.length > 15) console.log(`  … and ${planned.length - 15} more`);

  if (skipped.length) {
    console.log(`\nLeft untouched (no coordinates anywhere) — these need a human:`);
    for (const s of skipped.slice(0, 10)) {
      console.log(`  ${s.id}  user_id=${s.user_id}`);
    }
    if (skipped.length > 10) console.log(`  … and ${skipped.length - 10} more`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write these changes.');
    return;
  }

  console.log('\nWriting …');
  let written = 0;
  for (let i = 0; i < planned.length; i += 400) {
    const batch = db.batch();
    for (const p of planned.slice(i, i + 400)) {
      batch.update(db.collection('orders').doc(p.id), {
        delivery_address: p.after,
        // Keep the original so this is reversible.
        delivery_address_original: p.before === undefined ? null : p.before,
        delivery_address_backfilled_at: new Date().toISOString(),
        delivery_address_backfilled_from: p.source,
      });
    }
    await batch.commit();
    written += Math.min(400, planned.length - i);
    console.log(`  committed ${written}/${planned.length}`);
  }
  console.log(`\nDone. ${written} order(s) updated, ${skipped.length} left untouched.`);
  console.log('Original values preserved in `delivery_address_original`.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
