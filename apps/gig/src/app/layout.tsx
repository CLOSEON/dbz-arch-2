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
    // suppressHydrationWarning applies to THIS element's attributes only,
    // one level deep -- it does not hide real content mismatches. Browser
    // extensions (QuillBot writes data-qb-installed, Grammarly and password
    // managers do similar) mutate <html> before React hydrates, which React
    // otherwise reports as a hydration error the app cannot fix.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
