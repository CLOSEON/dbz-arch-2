'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  CalendarDays,
  Utensils,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Award,
  Users,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { fetchCustomPlanStats, type CustomPlanStats } from '@/lib/queries/admin';
import { cn } from '@/lib/utils';

export interface CustomPlanInsightsCardProps {
  initialStats?: CustomPlanStats | null;
  className?: string;
}

const WEEKDAY_NAMES = [
  { full: 'monday', short: 'Mon' },
  { full: 'tuesday', short: 'Tue' },
  { full: 'wednesday', short: 'Wed' },
  { full: 'thursday', short: 'Thu' },
  { full: 'friday', short: 'Fri' },
  { full: 'saturday', short: 'Sat' },
  { full: 'sunday', short: 'Sun' },
];

export function CustomPlanInsightsCard({
  initialStats,
  className,
}: CustomPlanInsightsCardProps) {
  const [stats, setStats] = useState<CustomPlanStats | null>(initialStats || null);
  const [loading, setLoading] = useState<boolean>(!initialStats);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomPlanStats();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error loading custom plan stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialStats) {
      loadStats();
    }
  }, []);

  const pattern = stats?.mostCommonPattern?.pattern || {};
  const usersCount = stats?.mostCommonPattern?.usersCount || 0;

  return (
    <div
      className={cn(
        'rounded-3xl bg-white/80 backdrop-blur-xl border border-amber-200/70 p-5 sm:p-7 shadow-xl shadow-amber-900/5',
        className
      )}
    >
      {/* ── Section Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-amber-100">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold tracking-wide uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Custom Subscription Intelligence
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Custom Meal Plan Business Insights
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Aggregated analytics across weekly & monthly tailored subscriptions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 hidden sm:inline-block">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 font-bold text-xs transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            title="Refresh Custom Plan Stats"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── 6 Primary Metric Cards Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 my-6">
        {/* Metric 1: Total Custom Weekly Subscriptions */}
        <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Weekly Subs
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100/80 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-amber-700" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {loading ? '—' : stats?.totalCustomWeeklySubscriptions ?? 0}
            </h4>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Custom weekly plans
            </p>
          </div>
        </div>

        {/* Metric 2: Total Custom Monthly Subscriptions */}
        <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-orange-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Monthly Subs
            </span>
            <div className="w-7 h-7 rounded-lg bg-orange-100/80 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-orange-700" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {loading ? '—' : stats?.totalCustomMonthlySubscriptions ?? 0}
            </h4>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Custom monthly plans
            </p>
          </div>
        </div>

        {/* Metric 3: Total Active Custom Plan Subscriptions */}
        <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Active Custom
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100/80 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <h4 className="text-2xl sm:text-3xl font-black text-emerald-700 leading-tight">
                {loading ? '—' : stats?.totalActiveCustomPlanSubscriptions ?? 0}
              </h4>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            </div>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Currently delivering
            </p>
          </div>
        </div>

        {/* Metric 4: Average Meals/Week Ordered */}
        <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-sky-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Avg Meals/Wk
            </span>
            <div className="w-7 h-7 rounded-lg bg-sky-100/80 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-sky-700" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {loading ? '—' : stats?.averageMealsPerWeekOrdered ?? 0}
            </h4>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Meals per week/sub
            </p>
          </div>
        </div>

        {/* Metric 5: Average Revenue/Custom Subscription */}
        <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Avg Revenue
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100/80 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-indigo-700" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-indigo-700 leading-tight">
              ₹{loading ? '—' : stats?.averageRevenuePerCustomSubscription?.toLocaleString() ?? 0}
            </h4>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Per custom plan
            </p>
          </div>
        </div>

        {/* Metric 6: Total Custom Volume */}
        <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-800 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Volume
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-100/80 flex items-center justify-center">
              <Award className="w-4 h-4 text-purple-700" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-purple-900 leading-tight">
              {loading ? '—' : stats?.totalCustomSubscriptions ?? 0}
            </h4>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              All time custom plans
            </p>
          </div>
        </div>
      </div>

      {/* ── Most Common Pattern Showcase ──────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-slate-50 border border-amber-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Most Common Meal Schedule Pattern
              </h3>
              <p className="text-xs text-slate-500">
                The most popular customer schedule configuration across custom subscribers
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-amber-200 text-slate-800 text-xs font-bold shadow-xs">
            <Users className="w-3.5 h-3.5 text-amber-600" />
            <span>
              <strong>{usersCount}</strong> subscribers share this exact pattern
            </span>
          </div>
        </div>

        {/* Visual 7-day pattern representation */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-1">
          {WEEKDAY_NAMES.map(({ full, short }) => {
            const count = Number(
              pattern[full] ?? pattern[short.toLowerCase()] ?? pattern[short] ?? 0
            );
            const is2 = count === 2;
            const is1 = count === 1;

            return (
              <div
                key={short}
                className={cn(
                  'flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border text-center transition-all',
                  is2
                    ? 'bg-orange-100/80 border-orange-300 ring-1 ring-orange-400/30 shadow-xs'
                    : is1
                    ? 'bg-amber-100/70 border-amber-300 ring-1 ring-amber-400/30 shadow-xs'
                    : 'bg-white/80 border-slate-200 text-slate-400'
                )}
              >
                <span className="text-[10px] sm:text-xs font-bold text-slate-600">
                  {short}
                </span>
                <span
                  className={cn(
                    'text-xs sm:text-sm font-black mt-0.5',
                    is2
                      ? 'text-orange-700'
                      : is1
                      ? 'text-amber-700'
                      : 'text-slate-300'
                  )}
                >
                  {is2 ? '2 Meals' : is1 ? '1 Meal' : 'Skip'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pattern Summary Footer */}
        <div className="mt-3.5 pt-3 border-t border-amber-200/50 flex flex-wrap items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
              1 Meal (Lunch or Dinner)
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
              2 Meals (Both)
            </span>
          </div>

          <span className="text-slate-400 text-[11px] italic mt-1 sm:mt-0">
            Calculated in real-time by getCustomPlanStats
          </span>
        </div>
      </div>
    </div>
  );
}

export default CustomPlanInsightsCard;
