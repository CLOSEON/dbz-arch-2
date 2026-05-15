'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppUser } from '@/types';

interface AuthState {
  user: AppUser | null;
  isHydrated: boolean;
  setUser: (user: AppUser) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isHydrated: false,
      setUser: (user) => set({ user }),
      logout: () => {
        // Clear local state
        set({ user: null });
        // Also sign out from Firebase (async, fire-and-forget)
        import('@/lib/auth/auth-service').then(({ signOut }) => {
          signOut().catch((err) => console.warn('[AuthStore] signOut error:', err));
        });
      },
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'dabzo-auth',
      // Only persist the user field
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Mark as hydrated once localStorage data is loaded
        state?.setHydrated();
      },
    }
  )
);
