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
    
    // Calculate targets for 4 hours and 12 hours from now
    // We give a 1-hour buffer window for the cron job to catch them
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const thirteenHoursFromNow = new Date(now.getTime() + 13 * 60 * 60 * 1000);

    // Fetch active delivery orders
    const ordersSnap = await db.collection('delivery_orders')
      .where('status', 'in', ['pending', 'preparing', 'ready'])
      .get();
      
    const vendorCounts = new Map<string, { vendorId: string; slot: string; count: number }>();

    // Batch event creation
    for (const doc of ordersSnap.docs) {
      const order = doc.data();
      
      let deliveryDate = new Date();
      if (order.createdAt?.toDate) {
        deliveryDate = order.createdAt.toDate();
      }
      
      // Calculate actual delivery time based on slot
      if (order.scheduledSlot === '8am') deliveryDate.setHours(8, 0, 0, 0);
      else if (order.scheduledSlot === '11am') deliveryDate.setHours(11, 0, 0, 0);
      else if (order.meal?.type === 'lunch') deliveryDate.setHours(13, 0, 0, 0);
      else deliveryDate.setHours(20, 0, 0, 0);
      
      // Check 4-hour window (Swap reminder & Tiffin Count)
      if (deliveryDate >= fourHoursFromNow && deliveryDate < fiveHoursFromNow) {
        // Customer: 4 hours left to swap
        await publishEvent(
          'swap_window_closing',
          order.customerId,
          'customer',
          `swap_reminder_${doc.id}`,
          { mealType: order.meal?.name || 'meal' }
        );
        
        // Aggregate for vendor
        const vId = order.vendorId;
        const slot = order.scheduledSlot || 'unknown';
        const key = `${vId}_${slot}`;
        if (!vendorCounts.has(key)) {
          vendorCounts.set(key, { vendorId: vId, slot, count: 0 });
        }
        vendorCounts.get(key)!.count++;
      }
      
      // Check 12-hour window (Skip reminder)
      if (deliveryDate >= twelveHoursFromNow && deliveryDate < thirteenHoursFromNow) {
        await publishEvent(
          'skip_window_closing',
          order.customerId,
          'customer',
          `skip_reminder_${doc.id}`,
          { mealType: order.meal?.name || 'meal' }
        );
      }
    }
    
    // Dispatch vendor aggregated counts
    for (const [key, val] of vendorCounts.entries()) {
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      await publishEvent(
        'tiffin_count_confirmed',
        val.vendorId,
        'vendor',
        `tiffin_count_${val.vendorId}_${dateStr}_${val.slot}`,
        { slot: val.slot, count: val.count } 
      );
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
  
  // Only lock orders that are strictly in 'created' status and already assigned to a vendor
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
