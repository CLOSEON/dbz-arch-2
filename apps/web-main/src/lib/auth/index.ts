/**
 * DABZZO AUTH — Public API
 */

export {
  signInWithGoogle,
  signInWithFacebook,
  signInWithApple,
  sendOtp,
  verifyOtp,
  signOut,
  cleanupAuth,
  SUPERADMIN_EMAIL,
  isSuperadminEmail,
} from './auth-service';

export type { SignInResult, SendOtpResult, VerifyOtpResult } from './auth-service';

export { AuthProvider } from './auth-provider';
export { AuthGuard } from './auth-guard';
