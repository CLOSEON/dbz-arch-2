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

import {
  PricingAlgorithmSettings,
  DEFAULT_PRICING_ALGORITHM,
  calculateVendorPayout,
  calculateCustomerFoodRate,
  calculateCustomerMealPrice,
  computeAlgorithmicMealPricing,
  AlgorithmicMealPricingResult,
} from '@/lib/pricing';

export {
  type PricingAlgorithmSettings,
  DEFAULT_PRICING_ALGORITHM,
  calculateVendorPayout,
  calculateCustomerFoodRate,
  calculateCustomerMealPrice,
  computeAlgorithmicMealPricing,
  type AlgorithmicMealPricingResult,
};

export const PRICING_ALGORITHM_DOC = {
  collection: 'system_settings',
  docId: 'pricing_algorithm',
};

/**
 * Fetch pricing algorithm settings from system_settings/pricing_algorithm.
 */
export async function getPricingAlgorithmSettings(): Promise<PricingAlgorithmSettings> {
  try {
    const docRef = doc(db, PRICING_ALGORITHM_DOC.collection, PRICING_ALGORITHM_DOC.docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        deliveryChargePerMeal:
          typeof data.deliveryChargePerMeal === 'number'
            ? data.deliveryChargePerMeal
            : DEFAULT_PRICING_ALGORITHM.deliveryChargePerMeal,
        vendorMarginPercent:
          typeof data.vendorMarginPercent === 'number'
            ? data.vendorMarginPercent
            : DEFAULT_PRICING_ALGORITHM.vendorMarginPercent,
        platformMargins: {
          monthly:
            typeof data.platformMargins?.monthly === 'number'
              ? data.platformMargins.monthly
              : DEFAULT_PRICING_ALGORITHM.platformMargins.monthly,
          weekly:
            typeof data.platformMargins?.weekly === 'number'
              ? data.platformMargins.weekly
              : DEFAULT_PRICING_ALGORITHM.platformMargins.weekly,
          daily:
            typeof data.platformMargins?.daily === 'number'
              ? data.platformMargins.daily
              : DEFAULT_PRICING_ALGORITHM.platformMargins.daily,
        },
        roundingStrategy: data.roundingStrategy === 'ceil' ? 'ceil' : 'round',
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (err) {
    console.warn('[getPricingAlgorithmSettings] Failed to fetch settings, using defaults:', err);
  }
  return { ...DEFAULT_PRICING_ALGORITHM };
}

/**
 * Save pricing algorithm settings to system_settings/pricing_algorithm.
 */
export async function savePricingAlgorithmSettings(
  settings: Partial<PricingAlgorithmSettings>,
  updatedBy: string = 'admin'
): Promise<PricingAlgorithmSettings> {
  const docRef = doc(db, PRICING_ALGORITHM_DOC.collection, PRICING_ALGORITHM_DOC.docId);
  const payload: PricingAlgorithmSettings = {
    deliveryChargePerMeal:
      typeof settings.deliveryChargePerMeal === 'number'
        ? settings.deliveryChargePerMeal
        : DEFAULT_PRICING_ALGORITHM.deliveryChargePerMeal,
    vendorMarginPercent:
      typeof settings.vendorMarginPercent === 'number'
        ? settings.vendorMarginPercent
        : DEFAULT_PRICING_ALGORITHM.vendorMarginPercent,
    platformMargins: {
      monthly:
        typeof settings.platformMargins?.monthly === 'number'
          ? settings.platformMargins.monthly
          : DEFAULT_PRICING_ALGORITHM.platformMargins.monthly,
      weekly:
        typeof settings.platformMargins?.weekly === 'number'
          ? settings.platformMargins.weekly
          : DEFAULT_PRICING_ALGORITHM.platformMargins.weekly,
      daily:
        typeof settings.platformMargins?.daily === 'number'
          ? settings.platformMargins.daily
          : DEFAULT_PRICING_ALGORITHM.platformMargins.daily,
    },
    roundingStrategy: settings.roundingStrategy === 'ceil' ? 'ceil' : 'round',
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'admin',
  };

  await setDoc(docRef, payload, { merge: true });
  return payload;
}

