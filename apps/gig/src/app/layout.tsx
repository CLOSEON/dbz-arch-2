import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gig Worker Portal - Dabzzo',
  description: 'Gig Platform for Dabzzo Marketplace Workers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
