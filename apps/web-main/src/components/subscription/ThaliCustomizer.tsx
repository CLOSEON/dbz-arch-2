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

      {/* Component Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {activeComponents.map((comp) => {
          const qty = quantities[comp.id] ?? comp.baseQuantity;
          const delta = qty - comp.baseQuantity;
          const isIncreased = delta > 0;
          const isDecreased = delta < 0;

          return (
            <div
              key={comp.id}
              className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                isIncreased
                  ? 'bg-emerald-50/40 border-emerald-200/80 shadow-xs'
                  : isDecreased
                  ? 'bg-rose-50/40 border-rose-200/80'
                  : 'bg-slate-50/60 border-slate-200/70 hover:border-slate-300'
              }`}
            >
              {/* Item Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xs text-slate-900 truncate">
                    {comp.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium lowercase">
                    ({comp.unit})
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span>Base: {comp.baseQuantity}</span>
                  <span>•</span>
                  <span>₹{comp.customerRate}/{comp.unit}</span>
                </div>

                {/* Delta Pill */}
                <div className="mt-1 text-[10px] font-bold">
                  {isIncreased && (
                    <span className="text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                      +{delta} (Adds ₹{delta * comp.customerRate})
                    </span>
                  )}
                  {isDecreased && (
                    <span className="text-rose-700 bg-rose-100/70 px-1.5 py-0.5 rounded">
                      {delta} (Saves ₹{Math.abs(delta) * comp.customerRate})
                    </span>
                  )}
                  {delta === 0 && (
                    <span className="text-slate-400 font-medium">Standard included</span>
                  )}
                </div>
              </div>

              {/* Stepper Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleDecrement(comp)}
                  disabled={qty <= comp.minQuantity}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-30 disabled:pointer-events-none font-black text-sm flex items-center justify-center transition-colors active:scale-90"
                  aria-label={`Decrease ${comp.name}`}
                >
                  <Minus className="w-3 h-3" />
                </button>

                <span className="w-6 text-center font-black font-mono text-xs text-slate-900">
                  {qty}
                </span>

                <button
                  type="button"
                  onClick={() => handleIncrement(comp)}
                  disabled={qty >= comp.maxQuantity}
                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-30 disabled:pointer-events-none font-black text-sm flex items-center justify-center transition-colors active:scale-90"
                  aria-label={`Increase ${comp.name}`}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Calculation Output Breakdown */}
      <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-black text-amber-900">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span>Thali Price Breakdown (Per Meal):</span>
          </div>
          <span className="font-extrabold text-slate-900 text-sm">
            ₹{effectiveCustomerPricePerMeal} / meal
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-amber-200/60 text-xs">
          <div className="bg-white/80 p-2 rounded-lg border border-amber-100">
            <span className="text-[10px] font-semibold text-slate-400 block">Base Thali</span>
            <span className="font-black text-slate-800">₹{baseMealPrice}</span>
          </div>

          <div className="bg-white/80 p-2 rounded-lg border border-amber-100">
            <span className="text-[10px] font-semibold text-slate-400 block">Custom Adjustment</span>
            <span
              className={`font-black ${
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

          <div className="bg-white/80 p-2 rounded-lg border border-amber-100">
            <span className="text-[10px] font-semibold text-slate-400 block">Effective Rate</span>
            <span className="font-black text-brand">₹{effectiveCustomerPricePerMeal}</span>
          </div>
        </div>

        {/* Packing Manifest Preview */}
        <div className="text-[11px] text-slate-600 font-medium flex items-start gap-1.5 pt-1">
          <span className="font-bold text-slate-800 shrink-0">📦 Manifest:</span>
          <span className="font-mono text-slate-700">{manifestSummary}</span>
        </div>

        {/* Dynamic Margin & Kitchen Cost Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/60 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-700">Kitchen Raw Cost:</span>
            <span className="font-black text-slate-900">₹{rawKitchenCost}</span>
            <span className="text-slate-400">•</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
              {effectiveVendorMargin}% kitchen margin
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Vendor Payout:</span>
            <span className="font-black text-emerald-700">₹{algorithmicPricing.vendorPayout.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
