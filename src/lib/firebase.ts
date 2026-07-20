import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// ─── Firebase Configuration ─────────────────────────────────────────────────
// These are safe to expose client-side — Firebase API keys are identifiers, not secrets.
// Security is enforced via Firebase Rules + Auth, not by hiding these.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dabzofb.firebaseapp.com',
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
setPersistence(auth, browserLocalPersistence).catch(err => console.warn('[Firebase] Persistence error:', err));
auth.useDeviceLanguage();

// Dev-only: bypass reCAPTCHA on localhost so Phone Auth works without Firebase Authorized Domains
// This flag is automatically ignored in production builds
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  (auth as any).settings.appVerificationDisabledForTesting = true;
}

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
export const functions = getFunctions(app, 'us-central1'); 

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
