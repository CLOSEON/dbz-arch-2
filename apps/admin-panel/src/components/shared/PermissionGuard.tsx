'use client';

import { useEffect } from 'react';

export function PermissionGuard() {
  useEffect(() => {
    // Silently trigger native OS/browser permission prompts on app load
    requestAllPermissions();
  }, []);

  async function requestAllPermissions() {
    try {
      // Request Geolocation directly (triggers native popup)
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const locStatus = await Geolocation.checkPermissions();
        if (locStatus.location !== 'granted') {
          await Geolocation.requestPermissions();
        }
      } catch (e) {
        // Fallback for standard web if capacitor plugin fails
        if (navigator && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(() => {}, () => {});
        }
      }

      // Request Push Notifications directly (triggers native popup)
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const pushStatus = await PushNotifications.checkPermissions();
        if (pushStatus.receive !== 'granted') {
          await PushNotifications.requestPermissions();
        }
      } catch (e) {
        // Fallback for standard web if capacitor plugin fails
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          Notification.requestPermission();
        }
      }
    } catch (error) {
      console.error('Failed to request permissions silently:', error);
    }
  }

  // No custom UI, rely entirely on the OS/Browser native dialogs
  return null;
}
