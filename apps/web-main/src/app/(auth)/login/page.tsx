'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { signInWithGoogle, signInWithApple, signInWithFacebook } from '@/lib/auth';
import { resolveUserProfile, completeOnboarding } from '@/lib/queries/users';
import { migrateSubscriptions } from '@/lib/queries/subscriptions';
import type { UserRole } from '@/types';
import type { User } from 'firebase/auth';
import { ArrowRight } from 'lucide-react';

type AuthStep = 'social' | 'phone-capture';

// SVG provider icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [step, setStep] = useState<AuthStep>('social');
  const [loading, setLoading] = useState<'google' | 'apple' | 'facebook' | null>(null);
  const [phone, setPhone] = useState('');
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [prefillName, setPrefillName] = useState('');
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  const [prefillPhoto, setPrefillPhoto] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);

  // ── After social sign-in succeeds ──────────────────────────────────────────
  const handleAuthSuccess = useCallback(async (firebaseUser: User) => {
    try {
      const email = firebaseUser.email;
      const displayName = firebaseUser.displayName;
      const photoURL = firebaseUser.photoURL;

      const { user: profile, isNewUser } = await resolveUserProfile(
        firebaseUser.uid,
        email,
        displayName,
        photoURL,
      );

      if (!isNewUser) {
        setUser(profile);
        addToast(`Welcome back, ${profile.name || 'Foodie'}! 🎉`, 'success');
        try { await migrateSubscriptions(firebaseUser.uid); } catch {}
        const paths: Record<string, string> = {
          admin: '/admin/dashboard',
          vendor: '/dashboard',
          delivery: '/dashboard',
          user: '/dashboard',
        };
        router.replace(paths[profile.role] || '/dashboard');
        return;
      }

      // New user — capture phone number
      setPendingUser(firebaseUser);
      setPrefillName(displayName || '');
      setPrefillEmail(email || null);
      setPrefillPhoto(photoURL || null);
      setStep('phone-capture');
    } catch (err: any) {
      addToast(err.message || 'Sign-in failed. Please try again.', 'error');
    }
  }, [setUser, addToast, router]);

  // ── Social provider buttons ────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoading('google');
    try {
      const result = await signInWithGoogle();
      if (!result.success) { addToast(result.error, 'error'); return; }
      await handleAuthSuccess(result.user);
    } finally { setLoading(null); }
  };

  const handleApple = async () => {
    setLoading('apple');
    try {
      const result = await signInWithApple();
      if (!result.success) { addToast(result.error, 'error'); return; }
      await handleAuthSuccess(result.user);
    } finally { setLoading(null); }
  };

  const handleFacebook = async () => {
    setLoading('facebook');
    try {
      const result = await signInWithFacebook();
      if (!result.success) { addToast(result.error, 'error'); return; }
      await handleAuthSuccess(result.user);
    } finally { setLoading(null); }
  };

  // ── Phone capture & onboarding ──────────────────────────────────────────────
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) { addToast('Enter a valid 10-digit number', 'warning'); return; }
    if (!pendingUser) return;

    setSavingPhone(true);
    try {
      const user = await completeOnboarding(
        pendingUser.uid,
        `+91${phone}`,
        prefillName || 'User',
        'user' as UserRole,
        prefillEmail,
        prefillPhoto,
      );
      setUser(user);
      addToast(`Welcome to Dabzzo, ${user.name || 'Foodie'}! 🎉`, 'success');
      router.replace('/dashboard');
    } catch (err: any) {
      addToast(err.message || 'Setup failed. Try again.', 'error');
    } finally {
      setSavingPhone(false);
    }
  };

  const isAnyLoading = loading !== null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center px-6 py-10 font-sans">
      <div className="w-full max-w-md mx-auto flex flex-col">

        {/* ── Logo ── */}
        <div className="flex justify-center mb-10">
          <Image
            src="/logo-main-text.png"
            alt="Dabzzo"
            width={340}
            height={95}
            priority
            unoptimized
            className="h-16 sm:h-20 w-auto object-contain"
          />
        </div>

        {/* ── Card ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-[0_12px_36px_rgba(0,0,0,0.05)]">

          {/* ── STEP 1: Social Sign-in ── */}
          {step === 'social' && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6">
                Sign in to continue
              </p>

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={isAnyLoading}
                className="w-full flex items-center gap-3 bg-white border-2 border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading === 'google'
                  ? <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
                  : <GoogleIcon />}
                <span className="flex-1 text-center">Continue with Google</span>
              </button>

              {/* Apple */}
              <button
                onClick={handleApple}
                disabled={isAnyLoading}
                className="w-full flex items-center gap-3 bg-black hover:bg-slate-900 text-white font-semibold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading === 'apple'
                  ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <AppleIcon />}
                <span className="flex-1 text-center">Continue with Apple</span>
              </button>

              {/* Facebook */}
              <button
                onClick={handleFacebook}
                disabled={isAnyLoading}
                className="w-full flex items-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading === 'facebook'
                  ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <FacebookIcon />}
                <span className="flex-1 text-center">Continue with Facebook</span>
              </button>
            </div>
          )}

          {/* ── STEP 2: Phone Capture ── */}
          {step === 'phone-capture' && (
            <form onSubmit={handlePhoneSubmit} className="space-y-5 animate-fade-in">
              {prefillPhoto && (
                <div className="flex justify-center mb-2">
                  <img src={prefillPhoto} alt={prefillName} className="w-14 h-14 rounded-full ring-2 ring-brand/20 object-cover" />
                </div>
              )}
              <div className="text-center mb-4">
                <p className="text-base font-bold text-slate-800">
                  Hi, {prefillName || 'there'} 👋
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  One last step — your number helps riders reach you
                </p>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">
                  Mobile Number
                </label>
                <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:bg-white focus-within:border-[#E68A00] focus-within:shadow-[0_0_0_4px_rgba(230,138,0,0.12)] transition-all duration-300">
                  <span className="text-base font-black text-slate-400 select-none mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digit number"
                    autoFocus
                    className="w-full bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPhone || phone.length !== 10}
                className="w-full bg-[#E68A00] text-white font-bold text-base py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-[#E68A00]/25 disabled:opacity-50 hover:bg-[#D97706]"
              >
                {savingPhone
                  ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <><span>Get Started</span><ArrowRight className="w-4 h-4" strokeWidth={2.5} /></>}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-slate-400 font-medium">
          Dabzzo · Fresh Home Cooked Tiffins ·{' '}
          <span className="underline decoration-slate-300 underline-offset-2 cursor-pointer hover:text-slate-600">Terms & Privacy</span>
        </p>

      </div>
    </div>
  );
}