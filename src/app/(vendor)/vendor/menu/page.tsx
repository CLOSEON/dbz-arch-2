'use client';

import { TodayMenuCard } from '@/components/vendor/TodayMenuCard';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';

export default function VendorMenuPage() {
  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Menu & Rates</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your daily offerings and pricing</p>
      </div>

      <TodayMenuCard />
      <MealRatesCard />
    </div>
  );
}
