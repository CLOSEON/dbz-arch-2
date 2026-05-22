'use client';

import { useAuthStore } from '@/store/authStore';
import { TodayOrdersList } from '@/components/vendor/TodayOrdersList';
import { Loader2 } from 'lucide-react';

export default function VendorOrdersPage() {
  const user = useAuthStore((s) => s.user);

  if (!user?.id) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Authenticating...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="px-4 mt-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1 rounded-full">
          Daily Kitchen Operations
        </span>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mt-2.5">
          Tiffin Batches
        </h1>
      </div>
      <TodayOrdersList vendorId={user.id} />
    </div>
  );
}
