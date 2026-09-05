import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { checkRateLimit } from '@/lib/server/rate-limit';

// Safely instantiate Razorpay — fail gracefully if env vars are missing
let razorpay: Razorpay | null = null;
try {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keyId && keySecret) {
    razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
} catch (e) {
  console.error('[Razorpay] Failed to initialize client:', e);
}

// Input validation helpers
function isValidId(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(val);
}

function isValidAmount(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 100 && val <= 10_000_000; // 1₹ to 1L₹ in paise
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitResult = checkRateLimit(`create-sub:${ip}`, 5, 60_000); // 5 per minute
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) } }
    );
  }

  // ── Razorpay availability check ────────────────────────────────────────
  if (!razorpay) {
    console.error('[Razorpay] Client not initialized — missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
    return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 });
  }

  try {
    // ── Body size guard ──────────────────────────────────────────────────
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 10_000) { // 10KB max
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    const body = await req.json();
    const {
      user_id,
      vendor_id,
      plan_id,
      meal_type,
      frequency,
      amount, // in paise
      currency = 'INR',
      customer_email,
      customer_phone,
      customer_name,
    } = body;

    // ── Input validation ─────────────────────────────────────────────────
    if (!isValidId(user_id) || !isValidId(vendor_id) || !isValidId(plan_id)) {
      return NextResponse.json({ error: 'Invalid user_id, vendor_id, or plan_id' }, { status: 400 });
    }
    if (!isValidAmount(amount)) {
      return NextResponse.json({ error: 'Invalid amount. Must be between 100 and 10000000 paise.' }, { status: 400 });
    }
    if (!['weekly', 'monthly'].includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency. Must be weekly or monthly.' }, { status: 400 });
    }
    if (!['lunch', 'dinner', 'both'].includes(meal_type)) {
      return NextResponse.json({ error: 'Invalid meal_type.' }, { status: 400 });
    }

    // For one-time payments, redirect
    if (frequency === 'one-time') {
      return NextResponse.json(
        { error: 'Use /api/razorpay/create-order for one-time payments' },
        { status: 400 }
      );
    }

    // Determine billing interval and count for Razorpay subscription
    let interval = 1;
    let period: 'monthly' | 'weekly' = 'monthly';

    if (frequency === 'weekly') {
      interval = 1;
      period = 'weekly';
    } else if (frequency === 'monthly') {
      interval = 1;
      period = 'monthly';
    }

    // Create Razorpay subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: undefined, // We'll use item-based for more flexibility
      customer_notify: 1,
      quantity: 1,
      total_count: 0, // Infinite until cancelled
      start_at: Math.floor(Date.now() / 1000), // Start immediately
      addons: [
        {
          item: {
            active: true,
            description: `${plan_id.charAt(0).toUpperCase() + plan_id.slice(1)} Plan`,
            amount: amount,
            currency: currency,
            tax_rate: null,
            hsn_code: null,
            sac_code: null,
            tax_id: null,
            tax_group_id: null,
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      ],
      notes: {
        user_id,
        vendor_id,
        plan_id,
        meal_type,
        frequency,
      },
      expire_at: undefined, // No expiration
      pause_at: undefined,
      method: 'emandate', // Electronic mandate for auto-pay
    } as any);

    // Store subscription metadata in Firestore for tracking
    const subscriptionDocId = `rzp_sub_${subscription.id}`;
    await setDoc(doc(db, 'payment_subscriptions', subscriptionDocId), {
      razorpay_subscription_id: subscription.id,
      user_id,
      vendor_id,
      plan_id,
      meal_type,
      frequency,
      amount: amount / 100, // Convert to ₹
      currency,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      customer_name: customer_name || null,
      status: subscription.status,
      start_at: Timestamp.fromDate(new Date(subscription.start_at * 1000)),
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
      notes: subscription.notes || {},
    });

    return NextResponse.json({
      subscription_id: subscription.id,
      status: subscription.status,
      amount: amount / 100, // Return amount in ₹
      currency,
      period,
      interval,
      message: 'Subscription created. Payment will be processed automatically.',
    });
  } catch (error: any) {
    console.error('[Razorpay] create-subscription error:', error);

    const status = error?.statusCode === 401 ? 401 : 500;
    const message =
      error?.error?.description ?? error?.message ?? 'Failed to create Razorpay subscription.';

    return NextResponse.json({ error: message }, { status });
  }
}
