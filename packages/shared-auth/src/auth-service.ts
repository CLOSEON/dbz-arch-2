import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, db } from './firebase';
import { Capacitor } from '@capacitor/core';

export const SUPERADMIN_EMAIL = 'closeon.st@gmail.com';

export function normalizeEmail(e: string): string {
  const clean = e.toLowerCase().trim();
  const [local, domain] = clean.split('@');
  if (!domain) return clean;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return local.replace(/\./g, '') + '@gmail.com';
  }
  return clean;
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return normalizeEmail(email) === normalizeEmail(SUPERADMIN_EMAIL);
}

export function isAdminUser(user: any): boolean {
  if (!user) return false;
  const email = user.email || user.providerData?.[0]?.email || '';
  if (isSuperadminEmail(email) || user.is_superadmin === true) return true;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  if (user.roles?.admin === true) return true;
  return false;
}

export function extractUserEmail(user: User | null | undefined): string {
  if (!user) return '';
  return (
    user.email ||
    user.providerData?.[0]?.email ||
    (user as any).reloadUserInfo?.email ||
    ''
  );
}

// ─── Return Types ─────────────────────────────────────────────────────────────

export interface SocialAuthResult {
  success: true;
  user: User;
}

export interface AuthErrorResult {
  success: false;
  error: string;
  code?: string;
}

export type SignInResult = SocialAuthResult | AuthErrorResult;

export interface VerifyOtpResult {
  success: boolean;
  user?: User;
  error?: string;
}

// Keep legacy types for any code still importing them
export interface WebOtpSentResult {
  success: true;
  verificationId: string;
}
export type SendOtpResult = WebOtpSentResult | AuthErrorResult;

// ─── Error Mapping ────────────────────────────────────────────────────────────

function mapFirebaseError(err: any): AuthErrorResult {
  const code = err?.code || '';
  const map: Record<string, string> = {
    'auth/popup-closed-by-user':   'Sign-in was cancelled.',
    'auth/popup-blocked':          'Pop-up was blocked. Please allow pop-ups for this site.',
    'auth/cancelled-popup-request':'Another sign-in is in progress.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests':      'Too many attempts. Please wait a few minutes.',
    'auth/user-disabled':          'This account has been disabled.',

    // Email + password. Firebase returns auth/invalid-credential for a wrong
    // password AND for an unknown email, deliberately, so an attacker cannot
    // use the error to discover which addresses are registered. The wording
    // here keeps that property rather than leaking it back.
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/wrong-password':         'Incorrect email or password.',
    'auth/user-not-found':         'Incorrect email or password.',
    'auth/invalid-email':          'That does not look like a valid email address.',
    'auth/email-already-in-use':   'An account already exists with this email. Try signing in instead.',
    'auth/weak-password':          'Password is too weak. Use at least 6 characters.',
    'auth/missing-password':       'Please enter your password.',
    'auth/operation-not-allowed':  'Email sign-in is not enabled for this project yet.',
  };

  return {
    success: false,
    error: map[code] || err?.message || 'Authentication failed. Please try again.',
    code,
  };
}

// ─── Native Social Auth (Capacitor) ──────────────────────────────────────────

