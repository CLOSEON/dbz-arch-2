import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { PageTransition } from '@/components/ui/PageTransition';
import { AdminAppShell } from '@/components/AdminAppShell';

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: 'Dabzzo Admin | Operations Control',
  description: 'Admin Operations Control Console for Dabzzo Food Subscriptions',
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
      <body className="bg-slate-50 text-slate-900 antialiased font-sans">
        <Toaster position="top-center" />
        <PermissionGuard />
        <AuthProvider>
          <PageTransition>
            <AdminAppShell>
              {children}
            </AdminAppShell>
          </PageTransition>
        </AuthProvider>
      </body>
    </html>
  );
}
