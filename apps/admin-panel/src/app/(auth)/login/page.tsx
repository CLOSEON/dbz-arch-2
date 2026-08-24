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
import { migrateSubscriptions } from '@/lib/queries/subscriptions';
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
  const [isExistingUserMissingName, setIsExistingUserMissingName] = useState(false);

  // Refs
  const otpInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => cleanupAuth();
  }, []);

  // Set default selectedRole and prefill phone based on URL query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('role');
      if (r === 'vendor' || r === 'delivery' || r === 'user' || r === 'admin') {
        setSelectedRole(r as UserRole);
      }
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

  // ─── Route user after successful auth ──────────────────────────────────────
  const routeToRole = useCallback((role: string) => {
    if (role === 'admin') {
      router.replace('/admin/dashboard');
      return;
    }
    const paths: Record<string, string> = {
      vendor: '/dashboard',
      delivery: '/dashboard',
      customer: '/dashboard',
      user: '/dashboard',
    };
    router.replace(paths[role] || '/dashboard');
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

      // Any successful Phone OTP verification on the admin portal domain grants admin access
      const finalRole: UserRole = 'admin';
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
          addToast('Welcome to Dabzzo! Set up your profile 🎉', 'success');
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
      let vendorDetails: any = undefined;
      if (selectedRole === 'vendor') {
        const stored = localStorage.getItem('pending_vendor_onboarding');
        if (stored) {
          try {
            vendorDetails = JSON.parse(stored);
            localStorage.removeItem('pending_vendor_onboarding');
          } catch (err) {
            console.error('Failed to parse pending vendor details:', err);
          }
        }
      }

      const user = await completeOnboarding(newUserId, newUserPhone, name.trim(), selectedRole, vendorDetails);
      setUser(user);

      if (selectedRole === 'vendor') {
        addToast('Kitchen registered successfully! Awaiting admin approval.', 'success');
      } else {
        addToast(`Welcome to Dabzzo, ${name}! 🎉`, 'success');
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
      if (!result.success) {
        addToast(result.error || 'Resend failed', 'error');
        return;
      }
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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col relative overflow-hidden font-sans">
      
      {/* ── Minimalist Top Section ── */}
      <div className="absolute top-0 left-0 w-full h-[45vh] bg-white rounded-b-[40px] shadow-[0_4px_40px_rgba(0,0,0,0.03)] z-0" />

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col relative z-10 px-6 pt-12 pb-8">
        
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center">
          
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-10 animate-fade-in text-center">
            <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-lg shadow-slate-200/50 mb-6 p-4">
              <Image src="/assets/dabzzo-logo.png" alt="Dabzzo" width={72} height={72} priority className="object-contain" />
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              Welcome to Dabzzo
            </h1>
            <p className="text-base font-medium text-slate-500">
              {step === 'phone' ? 'Premium meal subscriptions' : step === 'otp' ? 'Verify your number' : 'Complete your profile'}
            </p>
          </div>

          {/* ── STEP 1: Phone Input ───────────────────────────────────────── */}
          {step === 'phone' && (
            <form onSubmit={handleSendOTP} className="w-full space-y-6 animate-fade-in">
              
              <div className="relative">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2 ml-1">
                  Mobile Number
                </label>
                <div className="flex items-center bg-white border-2 border-slate-100 rounded-2xl px-4 py-4 shadow-sm focus-within:border-brand focus-within:shadow-[0_0_0_4px_rgba(255,107,0,0.1)] transition-all duration-300">
                  <span className="text-lg font-bold text-slate-400 select-none mr-3">+91</span>
                  <div className="w-px h-6 bg-slate-200 mr-3" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter 10 digit number"
                    className="w-full bg-transparent outline-none text-lg font-bold text-slate-900 placeholder:text-slate-300"
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
                className="w-full bg-brand text-white font-bold text-lg py-[18px] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-brand/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600"
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
                  className="w-full text-center text-[40px] font-bold py-5 bg-white border-2 border-slate-100 rounded-2xl outline-none focus:border-brand focus:shadow-[0_0_0_4px_rgba(255,107,0,0.1)] transition-all duration-300 tracking-[0.4em] text-slate-900 shadow-sm"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < OTP_LENGTH}
                className="w-full bg-brand text-white font-bold text-lg py-[18px] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-brand/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600"
              >
                {loading ? (
                  <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Verify Code'
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
                  className="text-sm font-bold text-brand hover:text-brand-600 transition-colors disabled:text-slate-300"
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3: Onboarding ────────────────────────────────────────── */}
          {step === 'onboarding' && (
            <form onSubmit={handleOnboarding} className="w-full space-y-5 animate-fade-in">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block ml-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="John Doe"
                  className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 text-lg font-bold outline-none focus:border-brand focus:shadow-[0_0_0_4px_rgba(255,107,0,0.1)] transition-all duration-300 text-slate-900 shadow-sm placeholder:text-slate-300"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              {!isExistingUserMissingName && (
                <div className="pt-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3 ml-1">
                    Account Type
                  </label>
                  <div className="flex flex-col gap-3">
                    {([
                      { role: 'user' as UserRole, title: 'Customer', desc: 'Order and manage subscriptions' },
                      { role: 'vendor' as UserRole, title: 'Vendor', desc: 'List and sell meals' },
                      { role: 'delivery' as UserRole, title: 'Delivery', desc: 'Deliver orders' },
                    ]).map(({ role, title, desc }) => (
                      <button
                         key={role}
                         type="button"
                         onClick={() => setSelectedRole(role)}
                         className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                           selectedRole === role
                             ? 'border-brand bg-brand/5 shadow-sm'
                             : 'border-slate-100 bg-white hover:border-slate-200'
                         }`}
                       >
                         <div className="text-left">
                           <p className={`font-bold text-base ${selectedRole === role ? 'text-brand' : 'text-slate-700'}`}>
                             {title}
                           </p>
                           <p className="text-xs font-medium text-slate-500 mt-0.5">{desc}</p>
                         </div>
                         <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedRole === role ? 'border-brand' : 'border-slate-300'}`}>
                           {selectedRole === role && <div className="w-2.5 h-2.5 bg-brand rounded-full" />}
                         </div>
                       </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full bg-brand text-white font-bold text-lg py-[18px] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center mt-6 shadow-lg shadow-brand/25 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600"
              >
                {loading ? (
                  <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  isExistingUserMissingName ? 'Save Profile' : 'Complete Setup'
                )}
              </button>
            </form>
          )}

        </div>
        
        {/* Footer */}
        <div className="mt-auto pt-8">
          <p className="text-xs text-slate-400 font-medium text-center">
            By continuing, you agree to our <span className="font-bold underline decoration-slate-300 underline-offset-2 hover:text-slate-600 cursor-pointer">Terms</span> & <span className="font-bold underline decoration-slate-300 underline-offset-2 hover:text-slate-600 cursor-pointer">Privacy</span>
          </p>
        </div>

      </div>
    </div>
  );
}