async function signInNativeGoogle(): Promise<SignInResult> {
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle();
    if (!result.credential?.idToken) throw new Error('No ID token received.');
    const { GoogleAuthProvider: GAP, signInWithCredential } = await import('firebase/auth');
    const credential = GAP.credential(result.credential.idToken);
    const userCred = await signInWithCredential(auth, credential);
    return { success: true, user: userCred.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

async function signInNativeApple(): Promise<SignInResult> {
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithApple();
    if (!result.credential?.idToken) throw new Error('No ID token received.');
    const { OAuthProvider: OAP, signInWithCredential } = await import('firebase/auth');
    const provider = new OAP('apple.com');
    const credential = provider.credential({
      idToken: result.credential.idToken,
      rawNonce: result.credential.nonce,
    });
    const userCred = await signInWithCredential(auth, credential);
    return { success: true, user: userCred.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

async function signInNativeFacebook(): Promise<SignInResult> {
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithFacebook();
    if (!result.credential?.accessToken) throw new Error('No access token received.');
    const { FacebookAuthProvider: FAP, signInWithCredential } = await import('firebase/auth');
    const credential = FAP.credential(result.credential.accessToken);
    const userCred = await signInWithCredential(auth, credential);
    return { success: true, user: userCred.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

// ─── Web Social Auth (Popup) ─────────────────────────────────────────────────

async function signInWebPopup(provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider): Promise<SignInResult> {
  try {
    const result = await signInWithPopup(auth, provider);
    return { success: true, user: result.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

// ─── Public Social Auth API ──────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<SignInResult> {
  if (Capacitor.isNativePlatform()) return signInNativeGoogle();
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWebPopup(provider);
}

export async function signInWithFacebook(): Promise<SignInResult> {
  if (Capacitor.isNativePlatform()) return signInNativeFacebook();
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  provider.addScope('public_profile');
  return signInWebPopup(provider);
}

export async function signInWithApple(): Promise<SignInResult> {
  if (Capacitor.isNativePlatform()) return signInNativeApple();
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return signInWebPopup(provider);
}

// ─── Legacy Stubs (phone OTP — kept for Capacitor backward-compat if needed) ──
// These are effectively disabled; they return an error to prevent accidental usage.

export async function sendOtp(_phoneNumber: string): Promise<SendOtpResult> {
  return {
    success: false,
    error: 'Phone OTP has been disabled. Please use Google, Facebook, or Apple sign-in.',
  };
}

export async function verifyOtp(_verificationId: string, _otpCode: string): Promise<VerifyOtpResult> {
  return {
    success: false,
    error: 'Phone OTP has been disabled. Please use social sign-in.',
  };
}

// ─── Email + Password ────────────────────────────────────────────────────────
//
// Requires the Email/Password provider to be enabled in the Firebase console
// (Authentication -> Sign-in method). Without it every call returns
// auth/operation-not-allowed.
//
// Sign-up is deliberately NOT exposed to the partner apps: vendor, rider and
// admin accounts are created by an administrator, so those portals offer
// sign-in and password reset only. See createPartnerAccount in Cloud Functions.

export interface PasswordResetResult {
  success: boolean;
  error?: string;
}

/** Sign in an existing account. */
export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    return { success: true, user: cred.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

/**
 * Create a new account. Customer app only — the partner portals do not call
 * this, by design.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<SignInResult> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
    if (displayName?.trim()) {
      // Best effort: a failure here must not sink an otherwise good sign-up.
      try {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      } catch {
        /* ignore */
      }
    }
    return { success: true, user: cred.user };
  } catch (err: unknown) {
    return mapFirebaseError(err);
  }
}

/**
 * Send a password reset email.
 *
 * Reports success even when the address is not registered. Firebase itself
 * does not reveal this, and neither should the UI — otherwise the form becomes
 * a way to test which emails have accounts.
 */
export async function sendPasswordReset(email: string): Promise<PasswordResetResult> {
  try {
    await sendPasswordResetEmail(auth, normalizeEmail(email));
    if (process.env.NODE_ENV !== 'production') {
      console.info('[auth] Password reset email requested for', normalizeEmail(email));
    }
    return { success: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';

    // Hiding "no such account" is right in production — otherwise this form
    // becomes a way to test which emails are registered. But it also makes the
    // failure indistinguishable from success while developing, so log the real
    // reason to the console in dev only. The returned value is unchanged, so
    // production behaviour is identical.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[auth] Password reset did NOT send. code=${code || '(none)'}. ` +
        'auth/user-not-found means no account exists for that address; ' +
        'the UI still reports success on purpose.',
        err
      );
    }

    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      return { success: true };
    }
    const mapped = mapFirebaseError(err);
    return { success: false, error: mapped.error };
  }
}

export function cleanupAuth(): void {
  // No-op: reCAPTCHA / phone auth removed
}

// ─── Sign Out ────────────────────────────────────────────────────────────────

const FCM_TOKEN_STORAGE_KEY = 'dabzzo_fcm_token';

export async function signOut(): Promise<void> {
  if (auth.currentUser) {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(FCM_TOKEN_STORAGE_KEY) : null;
    if (token) {
      try {
        const { doc, updateDoc, arrayRemove, deleteField } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          push_tokens: arrayRemove(token),
          fcmToken: deleteField(),
        });
        localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
      } catch (e) {
        console.error('[Auth] Failed to remove FCM token on signout', e);
      }
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch {
      // ignore
    }
  }

  await auth.signOut();
}
