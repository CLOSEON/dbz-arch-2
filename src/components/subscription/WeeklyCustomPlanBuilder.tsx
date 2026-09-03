'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Utensils,
  Sparkles,
  RotateCcw,
  CreditCard,
  Check,
  ChevronRight,
  ShieldCheck,
  Info,
  Clock,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { getPricingConfig, DEFAULT_WEEKLY_PRICING } from '@/lib/queries/pricing';
import { calculateCustomPlanPrice } from '@/lib/pricing';
import { CustomPlanCheckoutModal } from './CustomPlanCheckoutModal';
import { cn } from '@/lib/utils';

export type MealCount = 0 | 1 | 2; // 0 = Skip, 1 = 1 Meal, 2 = 2 Meals

export interface DayPlanInfo {
  id: string; // 'mon', 'tue', ...
  dayName: string; // 'Monday', 'Tuesday', ...
  shortDay: string; // 'Mon', 'Tue', ...
  dateStr: string; // 'Monday, 3 Sept'
  date: Date;
}

export interface DaySelection extends DayPlanInfo {
  meals: MealCount;
}

export interface PlanBuilderResult {
  selections: DaySelection[];
  totalMeals: number;
  pricePerMeal: number;
  weeklyTotal: number;
}

export interface WeeklyCustomPlanBuilderProps {
  /**
   * Optional initial price per meal. Overridden once getPricingConfig("weekly") resolves.
   */
  initialPricePerMeal?: number;
  /**
   * Reference start date for the week (defaults to Monday of current week).
   */
  startDate?: Date;
  /**
   * Pre-selected meal counts for each day by id (e.g. { mon: 1, tue: 2 }).
   */
  initialSelections?: Partial<Record<string, MealCount>>;
  /**
   * Callback fired immediately whenever any day's meal count changes.
   */
  onPlanChange?: (result: PlanBuilderResult) => void;
  /**
   * Callback fired when the user clicks [Confirm & Checkout].
   */
  onConfirmCheckout?: (result: PlanBuilderResult) => void;
  /**
   * Callback fired when [Reset] is clicked.
   */
  onReset?: () => void;
  /**
   * Additional wrapper CSS class names.
   */
  className?: string;
  /**
   * Whether to hide the top heading/subtitle (useful if rendered inside an existing modal).
   */
  hideHeader?: boolean;
}

/**
 * Calculates 7 days (Mon-Sun) starting from the Monday of the given reference date.
 */
export function getWeekDays(referenceDate?: Date): DayPlanInfo[] {
  const base = referenceDate ? new Date(referenceDate) : new Date();
  const dayOfWeek = base.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const shortDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ids = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  return ids.map((id, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const dayNum = d.getDate();
    // Use 'Sept' for September to match "Monday, 3 Sept" format specification
    const monthStr = d.getMonth() === 8 ? 'Sept' : d.toLocaleDateString('en-US', { month: 'short' });

    return {
      id,
      dayName: dayNames[index],
      shortDay: shortDays[index],
      dateStr: `${dayNames[index]}, ${dayNum} ${monthStr}`,
      date: d,
    };
  });
}

