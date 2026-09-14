'use client';
// Per-app branding wrapper; markup lives in @dabzzo/shared-ui.
import { Logo as SharedLogo, type LogoProps } from '@dabzzo/shared-ui';

export function Logo(props: Omit<LogoProps, 'src' | 'alt' | 'badgeClassName' | 'label' | 'labelClassName'>) {
  return (
    <SharedLogo {...props} src="/logo-admin.png" alt="Dabzzo Admin"
      badgeClassName="bg-slate-900" label="Admin" labelClassName="text-slate-500" />
  );
}
