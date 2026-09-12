'use client';

import { useAuthStore } from '@/store/authStore';
import { useVendorData } from './VendorDataProvider';
import { IndianRupee, Clock, RotateCcw, Calendar, Tag, ShieldCheck, PhoneCall, Utensils, CheckCircle2 } from 'lucide-react';
import { VegIcon, NonVegIcon } from '@/components/shared/DietaryIcon';
import { calculateBaseVendorCost } from '@/lib/queries/mealComponents';
import { DEFAULT_MEAL_COMPONENTS } from '@/types';

export function MealRatesCard() {
  const user = useAuthStore((s) => s.user);
  const { managedVendor } = useVendorData();
  const currentVendor = managedVendor || user;

  const vendorMarginPct =
    currentVendor?.vendor_margin_percent ??
    currentVendor?.vendor_margin_override ??
    40;
  const standardRawCost = 30;
  const safeMargin = Math.min(Math.max(vendorMarginPct, 0), 99.99);

  const customRates = currentVendor?.custom_component_rates;
  const hasCustomRates =
    customRates &&
    typeof customRates === 'object' &&
    Object.keys(customRates).length > 0;

  const standardComponentCost = hasCustomRates
    ? calculateBaseVendorCost(DEFAULT_MEAL_COMPONENTS, customRates)
    : 0;

  let standardPayout = 0;
  let isComponentBased = false;

  if (typeof currentVendor?.vendor_base_payout === 'number' && currentVendor.vendor_base_payout > 0) {
    standardPayout = currentVendor.vendor_base_payout;
    isComponentBased = true;
  } else if (typeof currentVendor?.standard_meal_payout === 'number' && currentVendor.standard_meal_payout > 0) {
    standardPayout = currentVendor.standard_meal_payout;
    isComponentBased = true;
  } else if (typeof currentVendor?.vendor_cost_per_meal === 'number' && currentVendor.vendor_cost_per_meal > 0) {
    standardPayout = currentVendor.vendor_cost_per_meal;
    isComponentBased = true;
  } else if (hasCustomRates && standardComponentCost > 0) {
    standardPayout = standardComponentCost;
    isComponentBased = true;
  } else {
    const standardRawCost = 30;
    standardPayout = (standardRawCost / (100 - safeMargin)) * 100;
  }

  const formattedPayout = standardPayout.toFixed(2);

  const hasVeg = !currentVendor?.dietary_categories || currentVendor.dietary_categories.includes('veg');
  const hasNonVeg = currentVendor?.dietary_categories?.includes('non_veg');

  const vegRates = {
    onetime: currentVendor?.rate_veg_onetime || currentVendor?.rate_onetime || 0,
    lunch_weekly: currentVendor?.rate_veg_lunch_weekly || currentVendor?.rate_lunch_weekly || 0,
    lunch_monthly: currentVendor?.rate_veg_lunch_monthly || currentVendor?.rate_lunch_monthly || 0,
    dinner_weekly: currentVendor?.rate_veg_dinner_weekly || currentVendor?.rate_dinner_weekly || 0,
    dinner_monthly: currentVendor?.rate_veg_dinner_monthly || currentVendor?.rate_dinner_monthly || 0,
    both_weekly: currentVendor?.rate_veg_both_weekly || currentVendor?.rate_both_weekly || 0,
    both_monthly: currentVendor?.rate_veg_both_monthly || currentVendor?.rate_both_monthly || 0,
  };

  const nonVegRates = {
    onetime: currentVendor?.rate_nonveg_onetime || 0,
    lunch_weekly: currentVendor?.rate_nonveg_lunch_weekly || 0,
    lunch_monthly: currentVendor?.rate_nonveg_lunch_monthly || 0,
    dinner_weekly: currentVendor?.rate_nonveg_dinner_weekly || 0,
    dinner_monthly: currentVendor?.rate_nonveg_dinner_monthly || 0,
    both_weekly: currentVendor?.rate_nonveg_both_weekly || 0,
    both_monthly: currentVendor?.rate_nonveg_both_monthly || 0,
  };

  const activeAddons = (currentVendor?.addons || []).filter((a: any) => a.active);

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

      {/* Dynamic Algorithmic Kitchen Payout Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent rounded-2xl p-4 sm:p-5 border border-emerald-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm shrink-0 mt-0.5 sm:mt-0">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-slate-900">Standard Meal Kitchen Payout</h4>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                isComponentBased
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}>
                {isComponentBased ? 'Approved Component Rates Active' : `${vendorMarginPct}% kitchen margin included`}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              {isComponentBased
                ? 'Calculated from approved kitchen component rates (4× Roti + 1× Rice + 1× Sabzi + 1× Dal) • Net automated vendor payout.'
                : `Base raw kitchen cost: ₹${standardRawCost}.00 • Net automated vendor payout calculated via dynamic pricing algorithm.`}
            </p>
          </div>
        </div>

        <div className="shrink-0 bg-white px-4 py-2.5 rounded-xl border border-emerald-200/80 text-left sm:text-right shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Your Payout</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-black text-emerald-700">₹{formattedPayout}</span>
            <span className="text-xs font-bold text-slate-500">/ meal</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
            {isComponentBased
              ? `₹${formattedPayout} / meal standard payout`
              : `₹${formattedPayout} / meal payout • ${vendorMarginPct}% kitchen margin included`}
          </span>
        </div>
      </div>

      {/* Itemized Meal Components Rate Card */}
      {hasCustomRates && (
        <div className="bg-amber-50/30 rounded-2xl p-4 border border-amber-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                Kitchen Meal Components & Approved Rates
              </span>
            </div>
            <span className="text-[10px] font-bold bg-white text-amber-800 px-2 py-0.5 rounded-lg border border-amber-100 shadow-2xs">
              Live Override Rates
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {DEFAULT_MEAL_COMPONENTS.map((comp) => {
              const override = customRates[comp.id];
              let rate = comp.vendorRate ?? 0;
              let isOverridden = false;
              if (typeof override === 'number') {
                rate = override;
                isOverridden = true;
              } else if (override && typeof override.vendorRate === 'number') {
                rate = override.vendorRate;
                isOverridden = true;
              }

              return (
                <div
                  key={comp.id}
                  className={`p-2.5 rounded-xl border text-center ${
                    isOverridden
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-white border-slate-100'
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-700 block truncate">{comp.name}</span>
                  <span className="text-xs font-black text-slate-900 block mt-0.5">
                    ₹{rate.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium block">
                    {comp.baseQuantity > 0 ? `Base: ${comp.baseQuantity}` : 'Add-on'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vegetarian Rates */}
      {hasVeg && (
        <div className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VegIcon size={16} />
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

      {/* Non-Vegetarian Rates */}
      {hasNonVeg && (
        <div className="bg-rose-50/30 rounded-2xl p-4 border border-rose-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NonVegIcon size={16} />
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
            {activeAddons.map((addon: any) => (
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
