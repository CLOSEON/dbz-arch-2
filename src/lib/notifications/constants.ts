/**
 * Shared constants for push notification module.
 * Kept in a separate file to avoid circular imports between push.ts and pushInit.tsx.
 */

/** localStorage key used to track the active FCM token for the current session.
 *  Stored on login, removed on logout to prevent notification leaks. */
export const FCM_TOKEN_STORAGE_KEY = 'current_fcm_token';
