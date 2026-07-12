import { onDocumentUpdated, onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { publishEvent } from './utils/events';

/**
 * Cloud Function triggered on every updates in a canonical order document.
 * Detects order status updates and dispatches system_events for push alerts.
 */
export const onOrderStatusChange = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before.status === after.status) return;

  const afterStatus = after.status;
  const customerId = after.user_id;
  const orderId = event.params.orderId;

  console.log(`[onOrderStatusChange] Order ${orderId} transitioned: ${before.status} -> ${afterStatus}`);

  try {
    if (afterStatus === 'vendor_notified') {
      await publishEvent('order_confirmed', customerId, 'customer', `confirmed_${orderId}`, {
        mealType: after.meal_type || 'meal',
        slot: after.delivery_slot || 'your requested time'
      });
    } else if (afterStatus === 'vendor_preparing' || afterStatus === 'vendor_ready') {
      // markBatchReady already publishes meal_prep_started when the batch is ready, 
      // but we add this specifically for vendor_preparing if the vendor triggers it manually.
      if (afterStatus === 'vendor_preparing') {
        await publishEvent('meal_prep_started', customerId, 'customer', `prep_${orderId}`, {
          mealType: after.meal_type || 'meal'
        });
      }
    } else if (afterStatus === 'picked_up') {
      await publishEvent('meal_picked_up', customerId, 'customer', `pickup_${orderId}`, {});
    } else if (afterStatus === 'out_for_delivery') {
      await publishEvent('rider_en_route', customerId, 'customer', `enroute_${orderId}`, {});
    } else if (afterStatus === 'delivered') {
      await publishEvent('meal_delivered', customerId, 'customer', `deliv_${orderId}`, {});
    } else if (afterStatus === 'failed') {
      await publishEvent('delivery_failed', customerId, 'customer', `fail_${orderId}`, {
        reason: after.failureReason || 'Unknown error'
      });
    }
  } catch (err) {
    console.error(`[onOrderStatusChange] Failed processing push trigger for ${orderId}:`, err);
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

    const existingSnap = await db.collection('orders')
      .where('created_at', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('created_at', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
      .get();

    existingSnap.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const docData = d.data();
      if (docData.subscription_id) existingSubIds.add(docData.subscription_id);
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

        const newOrderRef = db.collection('orders').doc();
        const todayStr = new Date().toISOString().split('T')[0];
        
        batch.set(newOrderRef, {
          order_id: newOrderRef.id,
          user_id: sub.user_id,
          customer_phone: user.phone || user.phoneNumber || '',
          subscription_id: subId,
          date: todayStr,
          meal_type: mealType,
          delivery_slot: scheduledSlot,
          vendor_id: sub.vendor_id,
          vendor_phone: vendor.phone || vendor.phoneNumber || '',
          batch_id: null,
          delivery_address: {
            line1: user.address || `${user.name}'s Location`,
            lat: userLat,
            lng: userLng,
          },
          status: 'created',
          otp: otp,
          rider_trip_id: null,
          swap_ref: null,
          skip_ref: null,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
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

  const result = await db.runTransaction(async (t) => {
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

    // Fetch all order documents first to satisfy Firestore read-before-write rules
    const orderIds: string[] = batch.order_ids || [];
    const orderDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    
    for (const orderId of orderIds) {
      const orderRef = db.collection('orders').doc(orderId);
      const orderDoc = await t.get(orderRef);
      orderDocs.push(orderDoc);
    }

    // 1. Generate Pickup OTP and Transition Batch to ready
    const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();

    t.update(batchRef, {
      status: 'ready',
      pickup_otp: pickupOTP,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Cascade to every non-skipped order in the batch
    let cascadeCount = 0;

    for (const orderDoc of orderDocs) {
      if (!orderDoc.exists) continue;

      const order = orderDoc.data()!;
      // Only update orders that are in an active state (not skipped/failed/completed)
      const skipStatuses = ['skipped', 'swapped_out', 'failed', 'completed'];
      if (skipStatuses.includes(order.status)) continue;

      t.update(orderDoc.ref, {
        status: 'vendor_ready',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Write OrderStatusLog for each order
      const logRef = db.collection('order_status_logs').doc();
      t.set(logRef, {
        id: logRef.id,
        order_id: orderDoc.id,
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
        `meal_prep_${orderDoc.id}`,
        { mealType: order.meal_type || 'meal' }
      ).catch(e => console.error('[markBatchReady] Failed to publish customer event:', e));

      cascadeCount++;
    }

    return { success: true, message: `Batch marked ready. ${cascadeCount} orders updated to vendor_ready.` };
  });

  // Automatically trigger rider assignment for this vendor now that the batch is ready
  // MUST BE AWAITED so the Cloud Function doesn't suspend before assignment finishes
  try {
    const m = await import('./matchingTriggers');
    await m.coreAssignRiderTrips(vendorId);
  } catch (e) {
    console.error('[markBatchReady] Auto-assign failed:', e);
  }

  return result;
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

/**
 * Generates a mock delivery flow for testing purposes.
 * Hardcodes user, vendor, and rider assignments using specified phone numbers.
 */
export const generateTestDelivery = onCall(async (request) => {
  const { auth } = request;
  if (!auth) throw new HttpsError('unauthenticated', 'Must be authenticated');
  
  // Verify Admin role
  if (auth.token.role !== 'admin') {
    const callerDoc = await admin.firestore().collection('users').doc(auth.uid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Must be an admin to run test delivery flow');
    }
  }

  const db = admin.firestore();

  // Find the required users by phone number
  const findUser = async (phone: string, role: string) => {
    const snap = await db.collection('users').where('phone', '==', phone).limit(1).get();
    if (snap.empty) {
      throw new HttpsError('not-found', `Could not find ${role} with phone ${phone}`);
    }
    return snap.docs[0];
  };

  const [userDoc, vendorDoc, riderDoc] = await Promise.all([
    findUser('+919900990011', 'customer'),
    findUser('+919900990022', 'vendor'),
    findUser('+919900990044', 'rider')
  ]);

  const customerId = userDoc.id;
  const vendorId = vendorDoc.id;
  const riderId = riderDoc.id;

  // Use local timezone string to match the vendor dashboard
  const todayStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

  // Optional: clear existing test trips for today for this vendor/rider to keep it clean
  const existingOrders = await db.collection('orders')
    .where('user_id', '==', customerId)
    .where('date', '==', todayStr)
    .get();
  
  for (const doc of existingOrders.docs) {
    await doc.ref.delete();
  }
  
  // Clear any existing test batches for this vendor to remove stuck ghosts
  const existingBatches = await db.collection('batches')
    .where('vendor_id', '==', vendorId)
    .get();
  
  for (const doc of existingBatches.docs) {
    await doc.ref.delete();
  }

  // Clear any existing test trips for this rider to remove stuck ghosts
  const existingTrips = await db.collection('rider_trips')
    .where('riderId', '==', riderId)
    .get();
  
  for (const doc of existingTrips.docs) {
    await doc.ref.delete();
  }

  const batchId = `TEST_BATCH_${vendorId}_${todayStr}`;
  const tripId = `TEST_TRIP_${riderId}_${todayStr}`;

  const vendorLocation = vendorDoc.data()?.location || { lat: 0, lng: 0 };
  const customerLocation = userDoc.data()?.location || { lat: 0, lng: 0 };
  const customerAddress = userDoc.data()?.address || { line1: 'Test Address' };

  // 1. Create a Pending Order
  const orderRef = db.collection('orders').doc();
  const orderData = {
    id: orderRef.id,
    user_id: customerId,
    vendor_id: vendorId,
    agent_id: riderId,
    rider_trip_id: tripId,
    // Add camelCase variants for frontend components that expect DeliveryOrder format
    driverId: riderId,
    customerId: customerId,
    vendorId: vendorId,
    address: customerAddress,
    date: todayStr,
    status: 'vendor_ready', // Let's skip directly to ready for pickup
    delivery_slot: '11am',
    meal_type: 'lunch',
    otp: Math.floor(1000 + Math.random() * 9000).toString(),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  await orderRef.set(orderData);

  // 2. Create the Batch
  const batchRef = db.collection('batches').doc(batchId);
  const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();

  const batchData = {
    id: batchId,
    vendor_id: vendorId,
    date: todayStr,
    slot: '11am',
    order_ids: [orderRef.id],
    status: 'ready',
    pickup_otp: pickupOTP,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  await batchRef.set(batchData);

  // 3. Create the Rider Trip assignment
  const tripRef = db.collection('rider_trips').doc(tripId);

  const tripData = {
    id: tripId,
    riderId: riderId,
    batch_ids: [batchId],
    assignedOrderIds: [orderRef.id],
    vendorIds: [vendorId],
    status: 'pickup_pending',
    pickupStops: [
      {
        vendorId: vendorId,
        vendorPhone: vendorDoc.data()?.phone,
        location: vendorLocation,
        sequence: 1,
        distanceKm: 0,
        status: 'pending',
        pickupOTP: pickupOTP
      }
    ],
    dropoffStops: [
      {
        orderId: orderRef.id,
        customerId: customerId,
        address: 'Test Customer Address',
        status: 'pending',
        lat: 21.1500,
        lng: 79.0900
      }
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await tripRef.set(tripData);

  // 4. Update the Batch to show it's assigned
  await batchRef.update({
    status: 'ready', // vendor is waiting for rider to pick up
    agent_id: riderId
  });

  return { 
    success: true, 
    orderId: orderRef.id, 
    batchId: batchId, 
    tripId: tripId,
    message: 'Test delivery flow successfully generated!'
  };
});
