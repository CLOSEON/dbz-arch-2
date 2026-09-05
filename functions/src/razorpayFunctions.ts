import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

// Helper to get configured Razorpay client
function getRazorpayInstance(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || 'NMgeawXrZfgjKJfwu06iGl1X';

  if (!key_id || !key_secret) {
    throw new HttpsError('failed-precondition', 'Razorpay credentials not configured.');
  }

  return new Razorpay({
    key_id,
    key_secret,
  });
}

function getKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || 'NMgeawXrZfgjKJfwu06iGl1X';
}

/**
 * Callable HTTPS Function: createRazorpayOrder
 * Creates an order in Razorpay (with optional split Route transfers).
 */
export const createRazorpayOrder = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const data = request.data || {};
  const amount = Number(data.amount); // in paise
  const currency = typeof data.currency === 'string' ? data.currency : 'INR';
  const receipt = typeof data.receipt === 'string' ? data.receipt : `rcpt_${Date.now()}`;
  const notes = data.notes && typeof data.notes === 'object' ? data.notes : {};
  const vendorId = data.vendor_id || notes.vendor_id;

  if (!amount || amount < 100 || amount > 50_000_000) {
    throw new HttpsError('invalid-argument', 'Invalid amount. Must be between ₹1 and ₹500,000.');
  }

  const orderPayload: any = {
    amount,
    currency,
    receipt: receipt.slice(0, 40),
    notes,
  };

  // Optional split Route transfers if vendor has linked Razorpay account
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
    } catch (err) {
      console.warn('[createRazorpayOrder] Route lookup failed, continuing standard order:', err);
    }
  }

  const rzp = getRazorpayInstance();
  let order: any;

  try {
    order = await rzp.orders.create(orderPayload);
  } catch (orderErr: any) {
    if (orderPayload.transfers && orderPayload.transfers.length > 0) {
      console.warn('[createRazorpayOrder] Route transfer failed, retrying standard order:', orderErr?.message || orderErr);
      delete orderPayload.transfers;
      order = await rzp.orders.create(orderPayload);
    } else {
      console.error('[createRazorpayOrder] Razorpay order creation error:', orderErr);
      throw new HttpsError('internal', orderErr?.error?.description || orderErr?.message || 'Failed to create payment order.');
    }
  }

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
  };
});

/**
 * Callable HTTPS Function: verifyRazorpayPayment
 * Verifies HMAC-SHA256 signature and credits swap allowances if applicable.
 */
export const verifyRazorpayPayment = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const data = request.data || {};
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new HttpsError('invalid-argument', 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature.');
  }

  const keySecret = getKeySecret();

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const signatureBuffer = Buffer.from(razorpay_signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  const isValid =
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    console.error('[verifyRazorpayPayment] Signature mismatch:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
    throw new HttpsError('permission-denied', 'Payment signature verification failed.');
  }

  // Fetch payment details from Razorpay
  const rzp = getRazorpayInstance();
  let paymentDetails: any = {};
  try {
    paymentDetails = await rzp.payments.fetch(razorpay_payment_id);
  } catch (err) {
    console.warn('[verifyRazorpayPayment] Could not fetch payment details:', err);
  }

  // If swap purchase, credit swap allowance
  if (paymentDetails.notes && paymentDetails.notes.type === 'buy_swaps') {
    const subscriptionId = paymentDetails.notes.subscription_id as string;
    const userId = paymentDetails.notes.user_id as string;
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
          } else {
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
      } catch (err) {
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

/**
 * HTTPS Request Handler: razorpayApi
 * Handles direct REST requests from Firebase Hosting rewrites (/api/razorpay/**).
 */
export const razorpayApi = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
  // Normalize path
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

      const isValid =
        signatureBuffer.length === expectedBuffer.length &&
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

    if (path === 'create-subscription' || path === 'create-subscription/') {
      const data = req.body || {};
      const { plan_id, customer_id, total_count, quantity } = data;

      if (!plan_id) {
        res.status(400).json({ error: 'Missing plan_id' });
        return;
      }

      const rzp = getRazorpayInstance();
      const payload: any = {
        plan_id,
        total_count: total_count || 12,
        quantity: quantity || 1
      };
      if (customer_id) payload.customer_id = customer_id;

      const subscription = await rzp.subscriptions.create(payload);

      res.status(200).json({
        subscription_id: subscription.id,
        short_url: subscription.short_url,
        status: subscription.status,
      });
      return;
    }

    if (path === 'create-vendor-account' || path === 'create-vendor-account/') {
      const data = req.body || {};
      const { name, email, phone, business_name, account_type } = data;

      if (!name || !email || !phone) {
        res.status(400).json({ error: 'Missing name, email, or phone' });
        return;
      }

      const rzp = getRazorpayInstance();
      const accountData = {
        name,
        email,
        contact: phone,
        type: account_type || 'route',
        business_type: 'individual',
        legal_business_name: business_name || name,
        profile: {
          category: 'food',
          subcategory: 'catering',
        },
      };

      const account = await (rzp as any).accounts.create(accountData);
      res.status(200).json(account);
      return;
    }

    if (path === 'webhook' || path === 'webhook/') {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.NEXT_PUBLIC_RAZORPAY_WEBHOOK_SECRET || 'dabzzo_webhook_secret';
      const signature = req.headers['x-razorpay-signature'] as string;

      if (!signature) {
        res.status(400).json({ error: 'Missing signature.' });
        return;
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (expectedSignature !== signature) {
        res.status(400).json({ error: 'Invalid signature.' });
        return;
      }

      const event = req.body;
      const db = admin.firestore();

      try {
        if (event.event === 'payment.captured') {
          const payment = event.payload.payment.entity;
          // You could update your database
        } else if (event.event === 'subscription.activated') {
          const subscription = event.payload.subscription.entity;
          const rzpSubId = subscription.id;
          const subsSnap = await db.collection('subscriptions').where('rzp_subscription_id', '==', rzpSubId).get();
          if (!subsSnap.empty) {
            const batch = db.batch();
            subsSnap.docs.forEach(doc => {
              batch.update(doc.ref, { status: 'active', updated_at: admin.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
          }
        } else if (event.event === 'subscription.halted') {
          const subscription = event.payload.subscription.entity;
          const rzpSubId = subscription.id;
          const subsSnap = await db.collection('subscriptions').where('rzp_subscription_id', '==', rzpSubId).get();
          if (!subsSnap.empty) {
            const batch = db.batch();
            subsSnap.docs.forEach(doc => {
              batch.update(doc.ref, { status: 'cancelled', updated_at: admin.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
          }
        }
      } catch (e) {
        console.error('Error processing webhook event:', e);
      }

      res.status(200).json({ status: 'ok' });
      return;
    }
  } catch (err: any) {
    console.error('[razorpayApi] Error:', err);
    res.status(500).json({ error: err?.message || 'Payment server error' });
  }
});
