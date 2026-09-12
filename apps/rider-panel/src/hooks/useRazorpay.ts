/**
 * useRazorpay — reusable hook for Razorpay Standard Checkout.
 *
 * Usage:
 *   const { openCheckout, loading } = useRazorpay();
 *   <button onClick={() => openCheckout({ amountInPaise: 50000, ... })}>
 *     Pay ₹500
 *   </button>
 */
'use client';

import { useCallback, useState } from 'react';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: { color?: string };
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (response: { error: { description: string } }) => void): void;
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type CreateOrderResponse = {
  order_id: string;
  amount: number;
};

export interface OpenCheckoutParams {
  /** Amount in paise (e.g. 50000 = ₹500). Must be ≥ 100. */
  amountInPaise: number;
  currency?: string;
  name?: string;
  description?: string;
  receipt?: string;
  prefill?: RazorpayOptions['prefill'];
  /** Called after verified success (signatures matched on backend). */
  onSuccess?: (paymentId: string, orderId: string) => void;
  /** Called if user dismisses the modal or payment fails. */
  onFailure?: (reason: string) => void;
}

/** Dynamically injects checkout.js once and caches the promise. */
let checkoutScriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null; // allow retry on next call
      reject(new Error('Failed to load Razorpay checkout script.'));
    };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useRazorpay() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = useCallback(async (params: OpenCheckoutParams) => {
    const {
      amountInPaise,
      currency = 'INR',
      name = 'Dabzzo',
      description,
      receipt,
      prefill,
      onSuccess,
      onFailure,
    } = params;

    setError(null);
    setLoading(true);

    try {
      // 1. Load checkout.js
      await loadCheckoutScript();

      // 2. Create order on backend
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise, currency, receipt }),
      });

      if (!orderRes.ok) {
        throw new Error(await readApiError(orderRes, 'Failed to create payment order.'));
      }

      const order = await orderRes.json() as CreateOrderResponse;

      // 3. Open Razorpay modal
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
          amount: order.amount,
          currency,
          name,
          description,
          order_id: order.order_id,
          prefill,
          theme: { color: '#f97316' }, // Dabzzo brand orange
          modal: {
            ondismiss: () => {
              onFailure?.('Payment cancelled by user.');
              reject(new Error('dismissed'));
            },
          },
          handler: async (response: RazorpayPaymentResponse) => {
            try {
              // 4. Verify signature on backend
              const verifyRes = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response),
              });

              if (!verifyRes.ok) {
                throw new Error(await readApiError(verifyRes, 'Signature verification failed.'));
              }

              onSuccess?.(response.razorpay_payment_id, response.razorpay_order_id);
              resolve();
            } catch (verifyErr: unknown) {
              onFailure?.(getErrorMessage(verifyErr, 'Signature verification failed.'));
              reject(verifyErr);
            }
          },
        });

        rzp.on('payment.failed', (resp: { error: { description: string } }) => {
          const msg = resp.error.description ?? 'Payment failed.';
          onFailure?.(msg);
          reject(new Error(msg));
        });

        rzp.open();
      });
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Something went wrong with payment.');

      if (msg !== 'dismissed') {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { openCheckout, loading, error };
}
