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
  Sun,
  Moon,
  Check
} from 'lucide-react';
import { getPricingConfig, DEFAULT_MONTHLY_PRICING } from '@/lib/queries/pricing';
import { calculateCustomPlanPrice } from '@/lib/pricing';
import { calculateSubscriptionPrice, DEFAULT_STANDARD_MEAL } from '@/lib/pricingEngine';
import { getUserSubscriptions } from '@/lib/queries/subscriptions';
import { CustomPlanCheckoutModal } from './CustomPlanCheckoutModal';
import { ThaliCustomizer, ThaliCustomizerConfig } from './ThaliCustomizer';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import type { Subscription } from '@/types';

export type MealCount = 0 | 1 | 2; // 0 = Skip, 1 = 1 Meal, 2 = 2 Meals
export type MealSlotChoice = 'skip' | 'lunch' | 'dinner' | 'both';

export interface MonthlyPlanDateSelection {
  dateKey: string; // 'YYYY-MM-DD'
  dayNumber: number; // 1..31
  dayOfWeek: string; // 'Monday', 'Tuesday', ...
  date: Date;
  slot: MealSlotChoice;
  meals: MealCount;
  isToday: boolean;
}

export interface MonthlyPlanBuilderResult {
  year: number;
  month: number; // 0-indexed (0=Jan, 8=Sept)
  monthName: string; // e.g. 'September'
  pattern: Record<string, number>;
  slots: Record<string, MealSlotChoice>;
  selections: Record<string, MealCount>;
  dateDetails: MonthlyPlanDateSelection[];
  totalMeals: number;
  pricePerMeal: number;
  monthlyTotal: number;
  customMealConfig?: ThaliCustomizerConfig | null;
  vendorId?: string;
  slotCounts: {
    lunch: number;
    dinner: number;
    both: number;
    skip: number;
  };
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
   * Pre-selected meal slots by dateKey ('YYYY-MM-DD').
   */
  initialSlots?: Record<string, MealSlotChoice>;
  /**
   * Selected vendor ID if scoping to a specific kitchen.
   */
  vendorId?: string;
  /**
   * Optional vendor custom component rates and overrides.
   */
  vendorOverrides?: Record<string, any>;
  /**
   * Optional custom kitchen margin override percentage (e.g. 40).
   */
  vendorMarginOverride?: number;
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
  initialSlots,
  vendorId,
  vendorOverrides,
  vendorMarginOverride,
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

  // Slot selections keyed by 'YYYY-MM-DD' ('skip' | 'lunch' | 'dinner' | 'both')
  const [slots, setSlots] = useState<Record<string, MealSlotChoice>>(() => {
    if (initialSlots) return { ...initialSlots };
    if (initialSelections) {
      const converted: Record<string, MealSlotChoice> = {};
      Object.entries(initialSelections).forEach(([dateKey, count]) => {
        converted[dateKey] = count === 2 ? 'both' : count === 1 ? 'lunch' : 'skip';
      });
      return converted;
    }
    return {};
  });

