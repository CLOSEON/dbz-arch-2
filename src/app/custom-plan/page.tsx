'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChefHat,
  SlidersHorizontal,
} from 'lucide-react';
import {
  WeeklyCustomPlanBuilder,
  PlanBuilderResult as WeeklyPlanResult,
} from '@/components/subscription/WeeklyCustomPlanBuilder';
import {
  MonthlyCustomPlanBuilder,
  MonthlyPlanBuilderResult,
} from '@/components/subscription/MonthlyCustomPlanBuilder';
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager';
import {
  CustomPlanCheckoutModal,
  CustomPlanCheckoutData,
} from '@/components/subscription/CustomPlanCheckoutModal';
import { cn } from '@/lib/utils';

export default function CustomPlanPage() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly' | 'manager'>('monthly');
  const [checkoutPlanData, setCheckoutPlanData] = useState<CustomPlanCheckoutData | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);

  // Opens the Custom Plan Checkout screen with weekly plan payload
  const handleCheckoutWeekly = (result: WeeklyPlanResult) => {
    setCheckoutPlanData({
      planType: 'weekly',
      totalPrice: result.weeklyTotal,
      pattern: result.selections,
      totalMeals: result.totalMeals,
      pricePerMeal: result.pricePerMeal,
      planStartDate: new Date(),
    });
    setIsCheckoutOpen(true);
  };

  // Opens the Custom Plan Checkout screen with monthly plan payload
  const handleCheckoutMonthly = (result: MonthlyPlanBuilderResult) => {
    setCheckoutPlanData({
      planType: 'monthly',
      totalPrice: result.monthlyTotal,
      pattern: result.selections,
      totalMeals: result.totalMeals,
      pricePerMeal: result.pricePerMeal,
      planStartDate: new Date(result.year, result.month, 1),
    });
    setIsCheckoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FEFCE8] py-8 px-3 sm:px-6">
      {/* Top Navigation & Brand Header */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-white/80 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100/70 px-3 py-1.5 rounded-xl border border-amber-200">
          <ChefHat className="w-3.5 h-3.5 text-amber-600" />
          Dabzzo Custom Meals
        </div>
      </div>

      {/* Plan Frequency Switcher Tab Bar */}
      <div className="max-w-xl mx-auto mb-6 p-1.5 rounded-2xl bg-slate-200/70 flex items-center shadow-inner gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 select-none',
            activeTab === 'weekly'
              ? 'bg-white text-slate-900 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Calendar className="w-4 h-4" />
          <span>Weekly Plan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('monthly')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 select-none',
            activeTab === 'monthly'
              ? 'bg-white text-slate-900 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Monthly Plan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manager')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 select-none',
            activeTab === 'manager'
              ? 'bg-white text-slate-900 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>My Plans</span>
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'weekly' && (
        <WeeklyCustomPlanBuilder onConfirmCheckout={handleCheckoutWeekly} />
      )}

      {activeTab === 'monthly' && (
        <MonthlyCustomPlanBuilder onConfirmCheckout={handleCheckoutMonthly} />
      )}

      {activeTab === 'manager' && (
        <SubscriptionManager
          onCreateNewPlan={() => setActiveTab('weekly')}
          onModifyPlan={(sub) => {
            const isWeekly =
              (sub as any).billingCycle === 'weekly' ||
              sub.frequency === 'weekly' ||
              (sub as any).subscriptionType === 'custom_weekly';
            setActiveTab(isWeekly ? 'weekly' : 'monthly');
          }}
        />
      )}

      {/* ── Custom Plan Checkout Modal & Payment Screen ───────────────────── */}
      <CustomPlanCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        customPlanData={checkoutPlanData}
        onSuccess={() => {
          setActiveTab('manager');
        }}
      />
    </div>
  );
}
