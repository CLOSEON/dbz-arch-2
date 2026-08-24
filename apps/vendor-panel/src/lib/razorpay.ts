/**
 * Razorpay Integration Utilities
 * 
 * Helper functions for Razorpay payment integration
 */

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
  key_id: string;
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

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: options.key_id,
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
  try {
    const response = await fetch('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_payment_id: payment_id,
        razorpay_order_id: order_id,
        razorpay_signature: signature,
      }),
    });

    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || 'Payment verification failed');
    }

    return true;
  } catch (err) {
    console.error('[Razorpay] Verification failed:', err);
    throw err;
  }
}

/**
 * Create Razorpay order for one-time payment
 */
export async function createRazorpayOrder(
  amount: number, // in ₹
  receipt: string,
  notes?: Record<string, any>
): Promise<{ order_id: string; amount: number; currency: string }> {
  try {
    const response = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        receipt,
        notes: notes || {},
      }),
    });

    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || 'Failed to create payment order');
    }

    return await response.json();
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
      const { error } = await response.json();
      throw new Error(error || 'Failed to create subscription');
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
