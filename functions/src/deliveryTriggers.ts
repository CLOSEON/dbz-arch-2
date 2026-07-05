import { onDocumentUpdated, onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { publishEvent } from './utils/events';

/**
 * Cloud Function triggered on every updates in a delivery order document.
 * Detects order status updates and dispatches push alerts (FCM) to customers, kitchens and admins.
 */
export const onDeliveryStatusChange = onDocumentUpdated('delivery_orders/{orderId}', async (event) => {
  const change = event.data;
  if (!change) {
    console.log('[onDeliveryStatusChange] No data change payload.');
    return;
  }

  const beforeData = change.before.data();
  const afterData = change.after.data();

  if (!beforeData || !afterData) {
    console.log('[onDeliveryStatusChange] Document state empty.');
    return;
  }

  const beforeStatus = beforeData.status;
  const afterStatus = afterData.status;

  // Return early if order status is unchanged
  if (beforeStatus === afterStatus) {
    console.log(`[onDeliveryStatusChange] Status unchanged (${afterStatus}). Returning.`);
    return;
  }

  const db = admin.firestore();
  const messaging = admin.messaging();
  const orderId = event.params.orderId;

  console.log(`[onDeliveryStatusChange] Transit status updated: ${beforeStatus} -> ${afterStatus} for order: ${orderId}`);

  try {
    const customerId = afterData.customerId;
    const vendorId = afterData.vendorId;

    if (afterStatus === 'picked_up') {
      // Notification to customer:
      // Title: "Your tiffin is on the way!"
      // Body: "Picked up from {vendorName}. Estimated delivery: {eta}"
      const vendorSnap = await db.collection('users').doc(vendorId).get();
      const vendorName = vendorSnap.exists
        ? (vendorSnap.data()?.name || 'Dabzo Partner Kitchen')
        : 'Dabzo Partner Kitchen';
      
      let eta = '1:30 PM';
      if (afterData.scheduledSlot === '8am') eta = '8:30 AM';
      else if (afterData.scheduledSlot === '11am') eta = '11:30 AM';
      else if (afterData.scheduledSlot === '8pm' || afterData.meal?.type === 'dinner') eta = '8:30 PM';

      await sendFCMToUser(customerId, {
        title: 'Your tiffin is on the way!',
        body: `Picked up from ${vendorName}. Estimated delivery: ${eta}`,
      });

    } else if (afterStatus === 'out_for_delivery') {
      // Notification to customer:
      // Title: "Driver is nearby"
      // Body: "Your OTP is {otp}. Show it to confirm delivery."
      const otp = afterData.otp || '0000';

      await sendFCMToUser(customerId, {
        title: 'Driver is nearby',
        body: `Your OTP is ${otp}. Show it to confirm delivery.`,
      });

    } else if (afterStatus === 'delivered') {
      // Notification to customer:
      // Title: "Delivered!"
      // Body: "Enjoy your meal! Rate your experience."
      // Notification to vendor:
      // Title: "Delivery confirmed"
      // Body: "{customerName}'s order delivered successfully."
      const customerSnap = await db.collection('users').doc(customerId).get();
      const customerName = customerSnap.exists
        ? (customerSnap.data()?.name || 'Subscriber')
        : 'Subscriber';

      await Promise.all([
        sendFCMToUser(customerId, {
          title: 'Delivered!',
          body: 'Enjoy your meal! Rate your experience.',
        }),
        sendFCMToUser(vendorId, {
          title: 'Delivery confirmed',
          body: `${customerName}'s order delivered successfully.`,
        }),
      ]);

    } else if (afterStatus === 'failed') {
      // Notification to administrative fleet owners:
      // Title: "Delivery failed"
      // Body: "Order {orderId} failed. Review in admin panel."
      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      const adminTokens: string[] = [];

      adminSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.fcmToken) {
          adminTokens.push(u.fcmToken);
        }
        if (u.push_tokens && Array.isArray(u.push_tokens)) {
          adminTokens.push(...u.push_tokens);
        }
      });

      if (adminTokens.length > 0) {
        const uniqueTokens = Array.from(new Set(adminTokens));
        await sendMulticastFCM(uniqueTokens, {
          title: 'Delivery failed',
          body: `Order ${orderId} failed. Review in admin panel.`,
        });
      }
    }
  } catch (err) {
    console.error(`[onDeliveryStatusChange] Failed processing push trigger for ${orderId}:`, err);
  }

  // Scoped utility function to send notification to a user based on their UID
  async function sendFCMToUser(uid: string, payload: { title: string; body: string }) {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      console.log(`[onDeliveryStatusChange] User profile not found: ${uid}`);
      return;
    }

    const userData = userSnap.data()!;
    const tokens: string[] = [];
    if (userData.fcmToken) {
      tokens.push(userData.fcmToken);
    }
    if (userData.push_tokens && Array.isArray(userData.push_tokens)) {
      tokens.push(...userData.push_tokens);
    }

    if (tokens.length === 0) {
      console.log(`[onDeliveryStatusChange] No device FCM token registered for ${uid}`);
      return;
    }

    const uniqueTokens = Array.from(new Set(tokens));
    await sendMulticastFCM(uniqueTokens, payload);
  }

  // Scoped utility function to dispatch multicast messaging
  async function sendMulticastFCM(tokens: string[], payload: { title: string; body: string }) {
    console.log(`[onDeliveryStatusChange] Dispatching multicast to ${tokens.length} channels...`);
    try {
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        android: {
          notification: {
            channelId: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });
      console.log('[onDeliveryStatusChange] Multicast push dispatched successfully.');
    } catch (e) {
      console.error('[onDeliveryStatusChange] Messaging payload transmission failure:', e);
    }
  }
});

