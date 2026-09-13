/**
 * DABZZO AUTH PROVIDER — Firebase Auth State Synchronization
 * 
 * Wraps the app to keep Zustand auth store in sync with Firebase Auth.
 * Listens to onAuthStateChanged and hydrates user profile from Firestore.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useAuthStore } from '@dabzzo/shared-lib/stores/authStore';
import { DabzzoLoadingScreen } from '@dabzzo/shared-ui/ui/loading';
import { useNetworkStore } from '@dabzzo/shared-lib/stores/networkStore';
import { Capacitor } from '@capacitor/core';
import type { AppUser } from '@dabzzo/shared-types';
import { SUPERADMIN_EMAIL } from './auth-service';
import Image from 'next/image';
import { getErrorMessage, getErrorCode } from '@dabzzo/shared-lib/errors';

/**
 * Per-portal provisioning for the superadmin account.
 *
 * Each portal auto-provisions the superadmin email into ITS OWN role on sign-in
 * (admin in web-main/admin-panel, vendor in vendor-panel, delivery in
 * rider-panel), so one account can exercise every portal. That behaviour was
 * previously forked across four copies of this file; it is now one component
 * plus this config.
 *
 * NOTE: this writes to Firestore in production builds, and the vendor/rider
 * variants seed placeholder verification data (e.g. verification_status
 * 'verified', a sample FSSAI number, sample rates and ratings). That is
 * deliberate test tooling, but it is not gated to non-production — see
 * IMPLEMENTATION_PLAN.md, flagged for a decision.
 */
export interface SuperadminProvisioning {
  /** Role this portal grants the superadmin account. */
  role: string;
  /** Name used when the Firebase profile has no displayName. */
  fallbackName: string;
  /** Phone used during optimistic hydration when auth has none. */
  fallbackPhone?: string;
  /** Extra fields merged into the optimistic (pre-Firestore) user object. */
  optimisticExtras?: Record<string, unknown>;
  /** Mutates an EXISTING Firestore user doc when the superadmin signs in. */
  applyToExistingDoc?: (data: Record<string, any>, authUser: User) => void;
  /** Extra fields for the profile written when no Firestore doc exists yet. */
  newProfileExtras?: (authUser: User) => Record<string, unknown>;
}

/**
 * Whether superadmin auto-provisioning should run in the current environment.
 *
 * This matters because provisioning WRITES to Firestore: vendor-panel seeds a
 * "Test Vendor" profile carrying verification_status 'verified', a sample FSSAI
 * licence number, sample rates and a 4.5-star/14-review history; rider-panel
 * seeds a verified rider. Those rows are indistinguishable from real ones once
 * written, and a self-verifying account also can't exercise the *unverified*
 * onboarding path.
 *
 * Currently returns true unconditionally, which preserves the behaviour this
 * code had before it was consolidated — deliberately, so the refactor changed
 * nothing. Whether to gate it is decision D6 in IMPLEMENTATION_PLAN.md and is
 * still open. Two obvious gates when you want one:
 *
 *   return process.env.NODE_ENV !== 'production';
 *   return process.env.NEXT_PUBLIC_ENABLE_SUPERADMIN_SEED === 'true';
 *
 * Note these are static-export builds, so either check is inlined at build
 * time and the seeding is dropped from bundles where it evaluates false.
 */
function shouldProvisionSuperadmin(): boolean {
  return true;
}

interface AuthProviderProps {
  children: React.ReactNode;
  /** Omit to disable superadmin auto-provisioning for this app. */
  superadmin?: SuperadminProvisioning;
}

