/**
 * DABZO AUTH — Public API
 * 
 * Single import point for all auth functionality:
 * import { sendOtp, AuthProvider, AuthGuard } from '@/lib/auth';
 */

export { sendOtp, verifyOtp, signOut, cleanupAuth } from './auth-service';
export type { SendOtpResult, VerifyOtpResult } from './auth-service';
export { AuthProvider } from './auth-provider';
export { AuthGuard } from './auth-guard';
