'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, setVendorApproval } from '@/lib/queries/users';
import { suspendVendor, unsuspendVendor } from '@/lib/queries/vendorAdmin';
import { AppUser } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { 
  Search, Check, X, Store, ShieldAlert, ShieldCheck, 
  Settings, Leaf, Drumstick, Tag, ArrowRight, 
  ExternalLink, Phone, MapPin, CheckCircle2, AlertCircle
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
      addToast(approved ? 'Vendor approved successfully' : 'Vendor status updated', 'info');
      setUsers(users.map(u => u.id === id ? { ...u, is_approved: approved } : u));
    } catch (err) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleSuspension(id: string, suspend: boolean) {
    try {
      if (suspend) {
        await suspendVendor(id);
        addToast('Vendor account suspended', 'warning');
        setUsers(users.map(u => u.id === id ? { ...u, is_approved: false, is_suspended: true } as any : u));
      } else {
        await unsuspendVendor(id);
        addToast('Vendor account unsuspended', 'success');
        setUsers(users.map(u => u.id === id ? { ...u, is_approved: true, is_suspended: false } as any : u));
      }
    } catch (err) {
      addToast('Failed to toggle suspension', 'error');
    }
  }

  async function handleBatchApproval(approve: boolean) {
    if (selectedIds.length === 0) return;
    setBatchActionLoading(true);
    try {
      await Promise.all(selectedIds.map(id => setVendorApproval(id, approve)));
      addToast(`Batch ${approve ? 'approved' : 'rejected'} successfully`, 'success');
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Kitchens & Vendors</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage menus, monthly subscription rates, kitchen details, and settlements
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search kitchen, phone, cuisine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800 transition-colors shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
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
                className={`px-3 py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${
                  filter === t 
                    ? 'bg-white text-slate-900 shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t} <span className="opacity-60 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Store className="w-10 h-10 text-slate-300 mx-auto" />}
          title="No kitchens found"
          description={`No ${filter} kitchens match your search query.`}
        />
      ) : (
        <div className="space-y-3">
          {/* Select all & batch actions */}
          <div className="flex items-center justify-between px-2 text-xs font-medium text-slate-500">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={selectedIds.length > 0 && selectedIds.length === visibleIds.length}
                onChange={() => toggleSelectAll(visibleIds)}
                className="w-3.5 h-3.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 cursor-pointer"
              />
              <span>Select all ({filtered.length})</span>
            </label>

            {selectedIds.length > 0 && (
              <button
                onClick={() => handleBatchApproval(true)}
                disabled={batchActionLoading}
                className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-xs"
              >
                Approve selected ({selectedIds.length})
              </button>
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
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Kitchen Info */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    className="w-3.5 h-3.5 mt-2 rounded text-slate-900 border-slate-300 focus:ring-slate-900 cursor-pointer shrink-0"
                  />

                  <Link 
                    href={`/admin/vendors/detail?vendorId=${v.id}`}
                    className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden relative border border-slate-200/60 shrink-0 hover:opacity-90 transition-opacity"
                  >
                    {v.image ? (
                      <Image 
                        src={v.image.startsWith('http') ? v.image : getImageUrl(v.image)} 
                        alt="" 
                        fill 
                        className="object-cover" 
                      />
                    ) : (
                      <Store className="w-6 h-6 text-slate-400" />
                    )}
                  </Link>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link 
                        href={`/admin/vendors/detail?vendorId=${v.id}`}
                        className="font-bold text-sm text-slate-900 hover:text-brand transition-colors truncate"
                      >
                        {v.kitchen_name || `${v.name}'s Kitchen`}
                      </Link>

                      {isSuspended ? (
                        <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">Suspended</span>
                      ) : v.is_approved ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">Verified</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">Pending Review</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 truncate">{v.cuisine_type || 'Homestyle Meals'}</p>
                    
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-slate-600"><Phone className="w-3 h-3 text-slate-400" /> {v.phone}</span>
                      {v.address && <span className="flex items-center gap-1 text-slate-500">• <MapPin className="w-3 h-3 text-slate-400" /> {v.address}</span>}
                    </div>

                    {/* Rates Pills */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {vegMonthly ? (
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                          <Leaf className="w-3 h-3 text-emerald-600" /> Veg ₹{vegMonthly}/mo
                        </span>
                      ) : null}

                      {nonVegMonthly ? (
                        <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 flex items-center gap-1">
                          <Drumstick className="w-3 h-3 text-rose-600" /> Non-Veg ₹{nonVegMonthly}/mo
                        </span>
                      ) : null}

                      {addonsCount > 0 ? (
                        <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-500" /> {addonsCount} Add-ons
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* 1 Single Manage Kitchen Button */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Link
                    href={`/admin/vendors/detail?vendorId=${v.id}`}
                    className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-300" /> Manage Kitchen <ArrowRight className="w-3 h-3" />
                  </Link>

                  {/* Suspend / Approve quick toggle */}
                  {isSuspended ? (
                    <button
                      onClick={() => handleSuspension(v.id, false)}
                      className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
                      title="Unsuspend"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                  ) : !v.is_approved ? (
                    <button
                      onClick={() => handleApproval(v.id, true)}
                      className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-xs"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSuspension(v.id, true)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="Suspend"
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
