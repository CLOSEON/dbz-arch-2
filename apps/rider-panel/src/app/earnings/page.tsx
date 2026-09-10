'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Loader2,
  Truck
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

interface RealTrip {
  id: string;
  status: string;
  createdAt?: any;
  completedAt?: any;
  assignedOrderIds?: string[];
  vendorIds?: string[];
  pickupStops?: any[];
  dropStops?: any[];
}

export default function RiderShiftsAndPayPage() {
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [trips, setTrips] = useState<RealTrip[]>([]);

  // ── 1. Real-Time Listeners from Database ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Fetch Driver Profile
    const profileRef = doc(db, 'driver_profiles', user.id);
    const unsubProfile = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        setDriverProfile(snap.data());
      } else {
        setDriverProfile(null);
      }
    }, (err) => console.warn('Driver profile listen error:', err));

    // 2. Fetch Orders Assigned to this Rider
    const ordersQuery = query(
      collection(db, 'orders'),
      where('driverId', '==', user.id)
    );
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('Orders listen error:', err));

    // 3. Fetch Trips Assigned to this Rider
    const tripsQuery = query(
      collection(db, 'rider_trips'),
      where('riderId', '==', user.id)
    );
    const unsubTrips = onSnapshot(tripsQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RealTrip));
      docs.sort((a, b) => {
        const tA = a.completedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const tB = b.completedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setTrips(docs);
      setLoading(false);
    }, (err) => {
      console.warn('Trips listen error:', err);
      setLoading(false);
    });

    return () => {
      unsubProfile();
      unsubOrders();
      unsubTrips();
    };
  }, [user?.id]);

  // ── 2. Real Calculations (No Static Mock Data) ────────────────────────────
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const todayDateString = now.toLocaleDateString('en-CA');

  // Real delivered tiffins count
  const deliveredOrders = useMemo(() => {
    return orders.filter(o => o.status === 'delivered');
  }, [orders]);

  const deliveredTotal = deliveredOrders.length;

  const deliveredThisMonth = useMemo(() => {
    return deliveredOrders.filter(o => {
      const ts = o.timestamps?.deliveredAt?.toDate?.() || o.updated_at?.toDate?.() || o.created_at?.toDate?.();
      if (!ts) return false;
      return ts.getMonth() === currentMonth && ts.getFullYear() === currentYear;
    }).length;
  }, [deliveredOrders, currentMonth, currentYear]);

  const deliveredToday = useMemo(() => {
    return deliveredOrders.filter(o => {
      const orderDate = o.date || o.created_at?.toDate?.()?.toLocaleDateString('en-CA');
      return orderDate === todayDateString;
    }).length;
  }, [deliveredOrders, todayDateString]);

  // Real Days Worked this month (derived from dates of completed trips or delivered orders)
  const activeDatesThisMonth = useMemo(() => {
    const dates = new Set<string>();
    
    trips.forEach(t => {
      if (t.status === 'completed') {
        const d = t.completedAt?.toDate?.() || t.createdAt?.toDate?.();
        if (d && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          dates.add(d.toLocaleDateString('en-CA'));
        }
      }
    });

    deliveredOrders.forEach(o => {
      const d = o.timestamps?.deliveredAt?.toDate?.() || o.created_at?.toDate?.();
      if (d && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        dates.add(d.toLocaleDateString('en-CA'));
      }
    });

    // If rider is online today, count today as present
    if (driverProfile?.isActive) {
      dates.add(todayDateString);
    }

    return dates;
  }, [trips, deliveredOrders, driverProfile?.isActive, currentMonth, currentYear, todayDateString]);

  const daysWorked = activeDatesThisMonth.size;

  // Real Monthly Salary Configuration
  // If not configured in DB, shows 0 (no static fake 18000)
  const monthlySalary: number = Number(driverProfile?.monthlySalary || driverProfile?.salary || (user as any)?.monthly_salary || (user as any)?.salary || 0);
  const workingDaysInMonth = 26;
  const dailyRate = monthlySalary > 0 ? Math.round(monthlySalary / workingDaysInMonth) : 0;
  const currentMonthEarned = daysWorked * dailyRate;

  // Real Attendance Rate
  const currentDayOfMonth = now.getDate();
  const attendancePct = currentDayOfMonth > 0 && daysWorked > 0 
    ? Math.min(100, Math.round((daysWorked / currentDayOfMonth) * 100)) 
    : 0;

  // Real Customer Rating
  const realRating = driverProfile?.rating || (user as any)?.rating || null;

  // Real On-Time Rate
  const onTimePercentage = useMemo(() => {
    if (deliveredTotal === 0) return null;
    let onTimeCount = 0;
    deliveredOrders.forEach(o => {
      // If delivery was within expected slot or delivered without delay flag
      if (o.is_delayed !== true && o.status === 'delivered') {
        onTimeCount++;
      }
    });
    return Math.round((onTimeCount / deliveredTotal) * 100);
  }, [deliveredOrders, deliveredTotal]);

  // Real Shift Attendance History (Only real completed trips from Firestore)
  const completedTripsList = useMemo(() => {
    return trips.filter(t => t.status === 'completed');
  }, [trips]);

  const handleDownloadSalarySlip = () => {
    if (completedTripsList.length === 0) return;
    const rows = [
      ['Trip ID', 'Date', 'Status', 'Tiffins Delivered'],
      ...completedTripsList.map(t => {
        const d = t.completedAt?.toDate?.() || t.createdAt?.toDate?.() || new Date();
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return [
          t.id,
          dateStr,
          t.status,
          t.assignedOrderIds?.length || 0
        ];
      })
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dabzzo-payout-slip-${todayDateString}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentHour = now.getHours();
  const isLunchSlot = currentHour >= 10 && currentHour <= 14;
  const isDinnerSlot = currentHour >= 19 && currentHour <= 22;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

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
          Dedicated Company Partner • Real-Time Database Metrics & Live Attendance
        </p>
      </div>

      {/* ── 2. Fixed Monthly Salary Card (Real DB Values) ───────────────────── */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.15)] relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              Monthly Fixed Compensation
            </span>
            <span className="text-[10px] font-bold bg-white/10 px-2.5 py-1 rounded-full text-white/90">
              Cycle: 1st of Month
            </span>
          </div>

          <div>
            {monthlySalary > 0 ? (
              <>
                <div className="text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1">
                  ₹{monthlySalary.toLocaleString('en-IN')}
                  <span className="text-xs font-bold text-slate-400">/ month fixed</span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Accrued so far this cycle: <strong className="text-emerald-400 font-black">₹{currentMonthEarned.toLocaleString('en-IN')}</strong> ({daysWorked} of {workingDaysInMonth} working days)
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-slate-200">
                  Salary Setup Pending
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Accrued so far this cycle: <strong className="text-white font-black">₹0</strong> ({daysWorked} days active)
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Daily Shift Rate</p>
              <p className="text-base font-black text-white mt-0.5">
                {dailyRate > 0 ? `₹${dailyRate} / day` : '—'}
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Rate</p>
              <p className="text-base font-black text-emerald-400 mt-0.5">
                {attendancePct > 0 ? `${attendancePct}% Present` : '0%'}
              </p>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-brand/30 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── 3. Today's Shift Attendance Card ───────────────────────────────── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-brand" /> Today&apos;s Shift Attendance
          </h3>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
            driverProfile?.isActive 
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
              : 'text-slate-500 bg-slate-50 border-slate-200'
          }`}>
            {driverProfile?.isActive ? 'Online & Present ✓' : 'Currently Offline'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Lunch Shift */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                1. Lunch Shift
              </span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isLunchSlot && driverProfile?.isActive
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {isLunchSlot && driverProfile?.isActive ? 'Active Duty' : '11:00 AM Slot'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> 11:00 AM – 1:30 PM
            </p>
            <p className="text-[11px] font-medium text-slate-600">
              Tiffins Delivered Today: <strong className="font-black text-slate-900">{deliveredToday}</strong>
            </p>
          </div>

          {/* Dinner Shift */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                2. Dinner Shift
              </span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isDinnerSlot && driverProfile?.isActive
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {isDinnerSlot && driverProfile?.isActive ? 'Active Duty' : '7:30 PM Slot'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> 7:30 PM – 9:30 PM
            </p>
            <p className="text-[11px] font-medium text-slate-600">
              Kitchen prep starts 6:45 PM. Log online 15m before shift.
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. Key Performance Indicators (Real Values) ────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <Award className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">
            {onTimePercentage !== null ? `${onTimePercentage}%` : '—'}
          </p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">On-Time Rate</p>
        </div>
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">{deliveredThisMonth}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tiffins This Month</p>
        </div>
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 text-center shadow-xs">
          <Sparkles className="w-5 h-5 text-brand mx-auto mb-1" />
          <p className="text-lg font-black text-slate-900">
            {realRating ? `${Number(realRating).toFixed(1)} ★` : '—'}
          </p>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Customer Rating</p>
        </div>
      </div>

      {/* ── 5. Shift Attendance & Trip History (Real Trips) ────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" /> Shift Attendance Log
          </h3>
          {completedTripsList.length > 0 && (
            <button
              onClick={handleDownloadSalarySlip}
              className="flex items-center gap-1.5 text-xs font-bold text-brand hover:text-[#C2410C] active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Download Slip
            </button>
          )}
        </div>

        {completedTripsList.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center shadow-xs space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-sm text-slate-900">No Completed Shift Runs Yet</h4>
              <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto mt-1 leading-relaxed">
                Your completed runs, attendance logs, and verified tiffin handovers will automatically record here in real time.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {completedTripsList.map((trip) => {
              const d = trip.completedAt?.toDate?.() || trip.createdAt?.toDate?.() || new Date();
              const dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
              const tiffinsCount = trip.assignedOrderIds?.length || 0;

              return (
                <div 
                  key={trip.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{dateStr}</p>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Trip ID: {trip.id.slice(-6).toUpperCase()} • {tiffinsCount} Tiffins Handed Over
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Completed ✓
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