/**
 * Callable function to update the status of a delivery.
 * Enforces role checks, state machine transitions, and triggers customer notifications.
 */
export const updateDeliveryStatus = onCall(async (request) => {
  const { data, auth } = request;
  
  // 1. Authorization
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  if (auth.token.role !== 'delivery_agent' && auth.token.role !== 'delivery') {
    throw new HttpsError('permission-denied', 'Must be a delivery agent to update status');
  }

  const { orderId, status, reason } = data;
  if (!orderId || !status) {
    throw new HttpsError('invalid-argument', 'Missing orderId or status');
  }

  const db = admin.firestore();
  const deliveryRef = db.collection('deliveries').doc(orderId);
  
  // 2. State Machine Enforcement within a Transaction
  const transitionResult = await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(deliveryRef);
    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'Delivery order not found');
    }

    const deliveryData = docSnap.data()!;
    
    // Validate matching agent
    if (deliveryData.agentId !== auth.uid) {
      throw new HttpsError('permission-denied', 'You are not assigned to this delivery');
    }

    const currentStatus = deliveryData.status;

    // Validate transitions
    if (status === 'picked_up' && currentStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'Can only transition to picked_up from pending');
    }
    if (status === 'delivered' && currentStatus !== 'picked_up') {
      throw new HttpsError('failed-precondition', 'Can only transition to delivered from picked_up');
    }
    if (status === 'failed_attempt' && currentStatus !== 'picked_up') {
      throw new HttpsError('failed-precondition', 'Can only transition to failed_attempt from picked_up');
    }
    if (status === 'failed_attempt' && (!reason || reason.trim() === '')) {
      throw new HttpsError('invalid-argument', 'Must provide a non-empty reason when setting status to failed_attempt');
    }

    // 3. Build Update Payload
    const updatePayload: any = {
      status,
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        agentId: auth.uid
      })
    };

    if (status === 'delivered') {
      updatePayload.delivered_at = admin.firestore.FieldValue.serverTimestamp();
    } else if (status === 'failed_attempt') {
      updatePayload.failedReason = reason;
    }

    transaction.update(deliveryRef, updatePayload);

    return {
      customerId: deliveryData.customerId,
      vendorId: deliveryData.vendorId,
      oldStatus: currentStatus,
      newStatus: status,
      reason: reason
    };
  });

  // 4. Trigger typed push notifications (outside transaction to avoid duplicate dispatches on retry)
  try {
    const { customerId, newStatus, reason } = transitionResult;

    if (newStatus === 'picked_up') {
      // Customer: meal is on its way
      await publishEvent(
        'meal_picked_up',
        customerId,
        'customer',
        `meal_picked_up_${orderId}`,
        { orderId }
      );

    } else if (newStatus === 'delivered') {
      // Customer: order delivered
      await publishEvent(
        'meal_delivered',
        customerId,
        'customer',
        `meal_delivered_${orderId}`,
        { orderId }
      );

    } else if (newStatus === 'failed_attempt') {
      // Customer: delivery attempt failed
      await publishEvent(
        'delivery_failed',
        customerId,
        'customer',
        `delivery_failed_${orderId}`,
        { orderId, reason: reason ?? '' }
      );

      // All admins: alert for manual follow-up
      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      await Promise.all(
        adminSnap.docs.map((adminDoc) =>
          publishEvent(
            'delivery_failed',
            adminDoc.id,
            'admin',
            `delivery_failed_admin_${orderId}_${adminDoc.id}`,
            { orderId, reason: reason ?? '' }
          )
        )
      );
    }
  } catch (error) {
    // Non-fatal — a notification failure must never fail the status update
    console.error(`[updateDeliveryStatus] Push notification error for order ${orderId}:`, error);
  }
  
  // 5. Return Typed Response
  return { 
    success: true, 
    newStatus: transitionResult.newStatus, 
    message: `Successfully updated order status to ${transitionResult.newStatus}` 
  };
});

