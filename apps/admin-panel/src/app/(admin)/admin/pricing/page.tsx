'use client';

import { MealPricingConfig } from '@/components/admin/MealPricingConfig';

export default function AdminPricingPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <MealPricingConfig />
    </div>
  );
}