export function WeeklyCustomPlanBuilder({
  initialPricePerMeal,
  startDate,
  initialSelections,
  onPlanChange,
  onConfirmCheckout,
  onReset,
  className,
  hideHeader = false,
}: WeeklyCustomPlanBuilderProps) {
  const weekDays = useMemo(() => getWeekDays(startDate), [startDate]);

  // Selections state: map day id ('mon'..'sun') to 0 (Skip), 1, or 2 meals
  const [selections, setSelections] = useState<Record<string, MealCount>>(() => {
    const initial: Record<string, MealCount> = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };
    if (initialSelections) {
      Object.entries(initialSelections).forEach(([k, v]) => {
        if (v !== undefined) initial[k] = v;
      });
    }
    return initial;
  });

  const [pricePerMeal, setPricePerMeal] = useState<number>(
    initialPricePerMeal ?? DEFAULT_WEEKLY_PRICING.pricePerMeal ?? 50
  );
  const [isLoadingPricing, setIsLoadingPricing] = useState<boolean>(true);
  const [checkoutWarning, setCheckoutWarning] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState<boolean>(false);

  // Fetch current pricePerMeal on load using getPricingConfig("weekly")
  useEffect(() => {
    let isMounted = true;
    async function loadPricing() {
      try {
        setIsLoadingPricing(true);
        const config = await getPricingConfig('weekly');
        if (isMounted && config && typeof config.pricePerMeal === 'number') {
          setPricePerMeal(config.pricePerMeal);
        }
      } catch (err) {
        console.warn('[WeeklyCustomPlanBuilder] Failed to fetch weekly pricing, using fallback:', err);
        if (isMounted) {
          setPricePerMeal(initialPricePerMeal ?? DEFAULT_WEEKLY_PRICING.pricePerMeal ?? 50);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPricing(false);
        }
      }
    }

    loadPricing();
    return () => {
      isMounted = false;
    };
  }, [initialPricePerMeal]);

  // Real-time calculation: Total meals count and Weekly total price using calculateCustomPlanPrice
  const { totalMeals, totalPrice: weeklyTotal } = useMemo(() => {
    return calculateCustomPlanPrice('weekly', selections, pricePerMeal);
  }, [selections, pricePerMeal]);

  // Notify parent component whenever selections or pricing change
  useEffect(() => {
    if (onPlanChange) {
      const fullSelections: DaySelection[] = weekDays.map((day) => ({
        ...day,
        meals: selections[day.id] || 0,
      }));
      onPlanChange({
        selections: fullSelections,
        totalMeals,
        pricePerMeal,
        weeklyTotal,
      });
    }
  }, [selections, totalMeals, pricePerMeal, weeklyTotal, weekDays, onPlanChange]);

  // Handlers for day buttons
  const handleToggle1Meal = useCallback((dayId: string) => {
    setCheckoutWarning(null);
    setSelections((prev) => ({
      ...prev,
      [dayId]: prev[dayId] === 1 ? 0 : 1,
    }));
  }, []);

  const handleToggle2Meals = useCallback((dayId: string) => {
    setCheckoutWarning(null);
    setSelections((prev) => ({
      ...prev,
      [dayId]: prev[dayId] === 2 ? 0 : 2,
    }));
  }, []);

  const handleSkip = useCallback((dayId: string) => {
    setCheckoutWarning(null);
    setSelections((prev) => ({
      ...prev,
      [dayId]: 0,
    }));
  }, []);

  // Quick preset actions
  const handleSelectWorkdays = useCallback(() => {
    setCheckoutWarning(null);
    setSelections({
      mon: 1,
      tue: 1,
      wed: 1,
      thu: 1,
      fri: 1,
      sat: 0,
      sun: 0,
    });
  }, []);

  const handleSelectAll1Meal = useCallback(() => {
    setCheckoutWarning(null);
    setSelections({
      mon: 1,
      tue: 1,
      wed: 1,
      thu: 1,
      fri: 1,
      sat: 1,
      sun: 1,
    });
  }, []);

  const handleSelectAll2Meals = useCallback(() => {
    setCheckoutWarning(null);
    setSelections({
      mon: 2,
      tue: 2,
      wed: 2,
      thu: 2,
      fri: 2,
      sat: 2,
      sun: 2,
    });
  }, []);

  // Bottom action: Reset
  const handleReset = useCallback(() => {
    setCheckoutWarning(null);
    setSelections({
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    });
    if (onReset) onReset();
  }, [onReset]);

  // Bottom action: Confirm & Checkout
  const handleConfirmCheckout = useCallback(() => {
    if (totalMeals === 0) {
      setCheckoutWarning('Please select at least 1 meal for the week to proceed.');
      return;
    }

    setCheckoutWarning(null);
    const fullSelections: DaySelection[] = weekDays.map((day) => ({
      ...day,
      meals: selections[day.id] || 0,
    }));

    const result: PlanBuilderResult = {
      selections: fullSelections,
      totalMeals,
      pricePerMeal,
      weeklyTotal,
    };

    if (onConfirmCheckout) {
      onConfirmCheckout(result);
    } else {
      setShowConfirmationModal(true);
    }
  }, [totalMeals, weekDays, selections, pricePerMeal, weeklyTotal, onConfirmCheckout]);

  return (
    <div
      className={cn(
        'w-full max-w-xl mx-auto rounded-3xl bg-white/95 backdrop-blur-md border border-amber-100/80 shadow-xl shadow-amber-900/5 p-4 sm:p-6 md:p-8 transition-all',
        className
      )}
    >
      {/* ── Heading & Subtitle ────────────────────────────────────────────── */}
      {!hideHeader && (
        <div className="mb-6 text-left sm:text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-bold tracking-wide uppercase mb-2">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            Flexible Subscription
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Customize Your Weekly Plan
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-1 font-medium">
            Select 1 or 2 meals for each day
          </p>
        </div>
      )}

      {/* ── Quick Presets ─────────────────────────────────────────────────── */}
      <div className="mb-5 pb-3 border-b border-slate-100 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max text-xs">
          <span className="text-slate-600 font-semibold mr-1">Quick Select:</span>
          <button
            type="button"
            onClick={handleSelectWorkdays}
            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold border border-amber-200/60 transition-colors active:scale-95"
          >
            Mon–Fri (1 Meal)
          </button>
          <button
            type="button"
            onClick={handleSelectAll1Meal}
            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 transition-colors active:scale-95"
          >
            All 7 Days (1 Meal)
          </button>
          <button
            type="button"
            onClick={handleSelectAll2Meals}
            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 transition-colors active:scale-95"
          >
            All 7 Days (2 Meals)
          </button>
        </div>
      </div>

      {/* ── 7 Day Buttons (Mon-Sun) ────────────────────────────────────────── */}
      <div className="space-y-3 mb-6" role="group" aria-label="7 Day Meal Selection">
        {weekDays.map((day, index) => {
          const selectedMeal = selections[day.id] || 0;
          const isSelected = selectedMeal > 0;
          const is1Meal = selectedMeal === 1;
          const is2Meals = selectedMeal === 2;
          const isSkipped = selectedMeal === 0;

          return (
            <motion.div
              key={day.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              className={cn(
                'relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border transition-all duration-200',
                isSelected
                  ? is2Meals
                    ? 'bg-gradient-to-r from-amber-500/10 via-amber-50/60 to-orange-500/10 border-amber-400 ring-2 ring-amber-400/30 shadow-sm'
                    : 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300/40 shadow-sm'
                  : 'bg-white/80 border-slate-200 hover:border-slate-300'
              )}
            >
              {/* Day Name + Date */}
              <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-[160px]">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-base font-bold tracking-tight transition-colors',
                        isSelected ? 'text-slate-900' : 'text-slate-700'
                      )}
                    >
                      {day.dateStr}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {day.dayName}
                  </span>
                </div>

                {/* Mobile status pill indicator */}
                <div className="sm:hidden">
                  {is1Meal && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                      <Utensils className="w-2.5 h-2.5" /> 1 Meal
                    </span>
                  )}
                  {is2Meals && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-200">
                      <Sparkles className="w-2.5 h-2.5" /> 2 Meals
                    </span>
                  )}
                  {isSkipped && (
                    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      Skipped
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: [1 Meal] [2 Meals] [Skip] */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* [1 Meal] Toggle Button */}
                <button
                  type="button"
                  onClick={() => handleToggle1Meal(day.id)}
                  aria-pressed={is1Meal}
                  className={cn(
                    'flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 select-none',
                    is1Meal
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400 font-extrabold'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-amber-300 hover:bg-amber-50/60'
                  )}
                >
                  <Utensils className={cn('w-3.5 h-3.5', is1Meal ? 'text-white' : 'text-slate-600')} />
                  1 Meal
                </button>

                {/* [2 Meals] Toggle Button */}
                <button
                  type="button"
                  onClick={() => handleToggle2Meals(day.id)}
                  aria-pressed={is2Meals}
                  className={cn(
                    'flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 select-none',
                    is2Meals
                      ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-md shadow-orange-500/30 ring-2 ring-orange-400 font-extrabold'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-orange-300 hover:bg-orange-50/60'
                  )}
                >
                  <Sparkles className={cn('w-3.5 h-3.5', is2Meals ? 'text-white' : 'text-slate-600')} />
                  2 Meals
                </button>

                {/* [Skip] Option (Light Gray) */}
                <button
                  type="button"
                  onClick={() => handleSkip(day.id)}
                  aria-pressed={isSkipped}
                  title="Skip this day"
                  className={cn(
                    'min-h-[40px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 active:scale-95 select-none',
                    isSkipped
                      ? 'bg-slate-200 text-slate-700 font-bold border border-slate-300 shadow-inner'
                      : 'bg-slate-50 text-slate-600 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
                  )}
                >
                  Skip
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Real-time Calculation Below ───────────────────────────────────── */}
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-amber-100/40 border border-amber-200/80 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200/60">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Live Price Breakdown
          </span>
          {isLoadingPricing && (
            <span className="text-[11px] font-medium text-amber-700 animate-pulse">
              Updating rates...
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {/* Total meals this week: {count} */}
          <div className="flex items-center justify-between text-sm sm:text-base text-slate-700">
            <span className="font-medium">Total meals this week:</span>
            <span className="font-bold text-slate-900 text-base sm:text-lg">
              {totalMeals}
            </span>
          </div>

          {/* Price per meal: ₹{pricePerMeal} */}
          <div className="flex items-center justify-between text-sm sm:text-base text-slate-700">
            <span className="font-medium">Price per meal:</span>
            <span className="font-semibold text-slate-900">
              ₹{pricePerMeal}
            </span>
          </div>

          {/* Weekly total: ₹{total} (in bold, larger font) */}
          <div className="pt-3 border-t border-amber-200/70 flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-slate-900">
              Weekly total:
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-800 tracking-tight">
              ₹{weeklyTotal}
            </span>
          </div>
        </div>

        {totalMeals === 0 && (
          <p className="text-xs text-amber-700/80 mt-3 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Pick meals for any days of the week to calculate your customized price.
          </p>
        )}
      </div>

      {/* Warning message if checkout attempted with 0 meals */}
      <AnimatePresence>
        {checkoutWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{checkoutWarning}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Buttons at Bottom ──────────────────────────────────────────────── */}
      <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
        {/* [Reset] Button */}
        <button
          type="button"
          onClick={handleReset}
          className="w-full sm:w-auto px-5 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-sm transition-all duration-150 flex items-center justify-center gap-2 active:scale-95 shadow-sm"
        >
          <RotateCcw className="w-4 h-4 text-slate-500" />
          Reset
        </button>

        {/* [Confirm & Checkout] Button */}
        <button
          type="button"
          onClick={handleConfirmCheckout}
          className={cn(
            'w-full sm:flex-1 py-3.5 px-6 rounded-xl font-black text-sm sm:text-base transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg',
            totalMeals > 0
              ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-amber-500/25 cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          )}
        >
          <span>Confirm & Checkout</span>
          {totalMeals > 0 && <span className="font-normal opacity-90">• ₹{weeklyTotal}</span>}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Built-in Custom Plan Checkout Screen & Payment Gateway ──────────── */}
      <CustomPlanCheckoutModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        customPlanData={{
          planType: 'weekly',
          totalPrice: weeklyTotal,
          pattern: selections,
          totalMeals,
          pricePerMeal,
          planStartDate: weekDays[0]?.date || new Date(),
        }}
      />
    </div>
  );
}

export default WeeklyCustomPlanBuilder;
