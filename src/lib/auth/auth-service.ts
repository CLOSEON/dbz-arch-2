/**
 * DABZZO AUTH SERVICE — Unified Phone OTP Authentication
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
import { FCM_TOKEN_STORAGE_KEY } from '../notifications/constants';
import { isTestAccount } from '../queries/users';
// Removed forced appVerificationDisabledForTesting to allow real numbers to work on localhost

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

// ─── reCAPTCHA Setup & Web Implementation ──────────────────────────────────────

function initRecaptcha() {
  if (_recaptchaVerifier) return;
  
  let container = document.getElementById('firebase-recaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'firebase-recaptcha-container';
    // Ensure the container is hidden to prevent layout shifts
    container.style.display = 'none';
    document.body.appendChild(container);
  }

  _recaptchaVerifier = new RecaptchaVerifier(auth, 'firebase-recaptcha-container', {
    size: 'invisible',
    callback: () => console.log('[Auth] reCAPTCHA solved'),
    'expired-callback': () => {
      console.warn('[Auth] reCAPTCHA expired, resetting verifier');
      if (_recaptchaVerifier) {
        _recaptchaVerifier.clear();
        _recaptchaVerifier = null;
      }
      const oldContainer = document.getElementById('firebase-recaptcha-container');
      if (oldContainer) {
        oldContainer.remove();
      }
    }
  });
}

async function sendOtpWeb(phoneNumber: string): Promise<SendOtpResult> {
  console.log('[Auth] Starting robust Web OTP flow...');

  try {
    initRecaptcha();

    // 6. Send the OTP
    _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, _recaptchaVerifier!);
    
    console.log('[Auth] Web: OTP sent successfully');
    return {
      success: true,
      verificationId: '_web_confirmation',
    };
  } catch (err: any) {
    console.error('[Auth] Web OTP Error:', err);
    // Cleanup verifier state on failure so the user can try again safely
    if (_recaptchaVerifier) {
      try { _recaptchaVerifier.clear(); } catch(e){}
      _recaptchaVerifier = null;
    }
    const oldContainer = document.getElementById('firebase-recaptcha-container');
    if (oldContainer) {
      oldContainer.remove();
    }
    
    // Map Firebase errors to human readable
    if (err.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many attempts. Please wait a few minutes or use a test account.' };
    }
    if (err.code === 'auth/invalid-app-credential') {
      return { success: false, error: 'App verification failed. If on localhost, ensure it is added to Firebase Authorized Domains.' };
    }
    
    return mapFirebaseError(err);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupAuth(): void {
  if (_recaptchaVerifier) {
    _recaptchaVerifier.clear();
    _recaptchaVerifier = null;
  }
  const oldContainer = document.getElementById('firebase-recaptcha-container');
  if (oldContainer) {
    oldContainer.remove();
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
    if (typeof window !== 'undefined') {
      if (isTestAccount(phoneNumber)) {
        console.log('[Auth] Test account detected. Bypassing reCAPTCHA.');
        (auth as any).settings.appVerificationDisabledForTesting = true;
      } else {
        (auth as any).settings.appVerificationDisabledForTesting = false;
      }
    }
    if (isNative) {
      return await sendOtpNative(phoneNumber);
    }
    return await sendOtpWeb(phoneNumber);
  } catch (err: any) {
    console.error('[Auth] sendOtp error:', err);
    return mapFirebaseError(err);
  }
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
    
    // Native Path (Capacitor Firebase Auth)
    // The native SDK generates a verificationId which we pass back here to authenticate the Web SDK
    if (verificationId && verificationId !== '_web_confirmation') {
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const result = await signInWithCredential(auth, credential);
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
  
  try {
    const { LocationTracker } = await import('@/lib/delivery/locationTracker');
    await LocationTracker.stopTracking(true);
  } catch (err) {
    console.error('[Auth] Failed to stop location tracking on logout:', err);
  }

  // Remove the active push token before signing out to prevent notification leaks
  if (auth.currentUser) {
    const token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    if (token) {
      try {
        const { doc, updateDoc, arrayRemove, deleteField } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          push_tokens: arrayRemove(token),
          fcmToken: deleteField()
        });
        localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
        console.log('[Auth] FCM token cleaned up on logout');
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
      // Plugin may not be available — continue with web signout
    }
  }

  await auth.signOut();
}
