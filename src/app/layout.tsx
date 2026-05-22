import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'Dabzo | Smart Meal Subscriptions',
  description: 'Premium daily tiffin service with smart tracking',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} font-sans`}>
      <body className="bg-ivory text-slate-900 antialiased">
        <Toaster position="top-center" />
        <PermissionGuard />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
