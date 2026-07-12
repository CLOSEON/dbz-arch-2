'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, setVendorApproval } from '@/lib/queries/users';
import { suspendVendor, unsuspendVendor } from '@/lib/queries/vendorAdmin';
import { AppUser } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { Search, Check, X, Store, Eye, ShieldAlert, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getImageUrl } from '@/lib/storage';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

export default function AdminVendors() {
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'suspended' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);

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
      addToast(approved ? 'Vendor approved! ✅' : 'Vendor status updated', 'info');
      setUsers(users.map(u => u.id === id ? { ...u, is_approved: approved } : u));
    } catch (err) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleSuspension(id: string, suspend: boolean) {
    try {
      if (suspend) {
        await suspendVendor(id);
        addToast('Vendor account suspended ⚠️', 'warning');
        setUsers(users.map(u => u.id === id ? { ...u, is_approved: false, is_suspended: true } as any : u));
      } else {
        await unsuspendVendor(id);
        addToast('Vendor account unsuspended ✅', 'success');
        setUsers(users.map(u => u.id === id ? { ...u, is_approved: true, is_suspended: false } as any : u));
      }
    } catch (err) {
      addToast('Failed to toggle suspension', 'error');
    }
  }

  // Batch action handler
  async function handleBatchApproval(approve: boolean) {
    if (selectedIds.length === 0) return;
    setBatchActionLoading(true);
    try {
      await Promise.all(selectedIds.map(id => setVendorApproval(id, approve)));
      addToast(`Batch ${approve ? 'approved' : 'rejected'} successfully!`, 'success');
      setUsers(users.map(u => selectedIds.includes(u.id) ? { ...u, is_approved: approve } : u));
      setSelectedIds([]);
    } catch (err) {
      addToast('Failed to process batch action', 'error');
    } finally {
      setBatchActionLoading(false);
    }
  }

  // Toggle single selection
  function toggleSelect(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }

  // Select all visible filtered vendors
  function toggleSelectAll(visibleIds: string[]) {
    if (selectedIds.length === visibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visibleIds);
    }
  }

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'pending') {
      list = list.filter(u => !u.is_approved && !(u as any).is_suspended);
    } else if (filter === 'approved') {
      list = list.filter(u => u.is_approved && !(u as any).is_suspended);
    } else if (filter === 'suspended') {
      list = list.filter(u => (u as any).is_suspended === true);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => 
        u.name.toLowerCase().includes(q) || 
        (u.kitchen_name ?? '').toLowerCase().includes(q) ||
        (u.phone ?? '').includes(q) ||
        (u.cuisine_type ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, filter, search]);

  const visibleIds = useMemo(() => filtered.map(v => v.id), [filtered]);

  return (
    <div className="space-y-6 animate-fade-in pb-10 pr-4 pl-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Vendors</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage kitchen approvals, suspensions, and configurations</p>
        </div>
        
        {/* Batch Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-2xl border border-slate-100 animate-slide-in">
            <span className="text-xs font-bold text-slate-500 px-2">{selectedIds.length} selected</span>
            <button
              onClick={() => handleBatchApproval(true)}
              disabled={batchActionLoading}
              className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600 transition-all flex items-center gap-1 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => handleBatchApproval(false)}
              disabled={batchActionLoading}
              className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-300 transition-all flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Revoke
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by kitchen name, phone number, cuisine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
          {(['pending', 'approved', 'suspended', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setFilter(t);
                setSelectedIds([]);
              }}
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
          {/* Header Row for Select All */}
          <div className="flex items-center gap-4 px-5 text-xs font-bold text-slate-400">
            <input 
              type="checkbox" 
              checked={selectedIds.length > 0 && selectedIds.length === visibleIds.length}
              onChange={() => toggleSelectAll(visibleIds)}
              className="w-4 h-4 rounded text-brand border-slate-300 focus:ring-brand cursor-pointer"
            />
            <span>Select All Visible</span>
          </div>

          {filtered.map((v) => {
            const isSuspended = (v as any).is_suspended === true;
            return (
              <div key={v.id} className="bg-white rounded-3xl p-5 shadow-card border border-slate-50 flex items-center gap-4 hover:border-slate-200 transition-all">
                {/* Selection Checkbox */}
                <input 
                  type="checkbox" 
                  checked={selectedIds.includes(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  className="w-4 h-4 rounded text-brand border-slate-300 focus:ring-brand cursor-pointer"
                />

                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl overflow-hidden relative border border-slate-100 flex-shrink-0">
                      {v.image ? (
                        <Image 
                          src={v.image.startsWith('http') ? v.image : getImageUrl(v.image)} 
                          alt="" 
                          fill 
                          className="object-cover" 
                        />
                      ) : (
                        <Store className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{v.kitchen_name || `${v.name}'s Kitchen`}</h4>
                      <p className="text-xs text-slate-500 font-medium">{v.cuisine_type || 'General Cuisine'}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>📞 {v.phone}</span>
                        <span>•</span>
                        <span>{v.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Badge */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Status Badge */}
                    {isSuspended ? (
                      <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100">Suspended</span>
                    ) : v.is_approved ? (
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">Approved</span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-100">Pending</span>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 ml-2">
                      <Link 
                        href={`/admin/vendors/${v.id}`}
                        className="w-9 h-9 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4.5 h-4.5" />
                      </Link>

                      {isSuspended ? (
                        <button
                          onClick={() => handleSuspension(v.id, false)}
                          className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                          title="Unsuspend Vendor"
                        >
                          <ShieldCheck className="w-4.5 h-4.5" />
                        </button>
                      ) : !v.is_approved ? (
                        <button
                          onClick={() => handleApproval(v.id, true)}
                          className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                          title="Approve"
                        >
                          <Check className="w-4.5 h-4.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspension(v.id, true)}
                          className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors"
                          title="Suspend Vendor"
                        >
                          <ShieldAlert className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
