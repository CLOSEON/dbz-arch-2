'use client';

import { useState, useMemo } from 'react';
import { 
  CalendarCheck, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  Download, 
  Award, 
  TrendingUp,
  AlertCircle,
  IndianRupee,
  Calendar,
  Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';

export default function RiderShiftsAndPayPage() {
  const user = useAuthStore((s) => s.user);
  const agentOrders = useDeliveryStore((s) => s.agentOrders);

  const completedTiffinsToday = agentOrders.filter(o => o.status === 'delivered').length;

  // Salary parameters (Company Fleet Model)
  const monthlySalary = 18000;
  const workingDaysInMonth = 26;
  const dailyRate = Math.round(monthlySalary / workingDaysInMonth);
  const daysWorked = 24;
  const currentMonthEarned = daysWorked * dailyRate;

  // Today's shift state
  const now = new Date();
  const currentHour = now.getHours();

  const isLunchDoneOrActive = currentHour >= 11;
  const isDinnerDoneOrActive = currentHour >= 19;

  // 7-day Mock Attendance History matching real company schedule
  const attendanceHistory = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const isToday = i === 0;
      const dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
      
      list.push({
        date: dateStr,
        isToday,
        lunchStatus: isToday ? (isLunchDoneOrActive ? 'Present' : 'Upcoming') : 'Present',
        dinnerStatus: isToday ? (isDinnerDoneOrActive ? 'Present' : 'Upcoming') : 'Present',
        tiffinsDelivered: isToday ? completedTiffinsToday : Math.floor(12 + (i * 3) % 8),
        punctuality: '100%',
        status: 'Approved'
      });
    }
    return list;
  }, [completedTiffinsToday, isLunchDoneOrActive, isDinnerDoneOrActive]);

  const handleDownloadSalarySlip = () => {
    const rows = [
      ['Date', 'Lunch Shift', 'Dinner Shift', 'Tiffins Delivered', 'Attendance', 'Status'],
      ...attendanceHistory.map(h => [
        h.date,
        h.lunchStatus,
        h.dinnerStatus,
        h.tiffinsDelivered,
        h.punctuality,
        h.status
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dabzzo-salary-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-28 text-slate-900 max-w-xl mx-auto px-2 sm:px-0 animate-fade-in">
      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-slate-900">Shifts & Payroll</h1>
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
            <ShieldCheck className="w-3.5 h-3.5" /> Salary Fleet
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Dedicated Company Partner • Fixed Monthly Payroll & Shift Attendance
        </p>
      </div>

      {/* ── 2. Fixed Monthly Salary Card ───────────────────────────────────── */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.15)] relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              Monthly Fixed Compensation
            </span>
            <span className="text-[10px] font-bold bg-white/10 px-2.5 py-1 rounded-full text-white/90">
              Payout Cycle: 1st of Month
            </span>
          </div>

          <div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1">
              ₹{monthlySalary.toLocaleString('en-IN')}
              <span className="text-xs font-bold text-slate-400">/ month fixed</span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Accrued so far this cycle: <strong className="text-emerald-400 font-black">₹{currentMonthEarned.toLocaleString('en-IN')}</strong> ({daysWorked} of {workingDaysInMonth} working days)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Daily Shift Rate</p>
              <p className="text-base font-black text-white mt-0.5">₹{dailyRate} / day</p>
            </div>
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Rate</p>
              <p className="text-base font-black text-emerald-400 mt-0.5">96.2% Present</p>
            </div>
          </div>
        </div>

        {/* Ambient glow */}
        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-brand/30 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── 3. Today's Shift Attendance Card ───────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-brand" /> Today&apos;s Shift Attendance
          </h3>
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Active Duty ✓
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Lunch Shift */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                1. Lunch Shift
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Present
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> 11:00 AM – 1:30 PM
            </p>
            <p className="text-[11px] font-medium text-slate-600">
              Dispatched & Standing By. Tiffins Delivered: <strong className="font-black text-slate-900">{completedTiffinsToday}</strong>
            </p>
          </div>

          {/* Dinner Shift */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                2. Dinner Shift
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {isDinnerDoneOrActive ? 'Present' : 'Scheduled'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> 7:30 PM – 9:30 PM
            </p>
            <p className="text-[11px] font-medium text-slate-600">
              Kitchen prep begins at 6:45 PM. Be online 15m before shift.
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. Key Performance Indicators ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <Award className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">98.4%</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">On-Time Rate</p>
        </div>
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">312</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tiffins This Month</p>
        </div>
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <Sparkles className="w-5 h-5 text-brand mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">4.9 ★</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Customer Rating</p>
        </div>
      </div>

      {/* ── 5. Attendance & Shift Log History ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" /> Shift Attendance Log
          </h3>
          <button
            onClick={handleDownloadSalarySlip}
            className="flex items-center gap-1.5 text-xs font-bold text-brand hover:text-[#C2410C] active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download Slip
          </button>
        </div>

        <div className="space-y-2">
          {attendanceHistory.map((item, idx) => (
            <div 
              key={`att-${idx}`}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                  item.lunchStatus === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                }`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-slate-900">{item.date}</p>
                    {item.isToday && (
                      <span className="text-[9px] font-black uppercase bg-brand text-white px-2 py-0.2 rounded-full">Today</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    Lunch: {item.lunchStatus} • Dinner: {item.dinnerStatus} • {item.tiffinsDelivered} Tiffins
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-block text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {item.status}
                </span>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{item.punctuality} Punctual</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
