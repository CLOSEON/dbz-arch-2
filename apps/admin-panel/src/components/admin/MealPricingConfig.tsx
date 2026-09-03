'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IndianRupee,
  Save,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarRange,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
  Calculator,
  ShieldCheck,
} from 'lucide-react';
import {
  getAllPricingConfigs,
  savePricingConfig,
  DEFAULT_WEEKLY_PRICING,
  DEFAULT_MONTHLY_PRICING,
} from '@/lib/queries/pricing';
import type { MealPricingConfig as MealPricingConfigData, PlanPricingType } from '@/types';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { triggerHapticImpact, triggerHapticSelection, ImpactStyle } from '@/lib/haptics';
import { formatDate } from '@/lib/utils';

interface MealPricingConfigProps {
  onSaved?: (type: PlanPricingType, updated: MealPricingConfigData) => void;
  className?: string;
}

export function MealPricingConfig({ onSaved, className = '' }: MealPricingConfigProps) {
  const addToast = useUiStore((s) => s.addToast);
  const user = useAuthStore((s) => s.user);

  // Firestore Saved Configurations
  const [weeklyConfig, setWeeklyConfig] = useState<MealPricingConfigData>(DEFAULT_WEEKLY_PRICING);
  const [monthlyConfig, setMonthlyConfig] = useState<MealPricingConfigData>(DEFAULT_MONTHLY_PRICING);
  const [loading, setLoading] = useState(true);

  // Editable Form Inputs (strings for smooth typing)
  const [weeklyPrice, setWeeklyPrice] = useState<string>('50');
  const [weeklyVendorCost, setWeeklyVendorCost] = useState<string>('30');

  const [monthlyPrice, setMonthlyPrice] = useState<string>('1400');
  const [monthlyVendorCost, setMonthlyVendorCost] = useState<string>('900');

  // Interactive Meal Multiplier for weekly calculation preview
  const [previewMealsPerWeek, setPreviewMealsPerWeek] = useState<number>(9);

  // Saving states
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingMonthly, setSavingMonthly] = useState(false);

  // Load live pricing configs from Firestore
  const loadPricing = useCallback(async () => {
    setLoading(true);
    try {
      const { weekly, monthly } = await getAllPricingConfigs();
      setWeeklyConfig(weekly);
      setMonthlyConfig(monthly);

      setWeeklyPrice(String(weekly.pricePerMeal ?? 50));
      setWeeklyVendorCost(String(weekly.vendorCostPerMeal ?? 30));

      setMonthlyPrice(String(monthly.pricePerMeal ?? 1400));
      setMonthlyVendorCost(String(monthly.vendorCostPerMeal ?? 900));
    } catch (err) {
      console.error('[MealPricingConfig] Error loading pricing config:', err);
      addToast('Failed to load meal pricing configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  // ─── Parsed Numeric Values & Margins ──────────────────────────────────────────
  const parsedWeeklyPrice = Math.max(0, Number(weeklyPrice) || 0);
  const parsedWeeklyVendorCost = Math.max(0, Number(weeklyVendorCost) || 0);
  const weeklyMargin = Math.round((parsedWeeklyPrice - parsedWeeklyVendorCost) * 100) / 100;
  const weeklyMarginPercent =
    parsedWeeklyPrice > 0 ? ((weeklyMargin / parsedWeeklyPrice) * 100).toFixed(1) : '0';

  const parsedMonthlyPrice = Math.max(0, Number(monthlyPrice) || 0);
  const parsedMonthlyVendorCost = Math.max(0, Number(monthlyVendorCost) || 0);
  const monthlyMargin = Math.round((parsedMonthlyPrice - parsedMonthlyVendorCost) * 100) / 100;
  const monthlyMarginPercent =
    parsedMonthlyPrice > 0 ? ((monthlyMargin / parsedMonthlyPrice) * 100).toFixed(1) : '0';

  // ─── Change Detection ───────────────────────────────────────────────────────
  const isWeeklyChanged = useMemo(() => {
    return (
      parsedWeeklyPrice !== weeklyConfig.pricePerMeal ||
      parsedWeeklyVendorCost !== weeklyConfig.vendorCostPerMeal
    );
  }, [parsedWeeklyPrice, parsedWeeklyVendorCost, weeklyConfig]);

  const isMonthlyChanged = useMemo(() => {
    return (
      parsedMonthlyPrice !== monthlyConfig.pricePerMeal ||
      parsedMonthlyVendorCost !== monthlyConfig.vendorCostPerMeal
    );
  }, [parsedMonthlyPrice, parsedMonthlyVendorCost, monthlyConfig]);

  // ─── Save Handlers ─────────────────────────────────────────────────────────
  const handleSaveWeekly = async () => {
    if (parsedWeeklyPrice <= 0) {
      addToast('Weekly price per meal must be greater than ₹0', 'error');
      return;
    }
    setSavingWeekly(true);
    triggerHapticImpact(ImpactStyle.Light);
    try {
      const updatedBy = user?.id || user?.email || 'admin';
      const updated = await savePricingConfig(
        'weekly',
        parsedWeeklyPrice,
        parsedWeeklyVendorCost,
        updatedBy
      );
      setWeeklyConfig(updated);
      addToast(`Weekly pricing saved: ₹${updated.pricePerMeal}/meal (Margin: ₹${updated.margin})`, 'success');
      onSaved?.('weekly', updated);
    } catch (err: any) {
      console.error('[MealPricingConfig] Error saving weekly pricing:', err);
      addToast(err?.message || 'Failed to save weekly pricing', 'error');
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleSaveMonthly = async () => {
    if (parsedMonthlyPrice <= 0) {
      addToast('Monthly price per meal must be greater than ₹0', 'error');
      return;
    }
    setSavingMonthly(true);
    triggerHapticImpact(ImpactStyle.Light);
    try {
      const updatedBy = user?.id || user?.email || 'admin';
      const updated = await savePricingConfig(
        'monthly',
        parsedMonthlyPrice,
        parsedMonthlyVendorCost,
        updatedBy
      );
      setMonthlyConfig(updated);
      addToast(`Monthly pricing saved: ₹${updated.pricePerMeal}/meal (Margin: ₹${updated.margin})`, 'success');
      onSaved?.('monthly', updated);
    } catch (err: any) {
      console.error('[MealPricingConfig] Error saving monthly pricing:', err);
      addToast(err?.message || 'Failed to save monthly pricing', 'error');
    } finally {
      setSavingMonthly(false);
    }
  };

  // Helper to format timestamps gracefully
  const renderTimestamp = (ts?: any) => {
    if (!ts) return null;
    try {
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return formatDate(date);
    } catch {
      return null;
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-brand">
            <IndianRupee className="w-6 h-6" strokeWidth={2.4} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                Meal Pricing Configuration
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure base customer rates, kitchen vendor costs, and live profit margins on-the-fly.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadPricing()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Rates</span>
        </button>
      </div>

      {/* ── Main Two-Column Pricing Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ══════════════════════════════════════════════════════════════
            CARD 1: WEEKLY PLANS PRICING
        ══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200/85 shadow-xs p-5 sm:p-6 transition-all hover:border-slate-300">
          <div className="space-y-5">
            {/* Title & Plan Badge */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-brand font-black">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Weekly Plans
                  </h3>
                  <span className="text-[11px] font-medium text-slate-400">
                    Flexible recurring weekly tiffins
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isWeeklyChanged && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    Unsaved Edits
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-orange-50 text-brand border border-orange-200">
                  Weekly
                </span>
              </div>
            </div>

            {/* Inputs Group */}
            <div className="space-y-4">
              {/* 1. Price Per Meal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Price per meal (₹)
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    — Single input field (e.g. ₹50/meal)
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={weeklyPrice}
                    onChange={(e) => setWeeklyPrice(e.target.value)}
                    placeholder="50"
                    className="w-full pl-8 pr-16 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 font-extrabold text-base focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none transition-all"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs font-semibold text-slate-400">
                    / meal
                  </div>
                </div>
              </div>

              {/* 2. Vendor Cost Per Meal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Vendor cost per meal (₹)
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    — for margin calculation (e.g. ₹30/meal)
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={weeklyVendorCost}
                    onChange={(e) => setWeeklyVendorCost(e.target.value)}
                    placeholder="30"
                    className="w-full pl-8 pr-16 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 font-extrabold text-base focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/10 outline-none transition-all"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs font-semibold text-slate-400">
                    / meal
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Profit Margin Display */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                weeklyMargin >= 0
                  ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {weeklyMargin >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Profit Margin per meal
                  </span>
                </div>
                <span
                  className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                    weeklyMargin >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {weeklyMarginPercent}%
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black tracking-tight">
                  ₹{weeklyMargin}
                  <span className="text-xs font-semibold text-slate-500 ml-1">
                    profit / meal
                  </span>
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  ₹{parsedWeeklyPrice} − ₹{parsedWeeklyVendorCost}
                </span>
              </div>
            </div>

            {/* 4. Live Calculation Output Pill (Mandatory User Requirement) */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                  <Calculator className="w-4 h-4 text-amber-700" />
                  <span>Calculation Preview:</span>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800">
                  <span>Meals:</span>
                  <select
                    value={previewMealsPerWeek}
                    onChange={(e) => setPreviewMealsPerWeek(Number(e.target.value))}
                    className="bg-white border border-amber-300 rounded px-1.5 py-0.5 font-black text-xs text-amber-950 outline-none"
                  >
                    {[5, 7, 9, 12, 14].map((m) => (
                      <option key={m} value={m}>
                        {m} meals/week
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exact required text format */}
              <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200/60">
                <p className="text-xs font-black text-slate-800">
                  If customer orders {previewMealsPerWeek} meals/week, total:{' '}
                  <span className="text-brand font-black text-sm">
                    ₹{previewMealsPerWeek * parsedWeeklyPrice}
                  </span>
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-1 flex items-center justify-between">
                  <span>Vendor payout: ₹{previewMealsPerWeek * parsedWeeklyVendorCost}</span>
                  <span className="text-emerald-700 font-bold">
                    Dabzzo gross profit: ₹{previewMealsPerWeek * weeklyMargin}
                  </span>
                </p>
              </div>
            </div>

            {/* Current Pricing in Database */}
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700">Database Rate:</span>{' '}
                ₹{weeklyConfig.pricePerMeal}/meal • Vendor: ₹{weeklyConfig.vendorCostPerMeal}
              </div>
              {weeklyConfig.updatedAt && (
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{renderTimestamp(weeklyConfig.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveWeekly}
              disabled={savingWeekly || !isWeeklyChanged}
              className={`w-full py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-xs ${
                isWeeklyChanged
                  ? 'bg-brand hover:bg-amber-600 text-white shadow-brand/20'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {savingWeekly ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Weekly Pricing…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Weekly Pricing</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            CARD 2: MONTHLY PLANS PRICING
        ══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200/85 shadow-xs p-5 sm:p-6 transition-all hover:border-slate-300">
          <div className="space-y-5">
            {/* Title & Plan Badge */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-black">
                  <CalendarRange className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Monthly Plans
                  </h3>
                  <span className="text-[11px] font-medium text-slate-400">
                    Full calendar month committed subscriptions
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isMonthlyChanged && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    Unsaved Edits
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Monthly
                </span>
              </div>
            </div>

            {/* Inputs Group */}
            <div className="space-y-4">
              {/* 1. Price Per Meal / Rate */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Price per meal (₹)
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    — Monthly rate (e.g. ₹1400/meal)
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                    placeholder="1400"
                    className="w-full pl-8 pr-16 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 font-extrabold text-base focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs font-semibold text-slate-400">
                    / meal
                  </div>
                </div>
              </div>

              {/* 2. Vendor Cost Per Meal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Vendor cost per meal (₹)
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    — for margin calculation (e.g. ₹900/meal)
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={monthlyVendorCost}
                    onChange={(e) => setMonthlyVendorCost(e.target.value)}
                    placeholder="900"
                    className="w-full pl-8 pr-16 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 font-extrabold text-base focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs font-semibold text-slate-400">
                    / meal
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Profit Margin Display */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                monthlyMargin >= 0
                  ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {monthlyMargin >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Profit Margin per meal
                  </span>
                </div>
                <span
                  className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                    monthlyMargin >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {monthlyMarginPercent}%
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black tracking-tight">
                  ₹{monthlyMargin}
                  <span className="text-xs font-semibold text-slate-500 ml-1">
                    profit / meal
                  </span>
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  ₹{parsedMonthlyPrice} − ₹{parsedMonthlyVendorCost}
                </span>
              </div>
            </div>

            {/* 4. Live Calculation Output Pill (Mandatory User Requirement) */}
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/70 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-900">
                  <Calculator className="w-4 h-4 text-indigo-700" />
                  <span>Calculation Preview:</span>
                </div>
                <span className="text-[11px] font-bold text-indigo-600">Standard 9 meals/week</span>
              </div>

              {/* Exact required text format */}
              <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-200/60">
                <p className="text-xs font-black text-slate-800">
                  If customer orders 9 meals/week, total:{' '}
                  <span className="text-indigo-700 font-black text-sm">
                    ₹{9 * parsedMonthlyPrice}
                  </span>
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-1 flex items-center justify-between">
                  <span>Vendor payout: ₹{9 * parsedMonthlyVendorCost}</span>
                  <span className="text-emerald-700 font-bold">
                    Dabzzo gross profit: ₹{9 * monthlyMargin}
                  </span>
                </p>
              </div>
            </div>

            {/* Current Pricing in Database */}
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700">Database Rate:</span>{' '}
                ₹{monthlyConfig.pricePerMeal}/meal • Vendor: ₹{monthlyConfig.vendorCostPerMeal}
              </div>
              {monthlyConfig.updatedAt && (
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{renderTimestamp(monthlyConfig.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveMonthly}
              disabled={savingMonthly || !isMonthlyChanged}
              className={`w-full py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-xs ${
                isMonthlyChanged
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {savingMonthly ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Monthly Pricing…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Monthly Pricing</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
