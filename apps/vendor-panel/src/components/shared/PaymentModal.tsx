'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, ShieldCheck, Loader2 } from 'lucide-react';
import { renewSubscription } from '@/lib/queries/subscriptions';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';

// Razorpay SDK loader
let _checkoutScriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (_checkoutScriptPromise) return _checkoutScriptPromise;
  _checkoutScriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { _checkoutScriptPromise = null; reject(new Error('Failed to load Razorpay SDK.')); };
    document.head.appendChild(s);
  });
  return _checkoutScriptPromise;
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: any;
  amount: number;
  onSuccess: () => void;
}

export function PaymentModal({ isOpen, onClose, subscription, amount, onSuccess }: PaymentModalProps) {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating_order' | 'awaiting_payment' | 'verifying' | 'renewing'>('idle');

  async function handlePayment() {
    if (loading) return;
    setLoading(true);
    setPaymentStatus('creating_order');

    try {
      // 1. Load Razorpay script
      await loadCheckoutScript();

      // 2. Create Razorpay order on server
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount * 100, // paise
          currency: 'INR',
          receipt: `renew_${subscription.id}_${Date.now()}`.slice(0, 40),
          notes: {
            user_id: user?.id,
            subscription_id: subscription.id,
            type: 'renew_subscription'
          }
        })
      });

      if (!orderRes.ok) {
        throw new Error(await readApiError(orderRes, 'Failed to create payment order.'));
      }

      const { order_id } = await orderRes.json();

      // 3. Open Razorpay Checkout modal
      setPaymentStatus('awaiting_payment');
      const paymentResponse = await new Promise<any>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
          amount: amount * 100,
          currency: 'INR',
          name: 'Dabzzo',
          description: `Subscription Renewal (${subscription.meal_type || 'Tiffin'} Meal)`,
          order_id,
          prefill: {
            name: user?.name || '',
            contact: user?.phone || '',
            email: user?.email || '',
          },
          theme: { color: '#f97316' },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled.'))
          },
          handler: (response: any) => resolve(response)
        });

        rzp.on('payment.failed', (resp: any) => {
          reject(new Error(resp.error?.description || 'Payment failed.'));
        });

        rzp.open();
      });

      // 4. Verify signature on backend
      setPaymentStatus('verifying');
      const verifyRes = await fetch('/api/razorpay/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentResponse)
      });

      if (!verifyRes.ok) {
        throw new Error(await readApiError(verifyRes, 'Verification failed.'));
      }

      // 5. Finalize subscription renewal in Firestore
      setPaymentStatus('renewing');
      const currentNextBilling = subscription.next_billing_date?.toDate?.() || 
        (subscription.created_at?.toDate?.() || new Date());
        
      await renewSubscription(
        subscription.id, 
        subscription.frequency || 'weekly', 
        currentNextBilling, 
        subscription.user_id
      );
      
      addToast('Renewal successful! Subscription extended. 🎉', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Payment renewal failed', 'error');
      setPaymentStatus('idle');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 p-4"
          >
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Complete Renewal</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Extend your plan securely</p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                <div className="bg-brand/5 border border-brand/10 rounded-3xl p-6 text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Total Renewal Amount</p>
                  <p className="text-4xl font-black text-brand">₹{amount}</p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-50 bg-slate-50/30">
                    <div className="w-9 h-9 bg-orange-100/60 rounded-xl flex items-center justify-center text-brand shrink-0">
                      <CreditCard className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Razorpay Smart Gateway</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">UPI, Net Banking, Card options</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-slate-50 bg-slate-50/30">
                    <div className="w-9 h-9 bg-emerald-100/60 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                      <ShieldCheck className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Encrypted Transactions</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Payments processed using 100% safe gateway</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-6 bg-slate-50/50 border-t border-slate-50">
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-200 bg-brand text-white hover:bg-brand/90 active:scale-[0.98] shadow-lg shadow-brand/20 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {paymentStatus === 'creating_order' && 'Initializing checkout...'}
                      {paymentStatus === 'awaiting_payment' && 'Awaiting payment...'}
                      {paymentStatus === 'verifying' && 'Verifying payment...'}
                      {paymentStatus === 'renewing' && 'Extending plan...'}
                    </span>
                  ) : (
                    'Pay Now with Razorpay'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
