'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
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

export default function AdminLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
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

  // ─── Read query params on mount ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('phone');
      if (p) {
        const cleanPhone = p.replace(/\D/g, '').slice(-10);
        if (cleanPhone.length === 10) {
          setPhone(cleanPhone);
        }
      }
    }
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
      
      if (!isAdmin) {
        addToast('Access restricted: Authorized administrator account required', 'error');
        return;
      }

      setUser({ ...profile, role: 'admin' });
      addToast(`Welcome back, ${profile.name || 'Admin'}! 🛡️`, 'success');
      router.replace('/admin/dashboard');
    } catch (err: any) {
      console.error('[Login] Admin profile error:', err);
      addToast(err.message || 'Login failed during authorization', 'error');
    }
  }, [phone, addToast, setUser, router]);

  // ─── Step 1: Send OTP ─────────────────────────────────────────────────────
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      addToast('Enter a valid 10-digit administrator mobile number', 'warning');
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
        addToast('Admin authorization code sent!', 'success');
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
        addToast('New admin code sent!', 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Resend failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col relative overflow-hidden font-sans">
      
      {/* ── Minimalist Curved Top Section ── */}
      <div className="absolute top-0 left-0 w-full h-[45vh] bg-white rounded-b-[40px] shadow-[0_4px_40px_rgba(0,0,0,0.03)] z-0" />

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col relative z-10 px-6 pt-12 pb-8">
        
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center">
          
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-10 animate-fade-in text-center">
            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-lg shadow-slate-200/50 mb-6 p-4 border border-slate-100">
              <Image
                src="/icon.png"
                alt="Dabzzo"
                width={72}
                height={72}
                priority
                unoptimized
                className="object-contain"
              />
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              Welcome to Dabzzo
            </h1>
            <p className="text-base font-medium text-slate-500">
              {step === 'phone'
                ? 'Operations & Control Console'
                : 'Verify your admin authorization code'}
            </p>
          </div>

          {/* ── STEP 1: Phone Input ───────────────────────────────────────── */}
          {step === 'phone' && (
            <form onSubmit={handleSendOTP} className="w-full space-y-6 animate-fade-in">
              <div className="relative">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2 ml-1">
                  Administrator Mobile
                </label>
                <div className="flex items-center bg-white border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:border-slate-900 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.1)] transition-all duration-300 shadow-sm">
                  <span className="text-base font-black text-slate-500 select-none mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Enter 10 digit number"
                    className="w-full bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-300 placeholder:font-medium"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full bg-slate-900 text-white font-bold text-lg py-[18px] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {loading ? (
                  <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Continue'
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP Verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="w-full space-y-6 animate-fade-in">
              <div className="text-center mb-2">
                <p className="text-sm font-medium text-slate-500">
                  Enter the code sent to <span className="text-slate-900 font-bold">+91 {phone}</span>
                </p>
              </div>

              <div className="relative">
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="------"
                  className="w-full text-center text-[40px] font-bold py-5 bg-white border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 focus:shadow-[0_0_0_4px_rgba(15,23,42,0.1)] transition-all duration-300 tracking-[0.4em] text-slate-900 shadow-sm"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < OTP_LENGTH}
                className="w-full bg-slate-900 text-white font-bold text-lg py-[18px] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {loading ? (
                  <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Verify Admin Access'
                )}
              </button>

              <div className="flex items-center justify-center gap-6 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setVerificationId(null);
                    cleanupAuth();
                  }}
                  className="text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Edit number
                </button>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                  className="text-sm font-bold text-slate-900 hover:text-slate-700 transition-colors disabled:text-slate-300"
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

        </div>
        
        {/* Footer */}
        <div className="mt-auto pt-8">
          <p className="text-xs text-slate-400 font-medium text-center">
            Authorized administrator access only • <span className="font-bold underline decoration-slate-300 underline-offset-2 hover:text-slate-600 cursor-pointer">Security Protocol</span>
          </p>
        </div>

      </div>
    </div>
  );
}