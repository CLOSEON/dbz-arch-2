#!/usr/bin/env node
/**
 * audit-delivery-address.mjs — READ-ONLY.
 *
 * Reports the shape of `delivery_address` across the `orders` collection, and
 * whether coordinates could be recovered for any order missing them.
 *
 * Why this exists as a separate, read-only step:
 *
 * Static analysis says every code path that writes an ORDER uses the object
 * form `{ line1, lat, lng }` (functions/src/deliveryTriggers.ts). The two
 * places that write a bare string target the `subscriptions` collection, not
 * `orders`. So in theory there is nothing to migrate.
 *
 * But "in theory" is not good enough to justify writing to production. Orders
 * created before the canonical schema landed may predate that trigger, and
 * documents are whatever was actually written. Run this first; only run
 * fix-delivery-address.mjs if this reports a non-zero count.
 *
 * Usage:
 *   node scripts/audit-delivery-address.mjs
 *   node scripts/audit-delivery-address.mjs --samples 20
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const sampleLimit = Number(
  (argv.find((a) => a.startsWith('--samples')) || '').split('=')[1] ||
    argv[argv.indexOf('--samples') + 1] ||
    10
);

if (!getApps().length) initializeApp({ projectId: 'dabzofb' });
const db = getFirestore();

function classify(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (typeof value === 'string') return value.trim() === '' ? 'empty-string' : 'string';
  if (typeof value === 'object') {
    const hasLat = typeof value.lat === 'number';
    const hasLng = typeof value.lng === 'number';
    if (hasLat && hasLng) return 'object-with-coords';
    return 'object-without-coords';
  }
  return `other(${typeof value})`;
}

async function main() {
  console.log('Reading orders … (read-only, nothing is written)\n');
  const snap = await db.collection('orders').get();

  const counts = {};
  const samples = {};
  const needsFix = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const kind = classify(d.delivery_address);
    counts[kind] = (counts[kind] || 0) + 1;
    (samples[kind] ||= []).push({ id: doc.id, value: d.delivery_address });

    if (kind !== 'object-with-coords') {
      // Is there a fallback already on the document?
      const alt = d.address;
      const altOk = alt && typeof alt === 'object' && typeof alt.lat === 'number';
      needsFix.push({
        id: doc.id,
        kind,
        user_id: d.user_id || d.customerId || null,
        status: d.status,
        date: d.date || d.delivery_date || null,
        recoverableFromAddressField: Boolean(altOk),
      });
    }
  }

  console.log(`Total orders: ${snap.size}\n`);
  console.log('delivery_address shapes:');
  for (const [kind, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const pct = snap.size ? ((n / snap.size) * 100).toFixed(1) : '0.0';
    console.log(`  ${String(n).padStart(6)}  ${pct.padStart(5)}%  ${kind}`);
  }

  if (!needsFix.length) {
    console.log('\nNothing to migrate: every order already has coordinates.');
    return;
  }

  console.log(`\n${needsFix.length} order(s) lack usable coordinates.`);

  // How many could actually be repaired, and from where?
  const userIds = [...new Set(needsFix.map((o) => o.user_id).filter(Boolean))];
  console.log(`Distinct users involved: ${userIds.length}`);

  const userCoords = new Map();
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    const docs = await Promise.all(chunk.map((id) => db.collection('users').doc(id).get()));
    for (const u of docs) {
      const loc = u.exists ? u.data().location : null;
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        userCoords.set(u.id, loc);
      }
    }
  }

  const fromOrderAddress = needsFix.filter((o) => o.recoverableFromAddressField).length;
  const fromUserLocation = needsFix.filter(
    (o) => !o.recoverableFromAddressField && o.user_id && userCoords.has(o.user_id)
  ).length;
  const unrecoverable = needsFix.length - fromOrderAddress - fromUserLocation;

  console.log('\nRepairable:');
  console.log(`  ${String(fromOrderAddress).padStart(6)}  from the order's own \`address\` field`);
  console.log(`  ${String(fromUserLocation).padStart(6)}  from the user's saved \`location\``);
  console.log(`  ${String(unrecoverable).padStart(6)}  NOT repairable — no coordinates anywhere`);

  console.log(`\nSample (up to ${sampleLimit}):`);
  for (const o of needsFix.slice(0, sampleLimit)) {
    const src = o.recoverableFromAddressField
      ? 'order.address'
      : userCoords.has(o.user_id)
        ? 'user.location'
        : 'NONE';
    console.log(
      `  ${o.id}  kind=${o.kind}  status=${o.status}  date=${o.date}  repairFrom=${src}`
    );
  }

  console.log('\nIf the repairable counts look right, dry-run the fix:');
  console.log('  node scripts/fix-delivery-address.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
