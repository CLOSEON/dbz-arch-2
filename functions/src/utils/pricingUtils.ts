/**
 * Custom Plan Pricing Utility for Cloud Functions
 */

export type CustomPlanType = 'weekly' | 'monthly';

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
