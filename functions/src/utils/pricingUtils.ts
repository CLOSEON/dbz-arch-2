/**
 * Custom Plan Pricing Utility for Cloud Functions
 */

export type CustomPlanType = 'weekly' | 'monthly';

export interface PricingAlgorithmSettings {
  deliveryChargePerMeal: number;       // Default: 11 (₹11)
  vendorMarginPercent: number;         // Default: 46.15% (derived from 30 / 65 * 100)
  standardMealPayout?: number;         // Default: 65 (₹65 standard payout, e.g. Priya's Kitchen)
  baseRawCost?: number;                // Default: 30 (₹30 base ingredients cost)
  platformMargins: {
    monthly: number;                   // Default: 5 (5% margin for monthly veg orders)
    weekly: number;                    // Default: 12 (12% margin, divisor 0.88)
    daily: number;                     // Default: 15 (15% margin, divisor 0.85)
  };
  roundingStrategy: 'round' | 'ceil';  // Default: 'round'
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_PRICING_ALGORITHM: PricingAlgorithmSettings = {
  deliveryChargePerMeal: 11,
  vendorMarginPercent: 46.15,
  standardMealPayout: 65,
  baseRawCost: 30,
  platformMargins: {
    monthly: 5,
    weekly: 12,
    daily: 15,
  },
  roundingStrategy: 'round',
};

/**
 * Vendor Payout = (Raw Kitchen Cost / (100 - M_vendor)) * 100
 * (e.g. if Raw Cost = 30 and M_vendor = 40%, Payout = 30 / 60 * 100 = 50)
 * Calculates vendor payout for a customized meal based on the vendor payout ratio:
 * Ratio = (Base Raw Cost / Standard Meal Payout) * 100
 * Vendor Payout = (Custom Raw Cost / Ratio) * 100 = Custom Raw Cost * (Standard Meal Payout / Base Raw Cost)
 *
 * Example (Priya's Kitchen):
 * - Standard Meal Payout = ₹65, Base Raw Cost = ₹30
 * - Ratio = (30 / 65) * 100 ≈ 46.15%
 * - If selection raw cost = ₹25, Payout = 25 * (65 / 30) = ₹54.17
 * - If selection raw cost = ₹30 (standard), Payout = ₹65.00
 */
export function calculateVendorPayout(
  rawKitchenCost: number,
  vendorMarginOrPayout: number = 65,
  baseRawCost: number = 30
): number {
  if (rawKitchenCost <= 0) return 0;
  const safeBaseRaw = Math.max(1, baseRawCost);

  if (vendorMarginOrPayout >= 50) {
    const payout = rawKitchenCost * (vendorMarginOrPayout / safeBaseRaw);
    return Math.round(payout * 100) / 100;
  }

  const safeMargin = Math.min(Math.max(vendorMarginOrPayout, 0), 99.99);
  const divisor = 100 - safeMargin;
  if (divisor <= 0) return rawKitchenCost;
  const payout = (rawKitchenCost / divisor) * 100;
  return Math.round(payout * 100) / 100;
}

/**
 * Customer Food Rate = Vendor Payout / (1 - Platform Margin %)
 * - Monthly: Vendor Payout / 0.96 (for 4% margin)
 * - Monthly: Vendor Payout / 0.95 (for 5% margin)
 * - Weekly: Vendor Payout / 0.88 (for 12% margin)
 * - Daily: Vendor Payout / 0.85 (for 15% margin)
 */
export function calculateCustomerFoodRate(
  vendorPayout: number,
  platformMarginPercent: number
): number {
  const marginFraction = platformMarginPercent / 100;
  const divisor = 1 - marginFraction;
  if (divisor <= 0) return vendorPayout;
  return vendorPayout / divisor;
}

/**
 * Customer All-Inclusive Meal Price = Math.round(Customer Food Rate + deliveryChargePerMeal)
 * (or Math.ceil if roundingStrategy is 'ceil')
 */
export function calculateCustomerMealPrice(
  customerFoodRate: number,
  deliveryChargePerMeal: number = 11,
  roundingStrategy: 'round' | 'ceil' = 'round'
): number {
  const total = customerFoodRate + deliveryChargePerMeal;
  return roundingStrategy === 'ceil' ? Math.ceil(total) : Math.round(total);
}

export interface AlgorithmicMealPricingResult {
  rawKitchenCost: number;
  vendorMarginPercent: number;
  vendorPayout: number;
  platformMarginPercent: number;
  customerFoodRate: number;
  deliveryChargePerMeal: number;
  customerMealPrice: number;
  platformGrossMarginRupees: number;
  platformGrossMarginPercent: number;
  standardMealPayout?: number;
  costRatio?: number;
}

export function computeAlgorithmicMealPricing(
  rawKitchenCost: number,
  planType: 'monthly' | 'weekly' | 'daily',
  settings: PricingAlgorithmSettings = DEFAULT_PRICING_ALGORITHM,
  vendorMarginOverride?: number,
  vendorStandardPayoutOverride?: number
): AlgorithmicMealPricingResult {
  const standardPayout =
    typeof vendorStandardPayoutOverride === 'number' && vendorStandardPayoutOverride > 0
      ? vendorStandardPayoutOverride
      : (typeof vendorMarginOverride === 'number' && vendorMarginOverride >= 50
          ? vendorMarginOverride
          : (settings?.standardMealPayout ?? DEFAULT_PRICING_ALGORITHM.standardMealPayout ?? 65));

  const baseRawCost = settings?.baseRawCost ?? DEFAULT_PRICING_ALGORITHM.baseRawCost ?? 30;
  const costRatio = Number(((baseRawCost / Math.max(1, standardPayout)) * 100).toFixed(2));

  const vendorMarginPercent =
    typeof vendorMarginOverride === 'number' && vendorMarginOverride > 0 && vendorMarginOverride < 50
      ? vendorMarginOverride
      : (settings?.vendorMarginPercent ?? costRatio);

  const vendorPayout = calculateVendorPayout(rawKitchenCost, standardPayout, baseRawCost);

  const platformMarginPercent =
    settings?.platformMargins?.[planType] ??
    (planType === 'monthly' ? 5 : planType === 'weekly' ? 12 : 15);

  const customerFoodRate = calculateCustomerFoodRate(vendorPayout, platformMarginPercent);

  const deliveryChargePerMeal =
    typeof settings?.deliveryChargePerMeal === 'number'
      ? settings.deliveryChargePerMeal
      : DEFAULT_PRICING_ALGORITHM.deliveryChargePerMeal;

  const roundingStrategy = settings?.roundingStrategy || 'round';
  const customerMealPrice = calculateCustomerMealPrice(
    customerFoodRate,
    deliveryChargePerMeal,
    roundingStrategy
  );

  const platformGrossMarginRupees =
    Math.round((customerMealPrice - vendorPayout - deliveryChargePerMeal) * 100) / 100;
  const platformGrossMarginPercent =
    customerFoodRate > 0
      ? Number((((customerFoodRate - vendorPayout) / customerFoodRate) * 100).toFixed(1))
      : 0;

  return {
    rawKitchenCost,
    vendorMarginPercent,
    vendorPayout,
    platformMarginPercent,
    customerFoodRate,
    deliveryChargePerMeal,
    customerMealPrice,
    platformGrossMarginRupees,
    platformGrossMarginPercent,
    standardMealPayout: standardPayout,
    costRatio,
  };
}

export interface CustomPlanPriceResult {
  totalMeals: number;
  pricePerMeal: number;
  totalPrice: number;
  pattern: Record<string, any>;
  planType: CustomPlanType;
}

/**
 * Calculates total meals and total price for a custom meal plan pattern.
 *
 * @param planType - "weekly" | "monthly"
 * @param pattern - object mapping days/dates to meal counts (0, 1, 2)
 * @param pricePerMeal - price rate per meal
 */
export function calculateCustomPlanPrice(
  planType: CustomPlanType,
  pattern: Record<string, any>,
  pricePerMeal: number
): CustomPlanPriceResult {
  const totalMeals = Object.values(pattern || {}).reduce<number>((sum, val) => {
    const count = Number(val);
    if (!isNaN(count) && count > 0) {
      return sum + count;
    }
    return sum;
  }, 0);

  const rawPrice = totalMeals * pricePerMeal;
  const totalPrice = Math.round(rawPrice * 100) / 100;

  return {
    totalMeals,
    pricePerMeal,
    totalPrice,
    pattern,
    planType,
  };
}

