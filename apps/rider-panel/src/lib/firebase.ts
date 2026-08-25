import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// ─── Dynamic Same-Origin Auth Domain ─────────────────────────────────────────
// Using the same-origin hosting domain (e.g. dabzzo.in / dabzo.web.app) eliminates
// the slow cross-origin /__/auth/iframe.js and getProjectConfig network waterfall.
const getDynamicAuthDomain = (): string => {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== 'capacitor') {
      return host;
    }
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dabzofb.firebaseapp.com';
};

// ─── Firebase Configuration ─────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0',
  authDomain: getDynamicAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dabzofb',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'dabzofb.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '651368129597',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:651368129597:web:31bd85f34d84e7e23b3654',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-GMWRJ1BK1E',
};

// ─── Singleton App ───────────────────────────────────────────────────────────
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth: Auth = getAuth(app);
auth.useDeviceLanguage();

// ─── Firestore with offline cache ────────────────────────────────────────────
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    ignoreUndefinedProperties: true,
  });
} catch {
  // Already initialized (HMR / SSR)
  db = getFirestore(app);
}
export { db };

// ─── Storage ─────────────────────────────────────────────────────────────────
export const storage: FirebaseStorage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

// ─── Functions ───────────────────────────────────────────────────────────────
export const functions: Functions = getFunctions(app, 'us-central1');

// ─── Messaging ───────────────────────────────────────────────────────────────
export const getAppMessaging = async () => {
  if (typeof window === 'undefined') return null;
  const { getMessaging, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (supported) {
    return getMessaging(app);
  }
  return null;
};
