'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { getVendorDiscounts, createDiscountCode, deleteDiscountCode } from '@/lib/queries/discounts';
import { DiscountCode } from '@/types';
import { Trash2, Tag, Loader2 } from 'lucide-react';

export default function VendorDiscounts() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  
  // Form state
  const [newCode, setNewCode] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user?.id) loadCodes();
  }, [user?.id]);

  async function loadCodes() {
    if (!user) return;
    setLoading(true);
    try {
      const list = await getVendorDiscounts(user.id);
      setCodes(list);
    } catch (err) {
      addToast('Failed to load discount codes', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!newCode.trim() || !discountPct) {
      addToast('Please fill all fields', 'warning');
      return;
    }

    setCreating(true);
    try {
      await createDiscountCode({
        vendor_id: user.id,
        code: newCode.trim().toUpperCase(),
        discount_pct: Number(discountPct),
      });
      addToast('Discount code created! 🏷️', 'success');
      setNewCode('');
      setDiscountPct('');
      loadCodes();
    } catch (err) {
      addToast('Failed to create code', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this code?')) return;
    try {
      await deleteDiscountCode(id);
      addToast('Code deleted', 'info');
      setCodes(codes.filter(c => c.id !== id));
    } catch (err) {
      addToast('Failed to delete code', 'error');
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Discounts</h1>
        <p className="text-sm text-slate-500 mt-0.5">Create and manage promo codes</p>
      </div>

      {/* Create Card */}
      <div className="bg-white rounded-3xl p-6 shadow-card">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Code</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Promo Code (e.g. SUMMER20)
            </label>
            <input
              className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold tracking-widest focus:ring-2 focus:ring-brand/20 transition-all outline-none uppercase"
              placeholder="ENTER CODE"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
              Discount Percentage (%)
            </label>
            <input
              type="number"
              className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-brand/20 transition-all outline-none"
              placeholder="e.g. 10"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full btn-primary py-3.5 h-auto text-sm"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Discount'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Your Active Codes</h3>
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 bg-white rounded-3xl animate-pulse" />
            <div className="h-16 bg-white rounded-3xl animate-pulse" />
          </div>
        ) : codes.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-card border border-slate-50">
            <Tag className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">No active codes</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {codes.map((c) => (
              <div key={c.id} className="bg-white rounded-3xl p-4 shadow-card flex items-center justify-between border border-slate-50 group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand/5 flex items-center justify-center">
                    <Tag className="w-5 h-5 text-brand" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 tracking-wider">{c.code}</h4>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                      {c.discount_pct}% OFF
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
