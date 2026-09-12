import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export { ImpactStyle, NotificationType };

// Helper to trigger haptics only when running inside Capacitor (native app)
const isNative = Capacitor.isNativePlatform();

export const triggerHapticImpact = async (style = ImpactStyle.Medium) => {
  if (isNative) {
    try {
      await Haptics.impact({ style });
    } catch (e) {
      console.warn('[Haptics] Failed to trigger impact:', e);
    }
  }
};

export const triggerHapticNotification = async (type = NotificationType.Success) => {
  if (isNative) {
    try {
      await Haptics.notification({ type });
    } catch (e) {
      console.warn('[Haptics] Failed to trigger notification:', e);
    }
  }
};

export const triggerHapticSelection = async () => {
  if (isNative) {
    try {
      await Haptics.selectionStart();
      setTimeout(async () => {
        await Haptics.selectionEnd();
      }, 50);
    } catch (e) {
      console.warn('[Haptics] Failed to trigger selection:', e);
    }
  }
};
