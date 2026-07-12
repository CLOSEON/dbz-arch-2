import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

type RazorpayApiError = {
  statusCode?: number;
  message?: string;
  error?: {
    code?: string;
    description?: string;
  };
};

function asRazorpayApiError(error: unknown): RazorpayApiError {
  return error instanceof Error ? { message: error.message } : error as RazorpayApiError;
}

function getRazorpayNotes(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number] => {
      const noteValue = entry[1];
      return typeof noteValue === 'string' || typeof noteValue === 'number';
    })
  );
}

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  if (publicKeyId && publicKeyId !== keyId) {
    throw new Error('Razorpay public and server key IDs do not match.');
  }

  if (process.env.NODE_ENV !== 'production' && keyId.startsWith('rzp_live_')) {
    throw new Error('Live Razorpay keys are configured in development. Switch .env.local to rzp_test_ keys to use Razorpay test cards.');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, {
    keyPrefix: 'razorpay:create-order',
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    amount?: unknown;
    currency?: unknown;
    receipt?: unknown;
    notes?: unknown;
  } | null = null;

  try {
    body = await req.json();
    const amount = body?.amount;
    const currency = typeof body?.currency === 'string' ? body.currency : 'INR';
    const receipt = typeof body?.receipt === 'string' ? body.receipt : undefined;
    const notes = getRazorpayNotes(body?.notes);

    // Validate amount — Razorpay requires minimum 100 paise (₹1)
    if (!amount || typeof amount !== 'number' || amount < 100 || amount > 500_000) {
      return NextResponse.json(
        { error: 'Invalid amount. Allowed range is ₹1 to ₹5,000.' },
        { status: 400 }
      );
    }

    if (currency !== 'INR') {
      return NextResponse.json(
        { error: 'Unsupported currency.' },
        { status: 400 }
      );
    }

    const order = await getRazorpayClient().orders.create({
      amount,       // in paise
      currency,
      receipt: receipt ?? `rcpt_${Date.now()}`,
      notes: notes ?? {},
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: unknown) {
    const razorpayError = asRazorpayApiError(error);
    const keyId = process.env.RAZORPAY_KEY_ID;
    const isAuthError =
      razorpayError.statusCode === 401 ||
      razorpayError.error?.code === 'BAD_REQUEST_ERROR' &&
        razorpayError.error?.description === 'Authentication failed';
    const isConfigError =
      razorpayError.message === 'Razorpay credentials are not configured.' ||
      razorpayError.message === 'Razorpay public and server key IDs do not match.' ||
      razorpayError.message === 'Live Razorpay keys are configured in development. Switch .env.local to rzp_test_ keys to use Razorpay test cards.';

    console.error('[Razorpay] create-order error:', {
      statusCode: razorpayError.statusCode,
      code: razorpayError.error?.code,
      description: razorpayError.error?.description ?? razorpayError.message,
      keyPrefix: keyId ? `${keyId.slice(0, 12)}...` : 'missing',
    });

    const status = isAuthError ? 401 : isConfigError ? 400 : 500;
    const message =
      isAuthError
        ? 'Razorpay credentials are invalid. Update RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local, then restart the dev server.'
        : isConfigError
          ? razorpayError.message
          : razorpayError.error?.description ?? razorpayError.message ?? 'Failed to create Razorpay order.';

    return NextResponse.json({ error: message }, { status });
  }
}