  const [pricePerMeal, setPricePerMeal] = useState<number>(
    initialPricePerMeal ?? DEFAULT_MONTHLY_PRICING.pricePerMeal ?? 50
  );
  const [customMealConfig, setCustomMealConfig] = useState<ThaliCustomizerConfig | null>(null);
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
    if ((initialSlots && Object.keys(initialSlots).length > 0) || (initialSelections && Object.keys(initialSelections).length > 0)) {
      return;
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
        const customSlots = (activeMonthly as any).custom_slots as Record<string, MealSlotChoice> | undefined;
        const customSchedule = (activeMonthly as any).custom_schedule as Record<string, MealCount> | undefined;
        const populated: Record<string, MealSlotChoice> = {};

        const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        if (customSlots && Object.keys(customSlots).length > 0) {
          Object.entries(customSlots).forEach(([k, v]) => {
            populated[k] = v;
          });
          setExistingPlanLoaded('Loaded custom slots from your active monthly plan');
        } else if (customSchedule && Object.keys(customSchedule).length > 0) {
          Object.entries(customSchedule).forEach(([k, v]) => {
            populated[k] = v === 2 ? 'both' : v === 1 ? 'lunch' : 'skip';
          });
          setExistingPlanLoaded('Loaded custom schedule from your active monthly plan');
        } else {
          // If standard monthly subscription, pre-populate days based on meal_type
          const defaultSlot: MealSlotChoice =
            activeMonthly.meal_type === 'both' ? 'both' :
            activeMonthly.meal_type === 'dinner' ? 'dinner' : 'lunch';

          for (let d = 1; d <= daysInCurrentMonth; d++) {
            const key = formatDateKey(currentYear, currentMonth, d);
            populated[key] = defaultSlot;
          }
          setExistingPlanLoaded(
            `Pre-populated ${defaultSlot === 'both' ? 'Lunch + Dinner' : defaultSlot === 'dinner' ? 'Dinner' : 'Lunch'} from your active subscription`
          );
        }

        setSlots((prev) => ({
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
  }, [user?.id, currentYear, currentMonth, initialSelections, initialSlots]);

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
  // 4. Derive numeric meal selections from slots
  const selections = useMemo(() => {
    const map: Record<string, MealCount> = {};
    calendarData.days.forEach((day) => {
      const s = slots[day.dateKey] || 'skip';
      map[day.dateKey] = s === 'both' ? 2 : (s === 'lunch' || s === 'dinner') ? 1 : 0;
    });
    return map;
  }, [calendarData.days, slots]);

  // Count slots
  const slotCounts = useMemo(() => {
    let lunch = 0;
    let dinner = 0;
    let both = 0;
    let skip = 0;
    calendarData.days.forEach((day) => {
      const s = slots[day.dateKey] || 'skip';
      if (s === 'lunch') lunch++;
      else if (s === 'dinner') dinner++;
      else if (s === 'both') both++;
      else skip++;
    });
    return { lunch, dinner, both, skip };
  }, [calendarData.days, slots]);

  // Build monthly schedule for Central Pricing Engine
  const centralSchedule = useMemo(() => {
    const list: Array<{ dayKey: string; slot: 'lunch' | 'dinner' | 'both'; items: Record<string, number> }> = [];
    const selectedItems = customMealConfig?.components || DEFAULT_STANDARD_MEAL.itemQuantities;
    calendarData.days.forEach((day) => {
      const s = slots[day.dateKey] || 'skip';
      if (s === 'lunch' || s === 'dinner' || s === 'both') {
        list.push({
          dayKey: day.dateKey,
          slot: s,
          items: selectedItems,
        });
      }
    });
    return list;
  }, [calendarData.days, slots, customMealConfig?.components]);

  const centralSubscriptionPricing = useMemo(() => {
    if (centralSchedule.length === 0) return null;
    try {
      return calculateSubscriptionPrice(centralSchedule, DEFAULT_STANDARD_MEAL.itemQuantities);
    } catch {
      return null;
    }
  }, [centralSchedule]);

  // 5. Real-time Calculation using Central Pricing Engine
  const totalMeals = centralSubscriptionPricing?.totalMeals ?? Object.values(selections).reduce((a: number, b: number) => a + b, 0);
  const monthlyTotal = centralSubscriptionPricing?.finalPrice ?? (totalMeals * Math.max(10, pricePerMeal + (customMealConfig?.customerDeltaPerMeal || 0)));
  const effectivePricePerMeal = totalMeals > 0
    ? Math.round((monthlyTotal / totalMeals) * 100) / 100
    : Math.max(10, pricePerMeal + (customMealConfig?.customerDeltaPerMeal || 0));

  // Notify parent on changes
  useEffect(() => {
    if (onPlanChange) {
      const dateDetails: MonthlyPlanDateSelection[] = calendarData.days.map((day) => ({
        dateKey: day.dateKey,
        dayNumber: day.dayNumber,
        dayOfWeek: day.dayOfWeek,
        date: day.date,
        slot: slots[day.dateKey] || 'skip',
        meals: selections[day.dateKey] || 0,
        isToday: day.isToday,
      }));

      onPlanChange({
        year: currentYear,
        month: currentMonth,
        monthName: MONTH_NAMES[currentMonth],
        pattern: selections,
        slots,
        selections,
        dateDetails,
        totalMeals,
        pricePerMeal: effectivePricePerMeal,
        monthlyTotal,
        customMealConfig: customMealConfig || undefined,
        vendorId,
        slotCounts,
      });
    }
  }, [slots, selections, totalMeals, effectivePricePerMeal, monthlyTotal, currentYear, currentMonth, calendarData.days, customMealConfig, vendorId, slotCounts, onPlanChange]);

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

  // Slot selector handlers
  const handleSetSlot = useCallback((dateKey: string, targetSlot: MealSlotChoice) => {
    setCheckoutWarning(null);
    setSlots((prev) => {
      const current = prev[dateKey] || 'skip';
      return {
        ...prev,
        [dateKey]: current === targetSlot ? 'skip' : targetSlot,
      };
    });
  }, []);

  // Quick Preset Handlers with Slots
  const handleSelectWorkdaysSlot = useCallback((slot: 'lunch' | 'dinner' | 'both') => {
    setCheckoutWarning(null);
    setSlots((prev) => {
      const updated = { ...prev };
      calendarData.days.forEach((d) => {
        const dayOfWeek = d.date.getDay(); // 0 is Sun, 6 is Sat
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
        updated[d.dateKey] = isWeekday ? slot : 'skip';
      });
      return updated;
    });
  }, [calendarData.days]);

  const handleSelectEntireMonthSlot = useCallback((slot: 'lunch' | 'dinner' | 'both') => {
    setCheckoutWarning(null);
    setSlots((prev) => {
      const updated = { ...prev };
      calendarData.days.forEach((d) => {
        updated[d.dateKey] = slot;
      });
      return updated;
    });
  }, [calendarData.days]);

  // Bottom action: Clear All
  const handleClearAll = useCallback(() => {
    setCheckoutWarning(null);
    setSlots((prev) => {
      const cleared = { ...prev };
      calendarData.days.forEach((d) => {
        cleared[d.dateKey] = 'skip';
      });
      return cleared;
    });
    if (onReset) onReset();
  }, [calendarData.days, onReset]);

  // Bottom action: Confirm & Checkout
  const handleConfirmCheckout = useCallback(() => {
    if (totalMeals === 0) {
      setCheckoutWarning('Please select at least 1 meal slot for this month to proceed.');
      return;
    }

    setCheckoutWarning(null);
    const dateDetails: MonthlyPlanDateSelection[] = calendarData.days.map((day) => ({
      dateKey: day.dateKey,
      dayNumber: day.dayNumber,
      dayOfWeek: day.dayOfWeek,
      date: day.date,
      slot: slots[day.dateKey] || 'skip',
      meals: selections[day.dateKey] || 0,
      isToday: day.isToday,
    }));

    const result: MonthlyPlanBuilderResult = {
      year: currentYear,
      month: currentMonth,
      monthName: MONTH_NAMES[currentMonth],
      pattern: selections,
      slots,
      selections,
      dateDetails,
      totalMeals,
      pricePerMeal: effectivePricePerMeal,
      monthlyTotal,
      customMealConfig: customMealConfig || undefined,
      vendorId,
      slotCounts,
    };

    if (onConfirmCheckout) {
      onConfirmCheckout(result);
    } else {
      setShowConfirmationModal(true);
    }
  }, [totalMeals, calendarData.days, slots, selections, currentYear, currentMonth, effectivePricePerMeal, monthlyTotal, customMealConfig, vendorId, slotCounts, onConfirmCheckout]);

  return (
    <div
      className={cn(
        'w-full max-w-4xl mx-auto rounded-3xl bg-[#FFFDF7] border border-amber-200/80 shadow-xl shadow-amber-900/5 p-4 sm:p-6 md:p-8 transition-all',
        className
      )}
    >
      {/* ── Heading & Brand Tag ────────────────────────────────────────────── */}
      {!hideHeader && (
        <div className="mb-6 text-left sm:text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300/80 text-amber-900 text-xs font-black tracking-wider uppercase mb-2 shadow-2xs">
            <CalendarDays className="w-3.5 h-3.5 text-amber-700" />
            Dabzzo Monthly Meal Planner
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Design Your Custom Monthly Calendar
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-1 font-medium">
            Pick your exact meals and delivery slots (<span className="text-amber-700 font-bold">☀️ Lunch</span> or <span className="text-indigo-700 font-bold">🌙 Dinner</span>) for each date
          </p>
        </div>
      )}

      {/* ── Active Subscription Banner ────────────────────────────────────── */}
      {existingPlanLoaded && (
        <div className="mb-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 animate-fade-in shadow-2xs">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-white to-orange-50/70 border border-amber-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-9 h-9 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 flex items-center justify-center text-amber-900 active:scale-95 transition-all shadow-2xs"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-9 h-9 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 flex items-center justify-center text-amber-900 active:scale-95 transition-all shadow-2xs"
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

        {/* Live Slot Counters in Header */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleJumpToToday}
            className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 text-xs font-black text-amber-900 active:scale-95 transition-all shadow-2xs"
          >
            Today
          </button>
          <div className="inline-flex items-center gap-1 text-[11px] font-black text-amber-900 bg-amber-100/90 px-2.5 py-1.5 rounded-xl border border-amber-200">
            <span>☀️ {slotCounts.lunch}</span>
            <span className="text-amber-400">•</span>
            <span>🌙 {slotCounts.dinner}</span>
            <span className="text-amber-400">•</span>
            <span>🍱 {slotCounts.both}</span>
            <span className="text-amber-400">•</span>
            <span>{totalMeals} Meals</span>
          </div>
        </div>
      </div>

      {/* ── Quick Month Presets (Batch Selectors) ─────────────────────────── */}
      <div className="mb-4 pb-3 border-b border-amber-100 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max text-xs">
          <span className="text-slate-600 font-bold mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-brand" /> Quick Presets:
          </span>

          <button
            type="button"
            onClick={() => handleSelectWorkdaysSlot('lunch')}
            className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold border border-amber-200 transition-all active:scale-95 shadow-2xs flex items-center gap-1"
          >
            <Sun className="w-3.5 h-3.5 text-amber-600" /> Mon–Fri Lunch
          </button>

          <button
            type="button"
            onClick={() => handleSelectWorkdaysSlot('dinner')}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold border border-indigo-200 transition-all active:scale-95 shadow-2xs flex items-center gap-1"
          >
            <Moon className="w-3.5 h-3.5 text-indigo-600" /> Mon–Fri Dinner
          </button>

          <button
            type="button"
            onClick={() => handleSelectWorkdaysSlot('both')}
            className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-900 font-bold border border-orange-200 transition-all active:scale-95 shadow-2xs flex items-center gap-1"
          >
            🍱 Mon–Fri Both
          </button>

          <button
            type="button"
            onClick={() => handleSelectEntireMonthSlot('lunch')}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-slate-800 font-bold border border-amber-200/80 transition-all active:scale-95 shadow-2xs"
          >
            ☀️ All Month Lunch
          </button>

          <button
            type="button"
            onClick={() => handleSelectEntireMonthSlot('dinner')}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-slate-800 font-bold border border-indigo-200/80 transition-all active:scale-95 shadow-2xs"
          >
            🌙 All Month Dinner
          </button>

          <button
            type="button"
            onClick={() => handleSelectEntireMonthSlot('both')}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 text-slate-800 font-bold border border-orange-200/80 transition-all active:scale-95 shadow-2xs"
          >
            🍱 All Month Both
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold border border-slate-200 transition-all active:scale-95"
          >
            ✕ Clear All
          </button>
        </div>
      </div>

      {/* ── Calendar View: Full Mon-Sun Grid ──────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-amber-200/90 bg-amber-50/30 p-2 sm:p-3 shadow-inner">
        {/* Mon-Sun Grid Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
          {WEEKDAY_HEADERS.map((h, i) => (
            <div
              key={h}
              className={cn(
                'py-1 text-[11px] sm:text-xs font-black tracking-wider uppercase',
                i >= 5 ? 'text-amber-800 font-black' : 'text-slate-600'
              )}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {/* Empty offset cells */}
          {Array.from({ length: calendarData.startOffset }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="min-h-[78px] sm:min-h-[96px] rounded-2xl bg-amber-100/20 border border-dashed border-amber-200/40 opacity-40 select-none"
            />
          ))}

          {/* Active Month Days */}
          {calendarData.days.map((day) => {
            const slot = slots[day.dateKey] || 'skip';
            const isLunch = slot === 'lunch';
            const isDinner = slot === 'dinner';
            const isBoth = slot === 'both';
            const isSkipped = slot === 'skip';

            return (
              <div
                key={day.dateKey}
                className={cn(
                  'relative flex flex-col justify-between p-1.5 sm:p-2 rounded-2xl border transition-all duration-150 shadow-2xs select-none',
                  day.isToday && 'ring-2 ring-amber-500 border-amber-500 shadow-md',
                  isLunch && 'bg-gradient-to-br from-amber-50 via-amber-100/60 to-orange-50/40 border-amber-300 ring-1 ring-amber-300/60',
                  isDinner && 'bg-gradient-to-br from-indigo-50/90 via-slate-50 to-amber-50/40 border-indigo-300 ring-1 ring-indigo-300/60',
                  isBoth && 'bg-gradient-to-br from-amber-100 via-orange-100/70 to-amber-50 border-orange-400 ring-1 ring-orange-400/70 shadow-sm',
                  isSkipped && 'bg-white/95 border-amber-100/80 hover:border-amber-300'
                )}
              >
                {/* Top Row: Date Number & Slot Indicator */}
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={cn(
                      'text-xs sm:text-sm font-black tracking-tight',
                      day.isToday ? 'text-amber-700' : isSkipped ? 'text-slate-600' : 'text-slate-900'
                    )}
                  >
                    {day.dayNumber}
                  </span>

                  {/* Visual Slot Pill */}
                  {isLunch && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black text-amber-900 bg-amber-200/80 px-1 sm:px-1.5 py-0.5 rounded-md border border-amber-300/80 shadow-2xs">
                      ☀️ <span className="hidden sm:inline">Lunch</span>
                    </span>
                  )}
                  {isDinner && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black text-indigo-900 bg-indigo-100 px-1 sm:px-1.5 py-0.5 rounded-md border border-indigo-200 shadow-2xs">
                      🌙 <span className="hidden sm:inline">Dinner</span>
                    </span>
                  )}
                  {isBoth && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black text-orange-950 bg-orange-200/90 px-1 sm:px-1.5 py-0.5 rounded-md border border-orange-300 shadow-2xs">
                      🍱 <span className="hidden sm:inline">Both</span>
                    </span>
                  )}
                  {isSkipped && (
                    <span className="text-[9px] font-semibold text-slate-300">
                      Skip
                    </span>
                  )}
                </div>

                {/* Bottom Row: 4 Intuitive Slot Toggle Buttons */}
                <div className="grid grid-cols-4 gap-0.5 sm:gap-1 w-full mt-auto pt-1 border-t border-amber-100/60">
                  {/* Lunch Toggle */}
                  <button
                    type="button"
                    onClick={() => handleSetSlot(day.dateKey, 'lunch')}
                    aria-pressed={isLunch}
                    title="Select Lunch (1 Meal)"
                    className={cn(
                      'h-6 sm:h-7 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center justify-center active:scale-90 select-none',
                      isLunch
                        ? 'bg-amber-500 text-white shadow-xs ring-1 ring-amber-400'
                        : 'bg-white/80 hover:bg-amber-50 text-slate-700 border border-slate-200/60'
                    )}
                  >
                    ☀️
                  </button>

                  {/* Dinner Toggle */}
                  <button
                    type="button"
                    onClick={() => handleSetSlot(day.dateKey, 'dinner')}
                    aria-pressed={isDinner}
                    title="Select Dinner (1 Meal)"
                    className={cn(
                      'h-6 sm:h-7 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center justify-center active:scale-90 select-none',
                      isDinner
                        ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400'
                        : 'bg-white/80 hover:bg-indigo-50 text-slate-700 border border-slate-200/60'
                    )}
                  >
                    🌙
                  </button>

                  {/* Both (Lunch + Dinner) Toggle */}
                  <button
                    type="button"
                    onClick={() => handleSetSlot(day.dateKey, 'both')}
                    aria-pressed={isBoth}
                    title="Select Both Lunch & Dinner (2 Meals)"
                    className={cn(
                      'h-6 sm:h-7 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center justify-center active:scale-90 select-none',
                      isBoth
                        ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white shadow-xs ring-1 ring-orange-400'
                        : 'bg-white/80 hover:bg-orange-50 text-slate-700 border border-slate-200/60'
                    )}
                  >
                    🍱
                  </button>

                  {/* Skip Toggle */}
                  <button
                    type="button"
                    onClick={() => handleSetSlot(day.dateKey, 'skip')}
                    aria-pressed={isSkipped}
                    title="Skip This Day"
                    className={cn(
                      'h-6 sm:h-7 rounded-lg text-[9px] sm:text-xs font-bold transition-all flex items-center justify-center active:scale-90 select-none',
                      isSkipped
                        ? 'bg-slate-200/80 text-slate-600 font-black'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Thali Portions Customizer Section ──────────────────────────────── */}
      <div className="mb-6 rounded-3xl border border-amber-200/90 bg-white p-4 sm:p-5 shadow-sm">
        <ThaliCustomizer
          baseMealPrice={pricePerMeal}
          planType="monthly"
          vendorOverrides={vendorOverrides}
          vendorMarginOverride={vendorMarginOverride}
          onChange={(config) => setCustomMealConfig(config)}
          compact
          title="Customize Your Daily Thali Portions (Optional)"
        />
      </div>

      {/* ── Real-Time Monthly Receipt Breakdown ────────────────────────────── */}
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-amber-50/95 via-white to-orange-50/70 border border-amber-200 p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-amber-200/70">
          <span className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-600" />
            Monthly Plan Calculation Receipt
          </span>
          {isLoadingPricing && (
            <span className="text-[11px] font-medium text-amber-700 animate-pulse">
              Updating rates...
            </span>
          )}
        </div>

        <div className="space-y-3">
          {/* Total Meals & Slot Breakdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm sm:text-base text-slate-700">
            <span className="font-semibold text-slate-800">Total Meals Scheduled:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-slate-900 text-base sm:text-lg">
                {totalMeals} Meals
              </span>
              <span className="text-xs font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-lg border border-amber-200">
                ☀️ {slotCounts.lunch} Lunches • 🌙 {slotCounts.dinner} Dinners • 🍱 {slotCounts.both} Full Days
              </span>
            </div>
          </div>

          {/* Rate Per Meal */}
          <div className="flex items-center justify-between text-sm sm:text-base text-slate-700">
            <span className="font-semibold text-slate-800">Price Per Meal:</span>
            <div className="text-right">
              <span className="font-bold text-slate-900">
                ₹{effectivePricePerMeal}
              </span>
              {customMealConfig && (customMealConfig.customerDeltaPerMeal ?? 0) !== 0 && (
                <span className="text-xs font-bold text-amber-700 ml-1.5">
                  {((customMealConfig.customerDeltaPerMeal ?? 0) > 0 ? `+₹${customMealConfig.customerDeltaPerMeal}` : `-₹${Math.abs(customMealConfig.customerDeltaPerMeal ?? 0)}`)} thali delta
                </span>
              )}
            </div>
          </div>

          {/* Platform Pricing Transparency */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-amber-100">
            <span>Pricing Breakdown per Meal:</span>
            <span className="font-medium text-slate-700">
              Kitchen Food Rate + ₹11 Delivery Fee + 5% Platform Margin
            </span>
          </div>

          {/* Monthly Total */}
          <div className="pt-3 border-t border-amber-200/80 flex items-center justify-between">
            <div>
              <span className="text-base sm:text-lg font-black text-slate-900 block">
                Total Monthly Investment:
              </span>
              <span className="text-xs text-slate-500">
                All-inclusive with doorstep delivery & daily hot packaging
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-amber-800 tracking-tight">
              ₹{monthlyTotal}
            </span>
          </div>
        </div>

        {totalMeals === 0 && (
          <p className="text-xs text-amber-800/90 mt-3 flex items-center gap-1.5 bg-amber-100/60 p-2 rounded-xl border border-amber-200">
            <Info className="w-4 h-4 shrink-0 text-amber-600" />
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
            className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-2xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{checkoutWarning}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Action Buttons at Bottom ───────────────────────────────────────── */}
      <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
        {/* [Reset] Button */}
        <button
          type="button"
          onClick={handleClearAll}
          className="w-full sm:w-auto px-5 py-3.5 rounded-2xl border border-amber-200 bg-white hover:bg-amber-50 text-slate-700 hover:text-slate-900 font-bold text-sm transition-all duration-150 flex items-center justify-center gap-2 active:scale-95 shadow-2xs"
        >
          <RotateCcw className="w-4 h-4 text-amber-600" />
          Reset Plan
        </button>

        {/* [Confirm & Checkout] Button */}
        <button
          type="button"
          onClick={handleConfirmCheckout}
          className={cn(
            'w-full sm:flex-1 py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg',
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
          slots,
          totalMeals,
          pricePerMeal: effectivePricePerMeal,
          planStartDate: new Date(currentYear, currentMonth, 1),
          customMealConfig: customMealConfig || undefined,
          vendorId,
        }}
      />
    </div>
  );
}

export default MonthlyCustomPlanBuilder;
