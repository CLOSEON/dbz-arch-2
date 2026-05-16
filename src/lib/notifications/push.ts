'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { db, getAppMessaging } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

export async function registerPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[PushNotifications] Not native, trying Web Push');
    try {
      const messaging = await getAppMessaging();
      if (!messaging) {
        console.log('[PushNotifications] Web Push not supported');
        return;
      }
      
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          // Add vapidKey here if Web Push throws an error
        });
        
        if (token) {
          console.log('[PushNotifications] Web Token generated:', token);
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, { push_tokens: arrayUnion(token) });
          
          onMessage(messaging, (payload) => {
            console.log('[PushNotifications] Web Foreground Message:', payload);
          });
        }
      } else {
        console.warn('[PushNotifications] Web Push permission denied');
      }
    } catch (err) {
      console.error('[PushNotifications] Web Push Setup failed:', err);
    }
    return;
  }

  try {
    console.log('[PushNotifications] Checking permissions...');
    let perm = await PushNotifications.checkPermissions();
    console.log('[PushNotifications] Current status:', perm.receive);

    if (perm.receive === 'prompt' || perm.receive === 'denied') {
      console.log('[PushNotifications] Requesting permissions...');
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive !== 'granted') {
      console.warn('[PushNotifications] Permission NOT granted:', perm.receive);
      return;
    }

    // 1. Add listeners FIRST so we don't miss the events
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PushNotifications] Token registered:', token.value);
      // Save token to Firestore
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        push_tokens: arrayUnion(token.value)
      });
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushNotifications] Registration error:', error);
    });

    // 2. Configure how notifications are presented when the app is OPEN
    // This ensures you see the notification even if you are using the app
    await PushNotifications.createChannel({
      id: 'default',
      name: 'Default',
      description: 'General Notifications',
      importance: 5,
      visibility: 1,
      vibration: true,
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PushNotifications] Received in foreground:', notification);
      // You can also show a local toast here if you want
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[PushNotifications] Action performed:', notification);
    });

    // 3. Now trigger the registration
    await PushNotifications.register();

  } catch (err) {
    console.error('[PushNotifications] Setup failed:', err);
  }
}
