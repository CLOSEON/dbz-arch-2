'use client';

import { useRazorpay } from '@/hooks/useRazorpay';
import { Loader2 } from 'lucide-react';

interface RazorpayButtonProps {
  /** Amount in paise (e.g. 50000 = ₹500). Min 100. */
  amountInPaise: number;
  label?: string;
  description?: string;
  receipt?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  onSuccess?: (paymentId: string, orderId: string) => void;
  onFailure?: (reason: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Drop-in Razorpay checkout button.
 *
 * @example
 * <RazorpayButton
 *   amountInPaise={49900}
 *   label="Pay ₹499"
 *   prefill={{ name: user.name, email: user.email }}
 *   onSuccess={(paymentId, orderId) => {
 *     toast.success(`Payment captured: ${paymentId}`);
 *   }}
 *   onFailure={(reason) => toast.error(reason)}
 * />
 */
export function RazorpayButton({
  amountInPaise,
  label,
  description,
  receipt,
  prefill,
  onSuccess,
  onFailure,
  className = '',
  disabled = false,
}: RazorpayButtonProps) {
  const { openCheckout, loading, error } = useRazorpay();

  const displayLabel = label ?? `Pay ₹${(amountInPaise / 100).toFixed(0)}`;

  const handleClick = () => {
    openCheckout({
      amountInPaise,
      description,
      receipt,
      prefill,
      onSuccess,
      onFailure: (reason) => {
        onFailure?.(reason);
      },
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        id="razorpay-checkout-btn"
        onClick={handleClick}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white',
          'bg-orange-500 hover:bg-orange-600 active:scale-95',
          'transition-all duration-150 shadow-md',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        ].join(' ')}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing…
          </>
        ) : (
          displayLabel
        )}
      </button>

      {error && (
        <p className="text-sm text-red-500 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
