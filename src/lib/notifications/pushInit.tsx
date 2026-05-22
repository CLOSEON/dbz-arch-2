/**
 * DABZO PUSH NOTIFICATION INITIALISATION MODULE
 *
 * Call `initPushNotifications(uid)` once after the user's Firestore profile is loaded.
 * It handles both Capacitor native (Android / iOS) and web paths, re-registers on
 * app foreground via `App.addListener('appStateChange')`, and shows in-app toasts
 * via react-hot-toast when a notification arrives while the app is open.
 *
 * Usage in auth-provider (already wired):
 *   import { initPushNotifications } from '@/lib/notifications/pushInit';
 *   initPushNotifications(uid);          // call once after Firestore profile hydration
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import toast from 'react-hot-toast';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushSetupOptions {
  /** Firestore UID of the currently authenticated user. */
  uid: string;
}

// ─── Token Persistence ────────────────────────────────────────────────────────

/**
 * Persists (or replaces) the FCM token on the user's Firestore document.
 * Uses `setDoc` with merge so the document is created if somehow absent.
 */
async function persistToken(uid: string, token: string): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', uid),
      { fcmToken: token, fcmTokenUpdatedAt: new Date().toISOString() },
      { merge: true }
    );
    console.log('[pushInit] FCM token persisted for user:', uid);
  } catch (err) {
    console.error('[pushInit] Failed to persist FCM token:', err);
  }
}

// ─── Listener Setup ───────────────────────────────────────────────────────────

/**
 * Attaches all four Capacitor PushNotifications listeners.
 * Safe to call multiple times — Capacitor deduplicates identical listeners.
 */
function attachListeners({ uid }: PushSetupOptions): void {
  // (1) FCM registration succeeded → persist token to Firestore
  PushNotifications.addListener('registration', async (token) => {
    console.log('[pushInit] Registration token received:', token.value);
    await persistToken(uid, token.value);
  });

  // (2) FCM registration failed → log only, do not crash
  PushNotifications.addListener('registrationError', (error) => {
    console.error('[pushInit] FCM registration error:', error);
  });

  // (3) Notification received while app is FOREGROUNDED → show react-hot-toast
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const title = notification.title ?? 'Notification';
    const body = notification.body ?? '';

    console.log('[pushInit] Foreground notification:', notification);

    toast(
      (t) => (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          onClick={() => toast.dismiss(t.id)}
        >
          <strong style={{ fontSize: 13 }}>{title}</strong>
          {body && <span style={{ fontSize: 12, color: '#64748b' }}>{body}</span>}
        </div>
      ),
      {
        duration: 5000,
        icon: '🔔',
        style: {
          borderRadius: '16px',
          padding: '12px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        },
      }
    );
  });

  // (4) User tapped a notification (app was backgrounded) → optional deep-link hook
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[pushInit] Notification tapped:', action);
    // Deep-link routing can be added here based on action.notification.data.event
  });
}

// ─── Core Initialiser ─────────────────────────────────────────────────────────

/**
 * Requests permission, registers with FCM, and sets up all listeners.
 *
 * Returns `true` if registration was triggered, `false` if permission was
 * denied or the environment is not supported.
 */
async function setupNativePush(options: PushSetupOptions): Promise<boolean> {
  // (1) Check current permission state
  let permStatus = await PushNotifications.checkPermissions();

  // (2) Prompt user if permission hasn't been determined yet
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  // (3) Bail out gracefully if permission was denied — no crash, no retry
  if (permStatus.receive !== 'granted') {
    console.warn('[pushInit] Push notification permission denied:', permStatus.receive);
    return false;
  }

  // (4) Attach listeners BEFORE calling register() to avoid a race condition
  //     where the token fires before the listener is in place.
  attachListeners(options);

  // (5) Ensure the default notification channel exists (Android only; no-op on iOS)
  await PushNotifications.createChannel({
    id: 'default',
    name: 'Dabzo Notifications',
    description: 'Order updates, delivery alerts, and more',
    importance: 5,   // IMPORTANCE_HIGH
    visibility: 1,   // VISIBILITY_PUBLIC
    vibration: true,
    sound: 'default',
  });

  // (6) Trigger FCM registration — fires 'registration' or 'registrationError'
  await PushNotifications.register();

  return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Entry point — call once after the user's Firestore profile is confirmed.
 *
 * On Capacitor native platforms: requests push permission and registers with FCM.
 * On web: skips native flow (web push handled separately in push.ts).
 *
 * Also registers an `appStateChange` listener so the FCM token is refreshed
 * whenever the user brings the app back to the foreground (handles token
 * rotation after long backgrounding).
 */
export async function initPushNotifications(uid: string): Promise<void> {
  if (!uid) return;

  // Web push is handled by the existing Firebase Messaging path in push.ts
  if (!Capacitor.isNativePlatform()) {
    console.log('[pushInit] Non-native platform — skipping Capacitor push init.');
    return;
  }

  // Initial registration
  await setupNativePush({ uid });

  // Re-register whenever the app comes back to the foreground.
  // This ensures the token is refreshed if FCM rotated it while the app was closed.
  const { App } = await import('@capacitor/app');
  App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;
    console.log('[pushInit] App foregrounded — re-checking FCM registration.');
    await setupNativePush({ uid });
  });
}
