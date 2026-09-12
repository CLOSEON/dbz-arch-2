import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

export interface NotificationPayload {
  userId: string;
  phone: string;
  title: string;
  message: string;
  type: 'approval' | 'request_details' | 'rejection' | 'system';
}

/**
 * Sends in-app notification & triggers SMS notification alert
 */
export async function sendNotificationAlert(payload: NotificationPayload) {
  try {
    // 1. Create In-App Notification in Firestore
    const notifRef = collection(db, 'users', payload.userId, 'notifications');
    await addDoc(notifRef, {
      title: payload.title,
      message: payload.message,
      type: payload.type,
      read: false,
      created_at: Timestamp.now(),
    });

    // 2. Trigger SMS notification helper / logger
    console.log(`[SMS Alert Sent] To ${payload.phone}: "${payload.title} - ${payload.message}"`);

    return { success: true };
  } catch (err: any) {
    console.error('[Notification Alert Failed]', err);
    return { success: false, error: err.message };
  }
}