/**
 * Callable function to generate today's deliveries from active subscriptions.
 * Enforces admin role check.
 */
async function processDailyDeliveries(force: boolean = false) {
  const db = admin.firestore();
  const result = { created: 0, skipped: 0, errors: 0, details: [] as any[] };

  // Fetch active drivers to assign orders to
  const driversSnap = await db.collection('users').where('role', 'in', ['delivery', 'delivery_agent']).get();
  const driverIds = driversSnap.docs.map(d => d.id);
  let currentDriverIndex = 0;

  // 1. Fetch all active subscriptions
  const subsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();

  if (subsSnap.empty) return result;

  // 2. Fetch today's already-existing delivery_orders (skipped when force=true)
  const existingSubIds = new Set<string>();
  if (!force) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const existingSnap = await db.collection('delivery_orders')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
      .get();

    existingSnap.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const docData = d.data();
      if (docData.subscriptionId) existingSubIds.add(docData.subscriptionId);
    });
  }

  // 3. Process each subscription
  const batch = db.batch();
  let batchCount = 0;

  for (const subDoc of subsSnap.docs) {
    const sub = subDoc.data();
    const subId = subDoc.id;

    if (existingSubIds.has(subId)) {
      result.skipped++;
      result.details.push({ subId, userName: sub.user_id, status: 'skipped', reason: 'Order already exists today' });
      continue;
    }

    try {
      const [userSnap, vendorSnap] = await Promise.all([
        db.collection('users').doc(sub.user_id).get(),
        db.collection('users').doc(sub.vendor_id).get(),
      ]);

      const user = userSnap.exists ? userSnap.data() : null;
      const vendor = vendorSnap.exists ? vendorSnap.data() : null;

      if (!user || !vendor) {
        result.errors++;
        result.details.push({ subId, userName: sub.user_id, status: 'error', reason: 'User or vendor profile not found' });
        continue;
      }

      const mealTypesToGenerate = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];

      const userLat = user.location?.lat ?? 18.5204;
      const userLng = user.location?.lng ?? 73.8567;

      for (const mealType of mealTypesToGenerate) {
        const mealName = mealType === 'dinner' ? 'Dinner' : 'Lunch';
        const otp = String(Math.floor(1000 + Math.random() * 9000));
        const assignedDriverId = driverIds.length > 0 ? driverIds[currentDriverIndex++ % driverIds.length] : null;

        const scheduledSlot = mealType === 'lunch' ? (user.deliveryPreference || '11am') : '8pm';

        const newOrderRef = db.collection('delivery_orders').doc();
        batch.set(newOrderRef, {
          subscriptionId: subId,
          customerId: sub.user_id,
          customerPhone: user.phone || user.phoneNumber || '',
          vendorId: sub.vendor_id,
          vendorPhone: vendor.phone || vendor.phoneNumber || '',
          driverId: assignedDriverId,
          status: 'preparing',
          otp,
          otpVerified: false,
          meal: {
            name: `${vendor.kitchen_name || vendor.name}'s ${mealName}`,
            type: mealType, // 'lunch' or 'dinner'
          },
          address: {
            line1: user.address || `${user.name}'s Location`,
            landmark: '',
            lat: userLat,
            lng: userLng,
          },
          driverLocation: null,
          scheduledSlot: scheduledSlot,
          timestamps: {
            preparedAt: null,
            pickedAt: null,
            outAt: null,
            deliveredAt: null,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Customer: Order Confirmed
        publishEvent(
          'order_confirmed',
          sub.user_id,
          'customer',
          `order_confirmed_${newOrderRef.id}`,
          { 
            mealType: mealName,
            slot: scheduledSlot
          }
        ).catch(err => console.error('Error publishing order_confirmed:', err));

        batchCount++;
      }

      result.created += mealTypesToGenerate.length;
      result.details.push({ subId, userName: user.name || sub.user_id, status: 'created', generatedOrders: mealTypesToGenerate.length });

      if (batchCount >= 490) {
        await batch.commit();
        batchCount = 0;
      }
    } catch (err: any) {
      result.errors++;
      result.details.push({ subId, userName: sub.user_id, status: 'error', reason: err.message || 'Unknown error' });
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return result;
}

/**
 * Callable function to generate today's deliveries from active subscriptions.
 * Enforces admin role check.
 */
export const generateTodayDeliveries = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  if (auth.token.role !== 'admin') {
    const userDoc = await admin.firestore().collection('users').doc(auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Must be an admin to generate orders');
    }
  }

  const force = (data as any)?.force === true;
  return await processDailyDeliveries(force);
});

/**
 * Automated daily background job to generate delivery orders from active subscriptions.
 * Runs every day at 1:00 AM IST.
 */
export const autoGenerateDailyDeliveries = onSchedule({
  schedule: '0 1 * * *',
  timeZone: 'Asia/Kolkata'
}, async (event) => {
  console.log('[autoGenerateDailyDeliveries] Starting scheduled order generation...');
  const result = await processDailyDeliveries(false);
  console.log(`[autoGenerateDailyDeliveries] Completed. Created: ${result.created}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
});

/**
 * Marks a specific vendor's batch of orders for a given date/slot as 'ready'.
 * Uses a transaction to ensure idempotency.
 */
export const markBatchReady = onCall(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const vendorId = auth.uid;
  const { batch_id } = data as any;
  if (!batch_id) {
    throw new HttpsError('invalid-argument', 'Missing batch_id');
  }

  const db = admin.firestore();
  const batchRef = db.collection('batches').doc(batch_id);

  return await db.runTransaction(async (t) => {
    const batchDoc = await t.get(batchRef);
    if (!batchDoc.exists) {
      throw new HttpsError('not-found', `Batch ${batch_id} not found`);
    }

    const batch = batchDoc.data()!;

    // Auth check: ensure the calling vendor owns this batch
    if (batch.vendor_id !== vendorId) {
      throw new HttpsError('permission-denied', 'This batch does not belong to you');
    }
    
    if (batch.status === 'ready' || batch.status === 'completed') {
      return { success: false, message: `Batch is already in status: ${batch.status}` };
    }

    // 1. Transition Batch to ready
    t.update(batchRef, {
      status: 'ready',
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Cascade to every non-skipped order in the batch
    const orderIds: string[] = batch.order_ids || [];
    let cascadeCount = 0;

    for (const orderId of orderIds) {
      const orderRef = db.collection('orders').doc(orderId);
      const orderDoc = await t.get(orderRef);
      if (!orderDoc.exists) continue;

      const order = orderDoc.data()!;
      // Only update orders that are in an active state (not skipped/failed/completed)
      const skipStatuses = ['skipped', 'swapped_out', 'failed', 'completed'];
      if (skipStatuses.includes(order.status)) continue;

      t.update(orderRef, {
        status: 'vendor_ready',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Write OrderStatusLog for each order
      const logRef = db.collection('order_status_logs').doc();
      t.set(logRef, {
        id: logRef.id,
        order_id: orderId,
        from_status: order.status,
        to_status: 'vendor_ready',
        actor: vendorId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // 4. Notify the customer that meal prep is complete
      publishEvent(
        'meal_prep_started',
        order.user_id,
        'customer',
        `meal_prep_${orderId}`,
        { mealType: order.meal_type || 'meal' }
      ).catch(e => console.error('[markBatchReady] Failed to publish customer event:', e));

      cascadeCount++;
    }

    return { success: true, message: `Batch marked ready. ${cascadeCount} orders updated to vendor_ready.` };
  });
});

/**
 * Triggers when a subscription document is created OR re-activated.
 * Uses onDocumentWritten because setDoc with a deterministic ID overwrites
 * existing docs (no create event fires on resubscription).
 * Immediately generates 3 days of delivery_orders.
 */
export const onSubscriptionCreated = onDocumentWritten('subscriptions/{subId}', async (event) => {
  const before = event.data?.before;
  const after = event.data?.after;

  if (!after?.exists) return;

  const afterData = after.data();
  if (!afterData || afterData.status !== 'active') return;

  // Only act when status becomes active (new doc or re-activation)
  const beforeData = before?.exists ? before.data() : null;
  if (beforeData && beforeData.status === 'active') return; // Was already active, skip
  const db = admin.firestore();

  const sub = afterData;
  const subId = event.params.subId;

  const [userSnap, vendorSnap] = await Promise.all([
    db.collection('users').doc(sub.user_id).get(),
    db.collection('users').doc(sub.vendor_id).get(),
  ]);

  const user = userSnap.exists ? userSnap.data() : null;
  const vendor = vendorSnap.exists ? vendorSnap.data() : null;

  if (!user || !vendor) {
    console.error(`[onSubscriptionCreated] User or vendor not found for sub ${subId}`);
    return;
  }

  const driversSnap = await db.collection('users').where('role', 'in', ['delivery', 'delivery_agent']).get();
  const driverIds = driversSnap.docs.map(d => d.id);

  const mealTypes = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];
  const userLat = user.location?.lat ?? 18.5204;
  const userLng = user.location?.lng ?? 73.8567;

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istHour = istNow.getUTCHours();

  // First, cancel any existing pending orders for this sub (clean slate on reactivation)
  const existingSnap = await db.collection('delivery_orders')
    .where('subscriptionId', '==', subId)
    .where('status', '==', 'pending')
    .get();
  const cleanBatch = db.batch();
  existingSnap.docs.forEach(d => cleanBatch.delete(d.ref));
  if (!existingSnap.empty) await cleanBatch.commit();

  const batch = db.batch();
  let driverIdx = 0;
  let ordersCreated = 0;

  for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
    for (const mealType of mealTypes) {
      if (dayOffset === 0) {
        if (mealType === 'lunch' && istHour >= 10) continue;
        if (mealType === 'dinner' && istHour >= 19) continue;
      }

      const mealName = mealType === 'dinner' ? 'Dinner' : 'Lunch';
      const scheduledSlot = mealType === 'lunch' ? (user.deliveryPreference || '11am') : '8pm';
      const orderDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      const assignedDriverId = driverIds.length > 0 ? driverIds[driverIdx++ % driverIds.length] : null;
      const otp = String(Math.floor(1000 + Math.random() * 9000));

      const newOrderRef = db.collection('delivery_orders').doc();
      batch.set(newOrderRef, {
        subscriptionId: subId,
        customerId: sub.user_id,
        customerPhone: user.phone || user.phoneNumber || '',
        vendorId: sub.vendor_id,
        vendorPhone: vendor.phone || vendor.phoneNumber || '',
        driverId: assignedDriverId,
        status: 'pending',
        otp,
        otpVerified: false,
        meal: {
          name: `${vendor.kitchen_name || vendor.name}'s ${mealName}`,
          type: mealType,
        },
        address: {
          line1: user.address || `${user.name}'s Location`,
          landmark: '',
          lat: userLat,
          lng: userLng,
        },
        driverLocation: null,
        scheduledSlot,
        timestamps: { preparedAt: null, pickedAt: null, outAt: null, deliveredAt: null },
        createdAt: admin.firestore.Timestamp.fromDate(orderDate),
      });
      ordersCreated++;
    }
  }

  if (ordersCreated > 0) await batch.commit();
  console.log(`[onSubscriptionCreated] Generated ${ordersCreated} delivery orders for sub ${subId}`);
});

/**
 * Triggers when a subscription is updated.
 * If status changes to 'cancelled' → immediately cancel all pending/preparing delivery_orders.
 */
export const onSubscriptionCancelled = onDocumentUpdated('subscriptions/{subId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only act when status transitions to cancelled
  if (before.status === after.status || after.status !== 'cancelled') return;

  const subId = event.params.subId;
  const db = admin.firestore();

  console.log(`[onSubscriptionCancelled] Cancelling future delivery orders for sub ${subId}`);

  // Find all pending/preparing orders for this subscription
  const ordersSnap = await db.collection('delivery_orders')
    .where('subscriptionId', '==', subId)
    .where('status', 'in', ['pending', 'preparing'])
    .get();

  if (ordersSnap.empty) {
    console.log(`[onSubscriptionCancelled] No pending orders found for sub ${subId}`);
    return;
  }

  const batch = db.batch();
  ordersSnap.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'cancelled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  console.log(`[onSubscriptionCancelled] Cancelled ${ordersSnap.size} delivery orders for sub ${subId}`);
});
