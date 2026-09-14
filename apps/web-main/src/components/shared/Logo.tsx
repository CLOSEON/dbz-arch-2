'use client';
// Per-app branding wrapper; markup lives in @dabzzo/shared-ui.
import { Logo as SharedLogo, type LogoProps } from '@dabzzo/shared-ui';

export function Logo(props: Omit<LogoProps, 'src' | 'alt' | 'badgeClassName' | 'label' | 'labelClassName'>) {
  return <SharedLogo {...props} src="/icon.png" alt="Dabzzo" badgeClassName="bg-amber-600" />;
}
