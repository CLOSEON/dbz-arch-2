import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  sendPushNotification,
  orderPickedUpPayload,
  orderDeliveredPayload,
  deliveryFailedPayload,
  deliveryFailedAdminPayload,
} from './utils/notifications';

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
      
      const eta = afterData.meal?.type === 'lunch' ? '1:30 PM' : '8:30 PM';

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
      await sendPushNotification(customerId, orderPickedUpPayload(orderId));

    } else if (newStatus === 'delivered') {
      // Customer: order delivered
      await sendPushNotification(customerId, orderDeliveredPayload(orderId));

    } else if (newStatus === 'failed_attempt') {
      // Customer: delivery attempt failed
      await sendPushNotification(customerId, deliveryFailedPayload(orderId, reason ?? ''));

      // All admins: alert for manual follow-up
      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      await Promise.all(
        adminSnap.docs.map((adminDoc) =>
          sendPushNotification(adminDoc.id, deliveryFailedAdminPayload(orderId, reason ?? ''))
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
export const generateTodayDeliveries = onCall(async (request) => {
  const { auth } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  if (auth.token.role !== 'admin') {
    // Fallback: check Firestore users collection
    const userDoc = await admin.firestore().collection('users').doc(auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Must be an admin to generate orders');
    }
  }

  const db = admin.firestore();
  const result = { created: 0, skipped: 0, errors: 0, details: [] as any[] };

  // Fetch active drivers to assign orders to
  const driversSnap = await db.collection('users').where('role', 'in', ['delivery', 'delivery_agent']).get();
  const driverIds = driversSnap.docs.map(d => d.id);
  let currentDriverIndex = 0;

  // 1. Fetch all active subscriptions
  const subsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();

  if (subsSnap.empty) return result;

  // 2. Fetch today's already-existing delivery_orders
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const existingSnap = await db.collection('delivery_orders')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
    .get();

  const existingSubIds = new Set<string>();
  existingSnap.forEach(d => {
    const data = d.data();
    if (data.subscriptionId) existingSubIds.add(data.subscriptionId);
  });

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

      const mealTypeMap: Record<string, string> = {
        lunch: 'Lunch',
        dinner: 'Dinner',
        both: 'Lunch + Dinner',
      };
      const mealName = mealTypeMap[sub.meal_type] || sub.meal_type || 'Daily Meal';
      const mealType = sub.meal_type === 'dinner' ? 'dinner' : 'lunch';

      const userLat = user.location?.lat ?? 18.5204;
      const userLng = user.location?.lng ?? 73.8567;
      const otp = String(Math.floor(1000 + Math.random() * 9000));

      const assignedDriverId = driverIds.length > 0 ? driverIds[currentDriverIndex++ % driverIds.length] : null;

      const newOrderRef = db.collection('delivery_orders').doc();
      batch.set(newOrderRef, {
        subscriptionId: subId,
        customerId: sub.user_id,
        vendorId: sub.vendor_id,
        driverId: assignedDriverId,
        status: 'preparing',
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
        timestamps: {
          preparedAt: null,
          pickedAt: null,
          outAt: null,
          deliveredAt: null,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      batchCount++;
      result.created++;
      result.details.push({ subId, userName: user.name || sub.user_id, status: 'created' });

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
});
