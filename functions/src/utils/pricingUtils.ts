/**
 * Custom Plan Pricing Utility for Cloud Functions
 */

export type CustomPlanType = 'weekly' | 'monthly';

export interface PricingAlgorithmSettings {
  deliveryChargePerMeal: number;       // Default: 13 (₹13)
  vendorMarginPercent: number;         // Default: 40 (40% kitchen margin, divisor is 100 - vendorMarginPercent)
  platformMargins: {
    monthly: number;                   // Default: 4 (4% margin, divisor 0.96)
    weekly: number;                    // Default: 12 (12% margin, divisor 0.88)
    daily: number;                     // Default: 15 (15% margin, divisor 0.85)
  };
  roundingStrategy: 'round' | 'ceil';  // Default: 'round'
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_PRICING_ALGORITHM: PricingAlgorithmSettings = {
  deliveryChargePerMeal: 13,
  vendorMarginPercent: 40,
  platformMargins: {
    monthly: 4,
    weekly: 12,
    daily: 15,
  },
  roundingStrategy: 'round',
};

/**
 * Vendor Payout = (Raw Kitchen Cost / (100 - M_vendor)) * 100
 * (e.g. if Raw Cost = 30 and M_vendor = 40%, Payout = 30 / 60 * 100 = 50)
 */
export function calculateVendorPayout(
  rawKitchenCost: number,
  vendorMarginPercent: number = 40
): number {
  const safeMargin = Math.min(Math.max(vendorMarginPercent, 0), 99.99);
  const divisor = 100 - safeMargin;
  if (divisor <= 0) return rawKitchenCost;
  const payout = (rawKitchenCost / divisor) * 100;
  return Math.round(payout * 100) / 100;
}

/**
 * Customer Food Rate = Vendor Payout / (1 - Platform Margin %)
 * - Monthly: Vendor Payout / 0.96 (for 4% margin)
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
  deliveryChargePerMeal: number = 13,
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
}

export function computeAlgorithmicMealPricing(
  rawKitchenCost: number,
  planType: 'monthly' | 'weekly' | 'daily',
  settings: PricingAlgorithmSettings = DEFAULT_PRICING_ALGORITHM,
  vendorMarginOverride?: number
): AlgorithmicMealPricingResult {
  const vendorMarginPercent =
    typeof vendorMarginOverride === 'number' && vendorMarginOverride > 0 && vendorMarginOverride < 100
      ? vendorMarginOverride
      : settings?.vendorMarginPercent ?? DEFAULT_PRICING_ALGORITHM.vendorMarginPercent;

  const vendorPayout = calculateVendorPayout(rawKitchenCost, vendorMarginPercent);

  const platformMarginPercent =
    settings?.platformMargins?.[planType] ??
    (planType === 'monthly' ? 4 : planType === 'weekly' ? 12 : 15);

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

