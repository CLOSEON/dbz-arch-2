'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, setVendorApproval } from '@/lib/queries/users';
import { suspendVendor, unsuspendVendor } from '@/lib/queries/vendorAdmin';
import { AppUser } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { 
  Search, Check, X, Store, Eye, ShieldAlert, ShieldCheck, 
  Settings, DollarSign, Leaf, Drumstick, Tag, Power, ArrowRight, ExternalLink
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getImageUrl } from '@/lib/storage';
import { SkeletonList } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

export default function AdminVendors() {
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'suspended' | 'all'>('approved');
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

  function toggleSelect(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll(visibleIds: string[]) {
    if (selectedIds.length === visibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visibleIds);
    }
  }

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'pending') list = list.filter(u => !u.is_approved && !(u as any).is_suspended);
    if (filter === 'approved') list = list.filter(u => u.is_approved && !(u as any).is_suspended);
    if (filter === 'suspended') list = list.filter(u => (u as any).is_suspended);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => 
        (u.name || '').toLowerCase().includes(q) ||
        (u.kitchen_name || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.cuisine_type || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, filter, search]);

  const visibleIds = useMemo(() => filtered.map(v => v.id), [filtered]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Vendors & Kitchens</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage menus, live pricing algorithms, sub-subscriptions, dispatch capacity, and payouts
          </p>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by kitchen name, phone, cuisine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl">
          {(['pending', 'approved', 'suspended', 'all'] as const).map((t) => {
            const count = users.filter(u => {
              if (t === 'pending') return !u.is_approved && !(u as any).is_suspended;
              if (t === 'approved') return u.is_approved && !(u as any).is_suspended;
              if (t === 'suspended') return (u as any).is_suspended;
              return true;
            }).length;

            return (
              <button
                key={t}
                onClick={() => {
                  setFilter(t);
                  setSelectedIds([]);
                }}
                className={`px-4 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                  filter === t ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t} <span className="opacity-60 text-[10px]">({count})</span>
              </button>
            );
          })}
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
        <div className="space-y-4">
          {/* Header Row for Select All & Batch */}
          <div className="flex items-center justify-between px-4 text-xs font-bold text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={selectedIds.length > 0 && selectedIds.length === visibleIds.length}
                onChange={() => toggleSelectAll(visibleIds)}
                className="w-4 h-4 rounded text-brand border-slate-300 focus:ring-brand cursor-pointer"
              />
              <span>Select All Visible ({filtered.length})</span>
            </label>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBatchApproval(true)}
                  disabled={batchActionLoading}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600 shadow-sm"
                >
                  Approve Selected ({selectedIds.length})
                </button>
              </div>
            )}
          </div>

          {filtered.map((v) => {
            const isSuspended = (v as any).is_suspended === true;
            const vegMonthly = v.rate_veg_lunch_monthly || v.rate_lunch_monthly || v.rate_veg_both_monthly || v.rate_both_monthly;
            const nonVegMonthly = v.rate_nonveg_lunch_monthly || v.rate_nonveg_both_monthly;
            const addonsCount = v.addons?.length || 0;

            return (
              <div 
                key={v.id} 
                className="bg-white rounded-3xl p-5 shadow-card border border-slate-100 hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                {/* Kitchen Info */}
                <div className="flex items-start gap-4 flex-1">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    className="w-4 h-4 mt-2 rounded text-brand border-slate-300 focus:ring-brand cursor-pointer flex-shrink-0"
                  />

                  <Link 
                    href={`/admin/vendors/detail?vendorId=${v.id}`}
                    className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl overflow-hidden relative border border-slate-100 flex-shrink-0 hover:opacity-90 transition-opacity"
                  >
                    {v.image ? (
                      <Image 
                        src={v.image.startsWith('http') ? v.image : getImageUrl(v.image)} 
                        alt="" 
                        fill 
                        className="object-cover" 
                      />
                    ) : (
                      <Store className="w-7 h-7 text-slate-300" />
                    )}
                  </Link>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link 
                        href={`/admin/vendors/detail?vendorId=${v.id}`}
                        className="font-extrabold text-base text-slate-900 hover:text-brand transition-colors"
                      >
                        {v.kitchen_name || `${v.name}'s Kitchen`}
                      </Link>

                      {/* Status Badges */}
                      {isSuspended ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">Suspended</span>
                      ) : v.is_approved ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">Approved</span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">Pending Review</span>
                      )}

                      {v.is_open !== false ? (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">● Open</span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">○ Closed</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 font-medium">{v.cuisine_type || 'North & South Indian Homestyle Meals'}</p>
                    
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap pt-0.5">
                      <span>📞 {v.phone}</span>
                      {v.email && <span>• {v.email}</span>}
                      {v.address && <span>• 📍 {v.address}</span>}
                    </div>

                    {/* Rate & Offering Badges */}
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      {vegMonthly ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100 flex items-center gap-1">
                          <Leaf className="w-3 h-3 text-emerald-600" /> Veg: ₹{vegMonthly}/mo
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg">No Veg Rate</span>
                      )}

                      {nonVegMonthly ? (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100 flex items-center gap-1">
                          <Drumstick className="w-3 h-3 text-rose-600" /> Non-Veg: ₹{nonVegMonthly}/mo
                        </span>
                      ) : null}

                      {addonsCount > 0 ? (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-100 flex items-center gap-1">
                          <Tag className="w-3 h-3 text-amber-600" /> {addonsCount} Add-ons
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap self-end md:self-center border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 w-full md:w-auto justify-end">
                  {/* Edit Rates Button */}
                  <Link
                    href={`/admin/vendors/detail?vendorId=${v.id}&tab=pricing`}
                    className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-amber-600" /> Edit Rates
                  </Link>

                  {/* Manage Kitchen Console Button */}
                  <Link
                    href={`/admin/vendors/detail?vendorId=${v.id}`}
                    className="px-4 py-2.5 bg-brand text-white hover:bg-brand/90 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-brand/20"
                  >
                    <Settings className="w-3.5 h-3.5" /> Manage Kitchen <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  {/* Suspend / Approve */}
                  {isSuspended ? (
                    <button
                      onClick={() => handleSuspension(v.id, false)}
                      className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-colors border border-emerald-200"
                      title="Unsuspend Vendor"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                  ) : !v.is_approved ? (
                    <button
                      onClick={() => handleApproval(v.id, true)}
                      className="p-2.5 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-colors shadow-sm"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSuspension(v.id, true)}
                      className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 transition-colors border border-rose-200"
                      title="Suspend Vendor"
                    >
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
