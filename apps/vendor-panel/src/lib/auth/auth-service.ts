import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Capacitor } from '@capacitor/core';
import { isTestAccount } from '@/lib/queries/users';

// ─── Constants ───────────────────────────────────────────────────────────────

const FCM_TOKEN_STORAGE_KEY = 'dabzzo_fcm_token';

// ─── Return Types ────────────────────────────────────────────────────────────

export interface WebOtpSentResult {
  success: true;
  verificationId: string;
}

export interface NativeAutoVerifiedResult {
  success: true;
  autoVerified: true;
  user: User;
}

export interface NativeCodeSentResult {
  success: true;
  autoVerified: false;
  verificationId: string;
}

export interface OtpErrorResult {
  success: false;
  error: string;
  code?: string;
}

export type SendOtpResult =
  | WebOtpSentResult
  | NativeAutoVerifiedResult
  | NativeCodeSentResult
  | OtpErrorResult;

export interface VerifyOtpResult {
  success: boolean;
  user?: User;
  error?: string;
}

// ─── Internal State ──────────────────────────────────────────────────────────

let _recaptchaVerifier: RecaptchaVerifier | null = null;
let _confirmationResult: ConfirmationResult | null = null;

// ─── Platform Detection ──────────────────────────────────────────────────────

const isNative = Capacitor.isNativePlatform();

// ─── reCAPTCHA Setup & Web Implementation (Stable Singleton) ──────────────────

function getOrCreateRecaptcha(): RecaptchaVerifier {
  if (typeof window === 'undefined') {
    throw new Error('reCAPTCHA is only supported in browser environment.');
  }

  // Ensure DOM container exists
  let container = document.getElementById('firebase-recaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'firebase-recaptcha-container';
    document.body.appendChild(container);
  }

  // Reuse existing singleton if already initialized
  if (_recaptchaVerifier) {
    return _recaptchaVerifier;
  }

  _recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
    callback: () => {
      console.log('[Auth] reCAPTCHA solved');
    },
    'expired-callback': () => {
      console.warn('[Auth] reCAPTCHA expired, resetting verifier');
      cleanupAuth();
    },
  });

  return _recaptchaVerifier;
}

async function sendOtpWeb(phoneNumber: string): Promise<SendOtpResult> {
  console.log('[Auth] Starting Web OTP flow for:', phoneNumber);

  try {
    const verifier = getOrCreateRecaptcha();

    // Trigger Phone Auth
    _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);

    console.log('[Auth] Web: OTP sent successfully');
    return {
      success: true,
      verificationId: '_web_confirmation',
    };
  } catch (err: any) {
    console.error('[Auth] Web OTP Error:', err);

    // On failure, reset verifier so next attempt gets a fresh instance
    cleanupAuth();

    if (err.code === 'auth/too-many-requests') {
      return {
        success: false,
        error: 'Too many OTP attempts. Please wait a few minutes before trying again.',
        code: err.code,
      };
    }
    if (err.code === 'auth/invalid-app-credential' || err.code === 'auth/captcha-check-failed') {
      return {
        success: false,
        error: 'Security verification failed for this domain. Please ensure domain is whitelisted or refresh the page.',
        code: err.code,
      };
    }

    return mapFirebaseError(err);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupAuth(): void {
  if (_recaptchaVerifier) {
    try {
      _recaptchaVerifier.clear();
    } catch {
      // ignore clear error
    }
    _recaptchaVerifier = null;
  }
  const oldContainer = document.getElementById('firebase-recaptcha-container');
  if (oldContainer) {
    oldContainer.innerHTML = '';
  }
  _confirmationResult = null;
}

// ─── Error Mapping ───────────────────────────────────────────────────────────

function mapFirebaseError(err: any): OtpErrorResult {
  const code = err?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number': 'Invalid phone number. Please check and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
    'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
    'auth/captcha-check-failed': 'Security verification failed. Please refresh and try again.',
    'auth/missing-phone-number': 'Phone number is required.',
    'auth/invalid-verification-code': 'Invalid OTP code. Please check and try again.',
    'auth/code-expired': 'OTP has expired. Please request a new one.',
    'auth/session-expired': 'Session expired. Please request a new OTP.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/app-not-authorized': 'This app is not authorized for phone auth. Check Firebase config.',
    'auth/missing-client-identifier': 'reCAPTCHA verification required. Please try again.',
  };

  return {
    success: false,
    error: map[code] || err?.message || 'Authentication failed. Please try again.',
    code,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendOtp(phoneNumber: string): Promise<SendOtpResult> {
  // Test accounts fast-path
  if (isTestAccount(phoneNumber)) {
    console.log('[Auth] Test account detected. Skipping reCAPTCHA/SMS.');
  }

  if (isNative) {
    return sendOtpNative(phoneNumber);
  }
  return sendOtpWeb(phoneNumber);
}

export async function verifyOtp(
  verificationId: string,
  otpCode: string
): Promise<VerifyOtpResult> {
  if (isNative) {
    return verifyOtpNative(verificationId, otpCode);
  }
  return verifyOtpWeb(otpCode);
}

// ─── Web Verify ──────────────────────────────────────────────────────────────

async function verifyOtpWeb(otpCode: string): Promise<VerifyOtpResult> {
  if (!_confirmationResult) {
    return {
      success: false,
      error: 'No active OTP request found. Please request a new OTP.',
    };
  }

  try {
    const result = await _confirmationResult.confirm(otpCode);
    cleanupAuth();
    return { success: true, user: result.user };
  } catch (err: any) {
    console.error('[Auth] Web verify error:', err);
    return {
      success: false,
      error:
        err.code === 'auth/invalid-verification-code'
          ? 'Invalid OTP. Please check the code and try again.'
          : err.code === 'auth/code-expired'
          ? 'OTP has expired. Please request a new one.'
          : err.message || 'Verification failed.',
    };
  }
}

// ─── Native Implementation (Capacitor SMS Retriever) ──────────────────────────

async function sendOtpNative(phoneNumber: string): Promise<SendOtpResult> {
  console.log('[Auth] Starting Native OTP flow for:', phoneNumber);

  try {
    const verifier = getOrCreateRecaptcha();
    _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    return {
      success: true,
      autoVerified: false,
      verificationId: '_native_confirmation',
    };
  } catch (err: any) {
    console.error('[Auth] Native OTP Error:', err);
    cleanupAuth();
    return mapFirebaseError(err);
  }
}

async function verifyOtpNative(
  verificationId: string,
  otpCode: string
): Promise<VerifyOtpResult> {
  return verifyOtpWeb(otpCode);
}

// ─── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  cleanupAuth();

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

  if (isNative) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch {
      // ignore
    }
  }

  await auth.signOut();
}
