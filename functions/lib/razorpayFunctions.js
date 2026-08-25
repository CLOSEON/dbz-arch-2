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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.razorpayApi = exports.verifyRazorpayPayment = exports.createRazorpayOrder = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const razorpay_1 = __importDefault(require("razorpay"));
function getRazorpayInstance() {
    const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'NMgeawXrZfgjKJfwu06iGl1X';
    if (!key_id || !key_secret) {
        throw new https_1.HttpsError('failed-precondition', 'Razorpay credentials not configured.');
    }
    return new razorpay_1.default({
        key_id,
        key_secret,
    });
}
function getKeySecret() {
    return process.env.RAZORPAY_KEY_SECRET || 'NMgeawXrZfgjKJfwu06iGl1X';
}
exports.createRazorpayOrder = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    const data = request.data || {};
    const amount = Number(data.amount);
    const currency = typeof data.currency === 'string' ? data.currency : 'INR';
    const receipt = typeof data.receipt === 'string' ? data.receipt : `rcpt_${Date.now()}`;
    const notes = data.notes && typeof data.notes === 'object' ? data.notes : {};
    const vendorId = data.vendor_id || notes.vendor_id;
    if (!amount || amount < 100 || amount > 50000000) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid amount. Must be between ₹1 and ₹500,000.');
    }
    const orderPayload = {
        amount,
        currency,
        receipt: receipt.slice(0, 40),
        notes,
    };
    if (typeof vendorId === 'string') {
        try {
            const vendorSnap = await admin.firestore().collection('users').doc(vendorId).get();
            const vendorData = vendorSnap.data();
            if (vendorData?.rzp_account_id) {
                const platformFeePct = vendorData.platform_fee_pct ?? 10;
                const vendorTransferAmount = Math.floor(amount * (1 - (platformFeePct / 100)));
                orderPayload.transfers = [
                    {
                        account: vendorData.rzp_account_id,
                        amount: vendorTransferAmount,
                        currency: 'INR',
                        notes: {
                            name: vendorData.kitchen_name || vendorData.name || 'Vendor',
                            type: 'vendor_settlement',
                        },
                        on_hold: 0,
                    },
                ];
            }
        }
        catch (err) {
            console.warn('[createRazorpayOrder] Route lookup failed, continuing standard order:', err);
        }
    }
    const rzp = getRazorpayInstance();
    let order;
    try {
        order = await rzp.orders.create(orderPayload);
    }
    catch (orderErr) {
        if (orderPayload.transfers && orderPayload.transfers.length > 0) {
            console.warn('[createRazorpayOrder] Route transfer failed, retrying standard order:', orderErr?.message || orderErr);
            delete orderPayload.transfers;
            order = await rzp.orders.create(orderPayload);
        }
        else {
            console.error('[createRazorpayOrder] Razorpay order creation error:', orderErr);
            throw new https_1.HttpsError('internal', orderErr?.error?.description || orderErr?.message || 'Failed to create payment order.');
        }
    }
    return {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
    };
});
exports.verifyRazorpayPayment = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    const data = request.data || {};
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new https_1.HttpsError('invalid-argument', 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature.');
    }
    const keySecret = getKeySecret();
    const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
    const signatureBuffer = Buffer.from(razorpay_signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const isValid = signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    if (!isValid) {
        console.error('[verifyRazorpayPayment] Signature mismatch:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
        });
        throw new https_1.HttpsError('permission-denied', 'Payment signature verification failed.');
    }
    const rzp = getRazorpayInstance();
    let paymentDetails = {};
    try {
        paymentDetails = await rzp.payments.fetch(razorpay_payment_id);
    }
    catch (err) {
        console.warn('[verifyRazorpayPayment] Could not fetch payment details:', err);
    }
    if (paymentDetails.notes && paymentDetails.notes.type === 'buy_swaps') {
        const subscriptionId = paymentDetails.notes.subscription_id;
        const userId = paymentDetails.notes.user_id;
        const count = Number(paymentDetails.notes.qty || 1);
        if (subscriptionId && userId) {
            try {
                const allowanceRef = admin.firestore().collection('subscription_swap_allowances').doc(subscriptionId);
                await admin.firestore().runTransaction(async (transaction) => {
                    const docSnap = await transaction.get(allowanceRef);
                    const now = admin.firestore.FieldValue.serverTimestamp();
                    if (docSnap.exists) {
                        const currentTotal = docSnap.data()?.free_swaps_total || 0;
                        transaction.update(allowanceRef, {
                            free_swaps_total: currentTotal + count,
                            updated_at: now,
                        });
                    }
                    else {
                        transaction.set(allowanceRef, {
                            subscription_id: subscriptionId,
                            user_id: userId,
                            free_swaps_total: count,
                            free_swaps_used: 0,
                            created_at: now,
                            updated_at: now,
                        });
                    }
                });
                console.log(`[verifyRazorpayPayment] Credited ${count} swaps to ${subscriptionId}`);
            }
            catch (err) {
                console.warn('[verifyRazorpayPayment] Swap allowance credit error:', err);
            }
        }
    }
    return {
        success: true,
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        amount: paymentDetails.amount ? paymentDetails.amount / 100 : undefined,
        currency: paymentDetails.currency || 'INR',
    };
});
exports.razorpayApi = (0, https_1.onRequest)({ region: 'us-central1', cors: true }, async (req, res) => {
    const path = req.path.replace(/^\/api\/razorpay/, '').replace(/^\//, '');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-razorpay-signature');
        res.status(204).send('');
        return;
    }
    res.set('Access-Control-Allow-Origin', '*');
    try {
        if (path === 'create-order' || path === 'create-order/') {
            const data = req.body || {};
            const amount = Number(data.amount);
            const currency = typeof data.currency === 'string' ? data.currency : 'INR';
            const receipt = typeof data.receipt === 'string' ? data.receipt : `rcpt_${Date.now()}`;
            const notes = data.notes && typeof data.notes === 'object' ? data.notes : {};
            if (!amount || amount < 100) {
                res.status(400).json({ error: 'Invalid amount. Minimum is ₹1 (100 paise).' });
                return;
            }
            const rzp = getRazorpayInstance();
            const order = await rzp.orders.create({
                amount,
                currency,
                receipt: receipt.slice(0, 40),
                notes,
            });
            res.status(200).json({
                order_id: order.id,
                amount: order.amount,
                currency: order.currency,
            });
            return;
        }
        if (path === 'verify-payment' || path === 'verify-payment/') {
            const data = req.body || {};
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                res.status(400).json({ error: 'Missing required payment verification fields.' });
                return;
            }
            const keySecret = getKeySecret();
            const expectedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');
            const signatureBuffer = Buffer.from(razorpay_signature, 'hex');
            const expectedBuffer = Buffer.from(expectedSignature, 'hex');
            const isValid = signatureBuffer.length === expectedBuffer.length &&
                crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
            if (!isValid) {
                res.status(400).json({ error: 'Payment signature verification failed.' });
                return;
            }
            res.status(200).json({
                success: true,
                payment_id: razorpay_payment_id,
                order_id: razorpay_order_id,
            });
            return;
        }
        res.status(404).json({ error: `Endpoint /api/razorpay/${path} not found.` });
    }
    catch (err) {
        console.error('[razorpayApi] Error:', err);
        res.status(500).json({ error: err?.message || 'Payment server error' });
    }
});
//# sourceMappingURL=razorpayFunctions.js.map