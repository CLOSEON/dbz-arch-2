'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin, MapPinOff, ArrowLeft } from 'lucide-react';
import { AppUser, Vendor, SubscriptionFrequency } from '@/types';
import { updateUser } from '@/lib/queries/users';
import { createSubscription } from '@/lib/queries/subscriptions';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { createPortal } from 'react-dom';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPlanId(initialPlanId);
      setAddress(user?.address || '');
      setLocation(user?.location || null);
      setDeliveryPreference(user?.deliveryPreference || null);
    }
  }, [isOpen, initialPlanId, user]);

  if (!mounted || !isOpen || !user) return null;

  const handleDetectLocation = () => {
    setDetectingLoc(true);
    if (!navigator.geolocation) {
      addToast('Geolocation is not supported by your browser', 'error');
      setDetectingLoc(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: Date.now() });
        setDetectingLoc(false);
        addToast('Location detected!', 'success');
      },
      (err) => {
        setDetectingLoc(false);
        addToast('Failed to get location. Please allow access.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmStep1 = () => {
    if (!address.trim()) {
      addToast('Please enter an address', 'error');
      return;
    }
    setStep(2);
  };

  const handleConfirmStep2 = () => {
    setStep(3);
  };

  const handleConfirmStep3 = () => {
    if (!deliveryPreference) {
      addToast('Please select a delivery slot', 'error');
      return;
    }
    setStep(4);
  };

  const handleConfirmPay = async () => {
    setIsSubmitting(true);
    try {
      // 1. Update user profile
      const userUpdates: Partial<AppUser> = {
        address,
        location: location || undefined,
        deliveryPreference: deliveryPreference || undefined
      };
      
      await updateUser(user.id, userUpdates);
      setUser({ ...user, ...userUpdates });

      // 2. Create subscription
      await createSubscription({
        user_id: user.id,
        vendor_id: vendor.id,
        plan_id: planId,
        meal_type: planId as any,
        frequency: selectedFrequency,
        discount_pct: appliedDiscount?.discount_pct,
        promo_code: appliedDiscount?.code,
      });

      addToast('Subscription active! 🍛', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      addToast('Failed to subscribe. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Plan calculation
  const getPrice = (pId: string) => {
    if (selectedFrequency === 'one-time') return vendor.rate_onetime || 0;
    if (pId === 'lunch') return selectedFrequency === 'monthly' ? (vendor.rate_lunch_monthly ?? vendor.rate_lunch_weekly ?? 0) : (vendor.rate_lunch_weekly ?? 0);
    if (pId === 'dinner') return selectedFrequency === 'monthly' ? (vendor.rate_dinner_monthly ?? vendor.rate_dinner_weekly ?? 0) : (vendor.rate_dinner_weekly ?? 0);
    if (pId === 'both') return selectedFrequency === 'monthly' ? (vendor.rate_both_monthly ?? vendor.rate_both_weekly ?? 0) : (vendor.rate_both_weekly ?? 0);
    return 0;
  };

  const basePrice = getPrice(planId);
  const discountAmount = appliedDiscount ? (basePrice * appliedDiscount.discount_pct) / 100 : 0;
  const finalPrice = basePrice - discountAmount;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4 animate-fade-in bg-black/40 backdrop-blur-sm">
      <div 
        className="w-full sm:w-[400px] bg-white rounded-t-[2rem] sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {step > 1 && (
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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500 font-bold">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto">
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

              <button 
                onClick={handleConfirmStep1}
                className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95"
              >
                Confirm Location
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              {['lunch', 'dinner', 'both'].map((type) => {
                const p = getPrice(type);
                if (!p) return null; // Vendor doesn't offer this plan
                return (
                  <label key={type} className={`block relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${planId === type ? 'border-brand bg-brand-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                    <input 
                      type="radio" 
                      name="plan" 
                      value={type} 
                      checked={planId === type} 
                      onChange={() => setPlanId(type)}
                      className="hidden"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${planId === type ? 'border-brand' : 'border-slate-300'}`}>
                          {planId === type && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                        </div>
                        <span className="font-bold text-slate-900 capitalize">{type} Plan</span>
                      </div>
                      <span className="font-black text-slate-900">₹{p}</span>
                    </div>
                  </label>
                )
              })}

              <button 
                onClick={handleConfirmStep2}
                className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95 mt-4"
              >
                Confirm Plan
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Choose a delivery time slot for your lunch deliveries. This applies to tomorrow's scheduled orders.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setDeliveryPreference('8am')}
                  className={`flex-1 py-4 rounded-2xl border-2 transition-all font-bold text-sm ${deliveryPreference === '8am' ? 'border-brand bg-brand-50 text-brand' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                >
                  8:00 AM
                </button>
                <button
                  onClick={() => setDeliveryPreference('11am')}
                  className={`flex-1 py-4 rounded-2xl border-2 transition-all font-bold text-sm ${deliveryPreference === '11am' ? 'border-brand bg-brand-50 text-brand' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                >
                  11:00 AM
                </button>
              </div>

              <button 
                onClick={handleConfirmStep3}
                className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95"
              >
                Confirm Slot
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-slate-50 p-5 rounded-2xl space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Plan</span>
                  <span className="font-bold text-slate-900 capitalize">{planId} Plan ({selectedFrequency})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Delivery Slot</span>
                  <span className="font-bold text-slate-900 capitalize">{deliveryPreference === '8am' ? '8:00 AM' : deliveryPreference === '11am' ? '11:00 AM' : 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Location</span>
                  <span className="font-bold text-slate-900 text-right max-w-[60%] truncate">{address}</span>
                </div>
                
                <hr className="border-slate-200 my-2" />
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Base Price</span>
                  <span className="font-bold text-slate-900">₹{basePrice}</span>
                </div>
                {appliedDiscount && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="font-medium">Discount ({appliedDiscount.code})</span>
                    <span className="font-bold">-₹{discountAmount}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center pt-2">
                  <span className="font-bold text-slate-900">Total to Pay</span>
                  <span className="text-xl font-black text-brand">₹{finalPrice}</span>
                </div>
              </div>

              <button 
                onClick={handleConfirmPay}
                disabled={isSubmitting}
                className="w-full py-4 flex items-center justify-center bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-transform active:scale-95 shadow-xl shadow-brand/20 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Confirm & Pay ₹${finalPrice}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
