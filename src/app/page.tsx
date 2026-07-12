'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';
import { Capacitor } from '@capacitor/core';
import { DabzzoLoadingScreen } from '@/components/ui/loading';

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  vendor: '/vendor/dashboard',
  delivery: '/delivery/dashboard',
  user: '/dashboard',
};

export default function RootRedirect() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    // Wait for the auth store to hydrate from local storage
    if (!isHydrated) return;

    if (user) {
      // If the user is logged in, redirect them to their dashboard
      const target = ROLE_DASHBOARDS[user.role] || '/dashboard';
      router.replace(target);
    } else {
      // First-time users or logged-out users get redirected to the landing page
      // In native apps (APK/iOS), we skip the landing page and go straight to login
      if (Capacitor.isNativePlatform()) {
        router.replace('/login');
      } else {
        router.replace('/main');
      }
    }
  }, [user, isHydrated, router]);

  // Show a simple loading state while figuring out where to route them
  return <DabzzoLoadingScreen />;
}
