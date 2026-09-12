'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { RefreshCw, IndianRupee, PieChart, Activity, ShieldCheck, Ticket } from 'lucide-react';

export default function AdminSwapsDashboard() {
  const [stats, setStats] = useState({
    swapsPerDay: 0,
    companyFulfilledPct: 0,
    matchedPct: 0,
    revenueCollected: 0,
    creditsIssued: 0,
    creditsRedeemed: 0,
    vouchersAvailable: 0,
    vouchersUsed: 0,
    netCost: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const swapsSnap = await getDocs(collection(db, 'swap_requests'));
        const creditsSnap = await getDocs(collection(db, 'user_credits'));
        const vouchersSnap = await getDocs(collection(db, 'free_meal_vouchers'));
        const auditSnap = await getDocs(collection(db, 'audit_logs'));

        let totalSwaps = 0;
        let matched = 0;
        let companyFulfilled = 0;
        let revenue = 0;

        swapsSnap.docs.forEach(doc => {
          const data = doc.data();
          totalSwaps++;
          if (data.status === 'matched') matched++;
          if (data.status === 'company_fulfilled') companyFulfilled++;
          if (data.is_paid && data.payment_amount) revenue += data.payment_amount;
        });

        let creditsIssued = 0;
        let creditsRedeemedCount = 0;
        creditsSnap.docs.forEach(doc => {
          const data = doc.data();
          creditsIssued += data.credit_amount || 0;
          if (data.redeemed) creditsRedeemedCount += data.credit_amount || 0;
        });

        let vouchersAvailable = 0;
        let vouchersUsed = 0;
        vouchersSnap.docs.forEach(doc => {
          if (doc.data().status === 'available') vouchersAvailable++;
          if (doc.data().status === 'used') vouchersUsed++;
        });

        const oldestSwap = swapsSnap.docs
          .map(d => d.data().created_at?.toDate()?.getTime() || Date.now())
          .sort()[0] || Date.now();
        const daysSinceStart = Math.max(1, Math.ceil((Date.now() - oldestSwap) / (1000 * 60 * 60 * 24)));
        
        const matchedPct = totalSwaps ? (matched / totalSwaps) * 100 : 0;
        const companyFulfilledPct = totalSwaps ? (companyFulfilled / totalSwaps) * 100 : 0;
        
        // Net cost: Vouchers used cost the company ~₹200 per meal. Revenue offset.
        const netCost = (vouchersUsed * 200) - revenue;

        setStats({
          swapsPerDay: totalSwaps / daysSinceStart,
          companyFulfilledPct,
          matchedPct,
          revenueCollected: revenue,
          creditsIssued,
          creditsRedeemed: creditsRedeemedCount,
          vouchersAvailable,
          vouchersUsed,
          netCost,
        });

      } catch (err) {
        console.error("Failed to load swap stats", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return <div className="p-8">Loading swap analytics...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Swap & Reward Analytics</h1>
          <p className="text-slate-500 font-medium">Real-time metrics on user behavior, collusion prevention, and financial impact.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Core Metrics */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Velocity</h3>
            <RefreshCw className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-4xl font-black text-slate-900 mb-1">{stats.swapsPerDay.toFixed(1)}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Swaps Requested / Day</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Financial Net</h3>
            <IndianRupee className="w-5 h-5 text-emerald-500" />
          </div>
          <p className={`text-4xl font-black mb-1 ${stats.netCost > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {stats.netCost > 0 ? '-' : '+'}₹{Math.abs(stats.netCost)}
          </p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Cost/Benefit (Revenue - Free Meals)</p>
          <p className="text-[10px] text-slate-400 mt-2 font-medium bg-slate-50 px-2 py-1 rounded inline-block">Revenue: ₹{stats.revenueCollected}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Match Rate</h3>
            <PieChart className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-4xl font-black text-slate-900 mb-1">{stats.matchedPct.toFixed(1)}%</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Successfully matched by users</p>
          
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div className="bg-amber-400 h-full" style={{ width: `${stats.matchedPct}%` }} title="Matched" />
            <div className="bg-indigo-400 h-full" style={{ width: `${stats.companyFulfilledPct}%` }} title="Company Fulfilled" />
          </div>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase"><div className="w-2 h-2 rounded-full bg-amber-400"></div> User Matched</div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase"><div className="w-2 h-2 rounded-full bg-indigo-400"></div> Co. Fulfilled</div>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
        <Ticket className="w-5 h-5 text-slate-400" /> Credit & Voucher Liability
      </h2>
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Issued Credits</p>
          <p className="text-3xl font-black text-slate-900">{stats.creditsIssued.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Converted to Vouchers</p>
          <p className="text-3xl font-black text-slate-900">{stats.creditsRedeemed.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Unused Vouchers (Liability)</p>
          <p className="text-3xl font-black text-indigo-600">{stats.vouchersAvailable}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Redeemed Vouchers</p>
          <p className="text-3xl font-black text-emerald-600">{stats.vouchersUsed}</p>
        </div>
      </div>
      
      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-900">Safeguards Active</p>
          <p className="text-xs text-blue-700 mt-1">
            Rate limiting (max 1 active broadcast), Collusion protection (max 3 matches/30 days), and full Audit Logging are currently running in the background for all users.
          </p>
        </div>
      </div>
    </div>
  );
}
