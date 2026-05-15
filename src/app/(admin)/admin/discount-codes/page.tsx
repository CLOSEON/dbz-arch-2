'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DiscountCode } from '@/types';
import { Tag, Trash2, Store, Calendar, Percent } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export default function AdminDiscountCodesPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const addToast = useUiStore((s) => s.addToast);

  useEffect(() => {
    loadCodes();
  }, []);

  async function loadCodes() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'discount_codes'), orderBy('created_at', 'desc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountCode));
      setCodes(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">System Discounts</h1>
        <p className="text-sm text-slate-500 mt-0.5">Overview of all active promo codes across the platform</p>
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
          <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-slate-50">
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
                    <h4 className="font-black text-slate-900 tracking-widest text-lg uppercase">{c.code}</h4>
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                        <Store className="w-3 h-3 text-slate-300" /> Vendor: {(c.vendor_id || 'System').substring(0, 8)}…
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                        <Calendar className="w-3 h-3 text-slate-300" /> Created {c.created_at ? formatDate(c.created_at) : 'N/A'}
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
