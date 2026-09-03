/**
 * Custom Plan Pricing Utility
 */

export type CustomPlanType = 'weekly' | 'monthly';

export type CustomPlanMealCount = 0 | 1 | 2;

export type WeeklyPlanPattern = Partial<
  Record<
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday'
    | 'mon'
    | 'tue'
    | 'wed'
    | 'thu'
    | 'fri'
    | 'sat'
    | 'sun'
    | string,
    number
  >
>;

export type MonthlyPlanPattern = Record<string | number, number>;

export type CustomPlanPattern = WeeklyPlanPattern | MonthlyPlanPattern | Record<string, any>;

export interface CustomPlanPriceResult<T extends CustomPlanPattern = CustomPlanPattern> {
  totalMeals: number;
  pricePerMeal: number;
  totalPrice: number;
  pattern: T;
  planType: CustomPlanType;
}

export interface CalculateCustomPlanPriceOptions<T extends CustomPlanPattern = CustomPlanPattern> {
  planType: CustomPlanType;
  pattern: T;
  pricePerMeal: number;
}

/**
 * Calculates total meals and price for a customized weekly or monthly plan.
 *
 * Supports both argument styles:
 * 1. calculateCustomPlanPrice(planType, pattern, pricePerMeal)
 * 2. calculateCustomPlanPrice({ planType, pattern, pricePerMeal })
 *
 * @param planType - "weekly" | "monthly" (or options object)
 * @param pattern - map of days (e.g. { monday: 1, ... }) or month dates (e.g. { "1": 1, ... }) to 0|1|2
 * @param pricePerMeal - numeric rate per meal (fetched from config)
 * @returns { totalMeals, pricePerMeal, totalPrice, pattern, planType }
 *
 * @example
 * // Weekly plan:
 * calculateCustomPlanPrice("weekly", { monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 2, sunday: 2 }, 50);
 * // Output: { totalMeals: 9, pricePerMeal: 50, totalPrice: 450, pattern: {...}, planType: "weekly" }
 *
 * @example
 * // Monthly plan:
 * calculateCustomPlanPrice("monthly", { "1": 1, "2": 2, "3": 1, "4": 0 }, 50);
 * // Output: { totalMeals: 4, pricePerMeal: 50, totalPrice: 200, pattern: {...}, planType: "monthly" }
 */
export function calculateCustomPlanPrice<T extends CustomPlanPattern = CustomPlanPattern>(
  planTypeOrOptions: CustomPlanType | CalculateCustomPlanPriceOptions<T>,
  maybePattern?: T,
  maybePricePerMeal?: number
): CustomPlanPriceResult<T> {
  let planType: CustomPlanType;
  let pattern: T;
  let pricePerMeal: number;

  if (typeof planTypeOrOptions === 'object' && planTypeOrOptions !== null) {
    planType = planTypeOrOptions.planType;
    pattern = planTypeOrOptions.pattern;
    pricePerMeal = Number(planTypeOrOptions.pricePerMeal) || 0;
  } else {
    planType = planTypeOrOptions;
    pattern = (maybePattern ?? {}) as T;
    pricePerMeal = Number(maybePricePerMeal) || 0;
  }

  // Count all non-zero meals in pattern
  const totalMeals = Object.values(pattern).reduce<number>((sum, val) => {
    const count = Number(val);
    if (!isNaN(count) && count > 0) {
      return sum + count;
    }
    return sum;
  }, 0);

  // Calculate: totalPrice = totalMeals * pricePerMeal
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

export default calculateCustomPlanPrice;
