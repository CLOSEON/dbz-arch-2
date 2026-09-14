"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
exports.orderPickedUpPayload = orderPickedUpPayload;
exports.orderDeliveredPayload = orderDeliveredPayload;
exports.deliveryFailedPayload = deliveryFailedPayload;
exports.deliveryFailedAdminPayload = deliveryFailedAdminPayload;
const admin = __importStar(require("firebase-admin"));
async function sendPushNotification(userId, payload) {
    const db = admin.firestore();
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists)
            return;
        const userData = userDoc.data();
        let token = userData?.fcmToken;
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
    }
    catch (error) {
        console.error(`[sendPushNotification] Error for user ${userId}:`, error?.code ?? error);
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
function orderPickedUpPayload(orderId) {
    return {
        title: '🛵 Your meal is on its way!',
        body: 'Your delivery agent has picked up your order and is heading to you.',
        data: {
            event: 'order_picked_up',
            orderId,
        },
    };
}
function orderDeliveredPayload(orderId) {
    return {
        title: '✅ Order delivered!',
        body: 'Your meal has been delivered. Bon appétit!',
        data: {
            event: 'order_delivered',
            orderId,
        },
    };
}
function deliveryFailedPayload(orderId, reason) {
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
function deliveryFailedAdminPayload(orderId, reason) {
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
//# sourceMappingURL=notifications.js.map