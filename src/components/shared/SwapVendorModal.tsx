'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUser, SubscriptionSwapAllowance } from '@/types';
import { X, MapPin, Navigation, ChefHat, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { requestVendorSwap, getSubscriptionSwapAllowance } from '@/lib/queries/swaps';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHapticImpact, triggerHapticNotification, ImpactStyle, NotificationType } from '@/lib/haptics';
import { createRazorpayOrder, verifyPaymentSignature, loadRazorpayCheckoutScript } from '@/lib/razorpay';

// Geolocation distance helper
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

interface VendorWithDistance extends AppUser {
  distance: number;
}

interface SwapVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number, lng: number };
  userId: string;
  delivery: any;
  onSwapSuccess: (deliveryId: string) => void;
}

export function SwapVendorModal({ isOpen, onClose, userLocation, userId, delivery, onSwapSuccess }: SwapVendorModalProps) {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [vendors, setVendors] = useState<VendorWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<SubscriptionSwapAllowance | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating_order' | 'awaiting_payment' | 'verifying' | 'swapping'>('idle');

  // Load nearby vendors and swap allowance on mount/open
  useEffect(() => {
    if (!isOpen) return;
    
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch nearby vendors
        const q = query(collection(db, 'users'), where('role', '==', 'vendor'));
        const snap = await getDocs(q);
        const nearby: VendorWithDistance[] = [];
        
        snap.docs.forEach(doc => {
          const data = doc.data() as AppUser;
          if (doc.id === delivery.vendorId) return; // Skip current vendor
          
          if (data.location?.lat && data.location?.lng) {
            const dist = getDistance(userLocation.lat, userLocation.lng, data.location.lat, data.location.lng);
            if (dist <= 2.0) {
              nearby.push({ ...data, distance: dist });
            }
          }
        });
        
        nearby.sort((a, b) => a.distance - b.distance);
        setVendors(nearby);

        // 2. Fetch subscription swap allowance
        if (delivery.subscriptionId) {
          const allowanceData = await getSubscriptionSwapAllowance(delivery.subscriptionId);
          setAllowance(allowanceData);
        }
      } catch (err) {
        setError('Failed to load initial swap details');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [isOpen, userLocation, delivery.vendorId, delivery.subscriptionId]);

  // Determine if swap is free or paid
  const isFreeSwap = allowance 
    ? allowance.free_swaps_used < allowance.free_swaps_total 
    : false;

  const handleSwap = async (vendor: VendorWithDistance) => {
    if (swappingId) return;
    setSwappingId(vendor.id);
    setError(null);

    try {
      if (isFreeSwap) {
        // Free swap flow
        setPaymentStatus('swapping');
        await requestVendorSwap(userId, delivery.subscriptionId, delivery, vendor.id, vendor.kitchen_name || vendor.name);
        triggerHapticNotification(NotificationType.Success);
        addToast('Swap successful using free allowance!', 'success');
        onSwapSuccess(delivery.id);
        onClose();
      } else {
        // Paid swap flow (₹50 fee)
        setPaymentStatus('creating_order');
        await loadRazorpayCheckoutScript();

        // 1. Create payment order (Callable Cloud Function + REST fallback)
        const order = await createRazorpayOrder(
          5000, // ₹50.00 in paise
          `swap_${delivery.id}_${Date.now()}`.slice(0, 40),
          {
            user_id: userId,
            subscription_id: delivery.subscriptionId,
            delivery_id: delivery.id,
            target_vendor_id: vendor.id,
          },
          vendor.id
        );

        const order_id = order.order_id;

        // 2. Open Razorpay Checkout modal
        setPaymentStatus('awaiting_payment');
        const paymentResponse = await new Promise<any>((resolve, reject) => {
          const RazorpayConstructor = (window as any).Razorpay;
          if (!RazorpayConstructor) {
            reject(new Error('Razorpay SDK failed to load. Please check your internet connection.'));
            return;
          }

          const rzp = new RazorpayConstructor({
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TCIxkFi3SRRU7E',
            amount: 5000,
            currency: 'INR',
            name: 'Dabzzo',
            description: `Meal Swap Fee (Kitchen Switch)`,
            order_id,
            prefill: {
              name: user?.name || '',
              contact: user?.phone || '',
              email: user?.email || '',
            },
            theme: { color: '#f97316' },
            modal: {
              ondismiss: () => reject(new Error('Payment cancelled by user.'))
            },
            handler: (response: any) => resolve(response)
          });

          rzp.on('payment.failed', (resp: any) => {
            reject(new Error(resp.error?.description || 'Payment failed.'));
          });

          rzp.open();
        });

        // 3. Verify Razorpay payment signature
        setPaymentStatus('verifying');
        await verifyPaymentSignature(
          paymentResponse.razorpay_payment_id,
          paymentResponse.razorpay_order_id,
          paymentResponse.razorpay_signature
        );

        // 4. Finalize swap in Firestore
        setPaymentStatus('swapping');
        await requestVendorSwap(
          userId, 
          delivery.subscriptionId, 
          delivery, 
          vendor.id, 
          vendor.kitchen_name || vendor.name,
          { paymentId: paymentResponse.razorpay_payment_id, orderId: paymentResponse.razorpay_order_id }
        );

        triggerHapticNotification(NotificationType.Success);
        addToast('Swap successful! Enjoy your new meal 🎉', 'success');
        onSwapSuccess(delivery.id);
        onClose();
      }
    } catch (err: any) {
      triggerHapticNotification(NotificationType.Error);
      setError(err.message || 'Swap operation failed');
      setSwappingId(null);
      setPaymentStatus('idle');
    }
  };

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
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[80vh]">
              {/* Header */}
              <div className="p-6 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Swap Your Meal</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Pick a vendor within 2km</p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto p-6 flex-1 space-y-4">
                {error && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-semibold text-center border border-rose-100">
                    {error}
                  </div>
                )}

                {/* Pricing indicator banner */}
                {!loading && vendors.length > 0 && (
                  <div className={`p-4 rounded-3xl flex items-center gap-3.5 border ${
                    isFreeSwap 
                      ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                      : 'bg-orange-50/50 border-orange-100 text-orange-800'
                  }`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isFreeSwap ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-brand'
                    }`}>
                      <CreditCard className="w-4.5 h-4.5" />
                    </div>
                    <div className="text-xs">
                      {isFreeSwap ? (
                        <>
                          <p className="font-bold text-emerald-950">Free Swap Available!</p>
                          <p className="opacity-75 font-medium mt-0.5">Remaining free allowance: {allowance ? (allowance.free_swaps_total - allowance.free_swaps_used) : 0} swaps</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold text-orange-950">Paid Swap: ₹50 charge applies</p>
                          <p className="opacity-75 font-medium mt-0.5">All free swap allowances have been fully consumed.</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {loading ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-brand animate-spin" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanning local kitchens...</p>
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-3 text-slate-300">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-slate-700">No Kitchens Found</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-[240px] leading-relaxed">We couldn't find other active tiffin vendors within 2.0 km of your location.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vendors.map(vendor => (
                      <div key={vendor.id} className="bg-white border border-slate-100 p-4 rounded-3xl shadow-sm flex flex-col gap-3 hover:border-slate-200 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                              <ChefHat className="w-5 h-5 text-brand" />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm leading-tight">
                                {vendor.kitchen_name || vendor.name}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Navigation className="w-3 h-3 text-brand" />
                                <span>{vendor.distance.toFixed(1)} km</span>
                                {vendor.cuisine_type && (
                                  <>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span>{vendor.cuisine_type}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            triggerHapticImpact(ImpactStyle.Light);
                            handleSwap(vendor);
                          }}
                          disabled={swappingId !== null}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 bg-brand/10 text-brand hover:bg-brand hover:text-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {swappingId === vendor.id ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {paymentStatus === 'creating_order' && 'Initializing Payment...'}
                              {paymentStatus === 'awaiting_payment' && 'Opening Gateway...'}
                              {paymentStatus === 'verifying' && 'Verifying payment...'}
                              {paymentStatus === 'swapping' && 'Swapping Meal...'}
                            </span>
                          ) : (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> Select Kitchen</>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
