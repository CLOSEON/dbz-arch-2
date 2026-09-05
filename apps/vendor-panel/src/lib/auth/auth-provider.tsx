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
import { auth, db } from '../firebase';
import { useAuthStore } from '@/store/authStore';
import { DabzzoLoadingScreen } from '@/components/ui/loading';
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
          const userEmail = (activeUser.email || '').toLowerCase().trim();
          const isSuper = userEmail === 'closeon.st@gmail.com';

          // 1. Initial hydration from Zustand (fast)
          const existingUser = useAuthStore.getState().user;
          if (!existingUser || existingUser.id !== activeUser.uid) {
            setUser({
              id: activeUser.uid,
              email: activeUser.email || undefined,
              name: activeUser.displayName || (isSuper ? 'Test Vendor' : ''),
              phone: activeUser.phoneNumber || (isSuper ? '+919900990022' : ''),
              name: activeUser.displayName || (isSuper ? 'Dabzzo Admin' : ''),
              phone: activeUser.phoneNumber || '',
              role: isSuper ? 'vendor' : 'user',
              kitchen_name: isSuper ? 'Test Vendor' : undefined,
              kitchen_name: isSuper ? 'Dabzzo Central Kitchen' : undefined,
              is_superadmin: isSuper ? true : undefined,
              is_approved: isSuper ? true : undefined,
              verification_status: isSuper ? 'verified' : undefined,
            });
          }

          // 2. Fetch full profile from Firestore with retry for auth propagation
          let userDoc;
          let retries = 3;
          while (retries > 0) {
            try {
              userDoc = await getDoc(doc(db, 'users', activeUser.uid));
              break;
            } catch (error: any) {
              if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
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
            if (isSuper) {
              data.role = 'vendor';
              data.name = data.name || 'Test Vendor';
              data.kitchen_name = data.kitchen_name || 'Test Vendor';
              data.phone = data.phone || '+919900990022';
              data.name = data.name || activeUser.displayName || 'Dabzzo Admin';
              data.kitchen_name = data.kitchen_name || 'Dabzzo Central Kitchen';
              data.phone = data.phone || activeUser.phoneNumber || '+919850277099';
              data.is_approved = true;
              data.is_superadmin = true;
              data.verification_status = 'verified';
              data.capacity = data.capacity || 10;
              data.subscriberCount = data.subscriberCount || 2;
              data.rate_onetime = data.rate_onetime || 150;
              data.address = data.address || 'Nagpur, Maharashtra';
              data.cuisine_type = data.cuisine_type || 'Home Style';
            }
            setUser({ id: activeUser.uid, ...data } as AppUser);
            
            // Register push tokens
            import('@/lib/notifications/pushInit').then(({ initPushNotifications }) => {
              initPushNotifications(activeUser!.uid);
            });
          } else if (isSuper && mounted.current) {
            const testVendorProfile: AppUser = {
            const superVendorProfile: AppUser = {
              id: activeUser.uid,
              email: activeUser.email || 'closeon.st@gmail.com',
              name: 'Test Vendor',
              kitchen_name: 'Test Vendor',
              name: activeUser.displayName || 'Dabzzo Admin',
              kitchen_name: 'Dabzzo Central Kitchen',
              image: activeUser.photoURL || undefined,
              phone: '+919900990022',
              phone: activeUser.phoneNumber || '+919850277099',
              role: 'vendor',
              is_superadmin: true,
              is_approved: true,
              verification_status: 'verified',
              capacity: 10,
              subscriberCount: 2,
              fssai_license: 'FSSAI-12345678901234',
              address: 'Sector 62, Noida, Uttar Pradesh',
              rate_onetime: 150,
              rate_lunch_weekly: 900,
              rate_lunch_monthly: 3600,
              rate_dinner_weekly: 900,
              rate_dinner_monthly: 3600,
              rate_both_weekly: 1750,
              rate_both_monthly: 6800,
              address: 'Nagpur, Maharashtra',
              cuisine_type: 'Home Style',
              bio: 'Authentic home cooked homestyle meals prepared fresh daily.',
              rating: 4.5,
              rating_avg: 4.5,
              review_count: 14,
            };
            try {
              const { setDoc: setFirestoreDoc } = await import('firebase/firestore');
              await setFirestoreDoc(doc(db, 'users', activeUser.uid), testVendorProfile, { merge: true });
              await setFirestoreDoc(doc(db, 'users', activeUser.uid), superVendorProfile, { merge: true });
            } catch (e) {
              console.warn('[AuthProvider] setDoc testVendorProfile fallback:', e);
              console.warn('[AuthProvider] setDoc superVendorProfile fallback:', e);
            }
            setUser(testVendorProfile);
            setUser(superVendorProfile);
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
    return <DabzzoLoadingScreen />;
  }

  return <>{children}</>;
}
