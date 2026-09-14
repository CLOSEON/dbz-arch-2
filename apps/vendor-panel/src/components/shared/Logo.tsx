'use client';
// Per-app branding wrapper; markup lives in @dabzzo/shared-ui.
import { Logo as SharedLogo, type LogoProps } from '@dabzzo/shared-ui';

export function Logo(props: Omit<LogoProps, 'src' | 'alt' | 'badgeClassName' | 'label' | 'labelClassName'>) {
  return (
    <SharedLogo {...props} src="/logo-vendor.png" alt="Dabzzo Vendor"
      badgeClassName="bg-rose-600" label="Vendor" labelClassName="text-rose-700" />
  );
}
