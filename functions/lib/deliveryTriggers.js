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
exports.generateTodayDeliveries = exports.updateDeliveryStatus = exports.onDeliveryStatusChange = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const notifications_1 = require("./utils/notifications");
exports.onDeliveryStatusChange = (0, firestore_1.onDocumentUpdated)('delivery_orders/{orderId}', async (event) => {
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
            const vendorSnap = await db.collection('users').doc(vendorId).get();
            const vendorName = vendorSnap.exists
                ? (vendorSnap.data()?.name || 'Dabzo Partner Kitchen')
                : 'Dabzo Partner Kitchen';
            const eta = afterData.meal?.type === 'lunch' ? '1:30 PM' : '8:30 PM';
            await sendFCMToUser(customerId, {
                title: 'Your tiffin is on the way!',
                body: `Picked up from ${vendorName}. Estimated delivery: ${eta}`,
            });
        }
        else if (afterStatus === 'out_for_delivery') {
            const otp = afterData.otp || '0000';
            await sendFCMToUser(customerId, {
                title: 'Driver is nearby',
                body: `Your OTP is ${otp}. Show it to confirm delivery.`,
            });
        }
        else if (afterStatus === 'delivered') {
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
        }
        else if (afterStatus === 'failed') {
            const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
            const adminTokens = [];
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
    }
    catch (err) {
        console.error(`[onDeliveryStatusChange] Failed processing push trigger for ${orderId}:`, err);
    }
    async function sendFCMToUser(uid, payload) {
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) {
            console.log(`[onDeliveryStatusChange] User profile not found: ${uid}`);
            return;
        }
        const userData = userSnap.data();
        const tokens = [];
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
    async function sendMulticastFCM(tokens, payload) {
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
        }
        catch (e) {
            console.error('[onDeliveryStatusChange] Messaging payload transmission failure:', e);
        }
    }
});
exports.updateDeliveryStatus = (0, https_1.onCall)(async (request) => {
    const { data, auth } = request;
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    if (auth.token.role !== 'delivery_agent' && auth.token.role !== 'delivery') {
        throw new https_1.HttpsError('permission-denied', 'Must be a delivery agent to update status');
    }
    const { orderId, status, reason } = data;
    if (!orderId || !status) {
        throw new https_1.HttpsError('invalid-argument', 'Missing orderId or status');
    }
    const db = admin.firestore();
    const deliveryRef = db.collection('deliveries').doc(orderId);
    const transitionResult = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(deliveryRef);
        if (!docSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Delivery order not found');
        }
        const deliveryData = docSnap.data();
        if (deliveryData.agentId !== auth.uid) {
            throw new https_1.HttpsError('permission-denied', 'You are not assigned to this delivery');
        }
        const currentStatus = deliveryData.status;
        if (status === 'picked_up' && currentStatus !== 'pending') {
            throw new https_1.HttpsError('failed-precondition', 'Can only transition to picked_up from pending');
        }
        if (status === 'delivered' && currentStatus !== 'picked_up') {
            throw new https_1.HttpsError('failed-precondition', 'Can only transition to delivered from picked_up');
        }
        if (status === 'failed_attempt' && currentStatus !== 'picked_up') {
            throw new https_1.HttpsError('failed-precondition', 'Can only transition to failed_attempt from picked_up');
        }
        if (status === 'failed_attempt' && (!reason || reason.trim() === '')) {
            throw new https_1.HttpsError('invalid-argument', 'Must provide a non-empty reason when setting status to failed_attempt');
        }
        const updatePayload = {
            status,
            statusHistory: admin.firestore.FieldValue.arrayUnion({
                status,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                agentId: auth.uid
            })
        };
        if (status === 'delivered') {
            updatePayload.delivered_at = admin.firestore.FieldValue.serverTimestamp();
        }
        else if (status === 'failed_attempt') {
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
    try {
        const { customerId, newStatus, reason } = transitionResult;
        if (newStatus === 'picked_up') {
            await (0, notifications_1.sendPushNotification)(customerId, (0, notifications_1.orderPickedUpPayload)(orderId));
        }
        else if (newStatus === 'delivered') {
            await (0, notifications_1.sendPushNotification)(customerId, (0, notifications_1.orderDeliveredPayload)(orderId));
        }
        else if (newStatus === 'failed_attempt') {
            await (0, notifications_1.sendPushNotification)(customerId, (0, notifications_1.deliveryFailedPayload)(orderId, reason ?? ''));
            const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
            await Promise.all(adminSnap.docs.map((adminDoc) => (0, notifications_1.sendPushNotification)(adminDoc.id, (0, notifications_1.deliveryFailedAdminPayload)(orderId, reason ?? ''))));
        }
    }
    catch (error) {
        console.error(`[updateDeliveryStatus] Push notification error for order ${orderId}:`, error);
    }
    return {
        success: true,
        newStatus: transitionResult.newStatus,
        message: `Successfully updated order status to ${transitionResult.newStatus}`
    };
});
exports.generateTodayDeliveries = (0, https_1.onCall)(async (request) => {
    const { auth } = request;
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    if (auth.token.role !== 'admin') {
        const userDoc = await admin.firestore().collection('users').doc(auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
            throw new https_1.HttpsError('permission-denied', 'Must be an admin to generate orders');
        }
    }
    const db = admin.firestore();
    const result = { created: 0, skipped: 0, errors: 0, details: [] };
    const driversSnap = await db.collection('users').where('role', 'in', ['delivery', 'delivery_agent']).get();
    const driverIds = driversSnap.docs.map(d => d.id);
    let currentDriverIndex = 0;
    const subsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();
    if (subsSnap.empty)
        return result;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const existingSnap = await db.collection('delivery_orders')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
        .get();
    const existingSubIds = new Set();
    existingSnap.forEach(d => {
        const data = d.data();
        if (data.subscriptionId)
            existingSubIds.add(data.subscriptionId);
    });
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
            const mealTypeMap = {
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
        }
        catch (err) {
            result.errors++;
            result.details.push({ subId, userName: sub.user_id, status: 'error', reason: err.message || 'Unknown error' });
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
    return result;
});
//# sourceMappingURL=deliveryTriggers.js.map