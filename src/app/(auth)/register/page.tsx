'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { redirect } from 'next/navigation';

// The /register route no longer exists — onboarding is inline in /login
// This redirect ensures any old links still work
export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center">
      <p className="text-slate-500 text-sm font-medium">Redirecting…</p>
    </div>
  );
}
