'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const ROLE_PATHS: Record<string, string> = {
  admin: '/admin/dashboard',
  vendor: '/vendor/dashboard',
  delivery: '/delivery/dashboard',
};

export default function RootPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;

    if (!user) {
      router.replace('/login');
    } else {
      router.replace(ROLE_PATHS[user.role] || '/dashboard');
    }
  }, [user, isHydrated, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-ivory">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-brand/20 animate-ping" />
          <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center shadow-lg shadow-brand/30">
            <span className="text-2xl">🍱</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em]">Entering Dabzo...</p>
      </div>
    </div>
  );
}
