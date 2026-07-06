import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { publishEvent } from './utils/events';

/**
 * Runs every hour to process time-based reminders and events.
 */
export const processTimeBasedReminders = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'Asia/Kolkata' // Set to your preferred timezone
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    
    // Check 4-hour window (Swap reminder) and 12-hour window (Skip reminder)
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const thirteenHoursFromNow = new Date(now.getTime() + 13 * 60 * 60 * 1000);

    // 1. Customer Order Reminders (Swap/Skip)
    // We fetch orders in active states
    const ordersSnap = await db.collection('orders')
      .where('status', 'in', ['created', 'vendor_notified', 'vendor_preparing', 'vendor_ready'])
      .get();
      
    for (const doc of ordersSnap.docs) {
      const order = doc.data();
      
      // Parse order date string
      const [year, month, day] = order.date.split('-').map(Number);
      let deliveryDate = new Date(year, month - 1, day);
      
      // Calculate actual delivery time based on slot
      if (order.delivery_slot === '8am') deliveryDate.setHours(8, 0, 0, 0);
      else if (order.delivery_slot === '11am') deliveryDate.setHours(11, 0, 0, 0);
      else if (order.delivery_slot === '8pm') deliveryDate.setHours(20, 0, 0, 0);
      else deliveryDate.setHours(13, 0, 0, 0); // fallback
      
      // Check 4-hour window (Swap reminder)
      if (deliveryDate >= fourHoursFromNow && deliveryDate < fiveHoursFromNow) {
        await publishEvent(
          'swap_window_closing',
          order.user_id,
          'customer',
          `swap_reminder_${doc.id}`,
          { mealType: order.meal_type || 'meal' }
        );
      }
      
      // Check 12-hour window (Skip reminder)
      if (deliveryDate >= twelveHoursFromNow && deliveryDate < thirteenHoursFromNow) {
        await publishEvent(
          'skip_window_closing',
          order.user_id,
          'customer',
          `skip_reminder_${doc.id}`,
          { mealType: order.meal_type || 'meal' }
        );
      }
    }
    
    // 2. Vendor Prep Deadline Reminders (1-hour window for Batches)
    const oneHourFromNow = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    // Active batches that aren't ready yet
    const batchesSnap = await db.collection('batches')
      .where('status', 'in', ['notified', 'preparing'])
      .get();

    for (const batchDoc of batchesSnap.docs) {
      const batch = batchDoc.data();
      const [year, month, day] = batch.date.split('-').map(Number);
      let deliveryDate = new Date(year, month - 1, day);
      
      if (batch.slot === '8am') deliveryDate.setHours(8, 0, 0, 0);
      else if (batch.slot === '11am') deliveryDate.setHours(11, 0, 0, 0);
      else if (batch.slot === '8pm') deliveryDate.setHours(20, 0, 0, 0);

      // If delivery is exactly in the 1-2 hour window, send reminder
      if (deliveryDate >= oneHourFromNow && deliveryDate < twoHoursFromNow) {
        await publishEvent(
          'vendor_prep_deadline_approaching',
          batch.vendor_id,
          'vendor',
          `prep_deadline_${batchDoc.id}`,
          { slot: batch.slot, batch_id: batchDoc.id, count: batch.total_count }
        );
      }
    }
    
    console.log(`[processTimeBasedReminders] Hourly cron execution complete.`);
  });


/**
 * Forms Batches for vendors exactly 4 hours prior to the delivery slot.
 */
