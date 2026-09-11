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
exports.dispatchRetryAndExpansion = exports.checkStuckOrders = exports.processBatchSkipUpdates = exports.formBatches = exports.getISTDateString = exports.processTimeBasedReminders = void 0;
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
        if (!order.date)
            continue;
        const normSlot = (order.delivery_slot || order.scheduledSlot || '').toLowerCase();
        let slotHour = 13;
        if (normSlot === '8am' || normSlot === 'breakfast')
            slotHour = 8;
        else if (normSlot === '11am' || normSlot === 'lunch')
            slotHour = 11;
        else if (normSlot === '8pm' || normSlot === 'dinner')
            slotHour = 20;
        const deliveryDate = new Date(`${order.date}T${String(slotHour).padStart(2, '0')}:00:00+05:30`);
        if (isNaN(deliveryDate.getTime()))
            continue;
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
        if (!batch.date)
            continue;
        const normSlot = (batch.slot || '').toLowerCase();
        let slotHour = 13;
        if (normSlot === '8am' || normSlot === 'breakfast')
            slotHour = 8;
        else if (normSlot === '11am' || normSlot === 'lunch')
            slotHour = 11;
        else if (normSlot === '8pm' || normSlot === 'dinner')
            slotHour = 20;
        const deliveryDate = new Date(`${batch.date}T${String(slotHour).padStart(2, '0')}:00:00+05:30`);
        if (isNaN(deliveryDate.getTime()))
            continue;
        if (deliveryDate >= oneHourFromNow && deliveryDate < twoHoursFromNow) {
            await (0, events_1.publishEvent)('vendor_prep_deadline_approaching', batch.vendor_id, 'vendor', `prep_deadline_${batchDoc.id}`, { slot: batch.slot, batch_id: batchDoc.id, count: batch.total_count });
        }
    }
    console.log(`[processTimeBasedReminders] Hourly cron execution complete.`);
});
const getISTDateString = (d = new Date()) => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    return new Date(d.getTime() + istOffsetMs).toISOString().split('T')[0];
};
exports.getISTDateString = getISTDateString;
async function processSlotBatches(db, targetDateStr, targetSlot, slotAliases) {
    const pendingSwapsSnap = await db.collection('swap_requests').where('status', '==', 'broadcasted').get();
    const swapPromises = pendingSwapsSnap.docs.map(async (swapDoc) => {
        const swap = swapDoc.data();
        if (swap.order_id) {
            const orderDoc = await db.collection('orders').doc(swap.order_id).get();
            if (orderDoc.exists) {
                const order = orderDoc.data();
                if (order.date === targetDateStr && (order.delivery_slot === targetSlot || slotAliases.includes(order.delivery_slot))) {
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
    });
    await Promise.all(swapPromises);
    const ordersSnap = await db.collection('orders')
        .where('date', '==', targetDateStr)
        .where('status', 'in', ['created', 'pending'])
        .get();
    const vendorOrders = new Map();
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        const orderSlot = (order.delivery_slot || order.scheduledSlot || '').toLowerCase();
        const isMatchingSlot = orderSlot === targetSlot || slotAliases.includes(orderSlot);
        if (isMatchingSlot && (!order.batch_id || order.batch_id.trim() === '')) {
            const vId = order.vendor_id || order.vendorId;
            if (vId) {
                if (!vendorOrders.has(vId))
                    vendorOrders.set(vId, []);
                vendorOrders.get(vId).push(doc);
            }
        }
    }
    for (const [vendorId, docs] of vendorOrders.entries()) {
        const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot}`;
        const orderIds = docs.map(d => d.id);
        const batchRef = db.collection('batches').doc(batchId);
        let isNewBatch = false;
        await db.runTransaction(async (transaction) => {
            const batchDoc = await transaction.get(batchRef);
            if (batchDoc.exists) {
                const existingData = batchDoc.data();
                const existingOrderIds = existingData.order_ids || [];
                const newOrderIds = orderIds.filter(id => !existingOrderIds.includes(id));
                if (newOrderIds.length > 0) {
                    const combinedIds = [...existingOrderIds, ...newOrderIds];
                    transaction.update(batchRef, {
                        order_ids: combinedIds,
                        total_count: combinedIds.length,
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                    for (const d of docs.filter(doc => newOrderIds.includes(doc.id))) {
                        transaction.update(d.ref, {
                            batch_id: batchId,
                            delivery_slot: targetSlot,
                            status: existingData.status === 'ready' ? 'vendor_ready' : 'vendor_notified',
                            updated_at: admin.firestore.FieldValue.serverTimestamp()
                        });
                        const logRef = db.collection('order_status_logs').doc();
                        transaction.set(logRef, {
                            id: logRef.id,
                            order_id: d.id,
                            from_status: d.data().status,
                            to_status: existingData.status === 'ready' ? 'vendor_ready' : 'vendor_notified',
                            actor: 'system_batcher_catchup',
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }
            else {
                isNewBatch = true;
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
                        delivery_slot: targetSlot,
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
            }
        });
        if (isNewBatch) {
            await (0, events_1.publishEvent)('batch_created', vendorId, 'vendor', `batch_created_${batchId}`, { slot: targetSlot, count: orderIds.length, batch_id: batchId });
        }
    }
    return vendorOrders.size;
}
exports.formBatches = (0, scheduler_1.onSchedule)({
    schedule: '0 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const todayDateStr = istNow.toISOString().split('T')[0];
    const currentHourIST = istNow.getUTCHours();
    const istTarget = new Date(now.getTime() + (4 * 60 * 60 * 1000) + istOffsetMs);
    const targetDateStr = istTarget.toISOString().split('T')[0];
    const targetHour = istTarget.getUTCHours();
    let targetSlot = '';
    let slotAliases = [];
    if (targetHour === 8) {
        targetSlot = '8am';
        slotAliases = ['8am', 'breakfast', '8'];
    }
    else if (targetHour === 11) {
        targetSlot = '11am';
        slotAliases = ['11am', 'lunch', '1pm', '13'];
    }
    else if (targetHour === 20) {
        targetSlot = '8pm';
        slotAliases = ['8pm', 'dinner', '20'];
    }
    let totalBatchesProcessed = 0;
    if (targetSlot) {
        console.log(`[formBatches] 4-Hour advance batching for IST date: ${targetDateStr}, slot: ${targetSlot} (hour: ${targetHour})`);
        const count = await processSlotBatches(db, targetDateStr, targetSlot, slotAliases);
        totalBatchesProcessed += count;
    }
    const todaySlots = [
        { slot: '8am', aliases: ['8am', 'breakfast', '8'], cutoffHour: 9 },
        { slot: '11am', aliases: ['11am', 'lunch', '1pm', '13'], cutoffHour: 13 },
        { slot: '8pm', aliases: ['8pm', 'dinner', '20'], cutoffHour: 21 },
    ];
    for (const s of todaySlots) {
        if (currentHourIST <= s.cutoffHour && !(targetDateStr === todayDateStr && targetSlot === s.slot)) {
            const catchupCount = await processSlotBatches(db, todayDateStr, s.slot, s.aliases);
            if (catchupCount > 0) {
                console.log(`[formBatches] Catch-up batching added orders to ${catchupCount} batches for slot ${s.slot} today.`);
                totalBatchesProcessed += catchupCount;
            }
        }
    }
    console.log(`[formBatches] Total batches processed: ${totalBatchesProcessed}.`);
});
exports.processBatchSkipUpdates = (0, scheduler_1.onSchedule)({
    schedule: '*/15 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const todayStr = (0, exports.getISTDateString)(now);
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
exports.checkStuckOrders = (0, scheduler_1.onSchedule)({
    schedule: '*/30 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStr = (0, exports.getISTDateString)(now);
    const statusesToCheck = ['vendor_preparing', 'picked_up', 'out_for_delivery'];
    const ordersSnap = await db.collection('orders')
        .where('date', '==', todayStr)
        .where('status', 'in', statusesToCheck)
        .get();
    let stuckCount = 0;
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        let isStuck = false;
        if (order.updated_at && order.updated_at.toDate) {
            if (order.updated_at.toDate() < oneHourAgo) {
                isStuck = true;
            }
        }
        else if (order.updated_at && typeof order.updated_at.seconds === 'number') {
            if (order.updated_at.seconds * 1000 < oneHourAgo.getTime()) {
                isStuck = true;
            }
        }
        if (isStuck) {
            await (0, events_1.publishEvent)('delivery_failed', order.user_id, 'customer', `stuck_order_alert_${doc.id}_${now.getTime()}`, {
                order_id: doc.id,
                status: order.status,
                message: `Order has been stuck in ${order.status} for > 1 hour. Immediate admin review required.`
            });
            stuckCount++;
        }
    }
    console.log(`[checkStuckOrders] Found and alerted on ${stuckCount} stuck orders.`);
});
exports.dispatchRetryAndExpansion = (0, scheduler_1.onSchedule)({
    schedule: '*/5 * * * *',
    timeZone: 'Asia/Kolkata'
}, async (event) => {
    const db = admin.firestore();
    const todayStr = (0, exports.getISTDateString)();
    const batchesSnap = await db.collection('batches')
        .where('date', '==', todayStr)
        .get();
    for (const doc of batchesSnap.docs) {
        const batch = doc.data();
        const unassignedOrdersSnap = await db.collection('orders')
            .where('vendor_id', '==', batch.vendor_id)
            .where('delivery_slot', '==', batch.slot)
            .where('status', '==', 'vendor_ready')
            .get();
        const unassignedOrders = unassignedOrdersSnap.docs.filter(d => !d.data().rider_trip_id);
        if (unassignedOrders.length === 0)
            continue;
        let dispatch_attempts = batch.dispatch_attempts || 0;
        const current_radius = 2.0;
        dispatch_attempts += 1;
        await doc.ref.update({
            dispatch_attempts,
            current_radius,
            dispatch_started_at: batch.dispatch_started_at || admin.firestore.FieldValue.serverTimestamp()
        });
        const { coreAssignRiderTrips } = await Promise.resolve().then(() => __importStar(require('./matchingTriggers')));
        await coreAssignRiderTrips(batch.vendor_id, batch.slot, current_radius, doc.id);
        if (dispatch_attempts >= 3) {
            const checkSnap = await db.collection('orders')
                .where('vendor_id', '==', batch.vendor_id)
                .where('delivery_slot', '==', batch.slot)
                .where('status', '==', 'vendor_ready')
                .get();
            const stillUnassigned = checkSnap.docs.filter(d => !d.data().rider_trip_id);
            if (stillUnassigned.length > 0) {
                await (0, events_1.publishEvent)('delivery_failed', batch.vendor_id, 'vendor', `zero_riders_escalation_${doc.id}_${Date.now()}`, {
                    batch_id: doc.id,
                    vendor_id: batch.vendor_id,
                    message: `URGENT: No riders found for vendor ${batch.vendor_id} after 6km expansion.`
                });
            }
        }
    }
});
//# sourceMappingURL=cronTriggers.js.map