import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// ─── Firebase Configuration ─────────────────────────────────────────────────
// These are safe to expose client-side — Firebase API keys are identifiers, not secrets.
// Security is enforced via Firebase Rules + Auth, not by hiding these.
const firebaseConfig = {
  apiKey: 'AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0',
  authDomain: 'dabzofb.firebaseapp.com',
  projectId: 'dabzofb',
  storageBucket: 'dabzofb.firebasestorage.app',
  messagingSenderId: '651368129597',
  appId: '1:651368129597:web:31bd85f34d84e7e23b3654',
  measurementId: 'G-GMWRJ1BK1E',
};

// ─── Singleton App ───────────────────────────────────────────────────────────
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth: Auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(err => console.warn('[Firebase] Persistence error:', err));
auth.useDeviceLanguage();

// ─── Firestore with offline cache ────────────────────────────────────────────
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache(),
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
