import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  doc,
  updateDoc,
  getDoc,
  setDoc,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

// ── Idempotency guard ──────────────────────────────────────────────────────
// Prevents duplicate webhook processing (Razorpay retries on 5xx)
const MAX_PROCESSED_EVENTS = 5000;
const processedEventIds = new Set<string>();
function markEventProcessed(eventId: string) {
  processedEventIds.add(eventId);
  // Evict oldest entries if set grows too large (serverless cold starts reset anyway)
  if (processedEventIds.size > MAX_PROCESSED_EVENTS) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
}

// Max webhook payload size: 1 MB
const MAX_BODY_SIZE = 1_048_576;

/**
 * Razorpay Webhook Handler
 * 
 * Handles the following events:
 * - payment.authorized: Payment completed successfully
 * - payment.failed: Payment failed
 * - subscription.authenticated: Subscription authenticated
 * - subscription.active: Subscription activated
 * - subscription.paused: Subscription paused
 * - subscription.cancelled: Subscription cancelled
 * - subscription.resumed: Subscription resumed
 */
export async function POST(req: NextRequest) {
  try {
    // ── Body size guard ──────────────────────────────────────────────────
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const body = await req.text();
    if (body.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    // Prefer dedicated webhook secret; fall back to API key secret
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    if (!webhookSecret) {
      console.error('[Razorpay Webhook] No webhook secret configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      console.error('[Razorpay Webhook] Signature verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 403 }
      );
    }

    const event = JSON.parse(body);
    const eventType = event.event;
    const eventId = event.event_id || event.id || `${eventType}_${Date.now()}`;
    const eventData = event.payload?.payment?.entity || event.payload?.subscription?.entity || {};

    // ── Idempotency check ────────────────────────────────────────────────
    if (processedEventIds.has(eventId)) {
      console.log(`[Razorpay Webhook] Duplicate event ${eventId} — skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    markEventProcessed(eventId);

    console.log(`[Razorpay Webhook] Received event: ${eventType}`, eventData);

    // Handle different event types
    switch (eventType) {
      case 'payment.authorized': {
        // Payment successful
        await handlePaymentAuthorized(event.payload.payment.entity);
        break;
      }

      case 'payment.failed': {
        // Payment failed
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      }

      case 'subscription.authenticated': {
        // Subscription authenticated by user
        await handleSubscriptionAuthenticated(event.payload.subscription.entity);
        break;
      }

      case 'subscription.active': {
        // Subscription is now active
        await handleSubscriptionActive(event.payload.subscription.entity);
        break;
      }

      case 'subscription.paused': {
        // Subscription paused
        await handleSubscriptionPaused(event.payload.subscription.entity);
        break;
      }

      case 'subscription.cancelled': {
        // Subscription cancelled
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;
      }

      case 'subscription.resumed': {
        // Subscription resumed
        await handleSubscriptionResumed(event.payload.subscription.entity);
        break;
      }

      default:
        console.log(`[Razorpay Webhook] Unhandled event type: ${eventType}`);
    }

    // Always respond with 200 OK to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Razorpay Webhook] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle payment.authorized event
 * Update payment history and mark subscription as ready for billing
 */
async function handlePaymentAuthorized(payment: any) {
  try {
    const {
      id: payment_id,
      order_id,
      amount,
      currency,
      status,
      notes,
    } = payment;

    // Store payment in history
    const paymentDocId = `payment_${payment_id}`;
    await setDoc(
      doc(db, 'payment_history', paymentDocId),
      {
        payment_id,
        order_id,
        amount: amount / 100, // Convert to ₹
        currency,
        status,
        notes,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );

    console.log(`[Webhook] Payment authorized: ${payment_id}`);
  } catch (err) {
    console.error('[Webhook] handlePaymentAuthorized error:', err);
  }
}

/**
 * Handle payment.failed event
 * Log failed payment and notify user
 */
async function handlePaymentFailed(payment: any) {
  try {
    const {
      id: payment_id,
      order_id,
      amount,
      error_code,
      error_description,
      notes,
    } = payment;

    // Store failed payment in history
    const paymentDocId = `payment_${payment_id}`;
    await setDoc(
      doc(db, 'payment_history', paymentDocId),
      {
        payment_id,
        order_id,
        amount: amount / 100,
        error_code,
        error_description,
        notes,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        status: 'failed',
      },
      { merge: true }
    );

    console.log(`[Webhook] Payment failed: ${payment_id} - ${error_description}`);
  } catch (err) {
    console.error('[Webhook] handlePaymentFailed error:', err);
  }
}

/**
 * Handle subscription.authenticated event
 * User has successfully authenticated the mandate for recurring payments
 */
async function handleSubscriptionAuthenticated(subscription: any) {
  try {
    const { id: subscription_id, customer_id, status, notes } = subscription;

    const docId = `rzp_sub_${subscription_id}`;
    await updateDoc(doc(db, 'payment_subscriptions', docId), {
      status,
      customer_id,
      updated_at: Timestamp.now(),
      authenticated_at: Timestamp.now(),
    });

    console.log(`[Webhook] Subscription authenticated: ${subscription_id}`);
  } catch (err) {
    console.error('[Webhook] handleSubscriptionAuthenticated error:', err);
  }
}

/**
 * Handle subscription.active event
 * Subscription is now active and will charge automatically
 */
async function handleSubscriptionActive(subscription: any) {
  try {
    const {
      id: subscription_id,
      status,
      customer_id,
      notes,
      start_at,
      current_start,
    } = subscription;

    const docId = `rzp_sub_${subscription_id}`;
    const subDoc = await getDoc(doc(db, 'payment_subscriptions', docId));

    if (!subDoc.exists()) {
      console.warn(`[Webhook] Subscription doc not found: ${subscription_id}`);
      return;
    }

    const subData = subDoc.data();
    const { user_id, vendor_id, plan_id } = subData;

    // Update payment subscription
    await updateDoc(doc(db, 'payment_subscriptions', docId), {
      status,
      customer_id,
      updated_at: Timestamp.now(),
      activated_at: Timestamp.now(),
      current_start: Timestamp.fromDate(new Date(current_start * 1000)),
    });

    // Also mark the main subscription as active if needed
    const subRefCol = collection(db, 'subscriptions');
    const q = query(
      subRefCol,
      where('user_id', '==', user_id),
      where('vendor_id', '==', vendor_id),
      where('meal_type', '==', plan_id)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const subRef = snap.docs[0];
      await updateDoc(subRef.ref, {
        razorpay_subscription_id: subscription_id,
        status: 'active',
        updated_at: Timestamp.now(),
      });
    }

    console.log(`[Webhook] Subscription active: ${subscription_id}`);
  } catch (err) {
    console.error('[Webhook] handleSubscriptionActive error:', err);
  }
}

/**
 * Handle subscription.paused event
 */
async function handleSubscriptionPaused(subscription: any) {
  try {
    const { id: subscription_id, status } = subscription;

    const docId = `rzp_sub_${subscription_id}`;
    await updateDoc(doc(db, 'payment_subscriptions', docId), {
      status,
      updated_at: Timestamp.now(),
      paused_at: Timestamp.now(),
    });

    console.log(`[Webhook] Subscription paused: ${subscription_id}`);
  } catch (err) {
    console.error('[Webhook] handleSubscriptionPaused error:', err);
  }
}

/**
 * Handle subscription.cancelled event
 */
async function handleSubscriptionCancelled(subscription: any) {
  try {
    const { id: subscription_id, status, short_url, notes } = subscription;

    const docId = `rzp_sub_${subscription_id}`;
    const subDoc = await getDoc(doc(db, 'payment_subscriptions', docId));

    if (subDoc.exists()) {
      const subData = subDoc.data();
      const { user_id, vendor_id, plan_id } = subData;

      // Update payment subscription
      await updateDoc(doc(db, 'payment_subscriptions', docId), {
        status,
        updated_at: Timestamp.now(),
        cancelled_at: Timestamp.now(),
      });

      // Also cancel the main subscription
      const subRefCol = collection(db, 'subscriptions');
      const q = query(
        subRefCol,
        where('user_id', '==', user_id),
        where('vendor_id', '==', vendor_id),
        where('meal_type', '==', plan_id)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const subRef = snap.docs[0];
        await updateDoc(subRef.ref, {
          status: 'cancelled',
          cancelled_at: Timestamp.now(),
          cancelled_by: 'razorpay_webhook',
          updated_at: Timestamp.now(),
        });
      }
    }

    console.log(`[Webhook] Subscription cancelled: ${subscription_id}`);
  } catch (err) {
    console.error('[Webhook] handleSubscriptionCancelled error:', err);
  }
}

/**
 * Handle subscription.resumed event
 */
async function handleSubscriptionResumed(subscription: any) {
  try {
    const { id: subscription_id, status, start_at } = subscription;

    const docId = `rzp_sub_${subscription_id}`;
    const subDoc = await getDoc(doc(db, 'payment_subscriptions', docId));

    if (subDoc.exists()) {
      const subData = subDoc.data();
      const { user_id, vendor_id, plan_id } = subData;

      // Update payment subscription
      await updateDoc(doc(db, 'payment_subscriptions', docId), {
        status,
        updated_at: Timestamp.now(),
        resumed_at: Timestamp.now(),
      });

      // Also reactivate the main subscription
      const subRefCol = collection(db, 'subscriptions');
      const q = query(
        subRefCol,
        where('user_id', '==', user_id),
        where('vendor_id', '==', vendor_id),
        where('meal_type', '==', plan_id)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const subRef = snap.docs[0];
        await updateDoc(subRef.ref, {
          status: 'active',
          updated_at: Timestamp.now(),
        });
      }
    }

    console.log(`[Webhook] Subscription resumed: ${subscription_id}`);
  } catch (err) {
    console.error('[Webhook] handleSubscriptionResumed error:', err);
  }
}
