'use client';

import { useAuthStore } from '@/store/authStore';
import { IndianRupee, Clock, RotateCcw, Calendar, Leaf, Drumstick, Tag, ShieldCheck, PhoneCall } from 'lucide-react';

export function MealRatesCard() {
  const user = useAuthStore((s) => s.user);

  const hasVeg = !user?.dietary_categories || user.dietary_categories.includes('veg');
  const hasNonVeg = user?.dietary_categories?.includes('non_veg');

  const vegRates = {
    onetime: user?.rate_veg_onetime || user?.rate_onetime || 0,
    lunch_weekly: user?.rate_veg_lunch_weekly || user?.rate_lunch_weekly || 0,
    lunch_monthly: user?.rate_veg_lunch_monthly || user?.rate_lunch_monthly || 0,
    dinner_weekly: user?.rate_veg_dinner_weekly || user?.rate_dinner_weekly || 0,
    dinner_monthly: user?.rate_veg_dinner_monthly || user?.rate_dinner_monthly || 0,
    both_weekly: user?.rate_veg_both_weekly || user?.rate_both_weekly || 0,
    both_monthly: user?.rate_veg_both_monthly || user?.rate_both_monthly || 0,
  };

  const nonVegRates = {
    onetime: user?.rate_nonveg_onetime || 0,
    lunch_weekly: user?.rate_nonveg_lunch_weekly || 0,
    lunch_monthly: user?.rate_nonveg_lunch_monthly || 0,
    dinner_weekly: user?.rate_nonveg_dinner_weekly || 0,
    dinner_monthly: user?.rate_nonveg_dinner_monthly || 0,
    both_weekly: user?.rate_nonveg_both_weekly || 0,
    both_monthly: user?.rate_nonveg_both_monthly || 0,
  };

  const activeAddons = (user?.addons || []).filter(a => a.active);

  const subRows = [
    { label: 'Lunch Plan',         weekly: 'lunch_weekly',  monthly: 'lunch_monthly'  },
    { label: 'Dinner Plan',        weekly: 'dinner_weekly', monthly: 'dinner_monthly' },
    { label: 'Combo Plan (Both)',  weekly: 'both_weekly',  monthly: 'both_monthly'   },
  ] as const;

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 leading-none">Subscription Rate Cards</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1.5">Approved customer pricing & add-on offerings</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 text-slate-600 px-3 py-1.5 rounded-full border border-slate-100 text-[10px] font-black uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" /> Admin Managed
        </div>
      </div>

      {/* Admin Controlled Disclaimer */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
          <PhoneCall className="w-4 h-4" />
        </div>
        <div className="text-xs">
          <p className="font-extrabold text-slate-900">Pricing is managed by Dabzzo Operations</p>
          <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
            Subscription prices and margin algorithms are calculated and updated directly by our operations team. If you wish to propose revised base prices, please get in touch with your partner manager.
          </p>
        </div>
      </div>

      {/* 🌿 Vegetarian Rates */}
      {hasVeg && (
        <div className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-wider text-emerald-900">Vegetarian Plan Rates</span>
            </div>
            <span className="text-[10px] font-bold bg-white text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100 shadow-sm">
              Trial: ₹{vegRates.onetime}
            </span>
          </div>

          <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
            <div className="text-left">Plan</div>
            <div className="flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3" /> Weekly</div>
            <div className="flex items-center justify-center gap-1"><Calendar className="w-3 h-3" /> Monthly</div>
          </div>

          <div className="space-y-2">
            {subRows.map(({ label, weekly, monthly }) => (
              <div key={weekly} className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 items-center bg-white p-2.5 rounded-xl border border-emerald-100/60 shadow-sm">
                <span className="text-xs font-black text-slate-800 text-left pl-1">{label}</span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50/50 py-1.5 rounded-lg border border-emerald-100/50 text-center">
                  ₹{vegRates[weekly as keyof typeof vegRates]}
                </span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50/50 py-1.5 rounded-lg border border-emerald-100/50 text-center">
                  ₹{vegRates[monthly as keyof typeof vegRates]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🍗 Non-Vegetarian Rates */}
      {hasNonVeg && (
        <div className="bg-rose-50/30 rounded-2xl p-4 border border-rose-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Drumstick className="w-4 h-4 text-rose-600" />
              <span className="text-xs font-black uppercase tracking-wider text-rose-900">Non-Vegetarian Plan Rates</span>
            </div>
            <span className="text-[10px] font-bold bg-white text-rose-700 px-2 py-0.5 rounded-lg border border-rose-100 shadow-sm">
              Trial: ₹{nonVegRates.onetime}
            </span>
          </div>

          <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
            <div className="text-left">Plan</div>
            <div className="flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3" /> Weekly</div>
            <div className="flex items-center justify-center gap-1"><Calendar className="w-3 h-3" /> Monthly</div>
          </div>

          <div className="space-y-2">
            {subRows.map(({ label, weekly, monthly }) => (
              <div key={weekly} className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 items-center bg-white p-2.5 rounded-xl border border-rose-100/60 shadow-sm">
                <span className="text-xs font-black text-slate-800 text-left pl-1">{label}</span>
                <span className="text-xs font-black text-rose-700 bg-rose-50/50 py-1.5 rounded-lg border border-rose-100/50 text-center">
                  ₹{nonVegRates[weekly as keyof typeof nonVegRates]}
                </span>
                <span className="text-xs font-black text-rose-700 bg-rose-50/50 py-1.5 rounded-lg border border-rose-100/50 text-center">
                  ₹{nonVegRates[monthly as keyof typeof nonVegRates]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Subscriptions / Add-Ons */}
      <div className="bg-amber-50/30 rounded-2xl p-4 border border-amber-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-900">Active Add-Ons Offerings</span>
          </div>
          <span className="text-[10px] font-bold bg-white text-amber-800 px-2 py-0.5 rounded-lg border border-amber-100">
            {activeAddons.length} Enabled
          </span>
        </div>

        {activeAddons.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium italic">No add-ons currently active for your kitchen.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {activeAddons.map(addon => (
              <div key={addon.id} className="bg-white p-3 rounded-xl border border-amber-100/80 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{addon.name}</span>
                  <span className="text-xs font-black text-amber-700">₹{addon.monthly_price}/mo</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  ₹{addon.weekly_price || Math.round(addon.monthly_price / 4)}/wk • ₹{addon.onetime_price || Math.round(addon.monthly_price / 30)}/meal
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
