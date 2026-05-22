'use client';

/**
 * Push notification entry point called from auth-provider.tsx after profile hydration.
 *
 * - Native (Android / iOS): delegates to pushInit.ts which handles permissions,
 *   FCM registration, token persistence, foreground toasts, and appStateChange re-init.
 * - Web: uses Firebase Web Messaging (getToken / onMessage).
 */

import { Capacitor } from '@capacitor/core';
import { db, getAppMessaging } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { initPushNotifications } from './pushInit';

export async function registerPushNotifications(userId: string) {
  if (!userId) return;

  // ─── Capacitor Native (Android / iOS) ────────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    // Full flow: permissions, registration, token persistence, foreground toasts
    await initPushNotifications(userId);
    return;
  }

  // ─── Web Push (Firebase Messaging) ───────────────────────────────────────
  console.log('[PushNotifications] Non-native — attempting Web Push setup.');
  try {
    const messaging = await getAppMessaging();
    if (!messaging) {
      console.log('[PushNotifications] Web Push not supported in this environment.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[PushNotifications] Web Push permission denied.');
      return;
    }

    const token = await getToken(messaging, {
      // vapidKey can be added here if required by the project config
    });

    if (token) {
      console.log('[PushNotifications] Web FCM token generated:', token);
      await updateDoc(doc(db, 'users', userId), {
        push_tokens: arrayUnion(token),
        fcmToken: token,
      });

      // Show foreground web notifications via console (toast handled natively on mobile)
      onMessage(messaging, (payload) => {
        console.log('[PushNotifications] Web foreground message:', payload);
      });
    }
  } catch (err) {
    console.error('[PushNotifications] Web Push setup failed:', err);
  }
}
