'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { signInWithGoogle } from '@/lib/auth';
import { resolveUserProfile } from '@/lib/queries/users';
import type { User } from 'firebase/auth';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function AdminLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);

  const handleAuthSuccess = useCallback(async (firebaseUser: User) => {
    try {
      const { user: profile } = await resolveUserProfile(
        firebaseUser.uid,
        firebaseUser.email,
        firebaseUser.displayName,
        firebaseUser.photoURL,
      );

      if (profile.role !== 'admin') {
        addToast('Access denied. Admin accounts only.', 'error');
        const { signOut } = await import('@/lib/auth');
        await signOut();
        return;
      }

      setUser(profile);
      addToast(`Welcome back, ${profile.name || 'Admin'}`, 'success');
      router.replace('/admin/dashboard');
    } catch (err: any) {
      addToast(err.message || 'Sign-in failed.', 'error');
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

  return (
    <div className="min-h-screen bg-[#0B0E11] flex flex-col justify-center px-6 py-10 font-sans">
      <div className="w-full max-w-sm mx-auto flex flex-col">

        <div className="flex justify-center mb-10">
          <Image
            src="/logo-main-text.png"
            alt="Dabzzo Admin"
            width={280}
            height={80}
            priority
            unoptimized
            className="h-14 sm:h-16 w-auto object-contain brightness-0 invert"
          />
        </div>

        <div className="bg-[#13181F] border border-white/5 rounded-3xl p-8 shadow-2xl">
          <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-widest mb-7">
            Admin Console
          </p>

          <button onClick={handleGoogle} disabled={loading}
            className="w-full flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50">
            {loading ? <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" /> : <GoogleIcon />}
            <span className="flex-1 text-center">Sign in with Google</span>
          </button>

          <p className="text-center text-[11px] text-slate-600 mt-6">
            Only authorized admin accounts can access this panel.
          </p>
        </div>

      </div>
    </div>
  );
}