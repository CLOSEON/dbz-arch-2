/**
 * DABZO AUTH SERVICE — Unified Phone OTP Authentication
 * 
 * Dual-platform architecture:
 * - WEB: Firebase JS SDK + RecaptchaVerifier (invisible reCAPTCHA)
 * - NATIVE (Android/iOS via Capacitor): @capacitor-firebase/authentication plugin
 * 
 * Flow:
 * 1. sendOtp(phone) → Returns verificationId (or auto-verifies on Android)
 * 2. verifyOtp(verificationId, code) → Returns Firebase User
 */

import { Capacitor } from '@capacitor/core';
import {
  signInWithPhoneNumber,
  signInWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
  ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OtpSendResult {
  success: true;
  verificationId: string;
  autoVerified?: false;
}

export interface OtpAutoVerifyResult {
  success: true;
  autoVerified: true;
  user: User;
}

export interface OtpErrorResult {
  success: false;
  error: string;
  code?: string;
}

export type SendOtpResult = OtpSendResult | OtpAutoVerifyResult | OtpErrorResult;

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

function isTestAccount(phone: string): boolean {
  const TEST_NUMBERS = ['+919000000001', '+919000000002', '+919000000003', '+919000000004'];
  return TEST_NUMBERS.includes(phone);
}

// ─── reCAPTCHA Setup (Web Only) ──────────────────────────────────────────────

function getRecaptchaVerifier(): RecaptchaVerifier {
  // Clean up any existing verifier
  if (_recaptchaVerifier) {
    _recaptchaVerifier.clear();
    _recaptchaVerifier = null;
  }

  // Ensure the container element exists
  let container = document.getElementById('recaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'recaptcha-container';
    document.body.appendChild(container);
  }

  _recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {
      console.log('[Auth] reCAPTCHA verified');
    },
    'expired-callback': () => {
      console.warn('[Auth] reCAPTCHA expired — will refresh on next attempt');
      _recaptchaVerifier = null;
    },
  });

  return _recaptchaVerifier;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupAuth(): void {
  if (_recaptchaVerifier) {
    _recaptchaVerifier.clear();
    _recaptchaVerifier = null;
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

// ─── SEND OTP ────────────────────────────────────────────────────────────────

export async function sendOtp(phoneNumber: string): Promise<SendOtpResult> {
  console.log(`[Auth] Sending OTP to ${phoneNumber} (platform: ${isNative ? 'native' : 'web'})`);

  try {
    // Force web flow for all numbers so JS SDK gets properly signed in
    // This prevents "insufficient permissions" when using Firestore Web SDK on Capacitor
    return await sendOtpWeb(phoneNumber);
  } catch (err: any) {
    console.error('[Auth] sendOtp error:', err);
    return mapFirebaseError(err);
  }
}

// ── Web Implementation ───────────────────────────────────────────────────────

async function sendOtpWeb(phoneNumber: string): Promise<SendOtpResult> {
  const verifier = getRecaptchaVerifier();

  _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);

  console.log('[Auth] Web: OTP sent successfully');
  return {
    success: true,
    verificationId: '_web_confirmation', // Sentinel — we use _confirmationResult directly
  };
}

// ── Native Implementation ────────────────────────────────────────────────────

async function sendOtpNative(phoneNumber: string): Promise<SendOtpResult> {
  // Dynamic import to avoid loading Capacitor plugin code on web
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

  return new Promise(async (resolve, reject) => {
    let resolved = false;
    let codeSentListener: any;
    let completedListener: any;
    let failedListener: any;

    const cleanup = () => {
      codeSentListener?.remove();
      completedListener?.remove();
      failedListener?.remove();
    };

    codeSentListener = await FirebaseAuthentication.addListener('phoneCodeSent', (event: any) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.log('[Auth] Native: OTP sent, verificationId received', event.verificationId);
      resolve({ success: true, verificationId: event.verificationId });
    });

    completedListener = await FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event: any) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.log('[Auth] Native: Phone verification auto-completed');
      
      // If we have a user directly from native, we'll return it
      if (event.user) {
         // Note: Getting it to sync to Web SDK can be tricky without the original code.
         // If they have event.credential, maybe we can use it, but typically we just return the user.
         // We might need to manually call auth.signInWithCustomToken if backend supports it, 
         // but for now we'll just return the native user.
         resolve({ success: true, autoVerified: true, user: event.user as any });
      } else {
         resolve({ success: false, error: 'Auto-verification failed to return user.' });
      }
    });

    failedListener = await FirebaseAuthentication.addListener('phoneVerificationFailed', (event: any) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      console.error('[Auth] Native: Phone verification failed', event.message);
      resolve({ success: false, error: event.message });
    });

    try {
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber });
    } catch (err: any) {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(mapFirebaseError(err));
      }
    }
  });
}

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────

export async function verifyOtp(verificationId: string, code: string): Promise<VerifyOtpResult> {
  console.log('[Auth] Verifying OTP...');

  try {
    if (_confirmationResult) {
      // Web path (used for all auth now to ensure JS SDK sync)
      const result = await _confirmationResult.confirm(code);
      _confirmationResult = null;
      cleanupAuth();
      return { success: true, user: result.user };
    }
    return { success: false, error: 'Session expired. Request a new OTP.' };

  } catch (err: any) {
    console.error('[Auth] verifyOtp error:', err);
    const mapped = mapFirebaseError(err);
    return { success: false, error: mapped.error };
  }
}

// ─── Sign Out ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  cleanupAuth();

  if (isNative) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch {
      // Plugin may not be available — continue with web signout
    }
  }

  await auth.signOut();
}
