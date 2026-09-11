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
      if (!order.date) continue;
      
      const normSlot = (order.delivery_slot || order.scheduledSlot || '').toLowerCase();
      let slotHour = 13;
      if (normSlot === '8am' || normSlot === 'breakfast') slotHour = 8;
      else if (normSlot === '11am' || normSlot === 'lunch') slotHour = 11;
      else if (normSlot === '8pm' || normSlot === 'dinner') slotHour = 20;
      
      // Construct exact IST datetime and parse to UTC moment
      const deliveryDate = new Date(`${order.date}T${String(slotHour).padStart(2, '0')}:00:00+05:30`);
      if (isNaN(deliveryDate.getTime())) continue;
      
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
      if (!batch.date) continue;

      const normSlot = (batch.slot || '').toLowerCase();
      let slotHour = 13;
      if (normSlot === '8am' || normSlot === 'breakfast') slotHour = 8;
      else if (normSlot === '11am' || normSlot === 'lunch') slotHour = 11;
      else if (normSlot === '8pm' || normSlot === 'dinner') slotHour = 20;

      const deliveryDate = new Date(`${batch.date}T${String(slotHour).padStart(2, '0')}:00:00+05:30`);
      if (isNaN(deliveryDate.getTime())) continue;

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
 * Helper to get IST date string (YYYY-MM-DD).
 */
export const getISTDateString = (d: Date = new Date()): string => {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(d.getTime() + istOffsetMs).toISOString().split('T')[0];
};

/**
 * Helper to batch orders for a specific date and slot, supporting initial formation and catch-up.
 */
