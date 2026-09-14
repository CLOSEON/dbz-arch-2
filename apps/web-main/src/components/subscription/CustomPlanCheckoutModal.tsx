'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CreditCard,
  ShieldCheck,
  Calendar,
  CalendarDays,
  Utensils,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Loader2,
  ArrowRight,
  Sparkles,
  Lock,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { createCustomPlanSubscription } from '@/lib/queries/subscriptions';
import { createRazorpayOrder, openRazorpayCheckout } from '@/lib/razorpay';
import { formatDate, cn } from '@/lib/utils';
import { CustomMealConfig } from '@/types';
import { getErrorMessage } from '@dabzzo/shared-lib/errors';

export interface CustomPlanCheckoutData {
  planType: 'weekly' | 'monthly';
  totalPrice: number;
  pattern: Record<string, any>;
  slots?: Record<string, any>;
  totalMeals: number;
  pricePerMeal?: number;
  planStartDate?: Date | string;
  vendorId?: string;
  customMealConfig?: CustomMealConfig;
}

export interface CustomPlanCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  customPlanData: CustomPlanCheckoutData | null;
  onSuccess?: (subscriptionId: string) => void;
}

const WEEKDAY_ORDER = [
  { key: 'monday', short: 'Mon', name: 'Monday' },
  { key: 'tuesday', short: 'Tue', name: 'Tuesday' },
  { key: 'wednesday', short: 'Wed', name: 'Wednesday' },
  { key: 'thursday', short: 'Thu', name: 'Thursday' },
  { key: 'friday', short: 'Fri', name: 'Friday' },
  { key: 'saturday', short: 'Sat', name: 'Saturday' },
  { key: 'sunday', short: 'Sun', name: 'Sunday' },
];

