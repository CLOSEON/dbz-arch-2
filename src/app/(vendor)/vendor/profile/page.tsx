'use client';

import { VendorProfileCard } from '@/components/vendor/VendorProfileCard';
import { MealRatesCard } from '@/components/vendor/MealRatesCard';
import { VendorReviews } from '@/components/vendor/VendorReviews';
import { useAuthStore } from '@/store/authStore';

export default function VendorProfile() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="px-5 py-4 max-w-2xl mx-auto space-y-10 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
          Business & Settings
        </span>
        <h1 className="text-[30px] sm:text-[36px] font-black text-slate-900 tracking-tight leading-tight mt-2.5">
          Profile
        </h1>
        <p className="text-sm font-medium text-slate-400 mt-1">
          Manage your kitchen details and pricing
        </p>
      </div>

      <div className="space-y-8">
        <VendorProfileCard />
        <MealRatesCard />
        {user?.id && <VendorReviews vendorId={user.id} />}
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-rose-600 mb-1">Danger Zone</h3>
        <p className="text-sm text-slate-500 mb-6">Irreversible account actions</p>
        
        <button
          onClick={logout}
          className="w-full py-4 text-sm font-bold text-rose-500 bg-rose-50 rounded-2xl hover:bg-rose-100 transition-colors"
        >
          Logout from Account
        </button>
      </div>
    </div>
  );
}
