'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Calendar,
  CalendarDays,
  ShieldCheck,
  Utensils,
  Truck,
  ArrowRight,
  Home,
  SlidersHorizontal,
  Sparkles,
  ChefHat
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

function SubscriptionActiveContent() {
  const searchParams = useSearchParams();

  const subscriptionId = searchParams.get('subscriptionId') || 'sub_demo_active';
  const planType = searchParams.get('planType') || 'weekly';
  const totalMeals = searchParams.get('totalMeals') || '9';
  const totalPrice = searchParams.get('totalPrice') || '450';

  const isWeekly = planType === 'weekly';

  return (
    <div className="min-h-screen bg-[#FEFCE8] py-10 px-4 sm:px-6 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-amber-100 text-center relative overflow-hidden"
      >
        {/* Glow Accent Background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-amber-200/40 blur-3xl -z-10 rounded-full" />

        {/* Success Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
          <CheckCircle2 className="w-9 h-9" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide uppercase mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Subscription Active & Confirmed
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Subscription Active!
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-sm mx-auto font-medium">
          Your custom {isWeekly ? 'weekly' : 'monthly'} meal plan has been confirmed and scheduled for delivery.
        </p>

        {/* Subscription Summary Card */}
        <div className="my-6 p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-left space-y-2.5 text-xs sm:text-sm">
          <div className="flex justify-between items-center pb-2 border-b border-amber-200/60">
            <span className="text-slate-500 font-semibold">Subscription ID:</span>
            <span className="font-mono font-bold text-slate-800 text-[11px] sm:text-xs">
              {subscriptionId}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600">Plan Type:</span>
            <span className="font-bold text-slate-900 capitalize">
              Custom {planType} Plan
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600">Total Scheduled Meals:</span>
            <span className="font-extrabold text-slate-900">
              {totalMeals} {isWeekly ? 'meals/week' : 'meals/month'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600">Amount Paid:</span>
            <span className="font-black text-amber-600 text-base">
              ₹{totalPrice}
            </span>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-amber-200/60">
            <span className="text-slate-600">Delivery Readiness:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ready for Delivery
            </span>
          </div>
        </div>

        {/* Next Steps Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left flex items-start gap-3 mb-6">
          <Truck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600">
            <p className="font-bold text-slate-800">What happens next?</p>
            <p className="mt-0.5">
              The kitchen team has received your meal schedule. Meals will be freshly prepared and dispatched on your selected days.
            </p>
          </div>
        </div>

        {/* Action Navigation Buttons */}
        <div className="space-y-2.5">
          <Link
            href="/custom-plan?tab=manager"
            className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-sm shadow-md shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Manage My Subscription</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/"
            className="w-full py-3 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4 text-slate-400" />
            <span>Return to Home</span>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function SubscriptionActivePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FEFCE8] flex items-center justify-center">
          <div className="text-sm font-bold text-amber-800 animate-pulse">
            Loading subscription confirmation...
          </div>
        </div>
      }
    >
      <SubscriptionActiveContent />
    </Suspense>
  );
}
