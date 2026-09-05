import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { rateLimit } from '@/lib/server/rate-limit';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

type RazorpayApiError = {
  statusCode?: number;
  message?: string;
  error?: {
    code?: string;
    description?: string;
  };
};

type RazorpayPaymentDetails = {
  amount?: string | number;
  currency?: string;
  status?: string;
  method?: string;
  notes?: Record<string, unknown>;
  vpa?: string | null;
  email?: string | null;
  contact?: string | number | null;
};

function asRazorpayApiError(error: unknown): RazorpayApiError {
  return error instanceof Error ? { message: error.message } : error as RazorpayApiError;
}

function getAmountInRupees(amount: string | number | undefined) {
  const paise = typeof amount === 'string' ? Number(amount) : amount;
  return Number.isFinite(paise) ? (paise ?? 0) / 100 : 0;
}

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, {
    keyPrefix: 'razorpay:verify-payment',
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // ── Authentication Check ──────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.substring(7);
        await adminAuth.verifyIdToken(idToken);
      } catch (authErr) {
        console.warn('[Razorpay verify-payment] Token verification warning:', authErr);
      }
    }

    // Validate all required fields are present
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing required payment verification fields.' },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return NextResponse.json(
        { error: 'Razorpay credentials are not configured.' },
        { status: 500 }
      );
    }

    // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(razorpay_signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      console.error('[Razorpay] Signature verification failed', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });
      return NextResponse.json(
        { error: 'Payment signature verification failed. Do not mark this order as paid.' },
        { status: 400 }
      );
    }

    // Fetch payment details from Razorpay to get full information
    let paymentDetails: RazorpayPaymentDetails = {};
    try {
      paymentDetails = await getRazorpayClient().payments.fetch(razorpay_payment_id);
    } catch (err) {
      console.warn('[Razorpay] Could not fetch payment details from API:', err);
      // Continue even if fetch fails, signature is already verified
    }

    // ── Update swap allowance if it's a swap purchase ───────────────────────
    if (paymentDetails.notes && paymentDetails.notes.type === 'buy_swaps') {
      const subscriptionId = paymentDetails.notes.subscription_id as string;
      const userId = paymentDetails.notes.user_id as string;
      const count = Number(paymentDetails.notes.qty || 1);

      if (subscriptionId && userId) {
        try {
          const allowanceRef = adminDb.collection('subscription_swap_allowances').doc(subscriptionId);
          
          await adminDb.runTransaction(async (transaction: any) => {
            const docSnap = await transaction.get(allowanceRef);
            const now = FieldValue.serverTimestamp();
            if (docSnap.exists) {
              const data = docSnap.data();
              const currentTotal = data?.free_swaps_total || 0;
              transaction.update(allowanceRef, {
                free_swaps_total: currentTotal + count,
                updated_at: now
              });
            } else {
              transaction.set(allowanceRef, {
                subscription_id: subscriptionId,
                user_id: userId,
                free_swaps_total: count,
                free_swaps_used: 0,
                created_at: now,
                updated_at: now
              });
            }
          });
          console.log(`[Razorpay] Successfully credited ${count} swaps to subscription ${subscriptionId} via Admin SDK`);
        } catch (allowanceErr) {
          console.warn('[Razorpay] Could not update swap allowance via Admin SDK:', allowanceErr);
        }
      }
    }

    console.log('[Razorpay] Payment verified successfully:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: getAmountInRupees(paymentDetails.amount),
      method: paymentDetails.method || 'unknown',
    });

    // Signatures match — payment is genuine and stored
    return NextResponse.json({
      success: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: getAmountInRupees(paymentDetails.amount),
      currency: paymentDetails.currency || 'INR',
    });
  } catch (error: unknown) {
    const razorpayError = asRazorpayApiError(error);
    const isAuthError =
      razorpayError.statusCode === 401 ||
      razorpayError.error?.code === 'BAD_REQUEST_ERROR' &&
        razorpayError.error?.description === 'Authentication failed';

    console.error('[Razorpay] verify-payment error:', {
      statusCode: razorpayError.statusCode,
      code: razorpayError.error?.code,
      description: razorpayError.error?.description ?? razorpayError.message,
    });

    return NextResponse.json(
      {
        error: isAuthError
          ? 'Razorpay credentials are invalid. Update the key pair in .env.local, then restart the dev server.'
          : razorpayError.message ?? 'Signature verification failed.',
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
