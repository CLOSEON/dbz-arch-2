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
