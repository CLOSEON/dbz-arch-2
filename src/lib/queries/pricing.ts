import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MealPricingConfig, PlanPricingType } from '@/types';

export const PRICING_COLLECTION = 'pricingConfig';

export const DEFAULT_WEEKLY_PRICING: MealPricingConfig = {
  id: 'weekly_pricing',
  type: 'weekly',
  pricePerMeal: 50,
  vendorCostPerMeal: 30,
  margin: 20,
};

export const DEFAULT_MONTHLY_PRICING: MealPricingConfig = {
  id: 'monthly_pricing',
  type: 'monthly',
  pricePerMeal: 1400,
  vendorCostPerMeal: 900,
  margin: 500,
};

/**
 * Fetch a specific meal pricing configuration (weekly or monthly) from Firestore.
 * Falls back to default initial values if not yet configured in database.
 */
export async function getPricingConfig(type: PlanPricingType): Promise<MealPricingConfig> {
  const docId = `${type}_pricing`;
  try {
    const snap = await getDoc(doc(db, PRICING_COLLECTION, docId));
    if (snap.exists()) {
      const data = snap.data();
      const price = typeof data.pricePerMeal === 'number' ? data.pricePerMeal : (type === 'weekly' ? 50 : 1400);
      const vendorCost = typeof data.vendorCostPerMeal === 'number' ? data.vendorCostPerMeal : (type === 'weekly' ? 30 : 900);
      const margin = typeof data.margin === 'number' ? data.margin : Math.round((price - vendorCost) * 100) / 100;

      return {
        id: snap.id,
        type: data.type || type,
        pricePerMeal: price,
        vendorCostPerMeal: vendorCost,
        margin,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (err) {
    console.warn(`[getPricingConfig] Failed to fetch ${type} pricing:`, err);
  }

  return type === 'weekly' ? { ...DEFAULT_WEEKLY_PRICING } : { ...DEFAULT_MONTHLY_PRICING };
}

/**
 * Fetch all pricing configs (both weekly and monthly) in parallel.
 */
export async function getAllPricingConfigs(): Promise<{
  weekly: MealPricingConfig;
  monthly: MealPricingConfig;
}> {
  const [weekly, monthly] = await Promise.all([
    getPricingConfig('weekly'),
    getPricingConfig('monthly'),
  ]);
  return { weekly, monthly };
}

/**
 * Save pricing configuration to Firestore for either 'weekly' or 'monthly'.
 * Calculates margin: pricePerMeal - vendorCostPerMeal.
 */
export async function savePricingConfig(
  type: PlanPricingType,
  pricePerMeal: number,
  vendorCostPerMeal: number,
  updatedBy: string = 'admin'
): Promise<MealPricingConfig> {
  const docId = `${type}_pricing`;
  const sanitizedPrice = Math.max(0, Math.round(Number(pricePerMeal) * 100) / 100);
  const sanitizedVendorCost = Math.max(0, Math.round(Number(vendorCostPerMeal) * 100) / 100);
  const margin = Math.round((sanitizedPrice - sanitizedVendorCost) * 100) / 100;

  const payload: MealPricingConfig = {
    id: docId,
    type,
    pricePerMeal: sanitizedPrice,
    vendorCostPerMeal: sanitizedVendorCost,
    margin,
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'admin',
  };

  const docRef = doc(db, PRICING_COLLECTION, docId);
  await setDoc(docRef, payload, { merge: true });

  return payload;
}

export interface CloudPricingConfigResponse {
  type: 'weekly' | 'monthly';
  pricePerMeal: number;
  vendorCostPerMeal: number;
  margin: number;
  lastUpdatedAt: any;
}

/**
 * Calls the "getPricingConfig" Cloud Function directly.
 * Used whenever a customer or admin builds a custom meal plan to fetch live validated rates.
 */
export async function fetchPricingConfigViaFunction(
  planType: PlanPricingType
): Promise<CloudPricingConfigResponse> {
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('@/lib/firebase');

  const getPricingFn = httpsCallable<{ planType: string }, CloudPricingConfigResponse>(
    functions,
    'getPricingConfig'
  );

  const result = await getPricingFn({ planType });
  return result.data;
}

export {
  calculateCustomPlanPrice,
  type CustomPlanType,
  type CustomPlanPattern,
  type CustomPlanPriceResult,
  type WeeklyPlanPattern,
  type MonthlyPlanPattern,
} from '@/lib/pricing';

