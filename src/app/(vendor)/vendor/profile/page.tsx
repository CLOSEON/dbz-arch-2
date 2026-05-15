'use client';

import { VendorProfileCard } from '@/components/vendor/VendorProfileCard';
import { useAuthStore } from '@/store/authStore';

export default function VendorProfile() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account settings</p>
      </div>

      <VendorProfileCard />

      <div className="bg-white rounded-3xl p-6 shadow-card border border-slate-50">
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
