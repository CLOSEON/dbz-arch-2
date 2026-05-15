import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Sends push notifications to a specific target group.
 * Called from the Admin Dashboard.
 * Using 1st Gen for better compatibility with default permissions.
 */
export const broadcastNotificationV1 = functions.https.onCall(async (data, context) => {
  // 1. Auth Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { target, title, message } = data;

  if (!title || !message) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Title and message are required.'
    );
  }

  try {
    const db = admin.firestore();
    const messaging = admin.messaging();
    
    // 2. Resolve Targets
    let query: admin.firestore.Query = db.collection('users');
    
    if (target !== 'all') {
      query = query.where('role', '==', target);
    }

    const snapshot = await query.get();
    const tokens: string[] = [];

    snapshot.forEach(doc => {
      const user = doc.data();
      if (user.push_tokens && Array.isArray(user.push_tokens)) {
        tokens.push(...user.push_tokens);
      }
    });

    if (tokens.length === 0) {
      return { success: true, sentCount: 0, message: 'No devices found for this target.' };
    }

    // 3. Batch Send (Multicast)
    const uniqueTokens = Array.from(new Set(tokens));
    const chunks = [];
    for (let i = 0; i < uniqueTokens.length; i += 500) {
      chunks.push(uniqueTokens.slice(i, i + 500));
    }

    let successCount = 0;
    
    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title,
          body: message,
        },
        android: {
          notification: {
            channelId: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default'
            }
          }
        }
      });
      successCount += response.successCount;
    }

    // 4. Log history
    await db.collection('notifications_history').add({
      target,
      title,
      message,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      successCount,
      totalTargeted: uniqueTokens.length,
      senderUid: context.auth.uid
    });

    return { 
      success: true, 
      sentCount: successCount,
      totalDevices: uniqueTokens.length 
    };

  } catch (error) {
    console.error('Error sending broadcast:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send notifications');
  }
});
