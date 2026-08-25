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
import { createRazorpayOrder, verifyPaymentSignature, loadRazorpayCheckoutScript } from '@/lib/razorpay';

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

export interface OpenCheckoutParams {
  /** Amount in paise (e.g. 50000 = ₹500). Must be ≥ 100. */
  amountInPaise: number;
  currency?: string;
  name?: string;
  description?: string;
  receipt?: string;
  prefill?: RazorpayOptions['prefill'];
  vendor_id?: string;
  /** Called after verified success (signatures matched on backend). */
  onSuccess?: (paymentId: string, orderId: string) => void;
  /** Called if user dismisses the modal or payment fails. */
  onFailure?: (reason: string) => void;
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
      vendor_id,
      onSuccess,
      onFailure,
    } = params;

    setError(null);
    setLoading(true);

    try {
      // 1. Load checkout.js
      await loadRazorpayCheckoutScript();

      // 2. Create order (Callable Cloud Function + REST fallback)
      const order = await createRazorpayOrder(
        amountInPaise,
        receipt || `rcpt_${Date.now()}`,
        {},
        vendor_id
      );

      // 3. Open Razorpay modal
      await new Promise<void>((resolve, reject) => {
        const RazorpayConstructor = (window as any).Razorpay;
        if (!RazorpayConstructor) {
          reject(new Error('Razorpay SDK failed to load. Please check your internet connection.'));
          return;
        }

        const rzp = new RazorpayConstructor({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E',
          amount: order.amount,
          currency,
          name,
          description,
          order_id: order.order_id,
          prefill,
          theme: { color: '#f97316' },
          modal: {
            ondismiss: () => {
              onFailure?.('Payment cancelled by user.');
              reject(new Error('dismissed'));
            },
          },
          handler: async (response: RazorpayPaymentResponse) => {
            try {
              // 4. Verify signature on backend
              await verifyPaymentSignature(
                response.razorpay_payment_id,
                response.razorpay_order_id,
                response.razorpay_signature
              );

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
