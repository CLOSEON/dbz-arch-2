'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { riderPaymentConverter, RiderPayment } from '@/types/payout';

export default function DeliveryEarningsPage() {
  const user = useAuthStore((s) => s.user);

  const [payments, setPayments] = useState<RiderPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, 'rider_payments').withConverter(riderPaymentConverter),
      where('riderId', '==', user.id),
      orderBy('calculatedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setPayments(snap.docs.map(d => d.data()));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [user?.id]);

  // Fix 4: compute date boundaries without mutating `now`
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // Week starts on Sunday — compute without mutating `now`
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;

  payments.forEach(p => {
    const time = p.calculatedAt?.toDate().getTime() || 0;
    if (time >= startOfToday) todayTotal += p.totalPayment;
    if (time >= startOfWeek) weekTotal += p.totalPayment;
    if (time >= startOfMonth) monthTotal += p.totalPayment;
  });

  // Fix 5: Real CSV export — generates actual downloadable file
  function handleDownloadReport() {
    if (payments.length === 0) return;
    const rows = [
      ['Date', 'Tiffins Delivered', 'Distance (km)', 'Base Pay (Rs)', 'Bonus (Rs)', 'Total (Rs)', 'Status'],
      ...payments.map(p => {
        const dateObj = p.calculatedAt?.toDate();
        const dateStr = dateObj
          ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Unknown';
        return [
          dateStr,
          p.deliveredCount,
          p.totalDistanceKm.toFixed(1),
          p.basePayment.toFixed(2),
          p.tiffinBonus.toFixed(2),
          p.totalPayment.toFixed(2),
          p.status,
        ];
      }),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dabzzo-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Earnings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track your delivery performance</p>
      </div>

      {/* Main Stats */}
      <div className="bg-brand rounded-[2rem] p-8 text-white shadow-xl shadow-brand/30 relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-brand-100 text-xs font-bold uppercase tracking-widest mb-1">This Month</p>
          <h2 className="text-4xl font-black mb-6">
            ₹{monthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <div className="flex gap-4">
            <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-[10px] text-brand-100 font-bold uppercase mb-1">Today</p>
              <p className="text-lg font-black">
                ₹{todayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-[10px] text-brand-100 font-bold uppercase mb-1">This Week</p>
              <p className="text-lg font-black">
                ₹{weekTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl mix-blend-overlay" />
      </div>

      {/* Payment History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-900">Payment History</h3>
          <button
            onClick={handleDownloadReport}
            disabled={payments.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-brand disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
        <div className="space-y-3">
          {payments.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">No payment data yet</p>
                <p className="text-xs text-amber-600 mt-1">
                  Earnings appear here automatically after your first completed trip.
                </p>
              </div>
            </div>
          ) : (
            payments.map((p) => {
              const dateObj = p.calculatedAt?.toDate();
              const dateStr = dateObj
                ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Unknown Date';
              return (
                <div key={p.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.totalPayment > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{dateStr}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{p.deliveredCount} tiffins delivered</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">₹{p.totalPayment.toFixed(2)}</p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${p.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {p.status}
                      </p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 flex justify-between text-xs text-slate-600 border border-slate-100">
                    <span>Base: ₹{p.basePayment.toFixed(2)} ({p.totalDistanceKm.toFixed(1)} km)</span>
                    {p.tiffinBonus > 0 && <span className="font-bold text-emerald-600">Bonus: +₹{p.tiffinBonus.toFixed(2)}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
