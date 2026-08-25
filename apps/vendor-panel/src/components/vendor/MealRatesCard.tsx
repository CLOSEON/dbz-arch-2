'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { updateUser } from '@/lib/queries/users';
import { IndianRupee, TrendingUp, Clock, RotateCcw, Calendar, Loader2, Sparkles } from 'lucide-react';

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
    { label: '☀️ Lunch Plan',         weekly: 'lunch_weekly',  monthly: 'lunch_monthly'  },
    { label: '🌙 Dinner Plan',        weekly: 'dinner_weekly', monthly: 'dinner_monthly' },
    { label: '🍱 Combo Plan (Both)',  weekly: 'both_weekly',  monthly: 'both_monthly'   },
  ] as const;

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <IndianRupee className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 leading-none">Subscription Pricing Plans</h3>
          <p className="text-xs font-semibold text-slate-400 mt-1.5">Set meal rates for single and repeat subscriptions</p>
        </div>
      </div>

      {/* ── One-time ── */}
      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Trial Meal Rate</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-slate-100">One-Time Trial</span>
        </div>
        <div className="relative max-w-[200px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm pointer-events-none">₹</span>
          <input
            type="number" min="0"
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-8 pr-4 text-center text-lg font-extrabold text-slate-900 focus:outline-none focus:border-brand/40"
            placeholder="0"
            value={rates.onetime || ''}
            onChange={(e) => set('onetime', e.target.value)}
          />
        </div>
      </div>

      {/* ── Subscription Plans ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Subscription Rate Cards</span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr] gap-3 mb-1 px-1">
          <div />
          <div className="flex items-center justify-center gap-1">
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Weekly (₹)</span>
          </div>
          <div className="flex items-center justify-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monthly (₹)</span>
          </div>
        </div>

        <div className="space-y-3">
          {subRows.map(({ label, weekly, monthly }) => (
            <div key={weekly} className="grid grid-cols-[1.1fr_0.9fr_0.9fr] gap-3 items-center bg-slate-50/20 hover:bg-slate-50/50 p-2 rounded-2xl border border-slate-100 transition-colors">
              <span className="text-xs font-black text-slate-800 leading-tight pl-1">{label}</span>
              {[weekly, monthly].map((field) => (
                <div key={field} className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black pointer-events-none">₹</span>
                  <input
                    type="number" min="0"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-6 pr-2 text-center text-xs font-extrabold text-slate-900 focus:outline-none focus:border-brand/40 focus:shadow-sm"
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
        className="w-full py-4 bg-brand text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-colors active:scale-95 shadow-lg shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <TrendingUp className="w-3.5 h-3.5" />
        )}
        {loading ? 'Saving rates...' : 'Save Pricing Plans'}
      </button>
    </div>
  );
}
