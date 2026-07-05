'use client';

import { useState } from 'react';
import { X, CreditCard, ShieldCheck } from 'lucide-react';
import { renewSubscription } from '@/lib/queries/subscriptions';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: any;
  amount: number;
  onSuccess: () => void;
}

export function PaymentModal({ isOpen, onClose, subscription, amount, onSuccess }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handlePayment() {
    setLoading(true);
    try {
      // Simulate payment delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const currentNextBilling = subscription.next_billing_date?.toDate?.() || 
        (subscription.created_at?.toDate?.() || new Date());
        
      await renewSubscription(
        subscription.id, 
        subscription.frequency || 'weekly', 
        currentNextBilling, 
        subscription.user_id
      );
      
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Complete Payment</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Renew your subscription securely</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center mb-6">
            <p className="text-sm font-bold text-slate-500 mb-1">Total Amount Due</p>
            <p className="text-3xl font-black text-slate-900">₹{amount}</p>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
              <CreditCard className="w-5 h-5" />
              <span>Simulated Payment Gateway</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span>Secure, encrypted transaction</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-black/5">
          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[13px] font-black uppercase tracking-wider transition-all duration-200 bg-brand text-white hover:bg-brand-600 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 
                Processing...
              </span>
            ) : (
              'Pay Now'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
