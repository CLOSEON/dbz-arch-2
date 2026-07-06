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
exports.processBatchSkipUpdates = exports.formBatches = exports.processTimeBasedReminders = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const events_1 = require("./utils/events");
exports.processTimeBasedReminders = (0, scheduler_1.onSchedule)({
    schedule: '0 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const thirteenHoursFromNow = new Date(now.getTime() + 13 * 60 * 60 * 1000);
    const ordersSnap = await db.collection('orders')
        .where('status', 'in', ['created', 'vendor_notified', 'vendor_preparing', 'vendor_ready'])
        .get();
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        const [year, month, day] = order.date.split('-').map(Number);
        let deliveryDate = new Date(year, month - 1, day);
        if (order.delivery_slot === '8am')
            deliveryDate.setHours(8, 0, 0, 0);
        else if (order.delivery_slot === '11am')
            deliveryDate.setHours(11, 0, 0, 0);
        else if (order.delivery_slot === '8pm')
            deliveryDate.setHours(20, 0, 0, 0);
        else
            deliveryDate.setHours(13, 0, 0, 0);
        if (deliveryDate >= fourHoursFromNow && deliveryDate < fiveHoursFromNow) {
            await (0, events_1.publishEvent)('swap_window_closing', order.user_id, 'customer', `swap_reminder_${doc.id}`, { mealType: order.meal_type || 'meal' });
        }
        if (deliveryDate >= twelveHoursFromNow && deliveryDate < thirteenHoursFromNow) {
            await (0, events_1.publishEvent)('skip_window_closing', order.user_id, 'customer', `skip_reminder_${doc.id}`, { mealType: order.meal_type || 'meal' });
        }
    }
    const oneHourFromNow = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const batchesSnap = await db.collection('batches')
        .where('status', 'in', ['notified', 'preparing'])
        .get();
    for (const batchDoc of batchesSnap.docs) {
        const batch = batchDoc.data();
        const [year, month, day] = batch.date.split('-').map(Number);
        let deliveryDate = new Date(year, month - 1, day);
        if (batch.slot === '8am')
            deliveryDate.setHours(8, 0, 0, 0);
        else if (batch.slot === '11am')
            deliveryDate.setHours(11, 0, 0, 0);
        else if (batch.slot === '8pm')
            deliveryDate.setHours(20, 0, 0, 0);
        if (deliveryDate >= oneHourFromNow && deliveryDate < twoHoursFromNow) {
            await (0, events_1.publishEvent)('vendor_prep_deadline_approaching', batch.vendor_id, 'vendor', `prep_deadline_${batchDoc.id}`, { slot: batch.slot, batch_id: batchDoc.id, count: batch.total_count });
        }
    }
    console.log(`[processTimeBasedReminders] Hourly cron execution complete.`);
});
exports.formBatches = (0, scheduler_1.onSchedule)({
    schedule: '0 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const targetDate = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const targetHour = targetDate.getHours();
    let targetSlot = '';
    if (targetHour === 8)
        targetSlot = '8am';
    else if (targetHour === 11)
        targetSlot = '11am';
    else if (targetHour === 20)
        targetSlot = '8pm';
    if (!targetSlot) {
        console.log(`[formBatches] No slot aligned with target hour ${targetHour}. Skipping.`);
        return;
    }
    console.log(`[formBatches] Forming batches for date: ${targetDateStr}, slot: ${targetSlot}`);
    const pendingSwapsSnap = await db.collection('swap_requests').where('status', '==', 'broadcasted').get();
    for (const swapDoc of pendingSwapsSnap.docs) {
        const swap = swapDoc.data();
        if (swap.order_id) {
            const orderDoc = await db.collection('orders').doc(swap.order_id).get();
            if (orderDoc.exists) {
                const order = orderDoc.data();
                if (order.date === targetDateStr && order.delivery_slot === targetSlot) {
                    await swapDoc.ref.update({ status: 'expired' });
                    const broadcastsSnap = await db.collection('swap_broadcasts')
                        .where('swap_request_id', '==', swapDoc.id)
                        .where('response', '==', 'pending')
                        .get();
                    if (!broadcastsSnap.empty) {
                        const bBatch = db.batch();
                        broadcastsSnap.docs.forEach(b => bBatch.update(b.ref, { response: 'expired' }));
                        await bBatch.commit();
                    }
                }
            }
        }
    }
    const ordersSnap = await db.collection('orders')
        .where('date', '==', targetDateStr)
        .where('delivery_slot', '==', targetSlot)
        .where('status', '==', 'created')
        .get();
    const vendorOrders = new Map();
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        if (order.vendor_id) {
            if (!vendorOrders.has(order.vendor_id))
                vendorOrders.set(order.vendor_id, []);
            vendorOrders.get(order.vendor_id).push(doc);
        }
    }
    for (const [vendorId, docs] of vendorOrders.entries()) {
        const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot}`;
        const orderIds = docs.map(d => d.id);
        const batchRef = db.collection('batches').doc(batchId);
        await db.runTransaction(async (transaction) => {
            const batchDoc = await transaction.get(batchRef);
            if (batchDoc.exists)
                return;
            transaction.set(batchRef, {
                id: batchId,
                vendor_id: vendorId,
                date: targetDateStr,
                slot: targetSlot,
                order_ids: orderIds,
                status: 'notified',
                total_count: orderIds.length,
                last_notified_count: orderIds.length,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            for (const d of docs) {
                transaction.update(d.ref, {
                    batch_id: batchId,
                    status: 'vendor_notified',
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                });
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
        await (0, events_1.publishEvent)('batch_created', vendorId, 'vendor', `batch_created_${batchId}`, { slot: targetSlot, count: orderIds.length, batch_id: batchId });
    }
    console.log(`[formBatches] Processed ${vendorOrders.size} batches.`);
});
exports.processBatchSkipUpdates = (0, scheduler_1.onSchedule)({
    schedule: '*/15 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const batchesSnap = await db.collection('batches')
        .where('date', '==', todayStr)
        .where('status', 'in', ['notified', 'preparing'])
        .get();
    let notifiedCount = 0;
    for (const batchDoc of batchesSnap.docs) {
        const batch = batchDoc.data();
        if (batch.total_count < batch.last_notified_count) {
            await (0, events_1.publishEvent)('batch_count_updated', batch.vendor_id, 'vendor', `batch_count_update_${batchDoc.id}_${Date.now()}`, { slot: batch.slot, new_count: batch.total_count, batch_id: batchDoc.id });
            await batchDoc.ref.update({
                last_notified_count: batch.total_count,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            notifiedCount++;
        }
    }
    console.log(`[processBatchSkipUpdates] Notified ${notifiedCount} vendors of updated counts.`);
});
//# sourceMappingURL=cronTriggers.js.map