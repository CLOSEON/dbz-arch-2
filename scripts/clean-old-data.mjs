import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'dabzofb' });
}

const db = getFirestore();

const ACTIVE_SUB_ID = 'MYQYSXZHic92zYEvmEum';

async function cleanup() {
  console.log('🚀 Starting clean-up of old trips, stale batches, and obsolete test orders...\n');

  // 1. Fetch active 9 orders to ensure we preserve them
  const activeOrdersSnap = await db.collection('orders').where('subscription_id', '==', ACTIVE_SUB_ID).get();
  const activeOrderIds = new Set(activeOrdersSnap.docs.map(d => d.id));
  console.log(`✅ Preserving ${activeOrderIds.size} active orders for subscription ${ACTIVE_SUB_ID}:`, Array.from(activeOrderIds));

  if (activeOrderIds.size !== 9) {
    console.warn(`⚠️ Warning: Expected 9 orders for active subscription, found ${activeOrderIds.size}`);
  }

  // 2. Delete old rider_trips
  const tripsSnap = await db.collection('rider_trips').get();
  console.log(`\n🧹 Cleaning rider_trips (${tripsSnap.size} found)...`);
  for (const doc of tripsSnap.docs) {
    console.log(`   Deleting trip: ${doc.id}`);
    await doc.ref.delete();
  }

  // 3. Delete old batches
  const batchesSnap = await db.collection('batches').get();
  console.log(`\n🧹 Cleaning batches (${batchesSnap.size} found)...`);
  for (const doc of batchesSnap.docs) {
    const data = doc.data();
    const orderIds = Array.isArray(data.order_ids) ? data.order_ids : [];
    const hasActiveOrder = orderIds.some(id => activeOrderIds.has(id));
    if (!hasActiveOrder) {
      console.log(`   Deleting obsolete batch: ${doc.id}`);
      await doc.ref.delete();
    } else {
      console.log(`   Keeping active batch: ${doc.id} (contains active orders)`);
    }
  }

  // 4. Delete stale orders (not belonging to active subscription)
  const allOrdersSnap = await db.collection('orders').get();
  console.log(`\n🧹 Cleaning orders (${allOrdersSnap.size} total in DB)...`);
  let deletedOrdersCount = 0;
  for (const doc of allOrdersSnap.docs) {
    if (!activeOrderIds.has(doc.id)) {
      console.log(`   Deleting stale order: ${doc.id} (sub: ${doc.data().subscription_id || 'NONE'})`);
      await doc.ref.delete();
      deletedOrdersCount++;
    }
  }
  console.log(`✅ Deleted ${deletedOrdersCount} stale orders. Remaining: ${allOrdersSnap.size - deletedOrdersCount} (should be 9).`);

  // 5. Clean order_status_logs
  const statusLogsSnap = await db.collection('order_status_logs').get();
  console.log(`\n🧹 Cleaning order_status_logs (${statusLogsSnap.size} found)...`);
  let deletedLogs = 0;
  for (const doc of statusLogsSnap.docs) {
    const orderId = doc.data().orderId || doc.data().order_id;
    if (!activeOrderIds.has(orderId)) {
      await doc.ref.delete();
      deletedLogs++;
    }
  }
  console.log(`✅ Deleted ${deletedLogs} obsolete status logs.`);

  // 6. Clean failed_delivery_reviews
  const failedSnap = await db.collection('failed_delivery_reviews').get();
  console.log(`\n🧹 Cleaning failed_delivery_reviews (${failedSnap.size} found)...`);
  for (const doc of failedSnap.docs) {
    console.log(`   Deleting failed delivery review: ${doc.id}`);
    await doc.ref.delete();
  }

  // 7. Clean pickup_discrepancies
  const pickupSnap = await db.collection('pickup_discrepancies').get();
  console.log(`\n🧹 Cleaning pickup_discrepancies (${pickupSnap.size} found)...`);
  for (const doc of pickupSnap.docs) {
    console.log(`   Deleting pickup discrepancy: ${doc.id}`);
    await doc.ref.delete();
  }

  // 8. Clean rider_payments
  const riderPaySnap = await db.collection('rider_payments').get();
  console.log(`\n🧹 Cleaning rider_payments (${riderPaySnap.size} found)...`);
  for (const doc of riderPaySnap.docs) {
    console.log(`   Deleting dummy rider payment: ${doc.id}`);
    await doc.ref.delete();
  }

  // 9. Clean payments not belonging to active subscription
  const paymentsSnap = await db.collection('payments').get();
  console.log(`\n🧹 Cleaning payments (${paymentsSnap.size} found)...`);
  for (const doc of paymentsSnap.docs) {
    const data = doc.data();
    const subId = data.subscription_id || data.subId;
    if (subId !== ACTIVE_SUB_ID) {
      console.log(`   Deleting old payment: ${doc.id} (sub: ${subId})`);
      await doc.ref.delete();
    } else {
      console.log(`   Keeping payment for active sub: ${doc.id}`);
    }
  }

  // 10. Clean old vendor_payouts
  const payoutsSnap = await db.collection('vendor_payouts').get();
  console.log(`\n🧹 Cleaning vendor_payouts (${payoutsSnap.size} found)...`);
  for (const doc of payoutsSnap.docs) {
    console.log(`   Deleting old vendor payout: ${doc.id}`);
    await doc.ref.delete();
  }

  console.log('\n🎉 Cleanup successfully finished!');
}

cleanup().catch(console.error);
