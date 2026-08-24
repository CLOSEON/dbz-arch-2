import { Capacitor } from '@capacitor/core';
import {
  signInWithPhoneNumber,
  signInWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
  ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export const FCM_TOKEN_STORAGE_KEY = 'dabzzo_fcm_token';

export function isTestAccount(e164: string): boolean {
  const TEST_NUMBERS = [
    '+919000000001',
    '+919000000002',
    '+919000000003',
    '+919000000004',
    '+919930577000',
    '+919900990011'
  ];
  if (TEST_NUMBERS.includes(e164)) return true;
  if (e164.startsWith('+9190000') || e164.startsWith('+9100000')) return true;
  return false;
}

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

let _recaptchaVerifier: RecaptchaVerifier | null = null;
let _confirmationResult: ConfirmationResult | null = null;

const isNative = Capacitor.isNativePlatform();

function initRecaptcha(): RecaptchaVerifier {
  if (typeof window === 'undefined') {
    throw new Error('reCAPTCHA is only supported in browser environment.');
  }

  if (_recaptchaVerifier) {
    try {
      _recaptchaVerifier.clear();
    } catch (e) {
      console.warn('[Auth] Error clearing recaptcha verifier:', e);
    }
    _recaptchaVerifier = null;
  }

  let container = document.getElementById('firebase-recaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'firebase-recaptcha-container';
    document.body.appendChild(container);
  } else {
    container.innerHTML = '';
  }

  _recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
    callback: () => console.log('[Auth] reCAPTCHA solved'),
    'expired-callback': () => {
      console.warn('[Auth] reCAPTCHA expired, resetting verifier');
      cleanupAuth();
    }
  });

  return _recaptchaVerifier;
}

async function sendOtpWeb(phoneNumber: string): Promise<SendOtpResult> {
  console.log('[Auth] Starting Web OTP flow for:', phoneNumber);

  try {
    const verifier = initRecaptcha();

    try {
      _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    } catch (err: any) {
      if (
        (err.code === 'auth/captcha-check-failed' || err.code === 'auth/invalid-app-credential') &&
        (auth as any).settings?.appVerificationDisabledForTesting
      ) {
        console.warn('[Auth] Test mode verification rejected by Firebase backend. Retrying with real reCAPTCHA...');
        (auth as any).settings.appVerificationDisabledForTesting = false;
        const freshVerifier = initRecaptcha();
        _confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, freshVerifier);
      } else {
        throw err;
      }
    }

    console.log('[Auth] Web: OTP sent successfully');
    return {
      success: true,
      verificationId: '_web_confirmation',
    };
  } catch (err: any) {
    console.error('[Auth] Web OTP Error:', err);
    cleanupAuth();

    if (err.code === 'auth/too-many-requests') {
      return {
        success: false,
        error: 'Too many OTP attempts for this number. Please wait a few minutes before trying again.',
        code: err.code,
      };
    }
    if (err.code === 'auth/invalid-app-credential' || err.code === 'auth/captcha-check-failed') {
      return {
        success: false,
        error: 'App verification failed. On localhost, ensure reCAPTCHA is allowed or add test numbers to Firebase Console.',
        code: err.code,
      };
    }

    return mapFirebaseError(err);
  }
}

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

async function sendOtpNative(phoneNumber: string): Promise<SendOtpResult> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

  return new Promise(async (resolve) => {
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
      if (event.user) {
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

export async function verifyOtp(verificationId: string, code: string): Promise<VerifyOtpResult> {
  console.log('[Auth] Verifying OTP...');

  try {
    if (_confirmationResult) {
      const result = await _confirmationResult.confirm(code);
      _confirmationResult = null;
      cleanupAuth();
      return { success: true, user: result.user };
    }
    
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

export async function signOut(): Promise<void> {
  cleanupAuth();
  
  if (auth.currentUser) {
    const token = typeof window !== 'undefined' ? localStorage.getItem(FCM_TOKEN_STORAGE_KEY) : null;
    if (token) {
      try {
        const { doc, updateDoc, arrayRemove, deleteField } = await import('firebase/firestore');
        await updateDoc(doc(auth.app ? (await import('./firebase')).db : (null as any), 'users', auth.currentUser.uid), {
          push_tokens: arrayRemove(token),
          fcmToken: deleteField()
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
    }
  }

  await auth.signOut();
}
