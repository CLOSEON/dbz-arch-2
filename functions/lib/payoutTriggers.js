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
exports.onDeliveryCompletedPayout = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
exports.onDeliveryCompletedPayout = (0, firestore_1.onDocumentUpdated)('deliveries/{orderId}', async (event) => {
    const change = event.data;
    if (!change) {
        console.log('[onDeliveryCompletedPayout] No data change payload — skipping.');
        return;
    }
    const beforeData = change.before.data();
    const afterData = change.after.data();
    if (!beforeData || !afterData) {
        console.log('[onDeliveryCompletedPayout] Missing before/after data — skipping.');
        return;
    }
    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;
    if (beforeStatus === 'delivered' || afterStatus !== 'delivered') {
        console.log(`[onDeliveryCompletedPayout] Skipping — transition ${beforeStatus} → ${afterStatus} is not a delivery completion.`);
        return;
    }
    const orderId = event.params.orderId;
    const agentId = afterData.agentId;
    if (!agentId) {
        console.error(`[onDeliveryCompletedPayout] Delivery ${orderId} has no agentId. Cannot create payout.`);
        return;
    }
    const db = admin.firestore();
    const PAYOUT_AMOUNT = 40;
    console.log(`[onDeliveryCompletedPayout] Delivery ${orderId} completed by agent ${agentId}. Creating payout of ₹${PAYOUT_AMOUNT}.`);
    try {
        const payoutRef = db.collection('agent_payouts').doc();
        const agentUserRef = db.collection('users').doc(agentId);
        const payoutRecord = {
            agentId,
            deliveryId: orderId,
            amount: PAYOUT_AMOUNT,
            date: admin.firestore.Timestamp.now(),
            status: 'pending',
        };
        const batch = db.batch();
        batch.set(payoutRef, payoutRecord);
        batch.update(agentUserRef, {
            daily_earnings: admin.firestore.FieldValue.increment(PAYOUT_AMOUNT),
        });
        await batch.commit();
        console.log(`[onDeliveryCompletedPayout] Payout ${payoutRef.id} created and daily_earnings incremented for agent ${agentId}.`);
    }
    catch (err) {
        console.error(`[onDeliveryCompletedPayout] Failed to create payout for delivery ${orderId}:`, err);
    }
});
//# sourceMappingURL=payoutTriggers.js.map