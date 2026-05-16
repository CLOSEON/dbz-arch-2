'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DiscountCode, AppUser } from '@/types';
import { Tag, Trash2, Store, Calendar, Percent, Plus, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { getAllUsers } from '@/lib/queries/users';
import { createDiscountCode } from '@/lib/queries/discounts';

export default function AdminDiscountCodesPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [vendors, setVendors] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const addToast = useUiStore((s) => s.addToast);

  // Form State
  const [newCode, setNewCode] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [targetVendor, setTargetVendor] = useState('global');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [codesSnap, users] = await Promise.all([
        getDocs(query(collection(db, 'discount_codes'), orderBy('created_at', 'desc'))),
        getAllUsers()
      ]);
      
      const list = codesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountCode));
      setCodes(list);
      setVendors(users.filter(u => u.role === 'vendor'));
    } catch (err) {
      console.error(err);
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !discountPct) {
      addToast('Please fill all fields', 'warning');
      return;
    }

    setCreating(true);
    try {
      await createDiscountCode({
        code: newCode.trim().toUpperCase(),
        discount_pct: Number(discountPct),
        vendor_id: targetVendor === 'global' ? 'global' : targetVendor
      });
      addToast('Code created successfully! 🏷️', 'success');
      setNewCode('');
      setDiscountPct('');
      loadData();
    } catch (err) {
      addToast('Failed to create code', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Permanently delete this discount code?')) return;
    try {
      await deleteDoc(doc(db, 'discount_codes', id));
      setCodes(codes.filter(c => c.id !== id));
      addToast('Code deleted successfully', 'info');
    } catch (err) {
      addToast('Failed to delete code', 'error');
    }
  }

  const getVendorName = (id?: string) => {
    if (!id || id === 'global') return 'Global (All Vendors)';
    const v = vendors.find(v => v.id === id);
    return v ? v.kitchen_name || v.name : `Unknown (${id.substring(0, 5)})`;
  };

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">System Discounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage promo codes across the platform</p>
        </div>
      </div>

      {/* Creation Form */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-brand" /> Generate New Code
        </h3>
        <form onSubmit={handleCreate} className="grid md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Code Name</label>
            <input 
              placeholder="E.G. FESTIVAL30"
              className="input uppercase font-black tracking-widest"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Discount %</label>
            <input 
              type="number"
              placeholder="30"
              className="input font-bold"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Vendor</label>
            <select 
              className="input font-bold"
              value={targetVendor}
              onChange={(e) => setTargetVendor(e.target.value)}
            >
              <option value="global">Global (All Vendors)</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.kitchen_name || v.name}</option>
              ))}
            </select>
          </div>
          <button 
            type="submit"
            disabled={creating}
            className="btn-primary py-3 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Code'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Codes</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-900">{loading ? '—' : codes.length}</h3>
            <Tag className="w-5 h-5 text-brand/20" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Average Disc</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-brand">
              {loading || codes.length === 0 ? '0%' : `${Math.round(codes.reduce((a, b) => a + b.discount_pct, 0) / codes.length)}%`}
            </h3>
            <Percent className="w-5 h-5 text-brand/20" />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white rounded-3xl animate-pulse shadow-sm border border-slate-50" />
          ))
        ) : codes.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-slate-50 col-span-full">
            <Tag className="w-10 h-10 text-slate-100 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-400">No discount codes found</p>
          </div>
        ) : (
          codes.map((c) => (
            <div key={c.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-50 group hover:border-brand/20 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand/5 text-brand flex items-center justify-center font-black text-sm tracking-tighter">
                    {c.discount_pct}%
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 tracking-widest text-lg uppercase leading-tight">{c.code}</h4>
                    <div className="flex flex-col gap-1 mt-1.5">
                      <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight ${c.vendor_id === 'global' || !c.vendor_id ? 'text-brand' : 'text-slate-500'}`}>
                        <Store className="w-3 h-3 opacity-50" /> {getVendorName(c.vendor_id)}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                        <Calendar className="w-3 h-3 opacity-50" /> {c.created_at ? formatDate(c.created_at) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(c.id)}
                  className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
