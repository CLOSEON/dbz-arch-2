/**
 * Razorpay Integration Utilities
 * 
 * Helper functions for Razorpay payment integration supporting both
 * Firebase Cloud Functions (for Firebase Hosting & Capacitor mobile apps)
 * and Next.js serverless API routes.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

/**
 * Load Razorpay checkout script dynamically
 */
let _checkoutScriptPromise: Promise<void> | null = null;

export function loadRazorpayCheckoutScript(): Promise<void> {
  if (_checkoutScriptPromise) return _checkoutScriptPromise;

  _checkoutScriptPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      _checkoutScriptPromise = null;
      reject(new Error('Failed to load Razorpay SDK.'));
    };

    document.head.appendChild(script);
  });

  return _checkoutScriptPromise;
}

/**
 * Open Razorpay checkout modal for one-time payment
 */
export async function openRazorpayCheckout(options: {
  key_id?: string;
  order_id: string;
  amount: number; // in paise
  currency?: string;
  description?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  theme_color?: string;
  image?: string;
  notes?: Record<string, any>;
  callback?: {
    onSuccess: (response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) => Promise<void>;
    onFailure: (error: any) => void;
    onClose: () => void;
  };
}): Promise<void> {
  await loadRazorpayCheckoutScript();

  const Razorpay = (window as any).Razorpay;
  if (!Razorpay) {
    throw new Error('Razorpay SDK could not be initialized.');
  }

  const key = options.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E';

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key,
      order_id: options.order_id,
      amount: options.amount,
      currency: options.currency || 'INR',
      name: 'Dabzzo',
      description: options.description || 'Order Payment',
      image: options.image,
      prefill: {
        name: options.customer_name || '',
        email: options.customer_email || '',
        contact: options.customer_phone || '',
      },
      theme: {
        color: options.theme_color || '#f97316',
      },
      notes: options.notes || {},
      modal: {
        ondismiss: () => {
          options.callback?.onClose?.();
          reject(new Error('Payment dismissed by user'));
        },
      },
      handler: async (response: any) => {
        try {
          await options.callback?.onSuccess?.(response);
          resolve();
        } catch (err) {
          options.callback?.onFailure?.(err);
          reject(err);
        }
      },
    });

    rzp.on('payment.failed', (response: any) => {
      const error = {
        code: response.error?.code,
        description: response.error?.description,
        reason: response.error?.reason,
      };
      options.callback?.onFailure?.(error);
      reject(new Error(error.description || 'Payment failed'));
    });

    rzp.open();
  });
}

/**
 * Verify payment signature with backend
 */
export async function verifyPaymentSignature(
  payment_id: string,
  order_id: string,
  signature: string
): Promise<boolean> {
  const payload = {
    razorpay_payment_id: payment_id,
    razorpay_order_id: order_id,
    razorpay_signature: signature,
  };

  // 1. Try Firebase Callable Cloud Function (works on Firebase Hosting & Capacitor APKs)
  try {
    const callable = httpsCallable<typeof payload, { success: boolean }>(
      functions,
      'verifyRazorpayPayment'
    );
    const res = await callable(payload);
    if (res?.data?.success) {
      return true;
    }
  } catch (callableErr: any) {
    console.warn('[Razorpay] Callable verification fallback to REST:', callableErr?.message || callableErr);
  }

  // 2. Fallback to REST endpoint
  try {
    const response = await fetch('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // If we got non-JSON (e.g. static html rewrite) but callable already failed, check response.ok
      if (response.ok) return true;
      throw new Error('Payment verification server unreachable');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Payment verification failed');
    }

    return true;
  } catch (err) {
    console.error('[Razorpay] Verification failed:', err);
    throw err;
  }
}

/**
 * Create Razorpay order for one-time payment
 * (amount in ₹, converts to paise)
 */
export async function createRazorpayOrder(
  amountPaiseOrRupees: number, // can be in rupees or paise
  receipt: string = `rcpt_${Date.now()}`,
  notes?: Record<string, any>,
  vendor_id?: string
): Promise<{ order_id: string; amount: number; currency: string }> {
  // If amount < 100, assume it's in ₹ and convert to paise
  const amountInPaise = amountPaiseOrRupees < 100 ? Math.round(amountPaiseOrRupees * 100) : Math.round(amountPaiseOrRupees);

  const payload = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes: notes || {},
    vendor_id,
  };

  // 1. Try Firebase Callable Cloud Function (works reliably on dabzzo.in and native APKs)
  try {
    const callable = httpsCallable<typeof payload, { order_id: string; amount: number; currency: string }>(
      functions,
      'createRazorpayOrder'
    );
    const res = await callable(payload);
    if (res?.data?.order_id) {
      return res.data;
    }
  } catch (callableErr: any) {
    console.warn('[Razorpay] Callable createRazorpayOrder fallback to REST:', callableErr?.message || callableErr);
  }

  // 2. Fallback to REST endpoint
  try {
    const response = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Payment server returned invalid response. Please retry.');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to create payment order');
    }

    return data;
  } catch (err) {
    console.error('[Razorpay] Order creation failed:', err);
    throw err;
  }
}

/**
 * Create Razorpay subscription for recurring payment
 */
export async function createRazorpaySubscription(
  user_id: string,
  vendor_id: string,
  plan_id: string,
  meal_type: string,
  amount: number, // in ₹
  frequency: 'weekly' | 'monthly',
  customer_email?: string,
  customer_phone?: string,
  customer_name?: string
): Promise<{ subscription_id: string; status: string }> {
  try {
    const response = await fetch('/api/razorpay/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id,
        vendor_id,
        plan_id,
        meal_type,
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        frequency,
        customer_email,
        customer_phone,
        customer_name,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Failed to create subscription');
    }

    return await response.json();
  } catch (err) {
    console.error('[Razorpay] Subscription creation failed:', err);
    throw err;
  }
}

/**
 * Format amount as currency string
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Get payment status label
 */
export function getPaymentStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    captured: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
    authorized: 'Authorized',
  };
  return statusMap[status] || 'Unknown';
}

/**
 * Get payment status color
 */
export function getPaymentStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    captured: 'text-emerald-600',
    failed: 'text-red-600',
    pending: 'text-amber-600',
    authorized: 'text-blue-600',
  };
  return colorMap[status] || 'text-slate-600';
}

/**
 * Validate payment amount
 * Razorpay minimum is 100 paise (₹1)
 */
export function isValidPaymentAmount(amount: number): boolean {
  return amount >= 1;
}
