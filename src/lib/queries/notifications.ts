import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface NotificationData {
  target: 'all' | 'users' | 'vendors' | 'delivery';
  title: string;
  message: string;
}

/**
 * Sends a notification broadcast by calling a Firebase Cloud Function.
 * This is secure because the private FCM keys stay on the server.
 */
export async function sendNotification(data: NotificationData) {
  console.log('[Notification] Triggering Firebase Cloud Function broadcast...', data);

  try {
    const broadcastNotification = httpsCallable(functions, 'broadcastNotificationV1');
    const result = await broadcastNotification(data);
    
    console.log('[Notification] Cloud Function Success:', result.data);
    return result.data;
    
  } catch (err: any) {
    console.error('[Notification] Cloud Function Error:', err);
    throw new Error(err.message || 'Failed to send notification via Firebase');
  }
}
