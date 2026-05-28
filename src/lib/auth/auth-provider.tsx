/**
 * DABZO AUTH PROVIDER — Firebase Auth State Synchronization
 * 
 * Wraps the app to keep Zustand auth store in sync with Firebase Auth.
 * Listens to onAuthStateChanged and hydrates user profile from Firestore.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';
import { Capacitor } from '@capacitor/core';
import type { AppUser } from '@/types';
import Image from 'next/image';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
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
      if (!mounted.current) return;

      try {
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
          // 1. Initial hydration from Zustand (fast)
          const existingUser = useAuthStore.getState().user;
          if (!existingUser || existingUser.id !== activeUser.uid) {
            setUser({
              id: activeUser.uid,
              phone: activeUser.phoneNumber || '',
              name: '',
              role: 'user'
            });
          }

          // 2. Fetch full profile from Firestore
          const userDoc = await getDoc(doc(db, 'users', activeUser.uid));
          if (userDoc.exists() && mounted.current) {
            const data = userDoc.data();
            setUser({ id: activeUser.uid, ...data } as AppUser);
            
            // Register push tokens
            import('@/lib/notifications/pushInit').then(({ initPushNotifications }) => {
              initPushNotifications(activeUser!.uid);
            });
          }
        } else {
          logout();
        }
      } catch (err) {
        console.error('[AuthProvider] Auth loop error:', err);
      } finally {
        if (mounted.current) {
          setInitializing(false);
          setHydrated();
        }
      }
    });

    // ─── Network & Offline Queue Setup ───────────────────────────────────────
    let handleOnline: () => void;
    let handleOffline: () => void;

    import('@/lib/offline/actionQueue').then(({ processQueue }) => {
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
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-36 h-36 rounded-full bg-brand/10 animate-ping" />
            <div className="relative z-10 w-28 h-28 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-brand/10">
              <Image src="/assets/dabzo-logo.png" alt="Dabzo" width={88} height={88} priority className="object-contain rounded-full" />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em]">Loading Dabzo...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
