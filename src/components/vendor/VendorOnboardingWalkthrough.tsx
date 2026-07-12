'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ChevronRight, ChevronLeft, ChefHat, Phone, Mail, MapPin, 
  DollarSign, Image as ImageIcon, Loader2, Sparkles, CheckCircle2, UploadCloud
} from 'lucide-react';
import { uploadImage } from '@/lib/storage';
import toast from 'react-hot-toast';
import Image from 'next/image';

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

type OnboardingStep = 
  | 'intro'
  | 'kitchen-identity'
  | 'contact-info'
  | 'location-address'
  | 'pricing-rates'
  | 'kitchen-photo'
  | 'finish';

export function VendorOnboardingWalkthrough({ isOpen, onClose }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('intro');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [form, setForm] = useState({
    kitchen_name: '',
    name: '',
    cuisine_type: '',
    phone: '',
    email: '',
    address: '',
    lat: '',
    lng: '',
    rate_onetime: '120',
    rate_lunch_weekly: '750',
    rate_lunch_monthly: '2800',
    rate_dinner_weekly: '750',
    rate_dinner_monthly: '2800',
    rate_both_weekly: '1400',
    rate_both_monthly: '5200',
    image: '',
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 'intro') setStep('kitchen-identity');
    else if (step === 'kitchen-identity') {
      if (!form.kitchen_name.trim() || !form.name.trim() || !form.cuisine_type.trim()) {
        toast.error('Please fill out all required fields');
        return;
      }
      setStep('contact-info');
    }
    else if (step === 'contact-info') {
      if (!form.phone.trim() || form.phone.replace(/\D/g, '').length !== 10) {
        toast.error('Please enter a valid 10-digit phone number');
        return;
      }
      setStep('location-address');
    }
    else if (step === 'location-address') setStep('pricing-rates');
    else if (step === 'pricing-rates') setStep('kitchen-photo');
    else if (step === 'kitchen-photo') setStep('finish');
  };

  const handleBack = () => {
    if (step === 'kitchen-identity') setStep('intro');
    else if (step === 'contact-info') setStep('kitchen-identity');
    else if (step === 'location-address') setStep('contact-info');
    else if (step === 'pricing-rates') setStep('location-address');
    else if (step === 'kitchen-photo') setStep('pricing-rates');
    else if (step === 'finish') setStep('kitchen-photo');
  };

  const handleSkip = (target: OnboardingStep) => {
    setStep(target);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          lat: String(pos.coords.latitude.toFixed(6)),
          lng: String(pos.coords.longitude.toFixed(6))
        }));
        setFetchingLocation(false);
        toast.success('Location coordinates captured! 📍');
      },
      (err) => {
        setFetchingLocation(false);
        toast.error('Could not capture location automatically. Please skip or enter manually.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setImagePreview(URL.createObjectURL(file));
    try {
      const url = await uploadImage(file, 'uploads/vendors/onboarding');
      if (url) {
        setForm(prev => ({ ...prev, image: url }));
        toast.success('Banner picture uploaded! 📸');
      } else {
        toast.error('Failed to upload image. Keep going and upload later.');
      }
    } catch (err) {
      toast.error('Error uploading image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFinishOnboarding = () => {
    // Save state to localStorage and redirect to login
    localStorage.setItem('pending_vendor_onboarding', JSON.stringify({
      kitchen_name: form.kitchen_name,
      cuisine_type: form.cuisine_type,
      address: form.address,
      image: form.image,
      location: form.lat && form.lng ? { lat: Number(form.lat), lng: Number(form.lng) } : null,
      rate_onetime: Number(form.rate_onetime || 0),
      rate_lunch_weekly: Number(form.rate_lunch_weekly || 0),
      rate_lunch_monthly: Number(form.rate_lunch_monthly || 0),
      rate_dinner_weekly: Number(form.rate_dinner_weekly || 0),
      rate_dinner_monthly: Number(form.rate_dinner_monthly || 0),
      rate_both_weekly: Number(form.rate_both_weekly || 0),
      rate_both_monthly: Number(form.rate_both_monthly || 0),
    }));

    toast.success('Walkthrough completed! Claiming kitchen profile...');
    onClose();
    // Redirect user to login with role preset to vendor and their phone prefilled if available
    window.location.href = `/login?role=vendor&phone=${form.phone}`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop glass blur */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="relative w-full max-w-xl bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-black">
                🍳
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight leading-tight">Partner Onboarding</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Onboarding Walkthrough</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <AnimatePresence mode="wait">
              {step === 'intro' && (
                <motion.div 
                  key="intro"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 text-center py-4"
                >
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-brand/10 text-brand flex items-center justify-center text-4xl shadow-inner">
                    🧑‍🍳
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Become a Dabzzo Partner Kitchen</h2>
                    <p className="text-sm font-medium text-slate-500 max-w-md mx-auto">
                      Onboard your kitchen, design subscription rate cards, and begin serving loyal customers in your area in 5 simple steps.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 text-left max-w-md mx-auto space-y-3">
                    <div className="flex gap-3 text-xs font-bold text-slate-600">
                      <span className="text-emerald-500">✓</span>
                      <span>Instant visibility to thousands of active subscribers.</span>
                    </div>
                    <div className="flex gap-3 text-xs font-bold text-slate-600">
                      <span className="text-emerald-500">✓</span>
                      <span>Admin-managed rider dispatches & deliveries.</span>
                    </div>
                    <div className="flex gap-3 text-xs font-bold text-slate-600">
                      <span className="text-emerald-500">✓</span>
                      <span>Zero setup fee — keep 100% of your earnings.</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleNext}
                    className="w-full max-w-xs py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg shadow-brand/20 hover:bg-brand/90"
                  >
                    Start Walkthrough
                  </button>
                </motion.div>
              )}

              {step === 'kitchen-identity' && (
                <motion.div 
                  key="kitchen-identity"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2.5 py-1 rounded-full">Step 1 of 5</span>
                    <h3 className="text-xl font-black text-slate-900 mt-2">Kitchen Identity</h3>
                    <p className="text-xs text-slate-400 font-medium">Let's start with your kitchen brand and cuisine details.</p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Kitchen / Brand Name *</label>
                      <input 
                        type="text"
                        placeholder="e.g. Royal Punjabi Kitchen"
                        value={form.kitchen_name}
                        onChange={e => setForm(prev => ({ ...prev, kitchen_name: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Contact Person Name *</label>
                      <input 
                        type="text"
                        placeholder="Owner or Chef name"
                        value={form.name}
                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Cuisine Specialty / Tags *</label>
                      <input 
                        type="text"
                        placeholder="e.g. North Indian, Jain Food, Homestyle"
                        value={form.cuisine_type}
                        onChange={e => setForm(prev => ({ ...prev, cuisine_type: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40 transition-colors"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'contact-info' && (
                <motion.div 
                  key="contact-info"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2.5 py-1 rounded-full">Step 2 of 5</span>
                    <h3 className="text-xl font-black text-slate-900 mt-2">Contact Details</h3>
                    <p className="text-xs text-slate-400 font-medium">Provide phone verification and customer contact channels.</p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Phone Number (10-digits) *</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">+91</span>
                        <input 
                          type="tel"
                          maxLength={10}
                          placeholder="9876543210"
                          value={form.phone}
                          onChange={e => setForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                          className="w-full pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
                      <input 
                        type="email"
                        placeholder="kitchen@example.com"
                        value={form.email}
                        onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40 transition-colors"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'location-address' && (
                <motion.div 
                  key="location-address"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2.5 py-1 rounded-full">Step 3 of 5 (Optional)</span>
                      <h3 className="text-xl font-black text-slate-900 mt-2">Location & Address</h3>
                      <p className="text-xs text-slate-400 font-medium">Pins down your kitchen coordinates for dispatch rider pickups.</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleSkip('pricing-rates')}
                      className="text-xs font-black text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      Skip Step
                    </button>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Street Address</label>
                      <textarea 
                        placeholder="Shop No., Lane, Area, City"
                        value={form.address}
                        onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-medium text-slate-950 focus:outline-none focus:border-brand/40 transition-colors resize-none"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Geographic Coordinates</span>
                        <button
                          type="button"
                          disabled={fetchingLocation}
                          onClick={detectLocation}
                          className="text-[10px] font-black uppercase tracking-widest text-brand border border-brand/20 bg-white hover:bg-brand-50 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {fetchingLocation ? 'Fetching...' : 'Auto-Detect GPS'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Latitude</label>
                          <input 
                            type="number"
                            step="any"
                            placeholder="e.g. 28.6139"
                            value={form.lat}
                            onChange={e => setForm(prev => ({ ...prev, lat: e.target.value }))}
                            className="w-full bg-white border border-slate-150 rounded-xl p-2 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Longitude</label>
                          <input 
                            type="number"
                            step="any"
                            placeholder="e.g. 77.2090"
                            value={form.lng}
                            onChange={e => setForm(prev => ({ ...prev, lng: e.target.value }))}
                            className="w-full bg-white border border-slate-150 rounded-xl p-2 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'pricing-rates' && (
                <motion.div 
                  key="pricing-rates"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2.5 py-1 rounded-full">Step 4 of 5 (Optional)</span>
                      <h3 className="text-xl font-black text-slate-900 mt-2">Subscription Rates</h3>
                      <p className="text-xs text-slate-400 font-medium">Design your rate cards (default values are already prefilled).</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleSkip('kitchen-photo')}
                      className="text-xs font-black text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      Skip Step
                    </button>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">One-Time Trial Meal Price (₹)</label>
                      <input 
                        type="number"
                        value={form.rate_onetime}
                        onChange={e => setForm(prev => ({ ...prev, rate_onetime: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Weekly (₹)</label>
                        <input 
                          type="number"
                          value={form.rate_lunch_weekly}
                          onChange={e => setForm(prev => ({ ...prev, rate_lunch_weekly: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Lunch Monthly (₹)</label>
                        <input 
                          type="number"
                          value={form.rate_lunch_monthly}
                          onChange={e => setForm(prev => ({ ...prev, rate_lunch_monthly: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Weekly (₹)</label>
                        <input 
                          type="number"
                          value={form.rate_dinner_weekly}
                          onChange={e => setForm(prev => ({ ...prev, rate_dinner_weekly: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Dinner Monthly (₹)</label>
                        <input 
                          type="number"
                          value={form.rate_dinner_monthly}
                          onChange={e => setForm(prev => ({ ...prev, rate_dinner_monthly: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-950 focus:outline-none focus:border-brand/40"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'kitchen-photo' && (
                <motion.div 
                  key="kitchen-photo"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-2.5 py-1 rounded-full">Step 5 of 5 (Optional)</span>
                      <h3 className="text-xl font-black text-slate-900 mt-2">Kitchen Banner Photo</h3>
                      <p className="text-xs text-slate-400 font-medium">Add an attractive kitchen banner picture to showcase to subscribers.</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleSkip('finish')}
                      className="text-xs font-black text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      Skip Step
                    </button>
                  </div>

                  <div className="space-y-4 pt-2 text-center">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full max-w-sm mx-auto h-44 bg-slate-50 hover:bg-slate-100/50 border border-dashed border-slate-300 hover:border-brand/40 rounded-3xl cursor-pointer transition-all flex flex-col items-center justify-center p-4 relative overflow-hidden"
                    >
                      {imagePreview ? (
                        <Image 
                          src={imagePreview} 
                          alt="Banner Preview" 
                          fill 
                          className="object-cover" 
                        />
                      ) : (
                        <div className="space-y-2 text-slate-400">
                          <UploadCloud className="w-10 h-10 mx-auto opacity-60 text-brand" />
                          <p className="text-xs font-black text-slate-600">Click to Upload Kitchen Logo/Banner</p>
                          <p className="text-[9px] font-semibold text-slate-400">JPEG, PNG up to 5MB</p>
                        </div>
                      )}

                      {uploadingImage && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin text-brand" />
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Uploading picture...</span>
                        </div>
                      )}
                    </div>
                    <input 
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                </motion.div>
              )}

              {step === 'finish' && (
                <motion.div 
                  key="finish"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 text-center py-4"
                >
                  <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Onboarding Walkthrough Complete!</h2>
                    <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
                      All partner kitchen information is set up. Now secure your profile with your phone number and claim your new kitchen page.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 text-left max-w-sm mx-auto text-xs space-y-1.5">
                    <p className="font-bold text-slate-700">Kitchen Summary:</p>
                    <p className="text-slate-500 font-medium">🏪 Kitchen: <span className="font-bold text-slate-800">{form.kitchen_name}</span></p>
                    <p className="text-slate-500 font-medium">🧑‍🍳 Chef / Owner: <span className="font-bold text-slate-800">{form.name}</span></p>
                    <p className="text-slate-500 font-medium">📞 Phone: <span className="font-bold text-slate-800">+91 {form.phone}</span></p>
                  </div>
                  <button 
                    onClick={handleFinishOnboarding}
                    className="w-full max-w-xs py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg shadow-brand/20 hover:bg-brand/90"
                  >
                    Register & Claim Kitchen
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Controls */}
          {step !== 'intro' && step !== 'finish' && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <button
                type="button"
                onClick={handleBack}
                className="py-2.5 px-4 flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              
              <button
                type="button"
                onClick={handleNext}
                className="py-2.5 px-6 flex items-center gap-1.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-850 transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
