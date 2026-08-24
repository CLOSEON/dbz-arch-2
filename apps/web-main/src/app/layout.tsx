import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { PageTransition } from '@/components/ui/PageTransition';
import { UserAppShell } from '@/components/UserAppShell';

export const viewport: Viewport = {
  themeColor: '#D97706',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: 'Dabzzo | Premium Food Subscriptions',
  description: 'Order and manage daily meal subscriptions from top home chefs and kitchens',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#FEFCE8] text-slate-900 antialiased font-sans">
        <Toaster position="top-center" />
        <PermissionGuard />
        <AuthProvider>
          <PageTransition>
            <UserAppShell>
              {children}
            </UserAppShell>
          </PageTransition>
        </AuthProvider>
      </body>
    </html>
  );
}
