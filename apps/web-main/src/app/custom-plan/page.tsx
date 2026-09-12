'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChefHat,
  SlidersHorizontal,
  MapPin,
  Sparkles,
  ShieldCheck
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
import { getUserById } from '@/lib/queries/users';
import { getImageUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';
import type { AppUser } from '@/types';

function CustomPlanContent() {
  const searchParams = useSearchParams();
  const vendorIdFromQuery = searchParams.get('vendorId') || searchParams.get('id') || '';
  const freqFromQuery = searchParams.get('freq');

  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly' | 'manager'>(
    freqFromQuery === 'weekly' ? 'weekly' : 'monthly'
  );
  const [selectedVendor, setSelectedVendor] = useState<AppUser | null>(null);
  const [checkoutPlanData, setCheckoutPlanData] = useState<CustomPlanCheckoutData | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);

  useEffect(() => {
    if (vendorIdFromQuery) {
      getUserById(vendorIdFromQuery).then((v) => {
        if (v) setSelectedVendor(v);
      });
    }
  }, [vendorIdFromQuery]);

  // Opens the Custom Plan Checkout screen with weekly plan payload
  const handleCheckoutWeekly = (result: WeeklyPlanResult) => {
    const patternMap: Record<string, number> = result.pattern || (
      Array.isArray(result.selections)
        ? result.selections.reduce((acc: Record<string, number>, s: any) => {
            acc[s.id] = s.meals;
            return acc;
          }, {})
        : (result.selections as any)
    );

    setCheckoutPlanData({
      planType: 'weekly',
      totalPrice: result.weeklyTotal,
      pattern: patternMap,
      slots: result.slots,
      totalMeals: result.totalMeals,
      pricePerMeal: result.pricePerMeal,
      planStartDate: new Date(),
      customMealConfig: result.customMealConfig || undefined,
      vendorId: result.vendorId || vendorIdFromQuery || undefined,
    });
    setIsCheckoutOpen(true);
  };

  // Opens the Custom Plan Checkout screen with monthly plan payload
  const handleCheckoutMonthly = (result: MonthlyPlanBuilderResult) => {
    const patternMap: Record<string, number> = result.pattern || result.selections;

    setCheckoutPlanData({
      planType: 'monthly',
      totalPrice: result.monthlyTotal,
      pattern: patternMap,
      slots: result.slots,
      totalMeals: result.totalMeals,
      pricePerMeal: result.pricePerMeal,
      planStartDate: result.startDate || (result.year && result.month !== undefined ? new Date(result.year, result.month, 1) : new Date()),
      customMealConfig: result.customMealConfig || undefined,
      vendorId: result.vendorId || vendorIdFromQuery || undefined,
    });
    setIsCheckoutOpen(true);
  };

  const kitchenTitle = selectedVendor?.kitchen_name || selectedVendor?.name;

  return (
    <div className="min-h-screen bg-[#FEFCE8] py-8 px-3 sm:px-6">
      {/* Top Navigation & Brand Header */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <Link
          href={vendorIdFromQuery ? `/vendor/detail?id=${vendorIdFromQuery}` : '/'}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-white/80 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          {vendorIdFromQuery ? 'Back to Kitchen' : 'Back to Home'}
        </Link>
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100/70 px-3 py-1.5 rounded-xl border border-amber-200">
          <ChefHat className="w-3.5 h-3.5 text-amber-600" />
          Dabzzo Custom Meals
        </div>
      </div>

      {/* Selected Partner Kitchen Banner */}
      {selectedVendor && (
        <div className="max-w-xl mx-auto mb-6 bg-gradient-to-r from-amber-50 via-white to-orange-50/50 rounded-3xl p-4 sm:p-5 border border-amber-200 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {selectedVendor.image ? (
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shrink-0 border border-amber-200 shadow-2xs">
                <Image
                  src={getImageUrl(selectedVendor.image)}
                  alt={kitchenTitle || 'Partner Kitchen'}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-brand flex items-center justify-center font-black text-xl shrink-0 border border-amber-200 shadow-2xs">
                🍱
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                  Customizing For Kitchen
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Partner
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight mt-1 truncate">
                {kitchenTitle}
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 text-brand shrink-0" />
                {selectedVendor.address || (selectedVendor as any).location?.address || 'Partner Kitchen'}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 hidden sm:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kitchen Rates</span>
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block mt-0.5">
              Live Custom Rates
            </span>
          </div>
        </div>
      )}

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
        <WeeklyCustomPlanBuilder
          vendorId={vendorIdFromQuery || undefined}
          vendorOverrides={selectedVendor?.custom_component_rates}
          vendorMarginOverride={selectedVendor?.vendor_margin_percent ?? selectedVendor?.vendor_margin_override}
          onConfirmCheckout={handleCheckoutWeekly}
        />
      )}

      {activeTab === 'monthly' && (
        <MonthlyCustomPlanBuilder
          vendorId={vendorIdFromQuery || undefined}
          vendorOverrides={selectedVendor?.custom_component_rates}
          vendorMarginOverride={selectedVendor?.vendor_margin_percent ?? selectedVendor?.vendor_margin_override}
          onConfirmCheckout={handleCheckoutMonthly}
        />
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

export default function CustomPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FEFCE8] flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-brand flex items-center justify-center mx-auto animate-pulse">
              <ChefHat className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-500">Loading Custom Plan...</p>
          </div>
        </div>
      }
    >
      <CustomPlanContent />
    </Suspense>
  );
}
