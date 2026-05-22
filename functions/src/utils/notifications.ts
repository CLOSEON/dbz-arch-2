import * as admin from 'firebase-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  /** All values must be strings — FCM data payload requirement. */
  data?: Record<string, string>;
}

// ─── Core Helper ─────────────────────────────────────────────────────────────

/**
 * Sends a push notification to a single user identified by their Firestore UID.
 *
 * Strategy:
 *  1. Reads the user document to retrieve the stored FCM token.
 *  2. Sends the message via `admin.messaging().send()`.
 *  3. On `messaging/registration-token-not-registered` or
 *     `messaging/invalid-registration-token`, clears the stale token from
 *     Firestore so it is never retried.
 *
 * Intentionally non-throwing — a failed notification must never roll back a
 * business-critical Firestore transaction.
 */
export async function sendPushNotification(userId: string, payload: NotificationPayload): Promise<void> {
  const db = admin.firestore();

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data();

    // Prefer the canonical fcmToken field; fall back to legacy push_tokens array.
    let token: string | undefined = userData?.fcmToken;
    if (!token && Array.isArray(userData?.push_tokens) && userData.push_tokens.length > 0) {
      token = userData.push_tokens[0];
    }

    if (!token) {
      console.log(`[sendPushNotification] No FCM token for user ${userId}. Skipping.`);
      return;
    }

    await admin.messaging().send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
    });

    console.log(`[sendPushNotification] Sent "${payload.title}" to user ${userId}.`);

  } catch (error: any) {
    console.error(`[sendPushNotification] Error for user ${userId}:`, error?.code ?? error);

    // Stale / deregistered token — clear it so we don't retry on every call.
    const staleTokenCodes = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ];
    if (staleTokenCodes.includes(error?.code)) {
      console.log(`[sendPushNotification] Clearing stale token for user ${userId}.`);
      await db.collection('users').doc(userId).update({
        fcmToken: admin.firestore.FieldValue.delete(),
        push_tokens: admin.firestore.FieldValue.delete(),
      });
    }
  }
}

// ─── Delivery Event Payloads ──────────────────────────────────────────────────

/**
 * Payload sent to the customer when an agent picks up their order.
 * @param orderId - The delivery order ID for deep-linking in the client app.
 */
export function orderPickedUpPayload(orderId: string): NotificationPayload {
  return {
    title: '🛵 Your meal is on its way!',
    body: 'Your delivery agent has picked up your order and is heading to you.',
    data: {
      event: 'order_picked_up',
      orderId,
    },
  };
}

/**
 * Payload sent to the customer when their order is delivered successfully.
 * @param orderId - The delivery order ID for deep-linking in the client app.
 */
export function orderDeliveredPayload(orderId: string): NotificationPayload {
  return {
    title: '✅ Order delivered!',
    body: 'Your meal has been delivered. Bon appétit!',
    data: {
      event: 'order_delivered',
      orderId,
    },
  };
}

/**
 * Payload sent to the customer when a delivery attempt fails.
 * @param orderId - The delivery order ID for deep-linking in the client app.
 * @param reason  - The agent-provided reason for the failed attempt.
 */
export function deliveryFailedPayload(orderId: string, reason: string): NotificationPayload {
  return {
    title: '⚠️ Delivery attempt failed',
    body: reason ? `Reason: ${reason}` : 'Your delivery agent was unable to complete the delivery.',
    data: {
      event: 'delivery_failed',
      orderId,
      reason,
    },
  };
}

/**
 * Payload sent to admin users when a delivery attempt fails,
 * so they can manually follow up with the agent or customer.
 * @param orderId - The failed delivery order ID.
 * @param reason  - The agent-provided reason.
 */
export function deliveryFailedAdminPayload(orderId: string, reason: string): NotificationPayload {
  return {
    title: '🚨 Delivery Failed Alert',
    body: `Order ${orderId.slice(-6)} could not be delivered. Reason: ${reason}`,
    data: {
      event: 'delivery_failed_admin',
      orderId,
      reason,
    },
  };
}
