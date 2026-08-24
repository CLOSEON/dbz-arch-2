'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin, ArrowLeft, ShieldCheck, CreditCard, CheckCircle2 } from 'lucide-react';
import { AppUser, Vendor, SubscriptionFrequency, MealType } from '@/types';
import { updateUser } from '@/lib/queries/users';
import { createSubscription } from '@/lib/queries/subscriptions';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type RazorpayPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriptionOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor;
  initialPlanId: string;
  selectedFrequency: SubscriptionFrequency;
  appliedDiscount: { code: string; discount_pct: number } | null;
  onSuccess: () => void;
}

export function SubscriptionOnboardingModal({
  isOpen,
  onClose,
  vendor,
  initialPlanId,
  selectedFrequency,
  appliedDiscount,
  onSuccess
}: SubscriptionOnboardingModalProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [step, setStep] = useState(1);
  const [address, setAddress] = useState(user?.address || '');
  const [location, setLocation] = useState(user?.location || null);
  const [detectingLoc, setDetectingLoc] = useState(false);
  const [planId, setPlanId] = useState(initialPlanId);
  const [deliveryPreference, setDeliveryPreference] = useState<'8am' | '11am' | null>(user?.deliveryPreference || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating_order' | 'awaiting_payment' | 'verifying' | 'activating' | 'done'>('idle');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPlanId(initialPlanId);
      setAddress(user?.address || '');
      setLocation(user?.location || null);
      setDeliveryPreference(user?.deliveryPreference || null);
      setPaymentStatus('idle');
    }
  }, [isOpen, initialPlanId, user]);

  const [activeSub, setActiveSub] = useState<any>(null);

  useEffect(() => {
    if (isOpen && user) {
      const fetchActiveSub = async () => {
        try {
          const subsSnap = await getDocs(query(
            collection(db, 'subscriptions'),
            where('user_id', '==', user.id),
            where('vendor_id', '==', vendor.id),
            where('status', '==', 'active')
          ));
          if (!subsSnap.empty) {
            const active = subsSnap.docs
              .map(d => ({ id: d.id, ...d.data() } as any))
              .find(s => s.meal_type === 'lunch' || s.meal_type === 'dinner');
            setActiveSub(active || null);
          } else {
            setActiveSub(null);
          }
        } catch (err) {
          console.warn('[OnboardingModal] Failed to fetch active sub:', err);
        }
      };
      fetchActiveSub();
    }
  }, [isOpen, user, vendor.id]);

  // Calculate proration credit if upgrading to 'both' combo
  const getProrationCredit = (): { credit: number; activeSubMeal?: string } => {
    if (planId !== 'both' || !activeSub) return { credit: 0 };
    
    let nextBilling = activeSub.next_billing_date?.toDate ? activeSub.next_billing_date.toDate() : null;
    
    // Fallback if missing (for subscriptions created before the fix)
    if (!nextBilling && activeSub.created_at?.toDate) {
      const created = activeSub.created_at.toDate();
      const addDays = activeSub.frequency === 'monthly' ? 30 : activeSub.frequency === 'weekly' ? 7 : 1;
      nextBilling = new Date(created.getTime());
      nextBilling.setDate(nextBilling.getDate() + addDays);
    }

    if (!nextBilling) return { credit: 0 };

    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((nextBilling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    if (daysLeft <= 0) return { credit: 0 };

    const totalDays = activeSub.frequency === 'monthly' ? 30 : activeSub.frequency === 'weekly' ? 7 : 1;
    const paidPrice = activeSub.price ?? activeSub.paid_amount ?? 0;
    const credit = Math.round((paidPrice / totalDays) * daysLeft);

    return { credit, activeSubMeal: activeSub.meal_type };
  };

  const { credit: prorationCredit, activeSubMeal } = getProrationCredit();

  if (!mounted || !user) return null;

  // ── Plan price helpers ────────────────────────────────────────────────────
  const getPrice = (pId: string): number => {
    if (selectedFrequency === 'one-time') return vendor.rate_onetime || 0;
    if (pId === 'lunch') return selectedFrequency === 'monthly'
      ? (vendor.rate_lunch_monthly ?? vendor.rate_lunch_weekly ?? vendor.rate_lunch ?? 0)
      : (vendor.rate_lunch_weekly ?? vendor.rate_lunch ?? 0);
    if (pId === 'dinner') return selectedFrequency === 'monthly'
      ? (vendor.rate_dinner_monthly ?? vendor.rate_dinner_weekly ?? vendor.rate_dinner ?? 0)
      : (vendor.rate_dinner_weekly ?? vendor.rate_dinner ?? 0);
    if (pId === 'both') return selectedFrequency === 'monthly'
      ? (vendor.rate_both_monthly ?? vendor.rate_both_weekly ?? vendor.rate_both ?? 0)
      : (vendor.rate_both_weekly ?? vendor.rate_both ?? 0);
    return 0;
  };

  const basePrice    = getPrice(planId);
  const discountAmt  = appliedDiscount ? Math.round((basePrice * appliedDiscount.discount_pct) / 100) : 0;
  const finalPrice   = Math.max(0, basePrice - discountAmt - prorationCredit);
  const amountPaise  = finalPrice * 100; // Razorpay works in paise

  // ── Step handlers ─────────────────────────────────────────────────────────
  const handleDetectLocation = () => {
    setDetectingLoc(true);
    if (!navigator.geolocation) {
      addToast('Geolocation not supported', 'error');
      setDetectingLoc(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: Date.now() });
        setDetectingLoc(false);
        addToast('Location detected!', 'success');
      },
      () => { setDetectingLoc(false); addToast('Please allow location access.', 'error'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmStep1 = () => {
    if (!address.trim()) { addToast('Please enter an address', 'error'); return; }
    setStep(2);
  };
  const handleConfirmStep2 = () => setStep(3);
  const handleConfirmStep3 = () => {
    if (!deliveryPreference) { addToast('Please select a delivery slot', 'error'); return; }
    setStep(4);
  };

  const activateVerifiedSubscription = async (response: RazorpayPaymentResponse) => {
    // Save user profile updates only after payment verification.
    setPaymentStatus('activating');
    const userUpdates: Partial<AppUser> = {
      address,
      location: location || undefined,
      deliveryPreference: deliveryPreference || undefined,
    };
    await updateUser(user.id, userUpdates);
    setUser({ ...user, ...userUpdates });

    await createSubscription({
      user_id: user.id,
      vendor_id: vendor.id,
      plan_id: planId,
      meal_type: planId as MealType,
      frequency: selectedFrequency,
      discount_pct: appliedDiscount?.discount_pct,
      promo_code: appliedDiscount?.code,
      payment_id: response.razorpay_payment_id,
      razorpay_order_id: response.razorpay_order_id,
      paid_amount: finalPrice,
    });

    setPaymentStatus('done');
    addToast('Subscription activated! 🍛', 'success');
    onSuccess();
    onClose();
  };

  const verifyPayment = async (response: RazorpayPaymentResponse) => {
    setPaymentStatus('verifying');
    const verifyRes = await fetch('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });

    if (!verifyRes.ok) {
      throw new Error(await readApiError(verifyRes, 'Payment verification failed.'));
    }
  };

  // ── Step 4: Razorpay payment flow ─────────────────────────────────────────
  const handleConfirmPay = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (finalPrice === 0) {
        setPaymentStatus('activating');
        const mockResponse = {
          razorpay_payment_id: 'upg_free_' + Math.random().toString(36).slice(2, 9),
          razorpay_order_id: 'upg_free_' + Math.random().toString(36).slice(2, 9),
          razorpay_signature: 'free'
        };
        await activateVerifiedSubscription(mockResponse);
        return;
      }

      // 1. Load Razorpay checkout.js
      setPaymentStatus('creating_order');
      await loadCheckoutScript();

      // 2. Create Razorpay order on the server
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: `sub_${user.id}_${vendor.id}_${planId}`.slice(0, 40),
          notes: {
            user_id: user.id,
            vendor_id: vendor.id,
            plan_id: planId,
            frequency: selectedFrequency,
          },
        }),
      });

      if (!orderRes.ok) {
        throw new Error(await readApiError(orderRes, 'Could not create payment order.'));
      }

      const { order_id } = await orderRes.json();

      // 3. Open Razorpay modal
      setPaymentStatus('awaiting_payment');
      const paymentResponse = await new Promise<RazorpayPaymentResponse>((resolve, reject) => {
        const RazorpayConstructor = (window as any).Razorpay;
        const rzp = new RazorpayConstructor({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E',
          amount: amountPaise,
          currency: 'INR',
          name: vendor.kitchen_name || vendor.name || 'Dabzzo',
          description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan — ${selectedFrequency}`,
          image: vendor.image ? undefined : undefined, // vendor logo if available
          order_id,
          prefill: {
            name: user.name || '',
            contact: user.phone || '',
            email: user.email || '',
          },
          theme: { color: '#f97316' }, // brand orange
          modal: {
            ondismiss: () => {
              reject(new Error('dismissed'));
            },
          },
          handler: (response: RazorpayPaymentResponse) => {
            resolve(response);
          },
        });

        rzp.on('payment.failed', (resp: { error?: { description?: string } }) => {
          reject(new Error(resp.error?.description || 'Payment failed.'));
        });

        rzp.open();
      });

      // 4. Verify payment signature
      await verifyPayment(paymentResponse);

      // 5. Activate subscription
      await activateVerifiedSubscription(paymentResponse);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Payment failed. Please try again.');

      if (message !== 'dismissed') {
        addToast(message, 'error');
      }
      setPaymentStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Status label for loading button ───────────────────────────────────────
  const payButtonLabel = () => {
    switch (paymentStatus) {
      case 'creating_order':  return 'Creating Order…';
      case 'awaiting_payment': return 'Opening Payment…';
      case 'verifying':       return 'Verifying Payment…';
      case 'activating':      return 'Activating Plan…';
      default: return `Pay ₹${finalPrice} with Razorpay`;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed bottom-0 sm:top-1/2 sm:-translate-y-1/2 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 w-full sm:w-[420px] z-[101] p-0 sm:p-4"
          >
            <div
              className="w-full bg-white rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                  {step > 1 && !isSubmitting && (
                    <button onClick={() => setStep(step - 1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                      <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-lg font-black text-slate-900 leading-tight">
                      {step === 1 ? 'Delivery Location' : step === 2 ? 'Select Plan' : step === 3 ? 'Delivery Slot' : 'Confirm & Pay'}
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step {step} of 4</p>
                  </div>
                </div>
                {!isSubmitting && (
                  <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 font-bold">
                    ✕
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto flex-1 bg-white">

                {/* ── Step 1: Location ─────────────────────────────────────── */}
                {step === 1 && (
                  <div className="space-y-5 animate-fade-in">
                    <button
                      onClick={handleDetectLocation}
                      disabled={detectingLoc}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand-50 text-brand rounded-2xl font-bold transition-colors hover:bg-brand-100"
                    >
                      {detectingLoc ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                      {location ? 'Location Detected (Update)' : 'Detect Current Location'}
                    </button>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Complete Address</label>
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Flat/House No, Building, Area"
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium outline-none focus:border-brand/40 transition-colors resize-none"
                      />
                    </div>

                    <button onClick={handleConfirmStep1} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                      Confirm Location
                    </button>
                  </div>
                )}

                {/* ── Step 2: Plan ─────────────────────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-4 animate-fade-in">
                    {(['lunch', 'dinner', 'both'] as const).map((type) => {
                      const p = getPrice(type);
                      if (!p) return null;
                      return (
                        <label
                          key={type}
                          className={`block relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${planId === type ? 'border-brand bg-brand-50/30' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                          <input type="radio" name="plan" value={type} checked={planId === type} onChange={() => setPlanId(type)} className="hidden" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${planId === type ? 'border-brand' : 'border-slate-300'}`}>
                                {planId === type && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                              </div>
                              <span className="font-bold text-slate-900 capitalize">{type === 'both' ? 'Lunch + Dinner' : `${type.charAt(0).toUpperCase() + type.slice(1)} Plan`}</span>
                            </div>
                            <span className="font-black text-slate-900">₹{p}<span className="text-xs font-medium text-slate-400">/{selectedFrequency === 'monthly' ? 'mo' : selectedFrequency === 'weekly' ? 'wk' : 'meal'}</span></span>
                          </div>
                        </label>
                      );
                    })}

                    <button onClick={handleConfirmStep2} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95 mt-4">
                      Confirm Plan
                    </button>
                  </div>
                )}

                {/* ── Step 3: Delivery Slot ─────────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-6 animate-fade-in">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                      Choose a delivery time for your lunch deliveries. This applies to tomorrow's scheduled orders.
                    </p>

                    <div className="flex gap-3">
                      {(['8am', '11am'] as const).map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setDeliveryPreference(slot)}
                          className={`flex-1 py-4 rounded-2xl border-2 transition-all font-bold text-sm ${deliveryPreference === slot ? 'border-brand bg-brand-50 text-brand' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                          {slot === '8am' ? '8:00 AM' : '11:00 AM'}
                        </button>
                      ))}
                    </div>

                    <button onClick={handleConfirmStep3} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                      Confirm Slot
                    </button>
                  </div>
                )}

                {/* ── Step 4: Order Summary + Razorpay Pay Button ──────────── */}
                {step === 4 && (
                  <div className="space-y-5 animate-fade-in">
                    {/* Order breakdown */}
                    <div className="bg-slate-50 p-5 rounded-2xl space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Vendor</span>
                        <span className="font-bold text-slate-900">{vendor.kitchen_name || vendor.name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Plan</span>
                        <span className="font-bold text-slate-900 capitalize">
                          {planId === 'both' ? 'Lunch + Dinner' : `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`} ({selectedFrequency})
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Delivery Slot</span>
                        <span className="font-bold text-slate-900">{deliveryPreference === '8am' ? '8:00 AM' : '11:00 AM'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Address</span>
                        <span className="font-bold text-slate-900 text-right max-w-[60%] truncate">{address}</span>
                      </div>

                      <hr className="border-slate-200 my-1" />

                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Base Price</span>
                        <span className="font-bold text-slate-900">₹{basePrice}</span>
                      </div>
                      {appliedDiscount && (
                        <div className="flex justify-between text-sm text-emerald-600">
                          <span className="font-medium">Discount ({appliedDiscount.code}) — {appliedDiscount.discount_pct}%</span>
                          <span className="font-bold">−₹{discountAmt}</span>
                        </div>
                      )}
                      {prorationCredit > 0 && (
                        <div className="flex justify-between text-sm text-brand">
                          <span className="font-medium">Upgrade Credit ({activeSubMeal} remaining)</span>
                          <span className="font-bold">−₹{prorationCredit}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-bold text-slate-900">Total</span>
                        <span className="text-xl font-black text-brand">₹{finalPrice}</span>
                      </div>
                    </div>

                    {/* Trust badge */}
                    <div className="flex items-center gap-2 px-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-xs text-slate-500 font-medium">Secured by Razorpay — 100% safe & encrypted</p>
                    </div>

                    {/* Pay button */}
                    <button
                      id="razorpay-subscription-pay-btn"
                      onClick={handleConfirmPay}
                      disabled={isSubmitting}
                      className="w-full py-4 flex items-center justify-center gap-2.5 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-brand/25 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-brand/90"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {payButtonLabel()}
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Pay ₹{finalPrice} with Razorpay
                        </>
                      )}
                    </button>

                    {/* Razorpay logo / accepted methods hint */}
                    <p className="text-center text-[11px] text-slate-400 font-medium">
                      UPI · Cards · Net Banking · Wallets accepted
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
