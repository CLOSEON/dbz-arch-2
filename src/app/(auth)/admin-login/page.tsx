'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { loginWithEmailPassword } from '@/lib/queries/users';

/**
 * HIDDEN ADMIN LOGIN — Not linked from any public page.
 * Access via: /admin-login
 * Uses Email + Password (Firebase) — not phone OTP.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { addToast('Fill all fields', 'warning'); return; }

    setLoading(true);
    try {
      const user = await loginWithEmailPassword(email, password);
      setUser(user);
      addToast(`Welcome back, ${user.name} 👑`, 'success');
      router.replace('/admin/dashboard');
    } catch (err: any) {
      addToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-5 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-700">
          <span className="text-2xl">👑</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Admin Access</h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Dabzo Control Panel</p>
      </div>

      <div className="w-full max-w-sm bg-slate-900 rounded-3xl border border-slate-800 p-8">
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-black text-slate-500 mb-2 uppercase tracking-widest">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dabzo.com"
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-5 py-4 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-brand/50 transition-all"
            />
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 mb-2 uppercase tracking-widest">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-5 py-4 text-sm font-semibold text-white placeholder:text-slate-600 outline-none focus:border-brand/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white rounded-2xl py-4 font-black text-sm mt-2 transition-all active:scale-95 disabled:opacity-60 shadow-lg shadow-brand/20 hover:shadow-brand/40"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              'Sign In as Admin'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Not an admin?{' '}
          <a href="/login" className="text-brand hover:underline font-bold">
            Go to main login
          </a>
        </p>
      </div>
    </div>
  );
}