export const formBatches = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  const db = admin.firestore();
  const now = new Date();
  
  // Calculate target delivery time (4 hours from now)
  const targetDate = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  const targetHour = targetDate.getHours();
  
  let targetSlot = '';
  if (targetHour === 8) targetSlot = '8am';
  else if (targetHour === 11) targetSlot = '11am';
  else if (targetHour === 20) targetSlot = '8pm';
  
  if (!targetSlot) {
    console.log(`[formBatches] No slot aligned with target hour ${targetHour}. Skipping.`);
    return;
  }
  
  console.log(`[formBatches] Forming batches for date: ${targetDateStr}, slot: ${targetSlot}`);
  
  // 0. Expire any pending swaps for this slot to ensure no race conditions with batch formation
  const pendingSwapsSnap = await db.collection('swap_requests').where('status', '==', 'broadcasted').get();
  for (const swapDoc of pendingSwapsSnap.docs) {
    const swap = swapDoc.data();
    if (swap.order_id) {
      const orderDoc = await db.collection('orders').doc(swap.order_id).get();
      if (orderDoc.exists) {
        const order = orderDoc.data()!;
        if (order.date === targetDateStr && order.delivery_slot === targetSlot) {
          await swapDoc.ref.update({ status: 'expired' });
          const broadcastsSnap = await db.collection('swap_broadcasts')
            .where('swap_request_id', '==', swapDoc.id)
            .where('response', '==', 'pending')
            .get();
          if (!broadcastsSnap.empty) {
            const bBatch = db.batch();
            broadcastsSnap.docs.forEach(b => bBatch.update(b.ref, { response: 'expired' }));
            await bBatch.commit();
          }
        }
      }
    }
  }

  // 1. Only lock orders that are strictly in 'created' status and already assigned to a vendor
  const ordersSnap = await db.collection('orders')
    .where('date', '==', targetDateStr)
    .where('delivery_slot', '==', targetSlot)
    .where('status', '==', 'created')
    .get();
    
  const vendorOrders = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    if (order.vendor_id) {
      if (!vendorOrders.has(order.vendor_id)) vendorOrders.set(order.vendor_id, []);
      vendorOrders.get(order.vendor_id)!.push(doc);
    }
  }
  
  for (const [vendorId, docs] of vendorOrders.entries()) {
    const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot}`;
    const orderIds = docs.map(d => d.id);
    const batchRef = db.collection('batches').doc(batchId);
    
    await db.runTransaction(async (transaction) => {
      const batchDoc = await transaction.get(batchRef);
      if (batchDoc.exists) return; // Batch already formed (idempotent check)
      
      // 1. Create Batch
      transaction.set(batchRef, {
        id: batchId,
        vendor_id: vendorId,
        date: targetDateStr,
        slot: targetSlot,
        order_ids: orderIds,
        status: 'notified',
        total_count: orderIds.length,
        last_notified_count: orderIds.length, // Initialize for debounce tracking
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 2. Update Orders
      for (const d of docs) {
        transaction.update(d.ref, {
          batch_id: batchId,
          status: 'vendor_notified',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 3. Status Log
        const logRef = db.collection('order_status_logs').doc();
        transaction.set(logRef, {
          id: logRef.id,
          order_id: d.id,
          from_status: d.data().status,
          to_status: 'vendor_notified',
          actor: 'system_batcher',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    
    // Send initial vendor notification: "Prepare {count} tiffins for {slot} today"
    await publishEvent(
      'batch_created',
      vendorId,
      'vendor',
      `batch_created_${batchId}`,
      { slot: targetSlot, count: orderIds.length, batch_id: batchId }
    );
  }
  
  console.log(`[formBatches] Processed ${vendorOrders.size} batches.`);
});

/**
 * Runs every 15 minutes. Sends a single consolidated "updated count" notification
 * to vendors whose batch total_count dropped due to late skips, but only if the
 * count changed since the last notification (debounced).
 */
export const processBatchSkipUpdates = onSchedule({
  schedule: '*/15 * * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  const db = admin.firestore();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Find all active notified batches for today where the count changed
  const batchesSnap = await db.collection('batches')
    .where('date', '==', todayStr)
    .where('status', 'in', ['notified', 'preparing'])
    .get();

  let notifiedCount = 0;
  for (const batchDoc of batchesSnap.docs) {
    const batch = batchDoc.data();
    if (batch.total_count < batch.last_notified_count) {
      // Count dropped — send consolidated update
      await publishEvent(
        'batch_count_updated',
        batch.vendor_id,
        'vendor',
        `batch_count_update_${batchDoc.id}_${Date.now()}`,
        { slot: batch.slot, new_count: batch.total_count, batch_id: batchDoc.id }
      );
      // Update last_notified_count so we don't spam again
      await batchDoc.ref.update({
        last_notified_count: batch.total_count,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      notifiedCount++;
    }
  }

  console.log(`[processBatchSkipUpdates] Notified ${notifiedCount} vendors of updated counts.`);
});

/**
 * Runs every 30 minutes. Checks for orders that are stuck in transit statuses
 * for more than 1 hour and fires system alerts.
 */
export const checkStuckOrders = onSchedule({
  schedule: '*/30 * * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  const db = admin.firestore();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];

  // We only check today's active orders in specific states
  const statusesToCheck = ['vendor_preparing', 'picked_up', 'out_for_delivery'];
  
  const ordersSnap = await db.collection('orders')
    .where('date', '==', todayStr)
    .where('status', 'in', statusesToCheck)
    .get();

  let stuckCount = 0;
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    
    // updated_at is set every time the status changes.
    // If it's been in this status for > 1 hour, flag it.
    let isStuck = false;
    if (order.updated_at && order.updated_at.toDate) {
      if (order.updated_at.toDate() < oneHourAgo) {
        isStuck = true;
      }
    } else if (order.updated_at && typeof order.updated_at.seconds === 'number') {
      if (order.updated_at.seconds * 1000 < oneHourAgo.getTime()) {
        isStuck = true;
      }
    }

    if (isStuck) {
      // Fire an alert event that support/admin can see
      await publishEvent(
        'delivery_failed', // Re-using delivery_failed as a high-severity alert for logistics
        order.user_id,
        'user',
        `stuck_order_alert_${doc.id}_${now.getTime()}`,
        { 
          order_id: doc.id, 
          status: order.status, 
          message: `Order has been stuck in ${order.status} for > 1 hour. Immediate admin review required.`
        }
      );
      stuckCount++;
    }
  }

  console.log(`[checkStuckOrders] Found and alerted on ${stuckCount} stuck orders.`);
});
