'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { signInWithGoogle, isSuperadminEmail, extractUserEmail, SUPERADMIN_EMAIL } from '@/lib/auth';
import { resolveUserProfile, completeOnboarding } from '@/lib/queries/users';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
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

export default function RiderLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const addToast = useUiStore((s) => s.addToast);

  const [step, setStep] = useState<AuthStep>('social');
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [prefillName, setPrefillName] = useState('');
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  const [prefillPhoto, setPrefillPhoto] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [saving, setSaving] = useState(false);

  // If already authenticated as rider / admin / superadmin, redirect to dashboard immediately
  useEffect(() => {
    if (!isHydrated) return;
    const email = currentUser?.email || auth.currentUser?.email || '';
    const isSuper = isSuperadminEmail(email);
    const hasRiderAccess =
      currentUser &&
      (currentUser.role === 'delivery' ||
        currentUser.role === 'admin' ||
        (currentUser as any)?.roles?.delivery ||
        (currentUser as any)?.roles?.rider ||
        isSuper);

    if (hasRiderAccess) {
      router.replace('/dashboard');
    }
  }, [currentUser, isHydrated, router]);

  const handleAuthSuccess = useCallback(async (firebaseUser: User) => {
    try {
      const email = extractUserEmail(firebaseUser);
      const isSuper = isSuperadminEmail(email);

      // Superadmin auto-link to Test Rider profile
      if (isSuper) {
        const testRiderProfile: AppUser = {
          id: firebaseUser.uid,
          email: email || SUPERADMIN_EMAIL,
          name: firebaseUser.displayName || 'Test Delivery',
          phone: '+919900990044',
          image: firebaseUser.photoURL || undefined,
          role: 'delivery' as UserRole,
          roles: { delivery: true, admin: true },
          is_approved: true,
          is_superadmin: true,
          verification_status: 'verified',
          vehicle_type: 'Motorcycle',
          vehicle_number: 'DL-01-AB-1234',
        };

        try {
          await setDoc(doc(db, 'users', firebaseUser.uid), testRiderProfile, { merge: true });
          await setDoc(doc(db, 'driver_profiles', firebaseUser.uid), {
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            name: testRiderProfile.name,
            phone: testRiderProfile.phone,
            vehicle_type: 'Motorcycle',
            vehicle_number: 'DL-01-AB-1234',
            isActive: true,
            updatedAt: Timestamp.now(),
          }, { merge: true });
        } catch (e) {
          console.warn('[RiderLogin] Syncing superadmin rider profile:', e);
        }

        setUser(testRiderProfile);
        addToast('Welcome back, Rider! 🛵', 'success');
        router.replace('/dashboard');
        return;
      }

      let profile: AppUser | null = null;
      let isNewUser = false;
      try {
        const res = await resolveUserProfile(
          firebaseUser.uid,
          email || null,
          firebaseUser.displayName,
          firebaseUser.photoURL,
        );
        profile = res.user;
        isNewUser = res.isNewUser;
      } catch (err: any) {
        console.warn('[RiderLogin] resolveUserProfile error:', err);
      }

      const hasRiderAccess =
        profile &&
        (profile.role === 'delivery' ||
          profile.role === 'admin' ||
          (profile as any)?.roles?.delivery ||
          (profile as any)?.roles?.rider);

      if (!isNewUser && hasRiderAccess && profile) {
        setUser(profile);
        addToast('Welcome back, Rider! 🛵', 'success');
        router.replace('/dashboard');
        return;
      }

      setPendingUser(firebaseUser);
      setPrefillName(profile?.name || firebaseUser.displayName || '');
      setPrefillEmail(email || null);
      setPrefillPhoto(firebaseUser.photoURL || null);
      setStep('onboarding');
    } catch (err: any) {
      addToast(err.message || 'Sign-in failed. Please try again.', 'error');
    }
  }, [setUser, addToast, router]);

  // Check redirect result and active Firebase session on mount
  useEffect(() => {
    let active = true;
    import('firebase/auth').then(async ({ getRedirectResult }) => {
      try {
        const res = await getRedirectResult(auth);
        if (res?.user && active) {
          await handleAuthSuccess(res.user);
        }
      } catch (err: any) {
        console.warn('[RiderLogin] getRedirectResult error:', err);
      }
    });

    if (auth.currentUser) {
      handleAuthSuccess(auth.currentUser);
    }

    return () => {
      active = false;
    };
  }, [handleAuthSuccess]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      if (auth.currentUser) {
        await handleAuthSuccess(auth.currentUser);
        return;
      }
      const result = await signInWithGoogle();
      if (!result.success) {
        if (result.code !== 'redirecting') {
          addToast(result.error, 'error');
        }
        return;
      }
      await handleAuthSuccess(result.user);
    } catch (err: any) {
      addToast(err?.message || 'Login error occurred.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    if (phone.length !== 10) { addToast('Enter a valid 10-digit phone number', 'warning'); return; }
    if (!vehicleType.trim()) { addToast('Enter your vehicle type', 'warning'); return; }

    setSaving(true);
    try {
      const user = await completeOnboarding(
        pendingUser.uid,
        `+91${phone}`,
        prefillName || 'Rider',
        'delivery' as UserRole,
        prefillEmail,
        prefillPhoto,
        { vehicle_type: vehicleType, vehicle_number: vehicleNumber },
      );

      // Also ensure driver_profiles doc exists
      try {
        await setDoc(doc(db, 'driver_profiles', pendingUser.uid), {
          id: pendingUser.uid,
          uid: pendingUser.uid,
          name: prefillName || 'Rider',
          phone: `+91${phone}`,
          vehicle_type: vehicleType,
          vehicle_number: vehicleNumber,
          isActive: true,
          updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch (e) {
        console.warn('[RiderLogin] driver_profiles error:', e);
      }

      setUser(user);
      addToast('Application submitted! Awaiting admin approval.', 'success');
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
                Rider Partner Sign In
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
                  <img src={prefillPhoto} alt={prefillName} className="w-14 h-14 rounded-full ring-2 ring-purple-500/20 object-cover" />
                </div>
              )}
              <div className="text-center mb-4">
                <p className="text-base font-bold text-slate-800">Join the Fleet, {prefillName || 'Rider'} 🛵</p>
                <p className="text-xs text-slate-500 mt-1">Tell us about yourself to get started</p>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Contact Number</label>
                <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 focus-within:bg-white focus-within:border-purple-600 focus-within:shadow-[0_0_0_4px_rgba(124,58,237,0.12)] transition-all">
                  <span className="text-base font-black text-slate-400 mr-3">+91</span>
                  <div className="w-px h-5 bg-slate-200 mr-3" />
                  <input type="tel" inputMode="numeric" maxLength={10} placeholder="10 digit number" autoFocus
                    className="w-full bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal"
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Vehicle Type</label>
                <input type="text" placeholder="e.g. Bike, EV Scooter, Cycle"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-purple-600 focus:shadow-[0_0_0_4px_rgba(124,58,237,0.12)] transition-all text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                  value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">
                  Vehicle Number <span className="text-slate-300 font-normal normal-case">(optional)</span>
                </label>
                <input type="text" placeholder="e.g. UP16-AB-1234"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-purple-600 focus:shadow-[0_0_0_4px_rgba(124,58,237,0.12)] transition-all text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                  value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
              </div>

              <button type="submit" disabled={saving || phone.length !== 10 || !vehicleType.trim()}
                className="w-full bg-[#7C3AED] text-white font-bold text-base py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/25 disabled:opacity-50 hover:bg-violet-700 mt-2">
                {saving ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <><span>Apply to Ride</span><ArrowRight className="w-4 h-4" strokeWidth={2.5} /></>}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400 font-medium">
          Dabzzo Rider Partners
        </p>
      </div>
    </div>
  );
}