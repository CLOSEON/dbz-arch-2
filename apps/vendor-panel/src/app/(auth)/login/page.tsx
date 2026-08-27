'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { signInWithGoogle, isSuperadminEmail, extractUserEmail } from '@/lib/auth';
import { resolveUserProfile, completeOnboarding } from '@/lib/queries/users';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserRole, AppUser } from '@/types';
import type { User } from 'firebase/auth';
import { ArrowRight } from 'lucide-react';

type AuthStep = 'social' | 'onboarding';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function VendorLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [step, setStep] = useState<AuthStep>('social');
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [prefillName, setPrefillName] = useState('');
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  const [prefillPhoto, setPrefillPhoto] = useState<string | null>(null);
  const [kitchenName, setKitchenName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // If already logged in with vendor access, redirect directly
  useEffect(() => {
    if (currentUser && (currentUser.role === 'vendor' || isSuperadminEmail(currentUser.email))) {
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  const handleAuthSuccess = useCallback(async (firebaseUser: User) => {
    try {
      const email = extractUserEmail(firebaseUser);
      const isSuper = isSuperadminEmail(email);

      // Superadmin auto-link to full verified test vendor account
      if (isSuper) {
        const vendorProfile: AppUser = {
          id: firebaseUser.uid,
          email: email,
          name: firebaseUser.displayName || 'Chef Sharma (Superadmin)',
          phone: firebaseUser.phoneNumber || '+919876543210',
          image: firebaseUser.photoURL || undefined,
          role: 'vendor' as UserRole,
          kitchen_name: 'Sharma Gourmet Kitchen',
          is_approved: true,
          is_superadmin: true,
          verification_status: 'verified',
          capacity: 50,
          fssai_license: 'FSSAI-12345678901234',
          address: 'Sector 62, Noida, UP',
          rate_onetime: 120,
          rate_lunch_weekly: 750,
          rate_lunch_monthly: 2800,
          rate_dinner_weekly: 750,
          rate_dinner_monthly: 2800,
          rate_both_weekly: 1400,
          rate_both_monthly: 5200,
          cuisine_type: 'North Indian & Homestyle',
          bio: 'Authentic pure vegetarian ghar ka khana prepared with love and hygiene.',
          rating: 4.8,
          rating_avg: 4.8,
          review_count: 24,
          subscriberCount: 12,
        };

        try {
          await setDoc(doc(db, 'users', firebaseUser.uid), vendorProfile, { merge: true });
        } catch (e) {
          console.warn('[VendorLogin] Syncing superadmin vendor profile:', e);
        }

        setUser(vendorProfile);
        addToast('Welcome to your Kitchen Dashboard, Chef! 🎉', 'success');
        router.replace('/dashboard');
        return;
      }

      const { user: profile, isNewUser } = await resolveUserProfile(
        firebaseUser.uid,
        email || null,
        firebaseUser.displayName,
        firebaseUser.photoURL,
      );

      if (!isNewUser && profile.role === 'vendor') {
        setUser(profile);
        addToast('Welcome back to your kitchen!', 'success');
        router.replace('/dashboard');
        return;
      }

      setPendingUser(firebaseUser);
      setPrefillName(profile.name || firebaseUser.displayName || '');
      setPrefillEmail(email || null);
      setPrefillPhoto(firebaseUser.photoURL || null);
      setKitchenName(profile.kitchen_name || '');
      setStep('onboarding');
    } catch (err: any) {
      addToast(err.message || 'Sign-in failed. Please try again.', 'error');
    }
  }, [setUser, addToast, router]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) { addToast(result.error, 'error'); return; }
      await handleAuthSuccess(result.user);
    } finally { setLoading(false); }
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    if (phone.length !== 10) { addToast('Enter a valid 10-digit phone number', 'warning'); return; }

    setSaving(true);
    try {
      const user = await completeOnboarding(
        pendingUser.uid,
        `+91${phone}`,
        prefillName || 'Chef',
        'vendor' as UserRole,
        prefillEmail,
        prefillPhoto,
        { kitchen_name: kitchenName || `${prefillName}'s Kitchen` },
      );
      setUser(user);
      addToast('Kitchen registered! Awaiting admin approval.', 'success');
      router.replace('/dashboard');
    } catch (err: any) {
      addToast(err.message || 'Registration failed. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center px-6 py-10 font-sans">
      <div className="w-full max-w-md mx-auto flex flex-col">

        <div className="flex justify-center mb-10">
          <Image src="/logo-main-text.png" alt="Dabzzo" width={340} height={95} priority unoptimized className="h-16 sm:h-20 w-auto object-contain" />
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-[0_12px_36px_rgba(0,0,0,0.05)]">

          {step === 'social' && (
            <div className="flex flex-col items-center gap-6 animate-fade-in">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Kitchen Partner Sign In
              </p>

              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center gap-3 bg-white border-2 border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50">
                {loading ? <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" /> : <GoogleIcon />}
                <span className="flex-1 text-center">Continue with Google</span>
              </button>
            </div>
          )}

          {step === 'onboarding' && (
            <form onSubmit={handleOnboarding} className="space-y-4 animate-fade-in">
              {prefillPhoto && (
                <div className="flex justify-center mb-2">
                  <img src={prefillPhoto} alt={prefillName} className="w-14 h-14 rounded-full ring-2 ring-red-500/20 object-cover" />
                </div>
              )}
              <div className="text-center mb-4">
                <p className="text-base font-bold text-slate-800">Set up your Kitchen, {prefillName || 'Chef'} 👨‍🍳</p>
                <p className="text-xs text-slate-500 mt-1">Enter your details to register as a Kitchen Partner</p>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Kitchen Name</label>
                <input type="text" placeholder={`${prefillName || 'Your'}'s Kitchen`} autoFocus
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-red-600 focus:shadow-[0_0_0_4px_rgba(220,38,38,0.12)] transition-all text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                  value={kitchenName} onChange={(e) => setKitchenName(e.target.value)} />
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Contact Number</label>
                <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:bg-white focus-within:border-red-600 focus-within:shadow-[0_0_0_4px_rgba(220,38,38,0.12)] transition-all">
                  <span className="text-base font-black text-slate-400 mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input type="tel" inputMode="numeric" maxLength={10} placeholder="10 digit number"
                    className="w-full bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal"
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                </div>
              </div>

              <button type="submit" disabled={saving || phone.length !== 10}
                className="w-full bg-[#DC2626] text-white font-bold text-base py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 disabled:opacity-50 hover:bg-red-700 mt-2">
                {saving ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <><span>Register Kitchen</span><ArrowRight className="w-4 h-4" strokeWidth={2.5} /></>}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400 font-medium">
          Dabzzo Kitchen Partners
        </p>
      </div>
    </div>
  );
}