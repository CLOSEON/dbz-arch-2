'use client';

import { useAuthStore } from '@/store/authStore';
import { LayoutDashboard, BadgePercent } from 'lucide-react';

export default function AdminOffersPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="page-shell-admin">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
          <BadgePercent className="h-6 w-6 text-brand" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Offers & Promotions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage promotional banners and offer cards</p>
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 mx-auto mb-4">
          <BadgePercent className="h-8 w-8 text-brand" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Offers Management</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          This section is under development. You can manage offer carousel cards and promotional banners here.
        </p>
      </div>
    </div>
  );
}
