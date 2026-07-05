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
exports.onSystemEventCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const notifications_1 = require("./utils/notifications");
exports.onSystemEventCreated = (0, firestore_1.onDocumentCreated)('system_events/{eventId}', async (eventSnap) => {
    if (!eventSnap.data)
        return;
    const snap = eventSnap.data;
    const event = snap.data();
    const db = admin.firestore();
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
    const userDoc = await db.collection('users').doc(event.recipientId).get();
    if (!userDoc.exists) {
        console.log(`[onSystemEventCreated] Recipient ${event.recipientId} not found.`);
        await snap.ref.update({ processed: true, error: 'User not found' });
        return;
    }
    const userData = userDoc.data() || {};
    const prefs = userData.notificationPreferences || {};
    const criticalEvents = ['meal_delivered', 'delivery_failed', 'rider_new_trip', 'vendor_rider_assigned'];
    if (prefs[event.type] === false && !criticalEvents.includes(event.type)) {
        console.log(`[onSystemEventCreated] Event ${event.type} muted by user ${event.recipientId}.`);
        await snap.ref.update({ processed: true, muted: true });
        return;
    }
    let title = '';
    let body = '';
    const payloadData = { eventType: event.type };
    switch (event.type) {
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
        case 'tiffin_count_confirmed':
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
    await (0, notifications_1.sendPushNotification)(event.recipientId, {
        title,
        body,
        data: payloadData
    });
    await snap.ref.update({ processed: true, processedAt: admin.firestore.FieldValue.serverTimestamp() });
});
//# sourceMappingURL=notificationTriggers.js.map