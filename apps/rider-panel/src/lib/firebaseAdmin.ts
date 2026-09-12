import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  try {
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dabzofb',
      ...(process.env.FIREBASE_SERVICE_ACCOUNT_KEY && {
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      })
    });
    console.log('[Firebase Admin] Initialized successfully');
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error);
  }
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
