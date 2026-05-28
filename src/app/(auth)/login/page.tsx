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
import Image from 'next/image';

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
  const [selectedRole, setSelectedRole] = useState<UserRole>('user');
  // True when an existing user is re-prompted to set a name (role already exists)
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
  const routeToRole = useCallback((role: string) => {
    const paths: Record<string, string> = {
      admin: '/admin/dashboard',
      vendor: '/vendor/dashboard',
      delivery: '/delivery/dashboard',
    };
    router.replace(paths[role] || '/dashboard');
  }, [router]);

  // ─── Handle successful Firebase user ───────────────────────────────────────
  const handleAuthSuccess = useCallback(async (firebaseUser: any) => {
    const e164 = formatPhoneE164(phone);

    try {
      const { user: profile, isNewUser } = await resolveUserProfile(
        firebaseUser.uid,
        firebaseUser.phoneNumber || e164
      );

      if (isNewUser) {
        setNewUserId(firebaseUser.uid);
        setNewUserPhone(firebaseUser.phoneNumber || e164);
        if (profile.role) {
          // Existing user missing name — keep their role, just collect name
          setSelectedRole(profile.role);
          setIsExistingUserMissingName(true);
          addToast('Welcome back! Please tell us your name 👋', 'info');
        } else {
          // Brand new user — full onboarding
          setIsExistingUserMissingName(false);
          addToast('Welcome to Dabzo! Set up your profile 🎉', 'success');
        }
        setStep('onboarding');
        return;
      }

      // Existing user — login
      setUser(profile);
      addToast(`Welcome back, ${profile.name || 'Chef'}!`, 'success');
      routeToRole(profile.role);

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
        throw new Error(result.error);
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
          isTestAccount(e164) ? 'Test account — use code 123456' : 'OTP sent to your phone',
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
        throw new Error(result.error || 'Verification failed');
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

      if (selectedRole === 'vendor') {
        addToast('Account created! Awaiting admin approval.', 'info');
      } else {
        addToast(`Welcome to Dabzo, ${name}! 🎉`, 'success');
      }

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
      if (!result.success) throw new Error(result.error);
      if ('verificationId' in result) {
        setVerificationId(result.verificationId);
        setResendTimer(RESEND_COOLDOWN);
        addToast('New OTP sent!', 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Resend failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-ivory flex flex-col items-center justify-center p-6 max-w-md mx-auto relative">

      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center mb-6">
            <Image src="/assets/dabzo-logo.svg" alt="Dabzo" width={80} height={48} priority />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">
            Smart Meal Subscriptions
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-slate-100">

          {/* ── STEP 1: Phone Input ───────────────────────────────────────── */}
          {step === 'phone' && (
            <form onSubmit={handleSendOTP} className="space-y-6">
              <div className="bg-slate-50/80 border-2 border-slate-100 rounded-2xl px-5 py-4 focus-within:border-brand/40 focus-within:bg-white transition-all duration-300">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 block">
                  Mobile Number
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-300 select-none">+91</span>
                  <div className="w-px h-6 bg-slate-200" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter 10 digit number"
                    className="w-full bg-transparent outline-none text-xl font-bold text-slate-900 placeholder:text-slate-300 placeholder:text-base placeholder:font-medium"
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
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  'Get OTP'
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP Verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="text-center mb-2">
                <p className="text-sm text-slate-400 font-medium">
                  Code sent to{' '}
                  <span className="text-slate-900 font-bold">+91 {phone}</span>
                </p>
              </div>

              <div className="relative">
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full text-center text-4xl sm:text-5xl font-black py-5 bg-slate-50/80 border-2 border-slate-100 rounded-2xl outline-none focus:border-brand/40 focus:bg-white transition-all duration-300 tracking-[0.3em] placeholder:text-slate-200"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  autoComplete="one-time-code"
                />
                {/* Progress dots */}
                <div className="flex justify-center gap-2 mt-3">
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        i < otp.length ? 'bg-brand scale-110' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < OTP_LENGTH}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              {/* Resend + Change number */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setVerificationId(null);
                    cleanupAuth();
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ← Change number
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                  className="text-xs font-bold text-brand hover:text-brand-700 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3: Onboarding ────────────────────────────────────────── */}
          {step === 'onboarding' && (
            <form onSubmit={handleOnboarding} className="space-y-6">
              {/* Context header */}
              <div className="text-center">
                <p className="text-sm font-bold text-slate-600">
                  {isExistingUserMissingName ? '👋 Almost there!' : '🎉 Welcome to Dabzo!'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {isExistingUserMissingName
                    ? 'Just tell us your name to continue'
                    : 'Set up your account to get started'}
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block ml-1">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="What should we call you?"
                  className="w-full bg-slate-50/80 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold outline-none focus:border-brand/40 focus:bg-white transition-all duration-300 placeholder:text-slate-300"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Role selection — only for brand new users */}
              {!isExistingUserMissingName && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3 block ml-1">
                    I am a
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { role: 'user' as UserRole, emoji: '🍽️', label: 'Customer', desc: 'Order meals' },
                      { role: 'vendor' as UserRole, emoji: '👨‍🍳', label: 'Vendor', desc: 'Sell meals' },
                      { role: 'delivery' as UserRole, emoji: '🚴', label: 'Delivery', desc: 'Deliver meals' },
                    ]).map(({ role, emoji, label, desc }) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setSelectedRole(role)}
                        className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 active:scale-[0.97] ${
                          selectedRole === role
                            ? 'border-brand bg-brand/5 shadow-lg shadow-brand/10'
                            : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}
                      >
                        <span className="text-2xl">{emoji}</span>
                        <p className={`font-bold text-sm mt-2 ${selectedRole === role ? 'text-brand' : 'text-slate-700'}`}>
                          {label}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isExistingUserMissingName && selectedRole === 'vendor' && (
                <div className="bg-amber-50 border border-amber-200/50 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 font-semibold">
                    ⚠️ Vendor accounts require admin approval before they can list meals.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>{isExistingUserMissingName ? 'Saving...' : 'Creating account...'}</span>
                  </>
                ) : (
                  isExistingUserMissingName ? 'Save & Continue' : 'Create Account'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-slate-300 text-[10px] font-bold tracking-[0.2em] uppercase">
          Dabzo v2.0 • Secured by Firebase
        </p>
      </div>

      {/* Invisible reCAPTCHA container — DO NOT REMOVE */}
      <div id="recaptcha-container" />
    </div>
  );
}