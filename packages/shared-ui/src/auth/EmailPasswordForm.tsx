'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import {
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
} from '@dabzzo/shared-auth';
import type { User } from 'firebase/auth';

/**
 * Email + password form, shared by all four portals.
 *
 * `allowSignUp` is off by default on purpose: vendor, rider and admin accounts
 * are created by an administrator, so those portals get sign-in and password
 * reset only. Only the customer app passes allowSignUp.
 */
export interface EmailPasswordFormProps {
  /** Show the "create account" tab. Customer app only. */
  allowSignUp?: boolean;
  /** Called with the signed-in Firebase user on success. */
  onSuccess: (user: User) => void;
  /** Surface a message to the user (toast, banner, whatever the app uses). */
  onNotify?: (message: string, kind: 'success' | 'error') => void;
  /** Accent colour for the submit button — portals differ. */
  accentClassName?: string;
  /** Label on the sign-in button, e.g. "Sign in to Kitchen". */
  signInLabel?: string;
}

type Mode = 'signin' | 'signup' | 'reset';

const MIN_PASSWORD = 6;

export function EmailPasswordForm({
  allowSignUp = false,
  onSuccess,
  onNotify,
  accentClassName = 'bg-slate-900 hover:bg-slate-800',
  signInLabel = 'Sign In',
}: EmailPasswordFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const notify = (m: string, k: 'success' | 'error') => {
    if (onNotify) onNotify(m, k);
    else if (k === 'error') setError(m);
  };

  const validate = (): string | null => {
    if (!email.trim()) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'That does not look like a valid email address.';
    if (mode === 'reset') return null;
    if (!password) return 'Please enter your password.';
    // Only enforce a minimum when creating an account. Applying it at sign-in
    // would lock out anyone whose existing password predates the rule.
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    return null;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const invalid = validate();
    if (invalid) {
      notify(invalid, 'error');
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        const res = await sendPasswordReset(email);
        if (res.success) {
          // Deliberately the same message whether or not the address exists,
          // so this form cannot be used to discover registered accounts.
          notify('If that email has an account, a reset link is on its way.', 'success');
          setMode('signin');
        } else {
          notify(res.error || 'Could not send the reset email.', 'error');
          setError(res.error || 'Could not send the reset email.');
        }
        return;
      }

      const res =
        mode === 'signup'
          ? await signUpWithEmail(email, password, name)
          : await signInWithEmail(email, password);

      if (res.success) {
        onSuccess(res.user);
      } else {
        notify(res.error, 'error');
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-900 ' +
    'placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 transition';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {allowSignUp && mode !== 'reset' && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); }}
              className={
                'rounded-lg py-2 text-xs font-black uppercase tracking-wider transition ' +
                (mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700')
              }
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
      )}

      {mode === 'signup' && (
        <div className="relative">
          <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      <div className="relative">
        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          required
        />
      </div>

      {mode !== 'reset' && (
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            // current-password vs new-password matters: it tells a password
            // manager whether to offer an existing entry or generate one.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls + ' pr-12'}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="px-1 text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={
          'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black uppercase tracking-wider ' +
          'text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ' +
          accentClassName
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {mode === 'reset' ? 'Send Reset Link' : mode === 'signup' ? 'Create Account' : signInLabel}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <div className="flex items-center justify-between px-1 pt-1">
        {mode === 'reset' ? (
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition"
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setMode('reset'); setError(''); }}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition"
          >
            Forgot password?
          </button>
        )}
      </div>
    </form>
  );
}
