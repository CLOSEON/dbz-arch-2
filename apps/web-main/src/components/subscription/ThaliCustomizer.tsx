                     'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Sparkles, Plus, Minus, Check, RotateCcw } from 'lucide-react';
import { getMealComponentsCatalog, calculateComponentDeltas, buildBoxManifest, calculateBaseVendorCost } from '@/lib/queries/mealComponents';
import {
  getPricingAlgorithmSettings,
  computeAlgorithmicMealPricing,
  PricingAlgorithmSettings,
  DEFAULT_PRICING_ALGORITHM,
  AlgorithmicMealPricingResult,
} from '@/lib/queries/pricing';
import { MealComponent, DEFAULT_MEAL_COMPONENTS, CustomMealConfig, ComponentCategory } from '@/types';

export interface ThaliCustomizerConfig extends CustomMealConfig {
  customerDeltaPerMeal: number;
  vendorDeltaPerMeal: number;
  rawKitchenCost: number;
  vendorMarginPercent: number;
  vendorPayout: number;
  algorithmicPricing: AlgorithmicMealPricingResult;
  breakdown: Array<{
    component: MealComponent;
    selectedQty: number;
    baseQty: number;
    delta: number;
    customerAdjustment: number;
    vendorAdjustment: number;
  }>;
}

export interface ThaliCustomizerProps {
  baseMealPrice: number;
  baseVendorCost?: number;
  planType?: 'weekly' | 'monthly' | 'daily';
  vendorMarginOverride?: number;
  algorithmSettings?: PricingAlgorithmSettings;
  initialQuantities?: Record<string, number>;
  onChange?: (config: ThaliCustomizerConfig) => void;
  vendorOverrides?: Record<string, any>;
  className?: string;
  compact?: boolean;
  title?: string;
}

