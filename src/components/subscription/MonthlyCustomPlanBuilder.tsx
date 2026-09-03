'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Utensils,
  Sparkles,
  RotateCcw,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Info,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { getPricingConfig, DEFAULT_MONTHLY_PRICING } from '@/lib/queries/pricing';
import { calculateCustomPlanPrice } from '@/lib/pricing';
import { getUserSubscriptions } from '@/lib/queries/subscriptions';
import { CustomPlanCheckoutModal } from './CustomPlanCheckoutModal';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import type { Subscription } from '@/types';

export type MealCount = 0 | 1 | 2; // 0 = Skip, 1 = 1 Meal, 2 = 2 Meals

export interface MonthlyPlanDateSelection {
  dateKey: string; // 'YYYY-MM-DD'
  dayNumber: number; // 1..31
  dayOfWeek: string; // 'Monday', 'Tuesday', ...
  date: Date;
  meals: MealCount;
  isToday: boolean;
}

export interface MonthlyPlanBuilderResult {
  year: number;
  month: number; // 0-indexed (0=Jan, 8=Sept)
  monthName: string; // e.g. 'September'
  selections: Record<string, MealCount>;
  dateDetails: MonthlyPlanDateSelection[];
  totalMeals: number;
  pricePerMeal: number;
  monthlyTotal: number;
}

export interface MonthlyCustomPlanBuilderProps {
  /**
   * Optional initial price per meal. Overridden once getPricingConfig("monthly") resolves.
   */
  initialPricePerMeal?: number;
  /**
   * Initial Year (defaults to current year).
   */
  initialYear?: number;
  /**
   * Initial Month (0-indexed, defaults to current month).
   */
  initialMonth?: number;
  /**
   * Pre-selected meal counts by dateKey ('YYYY-MM-DD').
   */
  initialSelections?: Record<string, MealCount>;
  /**
   * Callback fired whenever any date's meal selection changes.
   */
  onPlanChange?: (result: MonthlyPlanBuilderResult) => void;
  /**
   * Callback fired when [Confirm & Checkout] is clicked.
   */
  onConfirmCheckout?: (result: MonthlyPlanBuilderResult) => void;
  /**
   * Callback fired when [Reset] is clicked.
   */
  onReset?: () => void;
  /**
   * Additional wrapper CSS class names.
   */
  className?: string;
  /**
   * Whether to hide the top heading/subtitle.
   */
  hideHeader?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function MonthlyCustomPlanBuilder({
  initialPricePerMeal,
  initialYear,
  initialMonth,
  initialSelections,
  onPlanChange,
  onConfirmCheckout,
  onReset,
  className,
  hideHeader = false,
}: MonthlyCustomPlanBuilderProps) {
  const user = useAuthStore((s) => s.user);

  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(() => initialYear ?? today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => initialMonth ?? today.getMonth());

  // Meal selections keyed by 'YYYY-MM-DD'
  const [selections, setSelections] = useState<Record<string, MealCount>>(() => {
    return initialSelections ? { ...initialSelections } : {};
  });

  const [pricePerMeal, setPricePerMeal] = useState<number>(
    initialPricePerMeal ?? DEFAULT_MONTHLY_PRICING.pricePerMeal ?? 50
  );
  const [isLoadingPricing, setIsLoadingPricing] = useState<boolean>(true);
  const [existingPlanLoaded, setExistingPlanLoaded] = useState<string | null>(null);
  const [checkoutWarning, setCheckoutWarning] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState<boolean>(false);

  // 1. Fetch current pricePerMeal on load using getPricingConfig("monthly")
  useEffect(() => {
    let isMounted = true;
    async function loadMonthlyPricing() {
      try {
        setIsLoadingPricing(true);
        const config = await getPricingConfig('monthly');
        if (isMounted && config && typeof config.pricePerMeal === 'number') {
          // If pricePerMeal is configured as a package price (e.g. 1400 for 28 meals ~ 50/meal)
          // or direct per-meal price, normalize appropriately
          const resolvedPrice = config.pricePerMeal > 300 
            ? Math.round(config.pricePerMeal / 28) 
            : config.pricePerMeal;
          setPricePerMeal(resolvedPrice || 50);
        }
      } catch (err) {
        console.warn('[MonthlyCustomPlanBuilder] Failed to fetch monthly pricing:', err);
        if (isMounted) {
          setPricePerMeal(initialPricePerMeal ?? 50);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPricing(false);
        }
      }
    }

    loadMonthlyPricing();
    return () => {
      isMounted = false;
    };
  }, [initialPricePerMeal]);

  // 2. Pre-populate if user has existing monthly plan (show their current selections)
  useEffect(() => {
    if (initialSelections && Object.keys(initialSelections).length > 0) {
      return; // Already initialized by caller
    }

    let isMounted = true;
    async function checkExistingMonthlySubscription() {
      if (!user?.id) return;

      try {
        const subs: Subscription[] = await getUserSubscriptions(user.id);
        const activeMonthly = subs.find(
          (s) => s.status === 'active' && s.frequency === 'monthly'
        );

        if (!activeMonthly || !isMounted) return;

        // Check if existing subscription has custom schedule saved
        const customSchedule = (activeMonthly as any).custom_schedule as Record<string, MealCount> | undefined;
        const populated: Record<string, MealCount> = {};

        const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        if (customSchedule && Object.keys(customSchedule).length > 0) {
          Object.entries(customSchedule).forEach(([k, v]) => {
            populated[k] = v;
          });
          setExistingPlanLoaded('Loaded custom selections from your active monthly plan');
        } else {
          // If standard monthly subscription, pre-populate days based on meal_type
          const defaultMeals: MealCount = activeMonthly.meal_type === 'both' ? 2 : 1;
          for (let d = 1; d <= daysInCurrentMonth; d++) {
            const key = formatDateKey(currentYear, currentMonth, d);
            populated[key] = defaultMeals;
          }
          setExistingPlanLoaded(
            `Pre-populated ${defaultMeals === 2 ? '2 Meals/day' : '1 Meal/day'} from your active monthly subscription`
          );
        }

        setSelections((prev) => ({
          ...populated,
          ...prev, // preserve any immediate manual edits
        }));
      } catch (err) {
        console.warn('[MonthlyCustomPlanBuilder] Error loading existing user subscription:', err);
      }
    }

    checkExistingMonthlySubscription();
    return () => {
      isMounted = false;
    };
  }, [user?.id, currentYear, currentMonth, initialSelections]);

  // 3. Calendar Grid Construction (Mon-Sun)
  const calendarData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = new Date(currentYear, currentMonth, 1);
    // getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
    // Mon-Sun grid offset: Monday = 0, ..., Sunday = 6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const days: Array<{
      dayNumber: number;
      dateKey: string;
      date: Date;
      dayOfWeek: string;
      isToday: boolean;
    }> = [];

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isToday =
        today.getFullYear() === currentYear &&
        today.getMonth() === currentMonth &&
        today.getDate() === day;

