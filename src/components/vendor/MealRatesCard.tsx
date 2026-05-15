'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { updateUser } from '@/lib/queries/users';
import { IndianRupee, TrendingUp } from 'lucide-react';

export function MealRatesCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useUiStore((s) => s.addToast);

  const [rates, setRates] = useState({
    lunch: user?.rate_lunch || 0,
    dinner: user?.rate_dinner || 0,
    both: user?.rate_both || 0,
  });
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!user) return;
    setLoading(true);
    try {
      await updateUser(user.id, {
        rate_lunch: Number(rates.lunch),
        rate_dinner: Number(rates.dinner),
        rate_both: Number(rates.both),
      });
      setUser({
        ...user,
        rate_lunch: Number(rates.lunch),
        rate_dinner: Number(rates.dinner),
        rate_both: Number(rates.both),
      });
      addToast('Rates updated successfully! 💰', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update rates', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <IndianRupee className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 leading-none">Meal Rates</h3>
          <p className="text-xs font-medium text-slate-400 mt-1.5">Set your daily rates for each plan</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
            Lunch (₹)
          </label>
          <input
            type="number"
            className="input text-center px-2 py-3"
            placeholder="0"
            value={rates.lunch || ''}
            onChange={(e) => setRates({ ...rates, lunch: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
            Dinner (₹)
          </label>
          <input
            type="number"
            className="input text-center px-2 py-3"
            placeholder="0"
            value={rates.dinner || ''}
            onChange={(e) => setRates({ ...rates, dinner: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 ml-1">
            Combo (₹)
          </label>
          <input
            type="number"
            className="input text-center px-2 py-3"
            placeholder="0"
            value={rates.both || ''}
            onChange={(e) => setRates({ ...rates, both: Number(e.target.value) })}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full btn-primary mt-8 py-4 h-auto text-sm shadow-xl shadow-brand/20"
      >
        <div className="flex items-center justify-center gap-2">
          {!loading && <TrendingUp className="w-4 h-4" />}
          {loading ? 'Updating…' : 'Update Pricing Plans'}
        </div>
      </button>
    </div>
  );
}
