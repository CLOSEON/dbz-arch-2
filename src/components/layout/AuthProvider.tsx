'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import type { AppUser } from '@/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Quick set basic user info
          setUser({ id: firebaseUser.uid, phone: firebaseUser.phoneNumber } as AppUser);
          
          // Try to fetch full profile, but don't block the UI
          getDoc(doc(db, 'users', firebaseUser.uid)).then((userDoc) => {
            if (userDoc.exists()) {
              setUser({ id: firebaseUser.uid, ...userDoc.data() } as AppUser);
            }
          }).catch(e => console.warn('Firestore profile fetch failed (probably index issue):', e));
        } else {
          logout();
        }
      } catch (err) {
        console.error('AuthProvider Error:', err);
      } finally {
        setIsInitializing(false);
      }
    });

    return () => unsubscribe();
  }, [setUser, logout]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
