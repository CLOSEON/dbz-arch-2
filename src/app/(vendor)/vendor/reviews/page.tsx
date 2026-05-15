'use client';

import { useAuthStore } from '@/store/authStore';
import { VendorReviews } from '@/components/vendor/VendorReviews';

export default function VendorReviewsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Customer Feedback</h1>
        <p className="text-sm text-slate-500 mt-0.5">What your customers are saying</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        {user?.id ? (
          <VendorReviews vendorId={user.id} />
        ) : (
          <p className="text-center py-10 text-slate-400">Loading reviews...</p>
        )}
      </div>
    </div>
  );
}
