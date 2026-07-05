import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { sendPushNotification } from './utils/notifications';
import { SystemEvent } from './utils/events';

/**
 * Triggered when a new document is added to `system_events`.
 * This acts as our event bus processor for all notifications.
 */
export const onSystemEventCreated = onDocumentCreated('system_events/{eventId}', async (eventSnap) => {
  if (!eventSnap.data) return;
  const snap = eventSnap.data;
  const event = snap.data() as SystemEvent;
  const db = admin.firestore();

    // 1. Deduplication Check
    // We query for existing events with the same deduplicationKey that were already processed.
    const duplicateQuery = await db.collection('system_events')
      .where('deduplicationKey', '==', event.deduplicationKey)
      .where('processed', '==', true)
      .limit(1)
      .get();
      
    if (!duplicateQuery.empty) {
      console.log(`[onSystemEventCreated] Duplicate event detected for key: ${event.deduplicationKey}. Skipping.`);
      await snap.ref.update({ processed: true, duplicate: true });
      return;
    }

    // 2. Fetch Recipient Preferences
    const userDoc = await db.collection('users').doc(event.recipientId).get();
    if (!userDoc.exists) {
      console.log(`[onSystemEventCreated] Recipient ${event.recipientId} not found.`);
      await snap.ref.update({ processed: true, error: 'User not found' });
      return;
    }

    const userData = userDoc.data() || {};
    const prefs = userData.notificationPreferences || {};
    
    // Critical events cannot be muted
    const criticalEvents = ['meal_delivered', 'delivery_failed', 'rider_new_trip', 'vendor_rider_assigned'];
    
    if (prefs[event.type] === false && !criticalEvents.includes(event.type)) {
      console.log(`[onSystemEventCreated] Event ${event.type} muted by user ${event.recipientId}.`);
      await snap.ref.update({ processed: true, muted: true });
      return;
    }

    // 3. Build Push Notification Payload
    let title = '';
    let body = '';
    const payloadData: any = { eventType: event.type };

    switch (event.type) {
      // CUSTOMER EVENTS
      case 'order_confirmed':
        title = '🍲 Order Confirmed for Tomorrow';
        body = `Your ${event.payload.mealType || 'meal'} order has been scheduled for delivery at ${event.payload.slot || 'your requested time'}.`;
        break;
      case 'swap_window_closing':
        title = '⏳ 4 Hours Left to Swap';
        body = `Your swap window for today's ${event.payload.mealType || 'meal'} closes in 4 hours!`;
        break;
      case 'skip_window_closing':
        title = '⏳ 12 Hours Left to Skip';
        body = `Your skip window for today's ${event.payload.mealType || 'meal'} closes in 12 hours!`;
        break;
      case 'meal_prep_started':
        title = '👨‍🍳 Meal Prep Started';
        body = `The kitchen has started preparing your ${event.payload.mealType || 'meal'}.`;
        break;
      case 'meal_picked_up':
        title = '🛵 Meal Picked Up';
        body = `Your delivery rider has picked up your meal and is on the way!`;
        break;
      case 'rider_en_route':
        title = '📍 Rider Approaching';
        body = `Your rider is en route to your location.`;
        break;
      case 'meal_delivered':
        title = '✅ Meal Delivered';
        body = `Your meal has been delivered successfully. Bon appétit!`;
        break;
      case 'delivery_failed':
        title = '⚠️ Delivery Attempt Failed';
        body = event.payload.reason ? `Reason: ${event.payload.reason}` : `The rider was unable to complete the delivery.`;
        break;
        
      // VENDOR EVENTS
      case 'batch_created':
        title = '📋 Prepare Your Tiffins';
        body = `Prepare ${event.payload.count || 0} tiffins for the ${event.payload.slot || 'upcoming slot'} today. (Batch: ${event.payload.batch_id || ''})`;
        break;
      case 'batch_count_updated':
        title = '🔄 Updated Tiffin Count';
        body = `Updated count for ${event.payload.slot || 'your slot'}: now ${event.payload.new_count ?? 0} tiffins.`;
        break;
      case 'tiffin_count_confirmed': // Legacy — kept for backward compatibility
        title = '📋 Tiffin Count Confirmed';
        body = `Prepare ${event.payload.count || 0} tiffins for the upcoming ${event.payload.slot || 'slot'}.`;
        break;
      case 'vendor_rider_assigned':
        title = '🛵 Riders Assigned';
        body = `Riders have been assigned and are en route for your batch.`;
        break;
      case 'vendor_pickup_confirmed':
        title = '✅ Pickup Confirmed';
        body = `Your batch for slot ${event.payload.slot || ''} has been picked up.`;
        break;

      // RIDER EVENTS
      case 'rider_new_trip':
        title = '🗺️ New Trip Assigned';
        body = `You have been assigned a new trip with ${event.payload.stopCount || 0} stops.`;
        break;
      case 'rider_route_ready':
        title = '🚀 Route Ready';
        body = `Your pickup sequence and drop sequence are ready.`;
        break;
      case 'rider_delay_reminder':
        title = '⚠️ Trip Delay Warning';
        body = `You are running behind your planned ETA. Please proceed to your next stop.`;
        break;
        
      default:
        console.warn(`[onSystemEventCreated] Unknown event type: ${event.type}`);
        await snap.ref.update({ processed: true, error: 'Unknown event type' });
        return;
    }

    // 4. Send Push Notification
    await sendPushNotification(event.recipientId, {
      title,
      body,
      data: payloadData
    });

    // 5. Mark Processed
    await snap.ref.update({ processed: true, processedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
