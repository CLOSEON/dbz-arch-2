import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { PageTransition } from '@/components/ui/PageTransition';
import { RiderAppShell } from '@/components/RiderAppShell';

export const viewport: Viewport = {
  themeColor: '#431407',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: 'Dabzzo Delivery | Rider Panel',
  description: 'Delivery Fleet Partner App for Dabzzo Food Subscriptions',
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
            <RiderAppShell>
              {children}
            </RiderAppShell>
          </PageTransition>
        </AuthProvider>
      </body>
    </html>
  );
}
