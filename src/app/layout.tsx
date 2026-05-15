import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/auth';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
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
    <html lang="en" className={`${inter.variable} font-sans`}>
      <body className="bg-ivory text-slate-900 antialiased">
        <Toaster position="top-center" />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
