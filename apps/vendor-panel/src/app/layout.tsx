import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { PageTransition } from '@/components/ui/PageTransition';
import { VendorAppShell } from '@/components/VendorAppShell';

export const viewport: Viewport = {
  themeColor: '#E68A00',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: 'Dabzzo Vendor | Kitchen Partner Command Center',
  description: 'Kitchen Partner Operations & Menu Control for Dabzzo Food Subscriptions',
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
      <body className="bg-[#F8FAFC] text-slate-900 antialiased font-sans">
        <Toaster position="top-center" />
        <PermissionGuard />
        <AuthProvider>
          <PageTransition>
            <VendorAppShell>
              {children}
            </VendorAppShell>
          </PageTransition>
        </AuthProvider>
      </body>
    </html>
  );
}
