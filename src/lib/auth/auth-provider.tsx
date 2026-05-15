/**
 * DABZO AUTH PROVIDER — Firebase Auth State Synchronization
 * 
 * Wraps the app to keep Zustand auth store in sync with Firebase Auth.
 * Listens to onAuthStateChanged and hydrates user profile from Firestore.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuthStore } from '@/store/authStore';
import { Capacitor } from '@capacitor/core';
import type { AppUser } from '@/types';
import { registerPushNotifications } from '../notifications/push';
import { Logo } from '@/components/shared/Logo';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const [initializing, setInitializing] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // ─── Native Auth Sync ──────────────────────────────────────────────────
    // On native platforms, the JS SDK might lose session on restart.
    // We check if the Capacitor plugin has a session and sync it.
    const syncNativeAuth = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
          const result = await FirebaseAuthentication.getCurrentUser();
          if (result.user && !auth.currentUser) {
            console.log('[AuthProvider] Syncing native user to web store');
            // We can't easily "force" the Web SDK to have the user without a token,
            // but we can at least ensure the Zustand store has the basic info 
            // so the AuthGuard doesn't redirect while we are still initializing.
            const nativeUser: AppUser = {
              id: result.user.uid,
              phone: result.user.phoneNumber || '',
              name: (result.user as any).displayName || '',
              role: 'user', // Will be refined by Firestore check below
            };
            setUser(nativeUser);
          }
        } catch (e) {
          console.warn('[AuthProvider] Native sync failed:', e);
        }
      }
    };

    syncNativeAuth();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!mounted.current) return;

      try {
        if (firebaseUser) {
          // Immediately set basic user info so the UI is responsive
          const basicUser: AppUser = {
            id: firebaseUser.uid,
            phone: firebaseUser.phoneNumber || '',
            name: '',
            role: 'user',
          };
          setUser(basicUser);

          // Then fetch the full Firestore profile
          try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists() && mounted.current) {
              const data = userDoc.data();
              setUser({ id: firebaseUser.uid, ...data } as AppUser);
              
              // Register for push notifications
              registerPushNotifications(firebaseUser.uid);
            }
          } catch (firestoreErr) {
            // Firestore may be offline — localStorage/basic user still works
            console.warn('[AuthProvider] Firestore profile fetch failed:', firestoreErr);
          }
        } else {
          // On native, if Firebase Web SDK says null, double check Capacitor 
          // before force-logging out.
          let hasNativeSession = false;
          if (Capacitor.isNativePlatform()) {
             try {
               const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
               const result = await FirebaseAuthentication.getCurrentUser();
               if (result.user) hasNativeSession = true;
             } catch {}
          }
          
          if (!hasNativeSession) {
            logout();
          }
        }
      } catch (err) {
        console.error('[AuthProvider] Auth state change error:', err);
        logout();
      } finally {
        if (mounted.current) {
          setInitializing(false);
          setHydrated();
        }
      }
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [setUser, logout, setHydrated]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-2xl bg-brand/20 animate-ping" />
            <Logo size={56} className="relative z-10" />
          </div>
          <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em]">Loading Dabzo...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
