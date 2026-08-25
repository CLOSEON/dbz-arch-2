'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { sendOtp, verifyOtp, cleanupAuth } from '@/lib/auth';
import type { SendOtpResult } from '@/lib/auth';
import {
  resolveUserProfile,
  formatPhoneE164,
  isTestAccount,
  completeOnboarding,
} from '@/lib/queries/users';
import type { UserRole } from '@/types';
import { ShieldCheck, Lock, ArrowRight } from 'lucide-react';

// ─── Step Types ──────────────────────────────────────────────────────────────

type AuthStep = 'phone' | 'otp' | 'onboarding';

// ─── Constants ───────────────────────────────────────────────────────────────

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  // State
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<AuthStep>('phone');
  const [loading, setLoading] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Onboarding state
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [newUserPhone, setNewUserPhone] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [isExistingUserMissingName, setIsExistingUserMissingName] = useState(false);

  // Refs
  const otpInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => cleanupAuth();
  }, []);

  // ─── Resend timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // ─── Auto-focus OTP input ──────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  // ─── Route user after successful auth ──────────────────────────────────────
  const routeToRole = useCallback((_role?: string) => {
    router.replace('/dashboard');
  }, [router]);

  // ─── Handle successful Firebase user ───────────────────────────────────────
  const handleAuthSuccess = useCallback(async (firebaseUser: any) => {
    const e164 = formatPhoneE164(phone);

    try {
      // Force token refresh to ensure Firestore SDK & custom claims are synced
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      
      // Wait for auth state to be fully synchronized with all Firebase services
      const { auth } = await import('@/lib/firebase');
      await auth.authStateReady();

      const { user: profile, isNewUser } = await resolveUserProfile(
        firebaseUser.uid,
        firebaseUser.phoneNumber || e164
      );

      // Check if user has admin custom claim or admin role
      const isAdmin = Boolean(tokenResult?.claims?.admin || profile?.role === 'admin');
      const finalRole: UserRole = isAdmin ? 'admin' : (profile.role || 'admin');
      const finalProfile = { ...profile, role: finalRole };

      if (isNewUser) {
        setNewUserId(firebaseUser.uid);
        setNewUserPhone(firebaseUser.phoneNumber || e164);
        if (profile.role) {
          setSelectedRole(finalRole);
          setIsExistingUserMissingName(true);
          addToast('Welcome back! Please tell us your name 👋', 'info');
        } else {
          setIsExistingUserMissingName(false);
          addToast('Welcome to Dabzzo Admin Console 🎉', 'success');
        }
        setStep('onboarding');
        return;
      }

      // Existing user — login via OTP
      setUser(finalProfile);
      addToast(`Welcome back, Admin ${finalProfile.name || ''} 👑`, 'success');
      routeToRole(finalRole);

    } catch (err: any) {
      console.error('[Login] Profile resolution error:', err);
      addToast(err.message || 'Account issue. Contact support.', 'error');
    }
  }, [phone, setUser, addToast, routeToRole]);

  // ─── SEND OTP ──────────────────────────────────────────────────────────────
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (phone.length !== 10) {
      addToast('Enter a valid 10-digit number', 'warning');
      return;
    }

    setLoading(true);

    try {
      const e164 = formatPhoneE164(phone);
      console.log('[Login] Sending OTP to:', e164);

      const result: SendOtpResult = await sendOtp(e164);

      if (!result.success) {
        addToast(result.error || 'Failed to send OTP. Try again.', 'error');
        return;
      }

      // Auto-verified (Android SMS Retriever)
      if ('autoVerified' in result && result.autoVerified && result.user) {
        addToast('Phone verified automatically! ✨', 'success');
        await handleAuthSuccess(result.user);
        return;
      }

      // Manual OTP needed
      if ('verificationId' in result) {
        setVerificationId(result.verificationId);
        setStep('otp');
        setResendTimer(RESEND_COOLDOWN);
        addToast(
          isTestAccount(e164) ? 'Test account — use code 123456' : 'Admin OTP sent',
          'success'
        );
      }
    } catch (err: any) {
      console.error('[Login] Send OTP error:', err);
      addToast(err.message || 'Failed to send OTP. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── VERIFY OTP ────────────────────────────────────────────────────────────
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (otp.length < OTP_LENGTH) {
      addToast(`Enter the ${OTP_LENGTH}-digit code`, 'warning');
      return;
    }
    if (!verificationId) {
      addToast('Session expired. Request a new OTP.', 'error');
      setStep('phone');
      return;
    }

    setLoading(true);

    try {
      const result = await verifyOtp(verificationId, otp);

      if (!result.success || !result.user) {
        addToast(result.error || 'Verification failed', 'error');
        setOtp('');
        return;
      }

      await handleAuthSuccess(result.user);
    } catch (err: any) {
      console.error('[Login] Verify OTP error:', err);
      addToast(err.message || 'Invalid code. Try again.', 'error');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  // ─── COMPLETE ONBOARDING ───────────────────────────────────────────────────
  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!name.trim()) {
      addToast('Please enter your name', 'warning');
      return;
    }
    if (!newUserId) return;

    setLoading(true);

    try {
      const user = await completeOnboarding(newUserId, newUserPhone, name.trim(), selectedRole);
      setUser(user);
      addToast(`Admin profile saved, ${name}! 👑`, 'success');
      routeToRole(user.role);
    } catch (err: any) {
      console.error('[Login] Onboarding error:', err);
      addToast(err.message || 'Setup failed. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendTimer > 0 || loading) return;
    setOtp('');
    setVerificationId(null);
    cleanupAuth();

    setLoading(true);
    try {
      const e164 = formatPhoneE164(phone);
      const result = await sendOtp(e164);
      if (!result.success) {
        addToast(result.error || 'Resend failed', 'error');
        return;
      }
      if ('verificationId' in result) {
        setVerificationId(result.verificationId);
        setResendTimer(RESEND_COOLDOWN);
        addToast('New admin OTP sent!', 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Resend failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col justify-between px-6 py-10 relative overflow-hidden font-sans"
      style={{
        background: 'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(15, 23, 42, 0.1) 0%, rgba(248, 250, 252, 0.9) 50%, #FAF8F5 100%)',
      }}
    >
      {/* Subtle Ambient Lighting Orbs */}
      <div className="absolute top-0 right-1/4 w-72 h-72 rounded-full bg-slate-400/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-60 h-60 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

      {/* ── Main Content Area ── */}
      <div className="w-full max-w-md mx-auto my-auto relative z-10 flex flex-col">
        
        {/* ── Typographic Brand Header ── */}
        <div className="flex flex-col items-center mb-8 animate-fade-in text-center">
          
          {/* Brand Serif Title */}
          <div className="mb-3">
            <h1
              className="font-serif font-black text-5xl sm:text-[54px] tracking-[-0.03em] leading-none text-slate-900 drop-shadow-[0_2px_12px_rgba(15,23,42,0.12)]"
            >
              Dabzzo
            </h1>
          </div>

          {/* Sub-Brand Pill Badge */}
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-900/5 border border-slate-300 shadow-xs mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-800 stroke-[2.2]" />
            <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] leading-none">
              Operations Console
            </span>
          </div>

          {/* Context Subtitle */}
          <p className="text-sm font-medium text-slate-600 max-w-[290px] leading-relaxed">
            {step === 'phone'
              ? 'Platform operations, subscriptions, kitchen logistics & settlements'
              : step === 'otp'
              ? 'Enter the 6-digit admin verification code'
              : 'Complete your administrative profile'}
          </p>
        </div>

        {/* ── Elevated Form Container ── */}
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-7 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
          {/* ── STEP 1: Phone Input ───────────────────────────────────────── */}
          {step === 'phone' && (
            <form onSubmit={handleSendOTP} className="w-full space-y-5 animate-fade-in">
              <div className="relative">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">
                  Admin Mobile Number
                </label>
                <div className="flex items-center bg-slate-50/80 border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:bg-white focus-within:border-slate-900 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.1)] transition-all duration-300">
                  <span className="text-base font-black text-slate-500 select-none mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter 10 digit number"
                    className="w-full bg-transparent outline-none text-base font-bold text-slate-900 placeholder:text-slate-400 font-sans"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                    autoComplete="tel-national"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white font-black text-base py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-950/25 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-125"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <span>Authenticate Admin</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP Verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="w-full space-y-5 animate-fade-in">
              <div className="text-center mb-1">
                <p className="text-xs font-semibold text-slate-500">
                  Admin code sent to <span className="text-slate-900 font-bold">+91 {phone}</span>
                </p>
              </div>

              <div className="relative">
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="------"
                  className="w-full text-center text-3xl font-black py-4 bg-slate-50/80 border-2 border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-slate-900 focus:shadow-[0_0_0_4px_rgba(15,23,42,0.1)] transition-all duration-300 tracking-[0.35em] text-slate-900"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < OTP_LENGTH}
                className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white font-black text-base py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-950/25 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-125"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Verify Admin Credentials'
                )}
              </button>

              <div className="flex items-center justify-center gap-5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setVerificationId(null);
                    cleanupAuth();
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Edit number
                </button>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                  className="text-xs font-bold text-slate-900 hover:text-slate-700 transition-colors disabled:text-slate-400"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3: Onboarding ────────────────────────────────────────── */}
          {step === 'onboarding' && (
            <form onSubmit={handleOnboarding} className="w-full space-y-4 animate-fade-in">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block ml-1">
                  Administrator Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operations Lead"
                  className="w-full bg-slate-50/80 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-slate-900 focus:shadow-[0_0_0_4px_rgba(15,23,42,0.1)] transition-all duration-300 text-slate-900 placeholder:text-slate-400"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white font-black text-base py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center mt-4 shadow-lg shadow-slate-950/25 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-125"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  isExistingUserMissingName ? 'Save Profile' : 'Access Admin Console'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
      
      {/* ── Footer ── */}
      <div className="pt-6 relative z-10">
        <p className="text-xs text-slate-500 font-medium text-center">
          Dabzzo Internal Systems • Restricted Access
        </p>
      </div>
    </div>
  );
}