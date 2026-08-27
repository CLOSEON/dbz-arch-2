'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin, ArrowLeft, ShieldCheck, CreditCard, Plus, Check, Leaf, Drumstick, Sparkles } from 'lucide-react';
import { AppUser, SubscriptionFrequency, MealType, DietaryCategory, SelectedAddon } from '@/types';
import { updateUser } from '@/lib/queries/users';
import { createSubscription } from '@/lib/queries/subscriptions';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { createRazorpayOrder, verifyPaymentSignature, loadRazorpayCheckoutScript } from '@/lib/razorpay';

type RazorpayPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

interface SubscriptionOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: AppUser;
  initialPlanId: string;
  category?: DietaryCategory;
  selectedFrequency: SubscriptionFrequency;
  appliedDiscount: { code: string; discount_pct: number } | null;
  onSuccess: () => void;
}

export function SubscriptionOnboardingModal({
  isOpen,
  onClose,
  vendor,
  initialPlanId,
  category: initialCategory = 'veg',
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
  const [planId, setPlanId] = useState(initialPlanId || 'lunch');
  const [dietaryCategory, setDietaryCategory] = useState<DietaryCategory>(initialCategory);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [deliveryPreference, setDeliveryPreference] = useState<'8am' | '11am' | null>(user?.deliveryPreference || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating_order' | 'awaiting_payment' | 'verifying' | 'activating' | 'done'>('idle');
  const [mounted, setMounted] = useState(false);
  const [activeSub, setActiveSub] = useState<any>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPlanId(initialPlanId || 'lunch');
      setDietaryCategory(initialCategory || 'veg');
      setSelectedAddonIds([]);
      setAddress(user?.address || '');
      setLocation(user?.location || null);
      setDeliveryPreference(user?.deliveryPreference || null);
      setPaymentStatus('idle');
    }
  }, [isOpen, initialPlanId, initialCategory, user]);

  useEffect(() => {
    if (isOpen && user && vendor.id) {
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

  if (!mounted || !user) return null;

  // Add-ons list
  const activeVendorAddons = (vendor.addons || []).filter(a => a.active);

  // Helper for Add-On price by subscription frequency
  const getAddonPriceForFrequency = (addon: typeof activeVendorAddons[0]): number => {
    if (selectedFrequency === 'monthly') return addon.monthly_price;
    if (selectedFrequency === 'weekly') return addon.weekly_price || Math.round(addon.monthly_price / 4);
    return addon.onetime_price || Math.round(addon.monthly_price / 30);
  };

  const totalAddonsPrice = selectedAddonIds.reduce((sum, id) => {
    const found = activeVendorAddons.find(a => a.id === id);
    return sum + (found ? getAddonPriceForFrequency(found) : 0);
  }, 0);

  // Plan price calculation based on dietaryCategory
  const isNonVeg = dietaryCategory === 'non_veg';
  const getBasePlanPrice = (pId: string): number => {
    if (selectedFrequency === 'one-time') {
      return isNonVeg ? (vendor.rate_nonveg_onetime || 0) : (vendor.rate_veg_onetime ?? vendor.rate_onetime ?? 0);
    }
    if (pId === 'lunch') {
      return selectedFrequency === 'monthly'
        ? (isNonVeg ? (vendor.rate_nonveg_lunch_monthly || 0) : (vendor.rate_veg_lunch_monthly ?? vendor.rate_lunch_monthly ?? vendor.rate_lunch ?? 0))
        : (isNonVeg ? (vendor.rate_nonveg_lunch_weekly || 0) : (vendor.rate_veg_lunch_weekly ?? vendor.rate_lunch_weekly ?? vendor.rate_lunch ?? 0));
    }
    if (pId === 'dinner') {
      return selectedFrequency === 'monthly'
        ? (isNonVeg ? (vendor.rate_nonveg_dinner_monthly || 0) : (vendor.rate_veg_dinner_monthly ?? vendor.rate_dinner_monthly ?? vendor.rate_dinner ?? 0))
        : (isNonVeg ? (vendor.rate_nonveg_dinner_weekly || 0) : (vendor.rate_veg_dinner_weekly ?? vendor.rate_dinner_weekly ?? vendor.rate_dinner ?? 0));
    }
    if (pId === 'both') {
      return selectedFrequency === 'monthly'
        ? (isNonVeg ? (vendor.rate_nonveg_both_monthly || 0) : (vendor.rate_veg_both_monthly ?? vendor.rate_both_monthly ?? vendor.rate_both ?? 0))
        : (isNonVeg ? (vendor.rate_nonveg_both_weekly || 0) : (vendor.rate_veg_both_weekly ?? vendor.rate_both_weekly ?? vendor.rate_both ?? 0));
    }
    return 0;
  };

  // Proration calculation
  const getProrationCredit = (): { credit: number; activeSubMeal?: string } => {
    if (planId !== 'both' || !activeSub) return { credit: 0 };
    let nextBilling = activeSub.next_billing_date?.toDate ? activeSub.next_billing_date.toDate() : null;
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
  const basePrice = getBasePlanPrice(planId);
  const discountAmt = appliedDiscount ? Math.round((basePrice * appliedDiscount.discount_pct) / 100) : 0;
  const finalPrice = Math.max(0, basePrice + totalAddonsPrice - discountAmt - prorationCredit);
  const amountPaise = finalPrice * 100;

  const handleToggleAddon = (id: string) => {
    setSelectedAddonIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

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
  const handleConfirmStep3 = () => setStep(4);
  const handleConfirmStep4 = () => {
    if (!deliveryPreference) { addToast('Please select a delivery slot', 'error'); return; }
    setStep(5);
  };

  const activateVerifiedSubscription = async (response: RazorpayPaymentResponse) => {
    setPaymentStatus('activating');
    const userUpdates: Partial<AppUser> = {
      address,
      location: location || undefined,
      deliveryPreference: deliveryPreference || undefined,
    };
    await updateUser(user.id, userUpdates);
    setUser({ ...user, ...userUpdates });

    const structuredAddons: SelectedAddon[] = selectedAddonIds.map(id => {
      const a = activeVendorAddons.find(item => item.id === id)!;
      return {
        id: a.id,
        name: a.name,
        monthly_price: a.monthly_price,
        weekly_price: a.weekly_price,
        onetime_price: a.onetime_price,
        price_paid: getAddonPriceForFrequency(a),
      };
    });

    await createSubscription({
      user_id: user.id,
      vendor_id: vendor.id,
      plan_id: planId,
      meal_type: planId as MealType,
      category: dietaryCategory,
      frequency: selectedFrequency,
      selected_addons: structuredAddons,
      base_price: basePrice,
      addons_price: totalAddonsPrice,
      total_price: basePrice + totalAddonsPrice,
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
    await verifyPaymentSignature(
      response.razorpay_payment_id,
      response.razorpay_order_id,
      response.razorpay_signature
    );
  };

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

      setPaymentStatus('creating_order');
      await loadRazorpayCheckoutScript();

      const order = await createRazorpayOrder(
        amountPaise,
        `sub_${user.id}_${vendor.id}_${planId}`.slice(0, 40),
        {
          user_id: user.id,
          vendor_id: vendor.id,
          plan_id: planId,
          frequency: selectedFrequency,
          category: dietaryCategory,
        },
        vendor.id
      );

      const order_id = order.order_id;
      setPaymentStatus('awaiting_payment');

      const paymentResponse = await new Promise<RazorpayPaymentResponse>((resolve, reject) => {
        const RazorpayConstructor = (window as any).Razorpay;
        if (!RazorpayConstructor) {
          reject(new Error('Razorpay SDK failed to load. Please check your internet connection.'));
          return;
        }

        const rzp = new RazorpayConstructor({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E',
          amount: amountPaise,
          currency: 'INR',
          name: vendor.kitchen_name || vendor.name || 'Dabzzo',
          description: `${dietaryCategory === 'non_veg' ? '🍗 Non-Veg ' : '🌿 Veg '}${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan — ${selectedFrequency}`,
          image: vendor.image || undefined,
          order_id,
          prefill: {
            name: user.name || '',
            contact: user.phone || '',
            email: user.email || '',
          },
          theme: { color: '#f97316' },
          modal: {
            ondismiss: () => {
              reject(new Error('dismissed'));
            },
          },
          handler: (resp: RazorpayPaymentResponse) => {
            resolve(resp);
          },
        });

        rzp.on('payment.failed', (resp: { error?: { description?: string } }) => {
          reject(new Error(resp.error?.description || 'Payment failed.'));
        });

        rzp.open();
      });

      await verifyPayment(paymentResponse);
      await activateVerifiedSubscription(paymentResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      if (message !== 'dismissed') {
        addToast(message, 'error');
      }
      setPaymentStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const payButtonLabel = () => {
    switch (paymentStatus) {
      case 'creating_order':  return 'Creating Order…';
      case 'awaiting_payment': return 'Opening Payment…';
      case 'verifying':       return 'Verifying Payment…';
      case 'activating':      return 'Activating Plan…';
      default: return `Pay ₹${finalPrice} with Razorpay`;
    }
  };

  const hasVeg = !vendor.dietary_categories || vendor.dietary_categories.includes('veg');
  const hasNonVeg = vendor.dietary_categories?.includes('non_veg');
  const hasBoth = hasVeg && hasNonVeg;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed bottom-0 sm:top-1/2 sm:-translate-y-1/2 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 w-full sm:w-[460px] z-[101] p-0 sm:p-4"
          >
            <div
              className="w-full bg-white rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
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
                      {step === 1 ? 'Delivery Location' : step === 2 ? 'Select Plan & Category' : step === 3 ? 'Add-Ons & Extras' : step === 4 ? 'Delivery Slot' : 'Confirm & Pay'}
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step {step} of 5</p>
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
                        placeholder="Flat/House No, Building, Street, Landmark"
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium outline-none focus:border-brand/40 transition-colors resize-none"
                      />
                    </div>

                    <button onClick={handleConfirmStep1} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                      Confirm Location
                    </button>
                  </div>
                )}

                {/* ── Step 2: Plan & Category ──────────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-5 animate-fade-in">
                    {/* Dietary Category Selector */}
                    {hasBoth && (
                      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => setDietaryCategory('veg')}
                          className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                            dietaryCategory === 'veg'
                              ? 'bg-white text-emerald-700 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Leaf className="w-4 h-4 text-emerald-600" /> Pure Veg
                        </button>
                        <button
                          type="button"
                          onClick={() => setDietaryCategory('non_veg')}
                          className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                            dietaryCategory === 'non_veg'
                              ? 'bg-white text-rose-700 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Drumstick className="w-4 h-4 text-rose-600" /> Non-Veg
                        </button>
                      </div>
                    )}

                    <div className="space-y-3">
                      {(['lunch', 'dinner', 'both'] as const).map((type) => {
                        const p = getBasePlanPrice(type);
                        if (!p) return null;
                        return (
                          <label
                            key={type}
                            className={`block relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                              planId === type ? 'border-brand bg-brand-50/20' : 'border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <input type="radio" name="plan" value={type} checked={planId === type} onChange={() => setPlanId(type)} className="hidden" />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${planId === type ? 'border-brand' : 'border-slate-300'}`}>
                                  {planId === type && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-900 block leading-tight capitalize">
                                    {type === 'both' ? 'Lunch + Dinner' : `${type.charAt(0).toUpperCase() + type.slice(1)} Plan`}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {dietaryCategory === 'non_veg' ? '🍗 Non-Vegetarian' : '🌿 Pure Veg'}
                                  </span>
                                </div>
                              </div>
                              <span className="font-black text-slate-900 text-sm">
                                ₹{p}<span className="text-[10px] font-bold text-slate-400">/{selectedFrequency === 'monthly' ? 'mo' : selectedFrequency === 'weekly' ? 'wk' : 'meal'}</span>
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <button onClick={handleConfirmStep2} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                      Confirm Plan
                    </button>
                  </div>
                )}

                {/* ── Step 3: Add-Ons & Extras ─────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-black text-slate-900">Customise Your Tiffin with Add-Ons</h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Add daily sweets, extra curd, or special side dishes directly to your recurring subscription.
                      </p>
                    </div>

                    {activeVendorAddons.length === 0 ? (
                      <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100">
                        <p className="text-xs font-bold text-slate-400">No add-ons available for this kitchen right now.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                        {activeVendorAddons.map((addon) => {
                          const isSelected = selectedAddonIds.includes(addon.id);
                          const addonPrice = getAddonPriceForFrequency(addon);

                          return (
                            <div
                              key={addon.id}
                              onClick={() => handleToggleAddon(addon.id)}
                              className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                isSelected ? 'border-amber-500 bg-amber-50/30' : 'border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                                <div>
                                  <p className="text-xs font-black text-slate-900 leading-tight">{addon.name}</p>
                                  {addon.description && (
                                    <p className="text-[10px] text-slate-400 mt-0.5">{addon.description}</p>
                                  )}
                                </div>
                              </div>

                              <span className="text-xs font-black text-amber-800">
                                +₹{addonPrice}
                                <span className="text-[9px] font-bold text-slate-400">
                                  /{selectedFrequency === 'monthly' ? 'mo' : selectedFrequency === 'weekly' ? 'wk' : 'meal'}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="pt-2">
                      <button onClick={handleConfirmStep3} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                        {selectedAddonIds.length > 0 ? `Continue with ${selectedAddonIds.length} Add-On${selectedAddonIds.length > 1 ? 's' : ''}` : 'Skip Add-Ons'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Step 4: Delivery Slot ─────────────────────────────────── */}
                {step === 4 && (
                  <div className="space-y-6 animate-fade-in">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                      Choose a convenient delivery window for your meal orders.
                    </p>

                    <div className="flex gap-3">
                      {(['8am', '11am'] as const).map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setDeliveryPreference(slot)}
                          className={`flex-1 py-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                            deliveryPreference === slot ? 'border-brand bg-brand-50 text-brand' : 'border-slate-100 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {slot === '8am' ? '8:00 AM' : '11:00 AM'}
                        </button>
                      ))}
                    </div>

                    <button onClick={handleConfirmStep4} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95">
                      Confirm Slot
                    </button>
                  </div>
                )}

                {/* ── Step 5: Order Summary + Razorpay Pay Button ──────────── */}
                {step === 5 && (
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
                          {dietaryCategory === 'non_veg' ? '🍗 Non-Veg ' : '🌿 Veg '}
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

                      {/* Selected Add-Ons summary */}
                      {selectedAddonIds.length > 0 && (
                        <div className="pt-2 border-t border-slate-200">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Selected Add-Ons</span>
                          {selectedAddonIds.map(id => {
                            const a = activeVendorAddons.find(item => item.id === id);
                            if (!a) return null;
                            const price = getAddonPriceForFrequency(a);
                            return (
                              <div key={id} className="flex justify-between text-xs text-slate-700 py-0.5">
                                <span>+ {a.name}</span>
                                <span className="font-bold">₹{price}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <hr className="border-slate-200 my-1" />

                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Base Plan Price</span>
                        <span className="font-bold text-slate-900">₹{basePrice}</span>
                      </div>
                      {totalAddonsPrice > 0 && (
                        <div className="flex justify-between text-sm text-amber-800">
                          <span className="font-medium">Add-Ons Total</span>
                          <span className="font-bold">+₹{totalAddonsPrice}</span>
                        </div>
                      )}
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
                        <span className="font-bold text-slate-900">Total Payable</span>
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
