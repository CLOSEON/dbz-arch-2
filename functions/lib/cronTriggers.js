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
exports.processTimeBasedReminders = void 0;
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
    const ordersSnap = await db.collection('delivery_orders')
        .where('status', 'in', ['pending', 'preparing', 'ready'])
        .get();
    const vendorCounts = new Map();
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        let deliveryDate = new Date();
        if (order.createdAt?.toDate) {
            deliveryDate = order.createdAt.toDate();
        }
        if (order.scheduledSlot === '8am')
            deliveryDate.setHours(8, 0, 0, 0);
        else if (order.scheduledSlot === '11am')
            deliveryDate.setHours(11, 0, 0, 0);
        else if (order.meal?.type === 'lunch')
            deliveryDate.setHours(13, 0, 0, 0);
        else
            deliveryDate.setHours(20, 0, 0, 0);
        if (deliveryDate >= fourHoursFromNow && deliveryDate < fiveHoursFromNow) {
            await (0, events_1.publishEvent)('swap_window_closing', order.customerId, 'customer', `swap_reminder_${doc.id}`, { mealType: order.meal?.name || 'meal' });
            const vId = order.vendorId;
            const slot = order.scheduledSlot || 'unknown';
            const key = `${vId}_${slot}`;
            if (!vendorCounts.has(key)) {
                vendorCounts.set(key, { vendorId: vId, slot, count: 0 });
            }
            vendorCounts.get(key).count++;
        }
        if (deliveryDate >= twelveHoursFromNow && deliveryDate < thirteenHoursFromNow) {
            await (0, events_1.publishEvent)('skip_window_closing', order.customerId, 'customer', `skip_reminder_${doc.id}`, { mealType: order.meal?.name || 'meal' });
        }
    }
    for (const [key, val] of vendorCounts.entries()) {
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        await (0, events_1.publishEvent)('tiffin_count_confirmed', val.vendorId, 'vendor', `tiffin_count_${val.vendorId}_${dateStr}_${val.slot}`, { slot: val.slot, count: val.count });
    }
    console.log(`[processTimeBasedReminders] Hourly cron execution complete.`);
});
//# sourceMappingURL=cronTriggers.js.map