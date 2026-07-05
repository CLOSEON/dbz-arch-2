'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { updateUser } from '@/lib/queries/users';
import { IndianRupee, TrendingUp, Clock, RotateCcw, Calendar } from 'lucide-react';

export function MealRatesCard() {
  const user     = useAuthStore((s) => s.user);
  const setUser  = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [rates, setRates] = useState({
    // One-time: single flat price per meal — no meal-type distinction
    onetime:        user?.rate_onetime        ?? 0,
    // Weekly: per meal type
    lunch_weekly:   user?.rate_lunch_weekly   ?? 0,
    dinner_weekly:  user?.rate_dinner_weekly  ?? 0,
    both_weekly:    user?.rate_both_weekly     ?? 0,
    // Monthly: per meal type
    lunch_monthly:  user?.rate_lunch_monthly  ?? 0,
    dinner_monthly: user?.rate_dinner_monthly ?? 0,
    both_monthly:   user?.rate_both_monthly   ?? 0,
  });

  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof rates, value: string) {
    setRates((prev) => ({ ...prev, [field]: Number(value) }));
  }

  async function handleSave() {
    if (!user) return;
    setLoading(true);
    try {
      const update = {
        rate_onetime:        rates.onetime,
        rate_lunch_weekly:   rates.lunch_weekly,
        rate_dinner_weekly:  rates.dinner_weekly,
        rate_both_weekly:    rates.both_weekly,
        rate_lunch_monthly:  rates.lunch_monthly,
        rate_dinner_monthly: rates.dinner_monthly,
        rate_both_monthly:   rates.both_monthly,
      };
      await updateUser(user.id, update as any);
      setUser({ ...user, ...update });
      addToast('Pricing plans saved! 💰', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update rates', 'error');
    } finally {
      setLoading(false);
    }
  }

  const subRows = [
    { label: '☀️  Lunch',         weekly: 'lunch_weekly',  monthly: 'lunch_monthly'  },
    { label: '🌙  Dinner',        weekly: 'dinner_weekly', monthly: 'dinner_monthly' },
    { label: '🍱  Lunch + Dinner', weekly: 'both_weekly',  monthly: 'both_monthly'   },
  ] as const;

  return (
    <div className="card space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <IndianRupee className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 leading-none">Pricing Plans</h3>
          <p className="text-xs font-medium text-slate-400 mt-1.5">Set rates for each plan type</p>
        </div>
      </div>

      {/* ── One-time ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">One-time</span>
          <span className="text-[10px] text-slate-400 font-medium ml-1">· flat price per meal</span>
        </div>
        <div className="relative max-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">₹</span>
          <input
            type="number" min="0"
            className="input text-center pl-7 py-3 text-lg font-bold"
            placeholder="0"
            value={rates.onetime || ''}
            onChange={(e) => set('onetime', e.target.value)}
          />
        </div>
      </div>

      <div className="h-px bg-slate-100" />

      {/* ── Subscription Plans ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
          Subscription Plans
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div />
          <div className="flex items-center justify-center gap-1.5">
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Weekly</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monthly</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {subRows.map(({ label, weekly, monthly }) => (
            <div key={weekly} className="grid grid-cols-3 gap-2 items-center">
              <span className="text-xs font-bold text-slate-700 leading-tight">{label}</span>
              {[weekly, monthly].map((field) => (
                <div key={field} className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">₹</span>
                  <input
                    type="number" min="0"
                    className="input text-center pl-5 pr-1 py-2.5 text-sm w-full"
                    placeholder="0"
                    value={rates[field as keyof typeof rates] || ''}
                    onChange={(e) => set(field as keyof typeof rates, e.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full btn-primary py-4 h-auto text-sm shadow-xl shadow-brand/20"
      >
        <div className="flex items-center justify-center gap-2">
          {!loading && <TrendingUp className="w-4 h-4" />}
          {loading ? 'Saving…' : 'Save Pricing Plans'}
        </div>
      </button>
    </div>
  );
}