export function AuthProvider({ children, superadmin }: AuthProviderProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const [initializing, setInitializing] = useState(true);
  const mounted = useRef(true);
  const router = useRouter();

  useEffect(() => {
    // ─── Native Back Button Handling ─────────────────────────────────────────
    let backListener: any;
    const setupBackButton = async () => {
      if (Capacitor.isNativePlatform()) {
        const { App } = await import('@capacitor/app');
        backListener = await App.addListener('backButton', (data) => {
          if (window.location.pathname === '/' || window.location.pathname.includes('dashboard')) {
            // If on a main dashboard, maybe exit or minimize
            App.exitApp();
          } else {
            window.history.back();
          }
        });
      }
    };
    setupBackButton();
    mounted.current = true;

    // ─── Native Auth Sync & Crashlytics ──────────────────────────────────────────────────
    const syncNativeAuth = async () => {
      if (!Capacitor.isNativePlatform()) return null;
      try {
        const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
        await FirebaseCrashlytics.setEnabled({ enabled: true }).catch(console.warn);

        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const result = await FirebaseAuthentication.getCurrentUser();
        return result.user || null;
      } catch (e) {
        console.warn('[AuthProvider] Native sync failed:', e);
        return null;
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      try {
        // This guard used to sit OUTSIDE the try, so returning here skipped the
        // finally that clears `initializing` -- and the app sat on the loading
        // screen forever with no error. StrictMode mounts, unmounts and
        // remounts in dev, so if this callback fired during that window
        // mounted.current was false and the early return stranded the app.
        if (!mounted.current) return;

        let activeUser = firebaseUser;

        // If Web SDK says null, double check Native side on Capacitor
        if (!activeUser && Capacitor.isNativePlatform()) {
          const nativeUser = await syncNativeAuth();
          if (nativeUser) {
             console.log('[AuthProvider] Restored session from Native plugin');
             activeUser = nativeUser as unknown as User;
          }
        }

        if (activeUser) {
          const userEmail = (activeUser.email || '').toLowerCase().trim();
          const isSuper =
            userEmail === SUPERADMIN_EMAIL.toLowerCase() && shouldProvisionSuperadmin();

          // 1. Initial hydration from Zustand (fast)
          const existingUser = useAuthStore.getState().user;
          if (!existingUser || existingUser.id !== activeUser.uid) {
            setUser({
              id: activeUser.uid,
              email: activeUser.email || undefined,
              name: activeUser.displayName || (isSuper && superadmin ? superadmin.fallbackName : ''),
              phone: activeUser.phoneNumber || (isSuper && superadmin?.fallbackPhone ? superadmin.fallbackPhone : ''),
              role: (isSuper && superadmin ? superadmin.role : 'user') as AppUser['role'],
              is_superadmin: isSuper ? true : undefined,
              is_approved: isSuper ? true : undefined,
              ...(isSuper && superadmin?.optimisticExtras ? superadmin.optimisticExtras : {}),
            } as AppUser);
          }

          // 2. Fetch full profile from Firestore with retry for auth propagation
          let userDoc;
          let retries = 3;
          while (retries > 0) {
            try {
              userDoc = await getDoc(doc(db, 'users', activeUser.uid));
              break;
            } catch (error: unknown) {
              if (getErrorCode(error) === 'permission-denied' || getErrorMessage(error)?.includes('Missing or insufficient permissions')) {
                if (retries > 1) {
                  console.warn(`[AuthProvider] Permission denied, retrying in 1s... (${retries - 1} left)`);
                  await new Promise(r => setTimeout(r, 1000));
                  retries--;
                } else {
                  break;
                }
              } else {
                break;
              }
            }
          }
          
          if (userDoc && userDoc.exists() && mounted.current) {
            const data = userDoc.data();
            if (isSuper && superadmin) {
              data.role = superadmin.role;
              data.is_superadmin = true;
              data.is_approved = true;
              superadmin.applyToExistingDoc?.(data, activeUser);
            }
            setUser({ id: activeUser.uid, ...data } as AppUser);
            
            // Register push tokens
            import('@dabzzo/shared-lib/notifications/pushInit').then(({ initPushNotifications }) => {
              initPushNotifications(activeUser!.uid);
            });
          } else if (isSuper && superadmin && mounted.current) {
            const superProfile = {
              id: activeUser.uid,
              email: activeUser.email || SUPERADMIN_EMAIL,
              name: activeUser.displayName || superadmin.fallbackName,
              image: activeUser.photoURL || undefined,
              phone: activeUser.phoneNumber || superadmin.fallbackPhone || '',
              role: superadmin.role,
              is_superadmin: true,
              is_approved: true,
              verification_status: 'verified',
              ...(superadmin.newProfileExtras?.(activeUser) ?? {}),
            } as AppUser;
            try {
              const { setDoc: setFirestoreDoc } = await import('firebase/firestore');
              await setFirestoreDoc(doc(db, 'users', activeUser.uid), superProfile, { merge: true });
            } catch (e) {
              console.warn('[AuthProvider] setDoc superProfile fallback:', e);
            }
            setUser(superProfile);
          }
        } else {
          logout();
        }
      } catch (err) {
        console.error('[AuthProvider] Auth loop error:', err);
      } finally {
        // Unconditional on purpose. A state update after unmount is a no-op in
        // React 18+, whereas failing to clear `initializing` leaves the app
        // stuck on the splash with nothing logged. Being stuck is far worse
        // than a discarded update.
        setInitializing(false);
        setHydrated();
      }
    });

    // ─── Network & Offline Queue Setup ───────────────────────────────────────
    let handleOnline: () => void;
    let handleOffline: () => void;

    import('@dabzzo/shared-lib/offline/actionQueue').then(({ processQueue }) => {
      handleOnline = () => {
        useNetworkStore.getState().setOnline(true);
        processQueue();
      };
      
      handleOffline = () => {
        useNetworkStore.getState().setOnline(false);
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      if (Capacitor.isNativePlatform()) {
        import('@capacitor/app').then(({ App }) => {
          App.addListener('appStateChange', ({ isActive }) => {
            if (isActive && useNetworkStore.getState().isOnline) {
              processQueue();
            }
          });
        });
      }
    });

    return () => {
      mounted.current = false;
      unsubscribe();
      if (backListener) backListener.remove();
      if (handleOnline) window.removeEventListener('online', handleOnline);
      if (handleOffline) window.removeEventListener('offline', handleOffline);
    };
  }, [setUser, logout, setHydrated]);

  if (initializing) {
    return <DabzzoLoadingScreen />;
  }

  return <>{children}</>;
}