export function ThaliCustomizer({
  baseMealPrice,
  baseVendorCost = 30,
  planType = 'weekly',
  vendorMarginOverride,
  algorithmSettings,
  initialQuantities,
  onChange,
  vendorOverrides,
  className = '',
  compact = false,
  title = 'Customize Your Thali Items',
}: ThaliCustomizerProps) {
  const [catalog, setCatalog] = useState<MealComponent[]>(DEFAULT_MEAL_COMPONENTS);
  const [loading, setLoading] = useState<boolean>(true);

  // Map of componentId -> quantity
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    DEFAULT_MEAL_COMPONENTS.forEach((c) => {
      initial[c.id] = c.baseQuantity;
    });
    if (initialQuantities) {
      Object.entries(initialQuantities).forEach(([k, v]) => {
        if (typeof v === 'number') initial[k] = v;
      });
    }
    return initial;
  });

  // Load live catalog from Firestore
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const comps = await getMealComponentsCatalog();
        if (isMounted && comps.length > 0) {
          setCatalog(comps);
          // If initialQuantities were not provided or missing some components, initialize them
          setQuantities((prev) => {
            const next = { ...prev };
            comps.forEach((c) => {
              if (next[c.id] === undefined) {
                next[c.id] = c.baseQuantity;
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.warn('[ThaliCustomizer] Using default components catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Pricing algorithm settings
  const [algoSettings, setAlgoSettings] = useState<PricingAlgorithmSettings>(
    algorithmSettings || DEFAULT_PRICING_ALGORITHM
  );

  useEffect(() => {
    if (algorithmSettings) {
      setAlgoSettings(algorithmSettings);
      return;
    }
    let isMounted = true;
    getPricingAlgorithmSettings().then((res) => {
      if (isMounted && res) {
        setAlgoSettings(res);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [algorithmSettings]);

  // Compute raw kitchen cost from current portions
  const rawKitchenCost = useMemo(() => {
    return catalog.reduce((sum, comp) => {
      if (!comp.isActive) return sum;
      const qty = quantities[comp.id] !== undefined ? quantities[comp.id] : (comp.baseQuantity ?? 0);
      const raw = typeof comp.rawCost === 'number' ? comp.rawCost : 0;
      return sum + qty * raw;
    }, 0);
  }, [quantities, catalog]);

  const effectiveVendorMargin = useMemo(() => {
    if (typeof vendorMarginOverride === 'number') return vendorMarginOverride;
    if (typeof vendorOverrides?.vendor_margin_percent === 'number') return vendorOverrides.vendor_margin_percent;
    if (typeof vendorOverrides?.vendor_margin_override === 'number') return vendorOverrides.vendor_margin_override;
    return algoSettings?.vendorMarginPercent ?? 40;
  }, [vendorMarginOverride, vendorOverrides, algoSettings?.vendorMarginPercent]);

  const algorithmicPricing = useMemo(() => {
    return computeAlgorithmicMealPricing(
      rawKitchenCost,
      planType,
      algoSettings,
      effectiveVendorMargin
    );
  }, [rawKitchenCost, planType, algoSettings, effectiveVendorMargin]);

  // Resolve base vendor cost dynamically from component overrides
  const resolvedBaseVendorCost = useMemo(() => {
    if (typeof baseVendorCost === 'number' && baseVendorCost > 0 && baseVendorCost !== 30) {
      return baseVendorCost;
    }
    const computed = calculateBaseVendorCost(catalog, vendorOverrides);
    if (computed > 0) return computed;
    return typeof baseVendorCost === 'number' && baseVendorCost > 0 ? baseVendorCost : 30;
  }, [baseVendorCost, catalog, vendorOverrides]);

  // Compute live deltas
  const deltaResult = useMemo(() => {
    return calculateComponentDeltas(quantities, catalog, vendorOverrides);
  }, [quantities, catalog, vendorOverrides]);

  const effectiveCustomerPricePerMeal = Math.max(
    10,
    baseMealPrice + deltaResult.customerDeltaPerMeal
  );
  const effectiveVendorCostPerMeal = Math.max(
    10,
    resolvedBaseVendorCost + deltaResult.vendorDeltaPerMeal
  );

  const manifestSummary = useMemo(() => {
    return buildBoxManifest(quantities, catalog);
  }, [quantities, catalog]);

  // Notify parent component on changes
  useEffect(() => {
    if (onChange) {
      onChange({
        components: quantities,
        deltaPricePerMeal: deltaResult.customerDeltaPerMeal,
        deltaVendorCostPerMeal: deltaResult.vendorDeltaPerMeal,
        customerDeltaPerMeal: deltaResult.customerDeltaPerMeal,
        vendorDeltaPerMeal: deltaResult.vendorDeltaPerMeal,
        effectiveCustomerPricePerMeal,
        effectiveVendorCostPerMeal,
        baseCustomerPricePerMeal: baseMealPrice,
        baseVendorCostPerMeal: resolvedBaseVendorCost,
        manifestSummary,
        breakdown: deltaResult.breakdown,
        rawKitchenCost,
        vendorMarginPercent: effectiveVendorMargin,
        vendorPayout: algorithmicPricing.vendorPayout,
        algorithmicPricing,
      });
    }
  }, [
    quantities,
    deltaResult,
    effectiveCustomerPricePerMeal,
    effectiveVendorCostPerMeal,
    baseMealPrice,
    baseVendorCost,
    resolvedBaseVendorCost,
    manifestSummary,
    rawKitchenCost,
    effectiveVendorMargin,
    algorithmicPricing,
    onChange,
  ]);

  const handleIncrement = (comp: MealComponent) => {
    const current = quantities[comp.id] ?? comp.baseQuantity;
    if (current < comp.maxQuantity) {
      setQuantities((prev) => ({ ...prev, [comp.id]: current + 1 }));
    }
  };

  const handleDecrement = (comp: MealComponent) => {
    const current = quantities[comp.id] ?? comp.baseQuantity;
    if (current > comp.minQuantity) {
      setQuantities((prev) => ({ ...prev, [comp.id]: current - 1 }));
    }
  };

  const handleReset = () => {
    const reset: Record<string, number> = {};
    catalog.forEach((c) => {
      reset[c.id] = c.baseQuantity;
    });
    setQuantities(reset);
  };

  const categoryLabels: Record<ComponentCategory, string> = {
    staple: 'Staples',
    curry: 'Curries & Gravies',
    side: 'Salads & Accompaniments',
    dessert: 'Desserts & Sweets',
  };

  const activeComponents = catalog.filter((c) => c.isActive);

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/85 p-4 sm:p-5 space-y-4 shadow-xs ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-brand flex items-center justify-center font-black">
            <Utensils className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 leading-tight">{title}</h4>
            <p className="text-[11px] font-medium text-slate-500">
              Customize portions. Extra items add cost, removed items discount your meal.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
          title="Reset to standard thali"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Component Cards Grid - 2 columns for spacious, unclipped layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activeComponents.map((comp) => {
          const qty = quantities[comp.id] ?? comp.baseQuantity;
          const delta = qty - comp.baseQuantity;
          const isIncreased = delta > 0;
          const isDecreased = delta < 0;

          return (
            <div
              key={comp.id}
              className={`p-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 ${
                isIncreased
                  ? 'bg-gradient-to-br from-emerald-50/50 via-white to-amber-50/20 border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                  : isDecreased
                  ? 'bg-gradient-to-br from-rose-50/50 via-white to-amber-50/20 border-rose-300 ring-1 ring-rose-300/40 shadow-xs'
                  : 'bg-white/95 border-amber-100 hover:border-amber-300 hover:shadow-2xs'
              }`}
            >
              {/* Item Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                    {comp.name}
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200/60 lowercase">
                    {comp.unit}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-medium">Base: {comp.baseQuantity}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-slate-700">₹{comp.customerRate}/{comp.unit}</span>
                </div>

                {/* Delta Status Badge */}
                <div className="mt-1.5 flex items-center">
                  {isIncreased && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                      +{delta} (Adds ₹{delta * comp.customerRate})
                    </span>
                  )}
                  {isDecreased && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200">
                      {delta} (Saves ₹{Math.abs(delta) * comp.customerRate})
                    </span>
                  )}
                  {delta === 0 && (
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-md">
                      Standard included
                    </span>
                  )}
                </div>
              </div>

              {/* Stepper Buttons (Warm Dabzzo Food Branding) */}
              <div className="flex items-center gap-1.5 shrink-0 bg-amber-50/50 border border-amber-200/80 rounded-2xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleDecrement(comp)}
                  disabled={qty <= comp.minQuantity}
                  className="w-8 h-8 rounded-xl bg-white hover:bg-amber-100 text-amber-900 disabled:opacity-30 disabled:pointer-events-none font-black text-sm flex items-center justify-center transition-all active:scale-90 border border-amber-200/60 shadow-2xs"
                  aria-label={`Decrease ${comp.name}`}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <span className="w-7 text-center font-black font-mono text-sm text-slate-900 select-none">
                  {qty}
                </span>

                <button
                  type="button"
                  onClick={() => handleIncrement(comp)}
                  disabled={qty >= comp.maxQuantity}
                  className="w-8 h-8 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white disabled:opacity-30 disabled:pointer-events-none font-black text-sm flex items-center justify-center transition-all active:scale-90 shadow-sm shadow-amber-500/25"
                  aria-label={`Increase ${comp.name}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Culinary Price Breakdown & Kitchen Transparency Receipt */}
      <div className="p-4 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-amber-100/40 border border-amber-200/80 rounded-2xl space-y-3 shadow-xs">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-amber-200/70">
          <div className="flex items-center gap-1.5 font-black text-amber-950">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-xs uppercase tracking-wider">Thali Price Breakdown (Per Meal)</span>
          </div>
          <span className="font-extrabold text-amber-900 text-base">
            ₹{effectiveCustomerPricePerMeal} <span className="text-xs font-semibold text-slate-500">/ meal</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/60 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Base Thali</span>
            <span className="font-black text-slate-800 text-sm mt-0.5 block">₹{baseMealPrice}</span>
          </div>

          <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/60 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Portion Delta</span>
            <span
              className={`font-black text-sm mt-0.5 block ${
                deltaResult.customerDeltaPerMeal > 0
                  ? 'text-emerald-700'
                  : deltaResult.customerDeltaPerMeal < 0
                  ? 'text-rose-600'
                  : 'text-slate-600'
              }`}
            >
              {deltaResult.customerDeltaPerMeal > 0
                ? `+₹${deltaResult.customerDeltaPerMeal}`
                : deltaResult.customerDeltaPerMeal < 0
                ? `−₹${Math.abs(deltaResult.customerDeltaPerMeal)}`
                : '₹0'}
            </span>
          </div>

          <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/60 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Effective Rate</span>
            <span className="font-black text-amber-800 text-sm mt-0.5 block">₹{effectiveCustomerPricePerMeal}</span>
          </div>
        </div>

        {/* Packing Manifest Preview */}
        <div className="text-xs text-slate-700 font-medium flex items-start gap-2 pt-1">
          <span className="font-bold text-slate-900 shrink-0">🍱 Manifest:</span>
          <span className="font-mono text-slate-800 bg-white/70 px-2 py-0.5 rounded-md border border-amber-100 flex-1">
            {manifestSummary}
          </span>
        </div>

        {/* Dynamic Margin & Kitchen Cost Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/70 text-xs text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-700">Raw Kitchen Cost:</span>
            <span className="font-black text-slate-900">₹{rawKitchenCost}</span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-200">
              {effectiveVendorMargin}% kitchen ratio
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-medium">Vendor Payout:</span>
            <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              ₹{algorithmicPricing.vendorPayout.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
