import { Suspense } from 'react';
import VendorDetailClient from './VendorDetailClient';

export function generateStaticParams() {
  return [{ vendorId: 'placeholder' }];
}

interface PageProps {
  params: Promise<{ vendorId: string }>;
}

export default function VendorDetailPage(props: PageProps) {
  return <VendorDetailClient params={props.params} />;
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VendorDetailClient params={props.params} />
    </Suspense>
  );
}
