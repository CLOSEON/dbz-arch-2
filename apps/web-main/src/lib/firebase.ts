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

// ─── Firebase Configuration ─────────────────────────────────────────────────
// authDomain MUST be dabzofb.firebaseapp.com for OAuth popup/redirect handlers
// to work seamlessly with Google Sign-In across custom domains without mismatch errors.
//
// SECURITY: no hardcoded project fallback. A missing env var must fail the
// build loudly, not silently point a dev/staging build at production Firestore.
// Values come from the repo-root .env/.env.local, copied into this app's
// directory by scripts/sync-env.mjs (see predev/prebuild in package.json).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Run "node scripts/sync-env.mjs" from the repo root, or set it directly.`
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requireEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
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