      days.push({
        dayNumber: day,
        dateKey: formatDateKey(currentYear, currentMonth, day),
        date: d,
        dayOfWeek: dayNames[d.getDay()],
        isToday,
      });
    }

    return {
      daysInMonth,
      startOffset,
      days,
    };
  }, [currentYear, currentMonth, today]);

  // 4. Real-time Calculation using calculateCustomPlanPrice
  const { totalMeals, totalPrice: monthlyTotal } = useMemo(() => {
    return calculateCustomPlanPrice('monthly', selections, pricePerMeal);
  }, [selections, pricePerMeal]);

  // Notify parent on changes
  useEffect(() => {
    if (onPlanChange) {
      const dateDetails: MonthlyPlanDateSelection[] = calendarData.days.map((day) => ({
        dateKey: day.dateKey,
        dayNumber: day.dayNumber,
        dayOfWeek: day.dayOfWeek,
        date: day.date,
        meals: selections[day.dateKey] || 0,
        isToday: day.isToday,
      }));

      onPlanChange({
        year: currentYear,
        month: currentMonth,
        monthName: MONTH_NAMES[currentMonth],
        selections,
        dateDetails,
        totalMeals,
        pricePerMeal,
        monthlyTotal,
      });
    }
  }, [selections, totalMeals, pricePerMeal, monthlyTotal, currentYear, currentMonth, calendarData.days, onPlanChange]);

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Date toggle handlers
  const handleToggleMeal = useCallback((dateKey: string, targetMeals: 1 | 2) => {
    setCheckoutWarning(null);
    setSelections((prev) => {
      const current = prev[dateKey] || 0;
      return {
        ...prev,
        [dateKey]: current === targetMeals ? 0 : targetMeals,
      };
    });
  }, []);

  const handleSkipDate = useCallback((dateKey: string) => {
    setCheckoutWarning(null);
    setSelections((prev) => ({
      ...prev,
      [dateKey]: 0,
    }));
  }, []);

  // Quick Preset Handlers for the entire month
  const handleSelectAllWorkdays = useCallback((mealCount: 1 | 2) => {
    setCheckoutWarning(null);
    const updated: Record<string, MealCount> = { ...selections };
    calendarData.days.forEach((d) => {
      const dayOfWeek = d.date.getDay(); // 0 is Sun, 6 is Sat
      const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
      updated[d.dateKey] = isWeekday ? mealCount : 0;
    });
    setSelections(updated);
  }, [calendarData.days, selections]);

  const handleSelectEntireMonth = useCallback((mealCount: 1 | 2) => {
    setCheckoutWarning(null);
    const updated: Record<string, MealCount> = { ...selections };
    calendarData.days.forEach((d) => {
      updated[d.dateKey] = mealCount;
    });
    setSelections(updated);
  }, [calendarData.days, selections]);

  // Bottom action: Reset
  const handleReset = useCallback(() => {
    setCheckoutWarning(null);
    const cleared: Record<string, MealCount> = { ...selections };
    calendarData.days.forEach((d) => {
      cleared[d.dateKey] = 0;
    });
    setSelections(cleared);
    if (onReset) onReset();
  }, [calendarData.days, selections, onReset]);

  // Bottom action: Confirm & Checkout
  const handleConfirmCheckout = useCallback(() => {
    if (totalMeals === 0) {
      setCheckoutWarning('Please select at least 1 meal for this month to proceed.');
      return;
    }

    setCheckoutWarning(null);
    const dateDetails: MonthlyPlanDateSelection[] = calendarData.days.map((day) => ({
      dateKey: day.dateKey,
      dayNumber: day.dayNumber,
      dayOfWeek: day.dayOfWeek,
      date: day.date,
      meals: selections[day.dateKey] || 0,
      isToday: day.isToday,
    }));

    const result: MonthlyPlanBuilderResult = {
      year: currentYear,
      month: currentMonth,
      monthName: MONTH_NAMES[currentMonth],
      selections,
      dateDetails,
      totalMeals,
      pricePerMeal,
      monthlyTotal,
    };

    if (onConfirmCheckout) {
      onConfirmCheckout(result);
    } else {
      setShowConfirmationModal(true);
    }
  }, [totalMeals, calendarData.days, selections, currentYear, currentMonth, pricePerMeal, monthlyTotal, onConfirmCheckout]);

  return (
    <div
      className={cn(
        'w-full max-w-4xl mx-auto rounded-3xl bg-white/95 backdrop-blur-md border border-amber-100/80 shadow-xl shadow-amber-900/5 p-4 sm:p-6 md:p-8 transition-all',
        className
      )}
    >
      {/* ── Heading & Subtitle ────────────────────────────────────────────── */}
      {!hideHeader && (
        <div className="mb-6 text-left sm:text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-bold tracking-wide uppercase mb-2">
            <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
            Monthly Meal Planner
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Customize Your Monthly Plan
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-1 font-medium">
            Select meals for each day this month
          </p>
        </div>
      )}

      {/* ── Active Subscription Pre-populate Banner ───────────────────────── */}
      {existingPlanLoaded && (
        <div className="mb-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{existingPlanLoaded}</span>
          </div>
          <button
            type="button"
            onClick={() => setExistingPlanLoaded(null)}
            className="text-[11px] underline font-bold text-emerald-700 hover:text-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Month & Year Navigation Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-sm"
            aria-label="Next Month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="ml-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleJumpToToday}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
          >
            Today
          </button>
          <div className="text-xs font-bold text-amber-800 bg-amber-100/70 px-2.5 py-1.5 rounded-xl border border-amber-200">
            {calendarData.daysInMonth} Days
          </div>
        </div>
      </div>

      {/* ── Quick Month Presets ────────────────────────────────────────────── */}
      <div className="mb-4 pb-3 border-b border-slate-100 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max text-xs">
          <span className="text-slate-600 font-semibold mr-1">Quick Select:</span>
          <button
            type="button"
            onClick={() => handleSelectAllWorkdays(1)}
            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold border border-amber-200/60 transition-colors active:scale-95"
          >
            Mon–Fri (1 Meal)
          </button>
          <button
            type="button"
            onClick={() => handleSelectAllWorkdays(2)}
            className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 font-semibold border border-orange-200/60 transition-colors active:scale-95"
          >
            Mon–Fri (2 Meals)
          </button>
          <button
            type="button"
            onClick={() => handleSelectEntireMonth(1)}
            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 transition-colors active:scale-95"
          >
            All Month (1 Meal)
          </button>
          <button
            type="button"
            onClick={() => handleSelectEntireMonth(2)}
            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 transition-colors active:scale-95"
          >
            All Month (2 Meals)
          </button>
        </div>
      </div>

      {/* ── Calendar View: Full Mon-Sun Grid ──────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 p-2 sm:p-3">
        {/* Mon-Sun Grid Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
          {WEEKDAY_HEADERS.map((h, i) => (
            <div
              key={h}
              className={cn(
                'py-1 text-[11px] sm:text-xs font-bold tracking-wider uppercase',
                i >= 5 ? 'text-amber-700 font-black' : 'text-slate-600'
              )}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty offset cells for days before the 1st of month */}
          {Array.from({ length: calendarData.startOffset }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="min-h-[64px] sm:min-h-[82px] rounded-xl bg-slate-100/40 border border-dashed border-slate-200/50 opacity-40 select-none"
            />
          ))}

          {/* Active Month Days */}
          {calendarData.days.map((day) => {
            const meals = selections[day.dateKey] || 0;
            const is1Meal = meals === 1;
            const is2Meals = meals === 2;
            const isSkipped = meals === 0;
            const isSelected = meals > 0;

            return (
              <div
                key={day.dateKey}
                className={cn(
                  'relative flex flex-col justify-between p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all duration-150',
                  day.isToday && 'ring-2 ring-amber-500 border-amber-500 shadow-md',
                  isSelected
                    ? is2Meals
                      ? 'bg-gradient-to-br from-amber-50 via-orange-50/80 to-amber-100/60 border-orange-400 ring-1 ring-orange-400/40 shadow-sm'
                      : 'bg-amber-50/85 border-amber-300 ring-1 ring-amber-300/40 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                {/* Top Row: Date Number & Today Visual Distinction */}
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={cn(
                      'text-xs sm:text-sm font-black tracking-tight',
                      day.isToday ? 'text-amber-600' : isSelected ? 'text-slate-900' : 'text-slate-700'
                    )}
                  >
                    {day.dayNumber}
                  </span>

                  {day.isToday && (
                    <span className="hidden sm:inline-flex items-center text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-500 text-white shadow-xs">
                      Today
                    </span>
                  )}
                  {day.isToday && (
                    <span className="sm:hidden w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </div>

                {/* Bottom Row: Toggle Buttons [1] [2] and [Skip] */}
                <div className="flex items-center gap-1 sm:gap-1.5 justify-between w-full mt-auto">
                  {/* [1] Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleMeal(day.dateKey, 1)}
                    aria-pressed={is1Meal}
                    title="1 Meal"
                    className={cn(
                      'flex-1 h-6 sm:h-7 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center justify-center active:scale-90 select-none',
                      is1Meal
                        ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-400'
                        : 'bg-slate-50 hover:bg-amber-50 text-slate-700 border border-slate-200'
                    )}
                  >
                    1
                  </button>

                  {/* [2] Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleMeal(day.dateKey, 2)}
                    aria-pressed={is2Meals}
                    title="2 Meals"
                    className={cn(
                      'flex-1 h-6 sm:h-7 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center justify-center active:scale-90 select-none',
                      is2Meals
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-sm ring-1 ring-orange-400'
                        : 'bg-slate-50 hover:bg-orange-50 text-slate-700 border border-slate-200'
                    )}
                  >
                    2
                  </button>

                  {/* [Skip] Option (Light Gray) */}
                  <button
                    type="button"
                    onClick={() => handleSkipDate(day.dateKey)}
                    aria-pressed={isSkipped}
                    title="Skip"
                    className={cn(
                      'h-6 sm:h-7 px-1 sm:px-1.5 rounded-lg text-[9px] sm:text-[11px] transition-all flex items-center justify-center active:scale-90 select-none',
                      isSkipped
                        ? 'bg-slate-200 text-slate-700 font-bold border border-slate-300 shadow-inner'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Real-time Calculation Below ───────────────────────────────────── */}
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-amber-100/40 border border-amber-200/80 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200/60">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Real-time Monthly Calculation
          </span>
          {isLoadingPricing && (
            <span className="text-[11px] font-medium text-amber-700 animate-pulse">
              Updating rates...
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {/* Total meals this month: {count} */}
          <div className="flex items-center justify-between text-sm sm:text-base text-slate-700">
            <span className="font-medium">Total meals this month:</span>
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

          {/* Monthly total: ₹{total} (in bold, larger font) */}
          <div className="pt-3 border-t border-amber-200/70 flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-slate-900">
              Monthly total:
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-800 tracking-tight">
              ₹{monthlyTotal}
            </span>
          </div>
        </div>

        {totalMeals === 0 && (
          <p className="text-xs text-amber-700/80 mt-3 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Pick meals for any days in {MONTH_NAMES[currentMonth]} to calculate your customized monthly plan.
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
          {totalMeals > 0 && <span className="font-normal opacity-90">• ₹{monthlyTotal}</span>}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Built-in Custom Plan Checkout Screen & Payment Gateway ──────────── */}
      <CustomPlanCheckoutModal
        isOpen={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        customPlanData={{
          planType: 'monthly',
          totalPrice: monthlyTotal,
          pattern: selections,
          totalMeals,
          pricePerMeal,
          planStartDate: new Date(currentYear, currentMonth, 1),
        }}
      />
    </div>
  );
}

export default MonthlyCustomPlanBuilder;