async function processSlotBatches(
  db: FirebaseFirestore.Firestore,
  targetDateStr: string,
  targetSlot: string,
  slotAliases: string[]
): Promise<number> {
  // 0. Expire any pending swaps for this slot to ensure no race conditions with batch formation
  const pendingSwapsSnap = await db.collection('swap_requests').where('status', '==', 'broadcasted').get();
  const swapPromises = pendingSwapsSnap.docs.map(async (swapDoc) => {
    const swap = swapDoc.data();
    if (swap.order_id) {
      const orderDoc = await db.collection('orders').doc(swap.order_id).get();
      if (orderDoc.exists) {
        const order = orderDoc.data()!;
        if (order.date === targetDateStr && (order.delivery_slot === targetSlot || slotAliases.includes(order.delivery_slot))) {
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
  });
  await Promise.all(swapPromises);

  // 1. Query orders for this slot and date that are unbatched and ready to be batched
  const ordersSnap = await db.collection('orders')
    .where('date', '==', targetDateStr)
    .where('status', 'in', ['created', 'pending'])
    .get();

  const vendorOrders = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    const orderSlot = (order.delivery_slot || order.scheduledSlot || '').toLowerCase();
    const isMatchingSlot = orderSlot === targetSlot || slotAliases.includes(orderSlot);

    // Only lock orders that belong to this slot and are not already assigned to another batch
    if (isMatchingSlot && (!order.batch_id || order.batch_id.trim() === '')) {
      const vId = order.vendor_id || order.vendorId;
      if (vId) {
        if (!vendorOrders.has(vId)) vendorOrders.set(vId, []);
        vendorOrders.get(vId)!.push(doc);
      }
    }
  }

  for (const [vendorId, docs] of vendorOrders.entries()) {
    const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot}`;
    const orderIds = docs.map(d => d.id);
    const batchRef = db.collection('batches').doc(batchId);

    let isNewBatch = false;

    await db.runTransaction(async (transaction) => {
      const batchDoc = await transaction.get(batchRef);

      if (batchDoc.exists) {
        // Catch-up batching: append newly arrived unbatched orders to existing batch
        const existingData = batchDoc.data()!;
        const existingOrderIds: string[] = existingData.order_ids || [];
        const newOrderIds = orderIds.filter(id => !existingOrderIds.includes(id));

        if (newOrderIds.length > 0) {
          const combinedIds = [...existingOrderIds, ...newOrderIds];
          transaction.update(batchRef, {
            order_ids: combinedIds,
            total_count: combinedIds.length,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });

          for (const d of docs.filter(doc => newOrderIds.includes(doc.id))) {
            transaction.update(d.ref, {
              batch_id: batchId,
              delivery_slot: targetSlot,
              status: existingData.status === 'ready' ? 'vendor_ready' : 'vendor_notified',
              updated_at: admin.firestore.FieldValue.serverTimestamp()
            });

            const logRef = db.collection('order_status_logs').doc();
            transaction.set(logRef, {
              id: logRef.id,
              order_id: d.id,
              from_status: d.data().status,
              to_status: existingData.status === 'ready' ? 'vendor_ready' : 'vendor_notified',
              actor: 'system_batcher_catchup',
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      } else {
        isNewBatch = true;
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
            delivery_slot: targetSlot,
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
      }
    });

    if (isNewBatch) {
      await publishEvent(
        'batch_created',
        vendorId,
        'vendor',
        `batch_created_${batchId}`,
        { slot: targetSlot, count: orderIds.length, batch_id: batchId }
      );
    }
  }

  return vendorOrders.size;
}

/**
 * Forms Batches for vendors exactly 4 hours prior to the delivery slot in IST,
 * and performs catch-up batching for any unbatched active orders in today's slot.
 */
export const formBatches = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  const db = admin.firestore();
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  
  const istNow = new Date(now.getTime() + istOffsetMs);
  const todayDateStr = istNow.toISOString().split('T')[0];
  const currentHourIST = istNow.getUTCHours();

  // 1. 4-hour advance batching window
  const istTarget = new Date(now.getTime() + (4 * 60 * 60 * 1000) + istOffsetMs);
  const targetDateStr = istTarget.toISOString().split('T')[0];
  const targetHour = istTarget.getUTCHours();
  
  let targetSlot = '';
  let slotAliases: string[] = [];
  if (targetHour === 8) {
    targetSlot = '8am';
    slotAliases = ['8am', 'breakfast', '8'];
  } else if (targetHour === 11) {
    targetSlot = '11am';
    slotAliases = ['11am', 'lunch', '1pm', '13'];
  } else if (targetHour === 20) {
    targetSlot = '8pm';
    slotAliases = ['8pm', 'dinner', '20'];
  }

  let totalBatchesProcessed = 0;

  if (targetSlot) {
    console.log(`[formBatches] 4-Hour advance batching for IST date: ${targetDateStr}, slot: ${targetSlot} (hour: ${targetHour})`);
    const count = await processSlotBatches(db, targetDateStr, targetSlot, slotAliases);
    totalBatchesProcessed += count;
  }

  // 2. Dynamic Catch-Up Batching: Check active slots for today (orders placed within 4-hour window)
  const todaySlots: { slot: string; aliases: string[]; cutoffHour: number }[] = [
    { slot: '8am', aliases: ['8am', 'breakfast', '8'], cutoffHour: 9 },
    { slot: '11am', aliases: ['11am', 'lunch', '1pm', '13'], cutoffHour: 13 },
    { slot: '8pm', aliases: ['8pm', 'dinner', '20'], cutoffHour: 21 },
  ];

  for (const s of todaySlots) {
    // Only check if current IST time hasn't passed the meal window and not already processed as targetSlot
    if (currentHourIST <= s.cutoffHour && !(targetDateStr === todayDateStr && targetSlot === s.slot)) {
      const catchupCount = await processSlotBatches(db, todayDateStr, s.slot, s.aliases);
      if (catchupCount > 0) {
        console.log(`[formBatches] Catch-up batching added orders to ${catchupCount} batches for slot ${s.slot} today.`);
        totalBatchesProcessed += catchupCount;
      }
    }
  }

  console.log(`[formBatches] Total batches processed: ${totalBatchesProcessed}.`);
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
  const todayStr = getISTDateString(now);

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
  const todayStr = getISTDateString(now);

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
        'customer',
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

/**
 * Runs every 5 minutes. Retries dispatching unassigned vendor batches,
 * expanding the radius progressively (2km -> 4km -> 6km).
 * If it hits 6km and fails, it triggers an ops alert.
 */
export const dispatchRetryAndExpansion = onSchedule({
  schedule: '*/5 * * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  const db = admin.firestore();
  
  // Find batches that are active but not yet fully assigned
  // A batch is considered "unassigned" if there are orders in 'vendor_ready' for it 
  // that don't have a rider_trip_id. For simplicity, we just query all batches that 
  // have dispatch tracking fields initialized (or we can initialize them here).
  
  const todayStr = getISTDateString();
  const batchesSnap = await db.collection('batches')
    .where('date', '==', todayStr)
    .get();

  for (const doc of batchesSnap.docs) {
    const batch = doc.data();
    
    // Check if there are any unassigned orders for this batch's vendor/slot
    const unassignedOrdersSnap = await db.collection('orders')
      .where('vendor_id', '==', batch.vendor_id)
      .where('delivery_slot', '==', batch.slot)
      .where('status', '==', 'vendor_ready')
      .get();
      
    const unassignedOrders = unassignedOrdersSnap.docs.filter(d => !d.data().rider_trip_id);
    
    if (unassignedOrders.length === 0) continue; // All assigned or none ready

    let dispatch_attempts = batch.dispatch_attempts || 0;
    const current_radius = 2.0; // Strict 2km hard limit per RIDER_LOGIC.md

    dispatch_attempts += 1;

    await doc.ref.update({
      dispatch_attempts,
      current_radius,
      dispatch_started_at: batch.dispatch_started_at || admin.firestore.FieldValue.serverTimestamp()
    });

    // Dynamically import to avoid circular dependency issues if any
    const { coreAssignRiderTrips } = await import('./matchingTriggers');
    
    await coreAssignRiderTrips(batch.vendor_id, batch.slot, current_radius, doc.id);

    // If we've hit attempt 3 (6km) and we still have unassigned orders, alert ops
    if (dispatch_attempts >= 3) {
      // Check again if assignment succeeded
      const checkSnap = await db.collection('orders')
        .where('vendor_id', '==', batch.vendor_id)
        .where('delivery_slot', '==', batch.slot)
        .where('status', '==', 'vendor_ready')
        .get();
      const stillUnassigned = checkSnap.docs.filter(d => !d.data().rider_trip_id);
      
      if (stillUnassigned.length > 0) {
        await publishEvent(
          'delivery_failed', // Re-using for ops escalation
          batch.vendor_id,
          'vendor',
          `zero_riders_escalation_${doc.id}_${Date.now()}`,
          { 
            batch_id: doc.id,
            vendor_id: batch.vendor_id,
            message: `URGENT: No riders found for vendor ${batch.vendor_id} after 6km expansion.`
          }
        );
      }
    }
  }
});
