'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppUser } from '@dabzzo/shared-types';

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
        import('@dabzzo/shared-auth').then(({ signOut }) => {
          signOut().catch((err) => console.warn('[AuthStore] signOut error:', err));
        });
      },
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'dabzzo-auth',
      // Only persist the user field
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Mark as hydrated once localStorage data is loaded
        state?.setHydrated();
      },
    }
  )
);
