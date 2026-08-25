import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
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
    vendor_id?: unknown;
  } | null = null;

  try {
    body = await req.json();
    const amount = body?.amount;
    const currency = typeof body?.currency === 'string' ? body.currency : 'INR';
    const receipt = typeof body?.receipt === 'string' ? body.receipt : undefined;
    const notes = getRazorpayNotes(body?.notes);

    // ── Authentication Check ──────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.substring(7);
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (decoded?.uid) {
          notes.user_id = decoded.uid;
        }
      } catch (authErr) {
        console.warn('[Razorpay create-order] Token verification warning:', authErr);
      }
    }

    // Validate amount — Razorpay requires minimum 100 paise (₹1)
    if (!amount || typeof amount !== 'number' || amount < 100 || amount > 50_000_000) {
      return NextResponse.json(
        { error: 'Invalid amount. Allowed range is ₹1 to ₹500,000.' },
        { status: 400 }
      );
    }

    if (currency !== 'INR') {
      return NextResponse.json(
        { error: 'Unsupported currency.' },
        { status: 400 }
      );
    }

    const orderPayload: any = {
      amount,       // in paise
      currency,
      receipt: receipt ?? `rcpt_${Date.now()}`,
      notes: notes ?? {},
    };

    // If vendor_id is provided, check for a linked Razorpay account and configure split payments (Route)
    const vendorId = body?.vendor_id || notes?.vendor_id;
    if (typeof vendorId === 'string') {
      try {
        const vendorSnap = await adminDb.collection('users').doc(vendorId).get();
        const vendorData = vendorSnap?.data();
        
        if (vendorData?.rzp_account_id) {
          // Calculate the platform fee (commission)
          const platformFeePct = vendorData.platform_fee_pct ?? 10; // default 10%
          const vendorTransferAmount = Math.floor(amount * (1 - (platformFeePct / 100)));

          orderPayload.transfers = [
            {
              account: vendorData.rzp_account_id,
              amount: vendorTransferAmount,
              currency: 'INR',
              notes: {
                name: vendorData.kitchen_name || vendorData.name || 'Vendor',
                type: 'vendor_settlement'
              },
              on_hold: 0
            }
          ];
        }
      } catch (adminErr) {
        console.warn('[Razorpay] Could not query vendor for Route transfer, continuing standard order:', adminErr);
      }
    }

    const client = getRazorpayClient();
    let order: any;

    try {
      order = await client.orders.create(orderPayload);
    } catch (orderErr: any) {
      if (orderPayload.transfers && orderPayload.transfers.length > 0) {
        console.warn('[Razorpay] Route transfers failed, retrying standard order:', orderErr?.message || orderErr);
        delete orderPayload.transfers;
        order = await client.orders.create(orderPayload);
      } else {
        throw orderErr;
      }
    }

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