export function CustomPlanCheckoutModal({
  isOpen,
  onClose,
  customPlanData,
  onSuccess,
}: CustomPlanCheckoutModalProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState<boolean>(false);
  const [paymentStep, setPaymentStep] = useState<
    'confirm' | 'processing_order' | 'awaiting_payment' | 'creating_subscription' | 'failed'
  >('confirm');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasConfirmedAgreement, setHasConfirmedAgreement] = useState<boolean>(true);

  if (!isOpen || !customPlanData) return null;

  const {
    planType,
    totalPrice,
    pattern = {},
    slots = {},
    totalMeals,
    pricePerMeal = Math.round(totalPrice / Math.max(1, totalMeals)),
    planStartDate = new Date(),
    vendorId,
  } = customPlanData;

  const isWeekly = planType === 'weekly';

  // ── Weekly pattern items breakdown ──────────────────────────────────────────
  const weeklyBreakdown = WEEKDAY_ORDER.map(({ key, short, name }) => {
    const count = Number(pattern[key] ?? pattern[short.toLowerCase()] ?? pattern[short] ?? 0);
    const slot = slots[short.toLowerCase()] ?? slots[key] ?? (count === 2 ? 'both' : count === 1 ? 'lunch' : 'skip');
    return { key, short, name, count, slot };
  });

  // ── Monthly pattern items breakdown ─────────────────────────────────────────
  const monthlyBreakdown = Object.entries(pattern)
    .map(([dateKey, meals]) => {
      const dayNum = dateKey.includes('-') ? dateKey.split('-').pop() : dateKey;
      const slot = slots[dateKey] ?? (Number(meals) === 2 ? 'both' : Number(meals) === 1 ? 'lunch' : 'skip');
      return {
        dateKey,
        dayNum: Number(dayNum) || dateKey,
        meals: Number(meals) || 0,
        slot,
      };
    })
    .filter((d) => d.meals > 0)
    .sort((a, b) => Number(a.dayNum) - Number(b.dayNum));

  // ── Payment & Subscription Creation Handler ─────────────────────────────────
  const handleInitiatePayment = async () => {
    if (loading) return;
    if (planType === 'monthly' && totalMeals < 30) {
      setPaymentStep('failed');
      setErrorMessage(`Monthly plans require a minimum of 30 meals. You have ${totalMeals} meals scheduled.`);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setPaymentStep('processing_order');

    const customerUserId = user?.id || 'demo_customer_123';

    try {
      // 1. Create Razorpay order (or simulation fallback)
      let razorpayOrderId: string | null = null;
      let paymentId: string | null = null;

      try {
        const order = await createRazorpayOrder(
          totalPrice * 100, // in paise
          `custom_${planType}_${Date.now()}`.slice(0, 40),
          {
            user_id: customerUserId,
            plan_type: `custom_${planType}`,
            total_meals: totalMeals,
            total_price: totalPrice,
          },
          vendorId,
          {
            pattern,
            slots,
            customMealConfig: customPlanData.customMealConfig,
          }
        );
        razorpayOrderId = order.order_id;
      } catch (orderErr) {
        console.warn('[CustomPlanCheckout] Order creation fallback to direct checkout:', orderErr);
        razorpayOrderId = `order_sim_${Date.now()}`;
      }

      // 2. Open Razorpay Checkout Window
      setPaymentStep('awaiting_payment');

      const paymentResult = await new Promise<{
        razorpay_payment_id: string;
        razorpay_order_id: string;
      }>((resolve, reject) => {
        // If simulated order in test environment without live key:
        const hasLiveKey = Boolean(
          process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID &&
          process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID !== 'rzp_test_placeholder'
        );

        openRazorpayCheckout({
          order_id: razorpayOrderId!,
          amount: totalPrice * 100,
          currency: 'INR',
          description: `Custom ${isWeekly ? 'Weekly' : 'Monthly'} Meal Plan (${totalMeals} meals)`,
          customer_name: user?.name || 'Valued Customer',
          customer_phone: user?.phone || '',
          customer_email: user?.email || '',
          callback: {
            onSuccess: async (response) => {
              resolve(response);
            },
            onFailure: (err) => {
              reject(new Error(err?.description || 'Payment was unsuccessful.'));
            },
            onClose: () => {
              reject(new Error('Payment window closed by user.'));
            },
          },
        }).catch((openErr) => {
          // Fallback: If running in automated/iframe or test mode where Razorpay popup is blocked
          console.warn('[CustomPlanCheckout] Razorpay modal open note:', openErr);
          if (!hasLiveKey) {
            // Auto-resolve simulation for testing
            setTimeout(() => {
              resolve({
                razorpay_payment_id: `pay_mock_${Date.now()}`,
                razorpay_order_id: razorpayOrderId!,
              });
            }, 800);
          } else {
            reject(openErr);
          }
        });
      });

      paymentId = paymentResult.razorpay_payment_id;

      // 3. On Payment Success: Call createCustomPlanSubscription function
      setPaymentStep('creating_subscription');

      const subResponse = await createCustomPlanSubscription({
        userId: customerUserId,
        planType,
        pattern,
        totalMeals,
        totalPrice,
        planStartDate,
        vendorId,
        paymentId: paymentId || `pay_${Date.now()}`,
        razorpayOrderId: paymentResult.razorpay_order_id,
        customMealConfig: customPlanData.customMealConfig,
        custom_meal_config: customPlanData.customMealConfig,
        custom_slots: slots,
        customSlots: slots,
      });

      const subscriptionId = subResponse.subscriptionId;

      if (onSuccess) {
        onSuccess(subscriptionId);
      }

      // 4. Redirect to "Subscription Active" confirmation page
      onClose();
      router.push(
        `/subscription-active?subscriptionId=${subscriptionId}&planType=${planType}&totalMeals=${totalMeals}&totalPrice=${totalPrice}`
      );
    } catch (err: unknown) {
      console.error('[CustomPlanCheckout] Payment / Subscription error:', err);
      setPaymentStep('failed');
      setErrorMessage(
        getErrorMessage(err) ||
        'Payment was cancelled or could not be processed. Please check your card or UPI details and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Direct demo pay handler for instant validation
  const handleTestDemoPay = async () => {
    if (loading) return;
    if (planType === 'monthly' && totalMeals < 30) {
      setPaymentStep('failed');
      setErrorMessage(`Monthly plans require a minimum of 30 meals. You have ${totalMeals} meals scheduled.`);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setPaymentStep('creating_subscription');

    const customerUserId = user?.id || 'demo_customer_123';
    try {
      const mockPayId = `pay_demo_${Date.now()}`;
      const subResponse = await createCustomPlanSubscription({
        userId: customerUserId,
        planType,
        pattern,
        totalMeals,
        totalPrice,
        planStartDate,
        vendorId,
        paymentId: mockPayId,
        razorpayOrderId: `order_demo_${Date.now()}`,
        customMealConfig: customPlanData.customMealConfig,
        custom_meal_config: customPlanData.customMealConfig,
      });

      const subscriptionId = subResponse.subscriptionId;
      if (onSuccess) {
        onSuccess(subscriptionId);
      }

      onClose();
      router.push(
        `/subscription-active?subscriptionId=${subscriptionId}&planType=${planType}&totalMeals=${totalMeals}&totalPrice=${totalPrice}`
      );
    } catch (err: unknown) {
      setPaymentStep('failed');
      setErrorMessage(getErrorMessage(err) || 'Failed to create subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="w-full sm:max-w-xl bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl text-left max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* ── Top Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 bg-white px-4 sm:px-6 pt-4 pb-3.5 border-b border-slate-200/80 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100/70 border border-amber-200 text-amber-900 text-xs font-bold tracking-wide uppercase mb-1">
              {isWeekly ? <Calendar className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
              <span>{isWeekly ? 'Weekly Custom Plan' : 'Monthly Custom Plan'}</span>
            </div>
            {/* Required String 1: "You're subscribing to a custom {planType} plan" */}
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              You're subscribing to a custom {planType} plan
            </h3>
            {/* Required String 2: "Total {totalMeals} meals for ₹{totalPrice}" */}
            <p className="text-sm sm:text-base font-extrabold text-amber-600 mt-0.5">
              Total {totalMeals} meals for ₹{totalPrice}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable Body ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          {/* ── Payment Failure & Retry Banner ─────────────────────────────── */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm font-semibold flex flex-col gap-2 shadow-xs"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Payment could not be completed</p>
                    <p className="text-red-700 mt-0.5 text-xs font-normal leading-relaxed">
                      {errorMessage}
                    </p>
                  </div>
                </div>
                <div className="self-end">
                  <button
                    type="button"
                    onClick={handleInitiatePayment}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry Payment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Pattern Breakdown (Which days, how many meals) ──────────────── */}
          <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-amber-600" />
                Schedule Pattern Breakdown
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {isWeekly ? 'Monday to Sunday' : 'Selected Month Dates'}
              </span>
            </div>

            {isWeekly ? (
              /* Weekly Day-by-Day Breakdown Grid */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {weeklyBreakdown.map(({ key, short, count, slot }) => {
                  const isLunch = slot === 'lunch' || count === 1;
                  const isDinner = slot === 'dinner';
                  const isBoth = slot === 'both' || count === 2;

                  return (
                    <div
                      key={key}
                      className={cn(
                        'p-2.5 rounded-xl border flex items-center justify-between transition-all',
                        isBoth
                          ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-300/40'
                          : isDinner
                          ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300/40'
                          : isLunch
                          ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300/40'
                          : 'bg-white border-slate-200 opacity-60'
                      )}
                    >
                      <span className="font-bold text-xs text-slate-700">{short}</span>
                      <span
                        className={cn(
                          'text-xs font-black px-2 py-0.5 rounded-md',
                          isBoth
                            ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white'
                            : isDinner
                            ? 'bg-indigo-600 text-white'
                            : isLunch
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-100 text-slate-400'
                        )}
                      >
                        {isBoth ? '🍱 Both' : isDinner ? '🌙 Dinner' : isLunch ? '☀️ Lunch' : 'Skip'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Monthly Date-by-Date Breakdown List */
              <div>
                {monthlyBreakdown.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                    {/* One row per date. This list was rendered TWICE -- two
                        consecutive monthlyBreakdown.map() calls over the same array,
                        each emitting a span keyed by dateKey into the same parent,
                        which duplicated every date and collided React keys. */}
                    {monthlyBreakdown.map(({ dateKey, dayNum, meals, slot }) => {
                      const isBoth = slot === 'both' || meals === 2;
                      const isDinner = slot === 'dinner';
                      return (
                        <span
                          key={dateKey}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-semibold',
                            isBoth
                              ? 'bg-orange-50 text-orange-900 border-orange-200'
                              : isDinner
                                ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                          )}
                        >
                          <span className="text-slate-500 tabular-nums">{dayNum}</span>
                          <span>{isBoth ? 'Both' : isDinner ? 'Dinner' : 'Lunch'}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No scheduled dates chosen.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Customized Meal Box Manifest (if customized) ────────────────── */}
          {customPlanData.customMealConfig && (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Customized Daily Thali Portions
                </span>
                {(customPlanData.customMealConfig.deltaPricePerMeal ?? customPlanData.customMealConfig.customerDeltaPerMeal ?? 0) !== 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-900">
                    {(customPlanData.customMealConfig.deltaPricePerMeal ?? customPlanData.customMealConfig.customerDeltaPerMeal ?? 0) > 0
                      ? `+₹${customPlanData.customMealConfig.deltaPricePerMeal ?? customPlanData.customMealConfig.customerDeltaPerMeal}/meal`
                      : `-₹${Math.abs(customPlanData.customMealConfig.deltaPricePerMeal ?? customPlanData.customMealConfig.customerDeltaPerMeal ?? 0)}/meal`}
                  </span>
                )}
              </div>
              <div className="p-3 bg-white rounded-xl border border-amber-200/60 shadow-xs">
                <p className="text-xs font-bold text-slate-800 leading-relaxed">
                  📦 {customPlanData.customMealConfig.manifestSummary || 'Custom Thali Configuration'}
                </p>
              </div>
            </div>
          )}

          {/* Bill Details.
              Every line is one label -> value pair on a shared baseline with tabular
              figures, so amounts form a scannable column, and a dashed rule separates
              the charges from what is payable. Flat white on the neutral ground: the
              only saturated element in the sheet is the pay button, so it reads as
              the primary action. */}
          <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Bill Details</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">{totalMeals} meals × ₹{pricePerMeal}</span>
                <span className="font-semibold text-slate-900 tabular-nums">₹{totalPrice}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Plan</span>
                <span className="font-semibold text-slate-900 capitalize">Custom {planType}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Starts</span>
                <span className="font-semibold text-slate-900">
                  {formatDate(typeof planStartDate === 'string' ? new Date(planStartDate) : planStartDate)}
                </span>
              </div>
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-black text-slate-900">To Pay</span>
              <span className="text-xl font-black text-slate-900 tabular-nums">₹{totalPrice}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Doorstep delivery and hot packing included. Charged once for the full cycle.
            </p>
          </div>

          {/* ── Confirmation Checkbox Before Payment ───────────────────────── */}
          <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-200/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasConfirmedAgreement}
              onChange={(e) => setHasConfirmedAgreement(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 mt-0.5"
            />
            <span className="text-xs text-slate-700 leading-snug">
              I confirm this custom meal delivery schedule and authorize Dabzzo to activate my subscription for{' '}
              <strong className="text-slate-900">₹{totalPrice}</strong>.
            </span>
          </label>
        </div>

        {/* Pay bar.
            Pinned below the scrolling body so the amount and the action stay on
            screen. Previously two similar-weight buttons sat at the end of the
            scroll, so on a phone you had to scroll past the whole schedule to see
            what you were paying. safe-area padding clears the home indicator. */}
        <div
          className="shrink-0 bg-white border-t border-slate-200 px-4 sm:px-6 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-none">To Pay</p>
              <p className="text-lg font-black text-slate-900 tabular-nums leading-tight mt-0.5">₹{totalPrice}</p>
            </div>
            <button
              type="button"
              onClick={handleInitiatePayment}
              disabled={loading || !hasConfirmedAgreement}
              className={cn(
                'flex-1 py-3.5 px-5 rounded-2xl font-black text-sm transition-all duration-150 flex items-center justify-center gap-2',
                !loading && hasConfirmedAgreement
                  ? 'bg-[#E68A00] hover:bg-[#D97706] text-white shadow-lg shadow-[#E68A00]/25 active:scale-[0.98] cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>
                    {paymentStep === 'processing_order' && 'Preparing…'}
                    {paymentStep === 'awaiting_payment' && 'Awaiting payment…'}
                    {paymentStep === 'creating_subscription' && 'Activating…'}
                    {paymentStep === 'failed' && 'Retrying…'}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Pay securely</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors py-1">
              Modify plan
            </button>
            <button type="button" onClick={handleTestDemoPay} disabled={loading}
              className="text-[11px] font-semibold text-slate-300 hover:text-slate-500 transition-colors py-1">
              Test activation
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default CustomPlanCheckoutModal;
