import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
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
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
    return mapFirebaseError(err);
  }
}

// ─── Web Social Auth (Popup) ─────────────────────────────────────────────────

async function signInWebPopup(provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider): Promise<SignInResult> {
  try {
    const result = await signInWithPopup(auth, provider);
    return { success: true, user: result.user };
  } catch (err: any) {
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
