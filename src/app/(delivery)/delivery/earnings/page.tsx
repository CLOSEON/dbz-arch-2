'use client';

import { useState } from 'react';
import { Wallet, TrendingUp, ChevronRight, ArrowUpRight } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';

export default function DeliveryEarningsPage() {
  const addToast = useUiStore((s) => s.addToast);
  const [earnings] = useState({
    today: 450,
    week: 2850,
    month: 12400,
    history: [
      { id: '1', date: 'Today', amount: 450, tasks: 12 },
      { id: '2', date: 'Yesterday', amount: 520, tasks: 14 },
      { id: '3', date: '11 May', amount: 480, tasks: 13 },
      { id: '4', date: '10 May', amount: 0, tasks: 0 },
      { id: '5', date: '09 May', amount: 610, tasks: 16 },
    ]
  });

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Earnings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track your daily performance</p>
      </div>

      {/* Main Stats */}
      <div className="bg-brand rounded-[2rem] p-8 text-white shadow-xl shadow-brand/30 relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-brand-100 text-xs font-bold uppercase tracking-widest mb-1">Total Balance</p>
          <h2 className="text-4xl font-black mb-6">₹{earnings.month.toLocaleString()}</h2>
          <div className="flex gap-4">
            <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-[10px] text-brand-100 font-bold uppercase mb-1">Today</p>
              <p className="text-lg font-black">₹{earnings.today}</p>
            </div>
            <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
              <p className="text-[10px] text-brand-100 font-bold uppercase mb-1">This Week</p>
              <p className="text-lg font-black">₹{earnings.week}</p>
            </div>
          </div>
        </div>
        {/* Decorative Circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
      </div>

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-900">Recent History</h3>
          <button onClick={() => addToast('Report will be emailed to you shortly', 'success')} className="text-xs font-bold text-brand">Download Report</button>
        </div>
        <div className="space-y-3">
          {earnings.history.map((day) => (
            <div key={day.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${day.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{day.date}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{day.tasks} tasks completed</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">₹{day.amount}</p>
                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Received</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
