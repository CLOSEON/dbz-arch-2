'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, setVendorApproval } from '@/lib/queries/users';
import { AppUser } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { Search, Check, X, Store, MoreVertical } from 'lucide-react';
import Image from 'next/image';
import { cloudinaryUrl } from '@/lib/cloudinary';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

export default function AdminVendors() {
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadVendors();
  }, []);

  async function loadVendors() {
    setLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list.filter(u => u.role === 'vendor'));
    } catch (err) {
      addToast('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(id: string, approved: boolean) {
    try {
      await setVendorApproval(id, approved);
      addToast(approved ? 'Vendor approved! ✅' : 'Vendor rejected', 'info');
      setUsers(users.map(u => u.id === id ? { ...u, is_approved: approved } : u));
    } catch (err) {
      addToast('Failed to update status', 'error');
    }
  }

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'pending') list = list.filter(u => !u.is_approved);
    else if (filter === 'approved') list = list.filter(u => u.is_approved);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || (u.cuisine_type ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [users, filter, search]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Vendors</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage kitchen approvals</p>
      </div>

      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
          {(['pending', 'approved', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                filter === t ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏪"
          title="No vendors found"
          description={`No ${filter} vendors matching your search.`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <div key={v.id} className="bg-white rounded-3xl p-5 shadow-card border border-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl overflow-hidden relative">
                    {v.image ? (
                      <Image 
                        src={v.image.startsWith('http') ? v.image : cloudinaryUrl(v.image, 100, 100)} 
                        alt="" 
                        fill 
                        className="object-cover" 
                      />
                    ) : (
                      <Store className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{v.name}</h4>
                    <p className="text-xs text-slate-500">{v.cuisine_type || 'General Cuisine'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{v.email}</p>
                  </div>
                </div>
                {!v.is_approved ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproval(v.id, true)}
                      className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                      title="Approve"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">Approved</span>
                    <button 
                      onClick={() => handleApproval(v.id, false)}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                      title="Revoke Approval"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
