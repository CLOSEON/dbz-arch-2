import { Suspense } from 'react';
import VendorDetailClient from '../[vendorId]/VendorDetailClient';
import { SkeletonDetail } from '@/components/shared/Skeleton';

export default function VendorDetailQueryPage() {
  return (
    <Suspense fallback={<SkeletonDetail />}>
      <VendorDetailClient />
    </Suspense>
  );
}
