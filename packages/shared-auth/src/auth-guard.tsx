'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function AuthGuard({ children }: AuthGuardProps) {
  return <>{children}</>;
}
