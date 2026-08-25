'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { sendOtp, verifyOtp, cleanupAuth } from '@/lib/auth';
import type { SendOtpResult } from '@/lib/auth';
import { resolveUserProfile, formatPhoneE164, isTestAccount } from '@/lib/queries/users';
import { ShieldCheck, ArrowRight } from 'lucide-react';

// ─── Step Types ──────────────────────────────────────────────────────────────

type AuthStep = 'phone' | 'otp';

// ─── Constants ───────────────────────────────────────────────────────────────

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

export default function AdminLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Firebase auth confirmation / verificationId
  const [verificationId, setVerificationId] = useState<string | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupAuth();
    };
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

  // ─── Handle successful Firebase user ───────────────────────────────────────
  const handleAuthSuccess = useCallback(async (firebaseUser: any) => {
    const e164 = formatPhoneE164(phone);

    try {
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      const { auth } = await import('@/lib/firebase');
      await auth.authStateReady();

      const { user: profile } = await resolveUserProfile(
        firebaseUser.uid,
        firebaseUser.phoneNumber || e164
      );

      const isAdmin = Boolean(tokenResult?.claims?.admin || profile?.role === 'admin');

      if (!isAdmin && profile?.role !== 'admin') {
        addToast('Unauthorized. This portal requires Administrator privileges.', 'error');
        await auth.signOut();
        return;
      }

      setUser({ ...profile, role: 'admin' });
      addToast(`Welcome to Dabzzo Admin Console, ${profile?.name || 'Administrator'}! 🛡️`, 'success');
      router.replace('/admin/dashboard');
    } catch (err: any) {
      console.error('[Login] Profile resolution error:', err);
      addToast(err.message || 'Authentication failed during admin verification', 'error');
    }
  }, [phone, addToast, setUser, router]);

  // ─── Step 1: Send OTP ─────────────────────────────────────────────────────
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      addToast('Enter a valid 10-digit registered admin phone number', 'warning');
      return;
    }

    setLoading(true);
    try {
      const e164 = formatPhoneE164(phone);
      const result: SendOtpResult = await sendOtp(e164);

      if (!result.success) {
        addToast(result.error || 'Failed to send OTP. Try again.', 'error');
        return;
      }

      if ('verificationId' in result) {
        setVerificationId(result.verificationId);
        setStep('otp');
        setResendTimer(RESEND_COOLDOWN);
        addToast('Authorization code sent!', 'success');
      }
    } catch (err: any) {
      console.error('[Login] Send OTP error:', err);
      addToast(err.message || 'Failed to send verification code', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: Verify OTP ───────────────────────────────────────────────────
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < OTP_LENGTH) {
      addToast(`Enter the complete ${OTP_LENGTH}-digit OTP`, 'warning');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOtp(verificationId || '', otp.trim());

      if (!result.success || !result.user) {
        addToast(result.error || 'Invalid authorization code', 'error');
        return;
      }

      await handleAuthSuccess(result.user);
    } catch (err: any) {
      console.error('[Login] Verify OTP error:', err);
      addToast(err.message || 'Authorization failed. Try again.', 'error');
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
        addToast('New code sent!', 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Resend failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER (Admin Operations Console: Slate Dark Theme) ──────────────────

  return (
    <div
      className="min-h-screen flex flex-col justify-between px-6 py-10 relative overflow-hidden font-sans"
      style={{
        background: 'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(15, 23, 42, 0.12) 0%, rgba(241, 245, 249, 0.85) 50%, #F8FAFC 100%)',
      }}
    >
      {/* Ambient Lighting Orbs */}
      <div className="absolute top-0 right-1/4 w-72 h-72 rounded-full bg-slate-400/15 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-60 h-60 rounded-full bg-slate-900/10 blur-2xl pointer-events-none" />

      {/* ── Main Content Area ── */}
      <div className="w-full max-w-md mx-auto my-auto relative z-10 flex flex-col">
        
        {/* ── Typographic Brand Header ── */}
        <div className="flex flex-col items-center mb-8 animate-fade-in text-center">
          
          {/* Brand Logo Wordmark (Transparent, No Box) */}
          <div className="mb-3 flex justify-center">
            <Image
              src="/logo-main-text.png"
              alt="Dabzzo"
              width={260}
              height={70}
              priority
              unoptimized
              className="h-13 sm:h-15 w-auto object-contain drop-shadow-xs"
            />
          </div>

          {/* Sub-Brand Pill Badge */}
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-200/90 border border-slate-300 shadow-xs mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-800 stroke-[2.2]" />
            <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] leading-none">
              Operations Console
            </span>
          </div>

          {/* Context Subtitle */}
          <p className="text-sm font-medium text-slate-600 max-w-[300px] leading-relaxed">
            {step === 'phone'
              ? 'Platform operations, subscriptions, kitchen logistics & settlements'
              : 'Enter the 6-digit administrative verification code'}
          </p>
        </div>

        {/* ── Elevated Form Container ── */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-7 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
          {/* ── STEP 1: Phone Input ───────────────────────────────────────── */}
          {step === 'phone' && (
            <form onSubmit={handleSendOTP} className="w-full space-y-5 animate-fade-in">
              <div className="relative">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">
                  Administrator Mobile
                </label>
                <div className="flex items-center bg-slate-50/80 border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:bg-white focus-within:border-slate-900 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.12)] transition-all duration-300">
                  <span className="text-base font-black text-slate-500 select-none mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Enter 10 digit number"
                    className="w-full bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-medium"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full bg-slate-900 text-white font-bold text-base py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <span>Continue to Console</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP Verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="w-full space-y-5 animate-fade-in">
              <div className="text-center mb-2">
                <p className="text-xs font-medium text-slate-500">
                  Code sent to <span className="text-slate-900 font-bold">+91 {phone}</span>
                </p>
              </div>

              <div className="relative">
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="------"
                  className="w-full text-center text-3xl font-black py-4 bg-slate-50/80 border-2 border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-slate-900 focus:shadow-[0_0_0_4px_rgba(15,23,42,0.12)] transition-all duration-300 tracking-[0.35em] text-slate-900"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < OTP_LENGTH}
                className="w-full bg-slate-900 text-white font-bold text-base py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <span>Verify Code</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setVerificationId(null);
                    cleanupAuth();
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Edit number
                </button>
                <div className="w-1 h-1 rounded-full bg-slate-300" />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                  className="text-xs font-bold text-slate-900 hover:text-black transition-colors disabled:text-slate-300"
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

        </div>
        
        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[11px] text-slate-400 font-medium">
            Authorized administrator access only • Security Protocol
          </p>
        </div>

      </div>
    </div>
  );
}