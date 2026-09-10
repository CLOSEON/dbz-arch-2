import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

export interface GetPricingConfigRequest {
  planType: 'weekly' | 'monthly';
}

export interface GetPricingConfigResponse {
  type: 'weekly' | 'monthly';
  pricePerMeal: number;
  vendorCostPerMeal: number;
  margin: number;
  lastUpdatedAt: admin.firestore.Timestamp | any;
}

/**
 * Cloud Function: getPricingConfig
 *
 * Fetches current meal pricing configuration for a custom meal plan ("weekly" or "monthly").
 * Callable by customers or admins whenever building a custom plan.
 *
 * Input:
 *   - planType: "weekly" | "monthly"
 *
 * Output:
 *   {
 *     type: "weekly" | "monthly",
 *     pricePerMeal: number,
 *     vendorCostPerMeal: number,
 *     margin: number,
 *     lastUpdatedAt: timestamp
 *   }
 */
export const getPricingConfig = functions.https.onCall(
  async (data: any): Promise<GetPricingConfigResponse> => {
    // 1. Input Validation
    const rawPlanType = data?.planType || data?.type;
    if (!rawPlanType || typeof rawPlanType !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'planType is required and must be either "weekly" or "monthly".'
      );
    }

    const normalizedPlanType = rawPlanType.trim().toLowerCase();
    if (normalizedPlanType !== 'weekly' && normalizedPlanType !== 'monthly') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid planType. Expected "weekly" or "monthly".'
      );
    }

    const db = admin.firestore();
    const docId = `${normalizedPlanType}_pricing`;

    try {
      // 2. Fetch from pricingConfig collection based on docId
      let pricingDoc = await db.collection('pricingConfig').doc(docId).get();

      // Fallback query if saved under alternative document ID
      if (!pricingDoc.exists) {
        const querySnap = await db
          .collection('pricingConfig')
          .where('type', '==', normalizedPlanType)
          .limit(1)
          .get();

        if (!querySnap.empty) {
          pricingDoc = querySnap.docs[0];
        }
      }

      // 3. Check if pricing exists
      if (!pricingDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Pricing not configured for this plan type'
        );
      }

      const docData = pricingDoc.data();
      if (!docData) {
        throw new functions.https.HttpsError(
          'not-found',
          'Pricing not configured for this plan type'
        );
      }

      // 4. Validate numerical fields
      const pricePerMeal = typeof docData.pricePerMeal === 'number' ? docData.pricePerMeal : null;
      const vendorCostPerMeal =
        typeof docData.vendorCostPerMeal === 'number' ? docData.vendorCostPerMeal : null;

      if (pricePerMeal === null || vendorCostPerMeal === null) {
        throw new functions.https.HttpsError(
          'not-found',
          'Pricing not configured for this plan type'
        );
      }

      const margin =
        typeof docData.margin === 'number'
          ? docData.margin
          : Math.round((pricePerMeal - vendorCostPerMeal) * 100) / 100;

      const lastUpdatedAt = docData.updatedAt || docData.lastUpdatedAt || admin.firestore.Timestamp.now();

      // 5. Return Output matching exact required schema
      return {
        type: normalizedPlanType as 'weekly' | 'monthly',
        pricePerMeal,
        vendorCostPerMeal,
        margin,
        lastUpdatedAt,
      };
    } catch (error: any) {
      // Re-throw known HttpsErrors directly
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('[getPricingConfig] Internal error fetching pricing:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to fetch pricing configuration.'
      );
    }
  }
);

import {
  calculateCustomPlanPrice,
  CustomPlanType,
  PricingAlgorithmSettings,
  DEFAULT_PRICING_ALGORITHM,
  calculateVendorPayout,
  calculateCustomerFoodRate,
  calculateCustomerMealPrice,
  computeAlgorithmicMealPricing,
  AlgorithmicMealPricingResult,
} from './utils/pricingUtils';
import { publishEvent } from './utils/events';

export interface MealComponentItem {
  id: string;
  name: string;
  unit: 'piece' | 'bowl' | 'portion';
  baseQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  rawCost?: number;
  customerRate: number;
  vendorRate: number;
  isActive: boolean;
  category: 'staple' | 'curry' | 'side' | 'dessert';
}

export const DEFAULT_MEAL_COMPONENTS: MealComponentItem[] = [
  {
    id: 'roti',
    name: 'Roti / Chapati',
    unit: 'piece',
    baseQuantity: 4,
    minQuantity: 0,
    maxQuantity: 10,
    rawCost: 2.5,
    customerRate: 5,
    vendorRate: 4.17,
    isActive: true,
    category: 'staple',
  },
  {
    id: 'rice',
    name: 'Steamed Basmati Rice',
    unit: 'bowl',
    baseQuantity: 1,
    minQuantity: 0,
    maxQuantity: 3,
    rawCost: 6,
    customerRate: 15,
    vendorRate: 10,
    isActive: true,
    category: 'staple',
  },
  {
    id: 'sabzi',
    name: 'Seasonal Sabzi / Dry Veg',
    unit: 'bowl',
    baseQuantity: 1,
    minQuantity: 0,
    maxQuantity: 3,
    rawCost: 8,
    customerRate: 25,
    vendorRate: 13.33,
    isActive: true,
    category: 'curry',
  },
  {
    id: 'dal',
    name: 'Special Dal / Curry',
    unit: 'bowl',
    baseQuantity: 1,
    minQuantity: 0,
    maxQuantity: 3,
    rawCost: 6,
    customerRate: 15,
    vendorRate: 10,
    isActive: true,
    category: 'curry',
  },
  {
    id: 'sweet',
    name: 'Chef Dessert / Sweet',
    unit: 'portion',
    baseQuantity: 0,
    minQuantity: 0,
    maxQuantity: 5,
    rawCost: 6,
    customerRate: 15,
    vendorRate: 10,
    isActive: true,
    category: 'dessert',
  },
  {
    id: 'curd',
    name: 'Fresh Curd / Salad Bowl',
    unit: 'portion',
    baseQuantity: 0,
    minQuantity: 0,
    maxQuantity: 3,
    rawCost: 5,
    customerRate: 12,
    vendorRate: 8.33,
    isActive: true,
    category: 'side',
  },
];

export async function fetchPricingAlgorithmSettings(
  db: admin.firestore.Firestore
): Promise<PricingAlgorithmSettings> {
  try {
    const snap = await db.collection('system_settings').doc('pricing_algorithm').get();
    if (snap.exists) {
      const data = snap.data();
      if (data) {
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
    }
  } catch (e) {
    console.warn('[fetchPricingAlgorithmSettings] Using fallback defaults:', e);
  }
  return { ...DEFAULT_PRICING_ALGORITHM };
}

export async function fetchMealComponentsCatalog(
  db: admin.firestore.Firestore
): Promise<MealComponentItem[]> {
  try {
    const snap = await db.collection('system_settings').doc('meal_components').get();
    if (snap.exists) {
      const d = snap.data();
      if (Array.isArray(d?.components) && d.components.length > 0) {
        return d.components as MealComponentItem[];
      }
    }
  } catch (e) {
    console.warn('[fetchMealComponentsCatalog] Using fallback defaults:', e);
  }
  return DEFAULT_MEAL_COMPONENTS;
}

export function computeComponentDeltas(
  customMealConfig: any,
  catalog: MealComponentItem[],
  vendorRates?: Record<string, any>
) {
  const selectedQuantities =
    customMealConfig?.quantities || customMealConfig?.components || {};
  let customerDeltaPerMeal = 0;
  let vendorDeltaPerMeal = 0;
  const parts: string[] = [];

  catalog.forEach((comp) => {
    if (!comp.isActive) return;
    const baseQty = comp.baseQuantity ?? 0;
    const selectedQty =
      selectedQuantities[comp.id] !== undefined
        ? Number(selectedQuantities[comp.id])
        : baseQty;

    const delta = selectedQty - baseQty;
    const customerRate = comp.customerRate ?? 0;

    const override = vendorRates?.[comp.id];
    let vendorRate = comp.vendorRate ?? 0;
    if (typeof override === 'number') {
      vendorRate = override;
    } else if (override && typeof override.vendorRate === 'number') {
      vendorRate = override.vendorRate;
    }

    customerDeltaPerMeal += delta * customerRate;
    vendorDeltaPerMeal += delta * vendorRate;

    if (selectedQty === 0) {
      if (baseQty > 0) parts.push(`No ${comp.name}`);
    } else {
      parts.push(`${selectedQty}× ${comp.name}`);
    }
  });

  const manifestSummary = parts.length > 0 ? parts.join(', ') : 'Standard Thali';

  return {
    customerDeltaPerMeal,
    vendorDeltaPerMeal,
    manifestSummary,
  };
}

/**
 * Calculate the standard base thali vendor payout from components and vendor overrides.
 * e.g. 4× Roti + 1× Rice + 1× Sabzi + 1× Dal
 */
export function calculateBaseVendorCost(
  catalog: MealComponentItem[] = DEFAULT_MEAL_COMPONENTS,
  vendorOverrides?: Record<string, any>
): number {
  return catalog.reduce((sum, comp) => {
    if (!comp.isActive) return sum;
    const override = vendorOverrides?.[comp.id];
    let rate = comp.vendorRate ?? 0;
    if (typeof override === 'number') {
      rate = override;
    } else if (override && typeof override.vendorRate === 'number') {
      rate = override.vendorRate;
    }
    return sum + ((comp.baseQuantity ?? 0) * rate);
  }, 0);
}


export interface CreateCustomPlanSubscriptionRequest {
  userId: string;
  planType: 'weekly' | 'monthly';
  pattern: Record<string, any>;
  totalMeals: number;
  totalPrice: number;
  planStartDate?: any;
  vendorId?: string;
  paymentId?: string;
  razorpayOrderId?: string;
  customMealConfig?: any;
  custom_meal_config?: any;
  meal_components?: string[];
  metadata?: Record<string, any>;
}

export interface CreateCustomPlanSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  confirmation: boolean;
  message: string;
  subscription: {
    id: string;
    userId: string;
    subscriptionType: 'custom_weekly' | 'custom_monthly';
    totalMeals: number;
    totalPrice: number;
    pricePerMeal: number;
    status: string;
    billingCycle: 'weekly' | 'monthly';
    startDate: any;
    nextBillingDate: any;
    deliveryPattern: Record<string, any>;
    isCustomPlan: boolean;
    deliveryStatus: string;
  };
}

/**
 * Cloud Function: createCustomPlanSubscription
 *
 * Validates and creates a customized weekly or monthly plan subscription.
 *
 * Requirements:
 * - Validates userId exists in users collection
 * - Validates pattern has at least 1 meal
 * - Verifies totalMeals and totalPrice against calculateCustomPlanPrice
 * - Creates document in 'subscriptions' collection with customPlan and deliveryPattern
 * - Links to payments system
 * - Marks subscription as ready for delivery
 * - Returns subscription ID + confirmation
 */
export const createCustomPlanSubscription = functions.https.onCall(
  async (
    data: CreateCustomPlanSubscriptionRequest,
    context?: functions.https.CallableContext
  ): Promise<CreateCustomPlanSubscriptionResponse> => {
    const db = admin.firestore();

    // ── 1. Input Extraction & Validation ──────────────────────────────────────
    const rawUserId = data?.userId || context?.auth?.uid;
    if (!rawUserId || typeof rawUserId !== 'string' || !rawUserId.trim()) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId is required and must be a valid string.'
      );
    }
    const userId = rawUserId.trim();

    const rawPlanType = data?.planType;
    if (!rawPlanType || typeof rawPlanType !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'planType is required and must be either "weekly" or "monthly".'
      );
    }
    const planType = rawPlanType.trim().toLowerCase() as CustomPlanType;
    if (planType !== 'weekly' && planType !== 'monthly') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid planType. Expected "weekly" or "monthly".'
      );
    }

    let pattern = data?.pattern;
    // Robust normalizer: handles both object map { mon: 1 } and array [{ id: 'mon', meals: 1 }]
    if (Array.isArray(pattern)) {
      const converted: Record<string, number> = {};
      pattern.forEach((item: any) => {
        const key = item?.id || item?.dateKey || item?.shortDay || item?.day || item?.dateStr;
        const count = Number(item?.meals ?? item?.count ?? item?.quantity ?? item?.mealCount ?? 0);
        if (key && !isNaN(count)) {
          converted[key] = count;
        }
      });
      pattern = converted;
    }

    if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'pattern is required and must be an object mapping days/dates to meal counts.'
      );
    }

    // Validation: pattern must have at least 1 meal
    const patternMealCount = Object.values(pattern).reduce<number>((sum, val: any) => {
      const count = typeof val === 'object' && val !== null ? Number(val.meals ?? val.count ?? 0) : Number(val);
      return !isNaN(count) && count > 0 ? sum + count : sum;
    }, 0);

    if (patternMealCount < 1) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'pattern must have at least 1 meal.'
      );
    }

    // Validation: userId must exist in users collection
    const userDocSnap = await db.collection('users').doc(userId).get();
    if (!userDocSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        `User with ID "${userId}" does not exist.`
      );
    }
    const userData = userDocSnap.data() || {};

    // ── 2. Pricing Validation via calculateCustomPlanPrice & Component Rates ─
    let baseCustomerPricePerMeal = 50; // default baseline
    let baseVendorCostPerMeal = 35;
    try {
      const pricingDocId = `${planType}_pricing`;
      let pricingSnap = await db.collection('pricingConfig').doc(pricingDocId).get();

      if (!pricingSnap.exists) {
        const querySnap = await db
          .collection('pricingConfig')
          .where('type', '==', planType)
          .limit(1)
          .get();
        if (!querySnap.empty) {
          pricingSnap = querySnap.docs[0];
        }
      }

      if (pricingSnap.exists) {
        const pricingData = pricingSnap.data();
        if (typeof pricingData?.pricePerMeal === 'number') {
          baseCustomerPricePerMeal =
            planType === 'monthly' && pricingData.pricePerMeal > 300
              ? Math.round(pricingData.pricePerMeal / 28)
              : pricingData.pricePerMeal;
        }
        if (typeof pricingData?.vendorCostPerMeal === 'number') {
          baseVendorCostPerMeal =
            planType === 'monthly' && pricingData.vendorCostPerMeal > 300
              ? Math.round(pricingData.vendorCostPerMeal / 28)
              : pricingData.vendorCostPerMeal;
        }
      }
    } catch (pricingErr) {
      console.warn('[createCustomPlanSubscription] Error fetching pricing config, using default rate:', pricingErr);
    }

    const customMealConfig = data?.customMealConfig || data?.custom_meal_config || null;
    const vendorId = data?.vendorId || userData?.default_vendor_id || 'default_vendor';

    // Fetch vendor details and custom rate overrides if present
    let vendorData: any = null;
    if (vendorId && vendorId !== 'default_vendor') {
      try {
        const vendorSnap = await db.collection('users').doc(vendorId).get();
        if (vendorSnap.exists) {
          vendorData = vendorSnap.data();
        }
      } catch (vErr) {
        console.warn('[createCustomPlanSubscription] Failed fetching vendor data:', vErr);
      }
    }

    const algoSettings = await fetchPricingAlgorithmSettings(db);
    const vendorMarginOverride =
      typeof vendorData?.vendor_margin_percent === 'number'
        ? vendorData.vendor_margin_percent
        : typeof vendorData?.vendor_margin_override === 'number'
        ? vendorData.vendor_margin_override
        : undefined;
    const vendorMarginPercent = vendorMarginOverride ?? algoSettings.vendorMarginPercent ?? 40;

    const catalog = await fetchMealComponentsCatalog(db);
    const vendorCustomRates = vendorData?.custom_component_rates;
    const hasVendorCustomRates =
      vendorCustomRates &&
      typeof vendorCustomRates === 'object' &&
      Object.keys(vendorCustomRates).length > 0;

    // Resolve base vendor cost: prioritize vendor_base_payout, standard_meal_payout, or calculateBaseVendorCost
    if (typeof vendorData?.vendor_base_payout === 'number' && vendorData.vendor_base_payout > 0) {
      baseVendorCostPerMeal = vendorData.vendor_base_payout;
    } else if (typeof vendorData?.standard_meal_payout === 'number' && vendorData.standard_meal_payout > 0) {
      baseVendorCostPerMeal = vendorData.standard_meal_payout;
    } else if (typeof vendorData?.vendor_cost_per_meal === 'number' && vendorData.vendor_cost_per_meal > 0) {
      baseVendorCostPerMeal = vendorData.vendor_cost_per_meal;
    } else if (hasVendorCustomRates) {
      const computedBase = calculateBaseVendorCost(catalog, vendorCustomRates);
      if (computedBase > 0) {
        baseVendorCostPerMeal = computedBase;
      }
    }

    let customerDeltaPerMeal = 0;
    let vendorDeltaPerMeal = 0;
    let manifestSummary = 'Standard Thali (4× Roti, 1× Rice, 1× Dal, 1× Sabzi)';
    let rawKitchenCost = 30; // standard thali baseline raw cost
    let algorithmicPricing: AlgorithmicMealPricingResult | null = null;

    if (customMealConfig) {
      const catalog = await fetchMealComponentsCatalog(db);
      const vendorCustomRates = vendorData?.custom_component_rates;
      const deltas = computeComponentDeltas(customMealConfig, catalog, vendorCustomRates);
      customerDeltaPerMeal = deltas.customerDeltaPerMeal;
      vendorDeltaPerMeal = deltas.vendorDeltaPerMeal;
      manifestSummary = customMealConfig.manifestSummary || deltas.manifestSummary;

      // Calculate total raw kitchen cost from components
      const selectedQuantities =
        customMealConfig?.quantities || customMealConfig?.components || {};
      let totalRaw = 0;
      catalog.forEach((comp) => {
        if (!comp.isActive) return;
        const baseQty = comp.baseQuantity ?? 0;
        const selectedQty =
          selectedQuantities[comp.id] !== undefined
            ? Number(selectedQuantities[comp.id])
            : baseQty;
        const raw = typeof comp.rawCost === 'number' ? comp.rawCost : 0;
        totalRaw += selectedQty * raw;
      });

      if (totalRaw > 0) {
        rawKitchenCost = Math.round(totalRaw * 100) / 100;
      }

      algorithmicPricing = computeAlgorithmicMealPricing(
        rawKitchenCost,
        planType === 'weekly' ? 'weekly' : 'monthly',
        algoSettings,
        vendorMarginPercent
      );
    }

    let effectiveCustomerPricePerMeal = Math.max(10, baseCustomerPricePerMeal + customerDeltaPerMeal);
    let effectiveVendorCostPerMeal = Math.max(10, baseVendorCostPerMeal + vendorDeltaPerMeal);

    // If algorithmic pricing matches or is requested, adopt algorithmic rates
    const providedTotalPrice = Number(data.totalPrice);
    if (algorithmicPricing) {
      const algoVerification = calculateCustomPlanPrice(planType, pattern, algorithmicPricing.customerMealPrice);
      if (Math.abs(algoVerification.totalPrice - providedTotalPrice) <= 1.0) {
        effectiveCustomerPricePerMeal = algorithmicPricing.customerMealPrice;
        effectiveVendorCostPerMeal = algorithmicPricing.vendorPayout;
        if (!hasVendorCustomRates && !vendorData?.vendor_base_payout && !vendorData?.standard_meal_payout) {
          effectiveVendorCostPerMeal = algorithmicPricing.vendorPayout;
        }
      }
    }

    // Call calculateCustomPlanPrice to verify calculations
    const verification = calculateCustomPlanPrice(planType, pattern, effectiveCustomerPricePerMeal);

    if (verification.totalMeals !== Number(data.totalMeals)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Validation failed: Provided totalMeals (${data.totalMeals}) does not match calculated total meals (${verification.totalMeals}).`
      );
    }

    if (Math.abs(verification.totalPrice - providedTotalPrice) > 1.0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Validation failed: Provided totalPrice (₹${providedTotalPrice}) does not match calculated total price (₹${verification.totalPrice} at ₹${effectiveCustomerPricePerMeal}/meal).`
      );
    }

    const totalPayableToVendor = Math.round(verification.totalMeals * effectiveVendorCostPerMeal * 100) / 100;

    // ── 3. Billing & Start Dates Calculation ──────────────────────────────────
    let startTimestamp: admin.firestore.Timestamp;
    const rawStartDate = data?.planStartDate;

    if (rawStartDate instanceof admin.firestore.Timestamp) {
      startTimestamp = rawStartDate;
    } else if (typeof rawStartDate === 'number') {
      startTimestamp = admin.firestore.Timestamp.fromMillis(rawStartDate);
    } else if (rawStartDate) {
      const parsedDate = new Date(rawStartDate);
      startTimestamp = isNaN(parsedDate.getTime())
        ? admin.firestore.Timestamp.now()
        : admin.firestore.Timestamp.fromDate(parsedDate);
    } else {
      startTimestamp = admin.firestore.Timestamp.now();
    }

    const nextBillingDateObj = startTimestamp.toDate();
    if (planType === 'weekly') {
      nextBillingDateObj.setDate(nextBillingDateObj.getDate() + 7);
    } else {
      nextBillingDateObj.setMonth(nextBillingDateObj.getMonth() + 1);
    }
    const nextBillingDate = admin.firestore.Timestamp.fromDate(nextBillingDateObj);

    const now = admin.firestore.Timestamp.now();

    // ── 4. Create Document in "subscriptions" Collection via Batch ───────────
    const batch = db.batch();
    const subRef = db.collection('subscriptions').doc();
    const subscriptionType = planType === 'weekly' ? 'custom_weekly' : 'custom_monthly';
    const paymentId = data?.paymentId || null;
    const razorpayOrderId = data?.razorpayOrderId || null;

    const subscriptionDoc: Record<string, any> = {
      id: subRef.id,
      userId: userId,
      user_id: userId,
      vendor_id: vendorId,
      vendor_name: vendorData?.kitchen_name || vendorData?.name || '',
      subscriptionType: subscriptionType,
      plan_id: subscriptionType,
      customPlan: {
        pattern: pattern,
        totalMeals: verification.totalMeals,
        totalPrice: verification.totalPrice,
        pricePerMeal: effectiveCustomerPricePerMeal,
        basePricePerMeal: baseCustomerPricePerMeal,
        customerDeltaPerMeal,
        vendorDeltaPerMeal,
        createdAt: now,
      },
      status: 'active',
      billingCycle: planType,
      frequency: planType,
      nextBillingDate: nextBillingDate,
      next_billing_date: nextBillingDate,
      startDate: startTimestamp,
      start_date: startTimestamp,
      createdAt: now,
      created_at: now,

      // Component Manifest & Rates
      custom_meal_config: customMealConfig
        ? {
            ...customMealConfig,
            manifestSummary,
            customerDeltaPerMeal,
            vendorDeltaPerMeal,
            effectiveCustomerPricePerMeal,
            effectiveVendorCostPerMeal,
            rawKitchenCost,
            vendorMarginPercent,
            vendorPayout: effectiveVendorCostPerMeal,
            algorithmicPricing: algorithmicPricing || null,
          }
        : null,
      meal_components: [manifestSummary],
      effective_customer_price_per_meal: effectiveCustomerPricePerMeal,
      effective_vendor_cost_per_meal: effectiveVendorCostPerMeal,
      vendor_total_payable: totalPayableToVendor,

      // For delivery ops
      deliveryPattern: pattern,
      delivery_pattern: pattern,
      custom_schedule: pattern,
      custom_slots: (data as any)?.custom_slots || (data as any)?.customSlots || null,
      isCustomPlan: true,
      is_custom_plan: true,

      // Link to existing payments system
      total_price: verification.totalPrice,
      paid_amount: verification.totalPrice,
      price: verification.totalPrice,
      payment_status: paymentId ? 'paid' : 'pending_payment',
      payment_id: paymentId,
      razorpay_order_id: razorpayOrderId,

      // Mark subscription as "ready for delivery"
      delivery_status: 'ready_for_delivery',
      ready_for_delivery: true,
      is_ready_for_delivery: true,
    };

    if (data?.metadata && typeof data.metadata === 'object') {
      subscriptionDoc.metadata = data.metadata;
    }

    batch.set(subRef, subscriptionDoc);

    // ── 5. Link to Payments System Record ─────────────────────────────────────
    if (paymentId || razorpayOrderId) {
      const paymentDocRef = db.collection('payments').doc(paymentId || `pay_${subRef.id}`);
      batch.set(
        paymentDocRef,
        {
          subscription_id: subRef.id,
          user_id: userId,
          amount: verification.totalPrice,
          currency: 'INR',
          status: paymentId ? 'captured' : 'created',
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: paymentId,
          plan_type: subscriptionType,
          created_at: now,
        },
        { merge: true }
      );
    }

    // ── 6. Vendor Upfront Settlement & Earnings Crediting ─────────────────────
    if (vendorId && vendorId !== 'default_vendor') {
      const vendorPayoutRef = db.collection('vendor_payouts').doc();
      batch.set(vendorPayoutRef, {
        id: vendorPayoutRef.id,
        vendor_id: vendorId,
        vendor_name: vendorData?.kitchen_name || vendorData?.name || '',
        subscription_id: subRef.id,
        user_id: userId,
        user_name: userData?.name || '',
        amount: totalPayableToVendor,
        cost_per_meal: effectiveVendorCostPerMeal,
        total_meals: verification.totalMeals,
        source: 'custom_subscription',
        status: 'credited',
        reference_id: razorpayOrderId || paymentId || '',
        custom_meal_config: subscriptionDoc.custom_meal_config,
        raw_kitchen_cost: rawKitchenCost,
        vendor_margin_percent: vendorMarginPercent,
        manifest: manifestSummary,
        created_at: now,
      });

      // Increment vendor balance atomically
      const vendorDocRef = db.collection('users').doc(vendorId);
      batch.set(
        vendorDocRef,
        {
          total_earnings: admin.firestore.FieldValue.increment(totalPayableToVendor),
          pending_payout: admin.firestore.FieldValue.increment(totalPayableToVendor),
          last_payout_credit_at: now,
        },
        { merge: true }
      );
    }

    // ── 7. Update Customer Membership to Active ───────────────────────────────
    const customerDocRef = db.collection('users').doc(userId);
    batch.set(
      customerDocRef,
      {
        is_active_subscriber: true,
        membership_status: 'active',
        active_subscription_id: subRef.id,
        last_subscribed_at: now,
        updated_at: now,
      },
      { merge: true }
    );

    await batch.commit();

    // ── 6. Publish Order Event for Kitchen & Dispatch ─────────────────────────
    try {
      await publishEvent(
        'order_confirmed',
        userId,
        'customer',
        `custom_plan_sub_${subRef.id}`,
        {
          subscriptionId: subRef.id,
          planType,
          totalMeals: verification.totalMeals,
          totalPrice: verification.totalPrice,
          deliveryStatus: 'ready_for_delivery',
          isCustomPlan: true,
        }
      );
    } catch (eventErr) {
      console.warn('[createCustomPlanSubscription] System event publish error (non-fatal):', eventErr);
    }

    // ── 7. Return Subscription ID + Confirmation ──────────────────────────────
    return {
      success: true,
      subscriptionId: subRef.id,
      confirmation: true,
      message: `Custom ${planType} plan subscription created successfully and marked ready for delivery.`,
      subscription: {
        id: subRef.id,
        userId: userId,
        subscriptionType: subscriptionType,
        totalMeals: verification.totalMeals,
        totalPrice: verification.totalPrice,
        pricePerMeal: effectiveCustomerPricePerMeal,
        status: 'active',
        billingCycle: planType,
        startDate: startTimestamp,
        nextBillingDate: nextBillingDate,
        deliveryPattern: pattern,
        isCustomPlan: true,
        deliveryStatus: 'ready_for_delivery',
      },
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function: getCustomPlanStats
// ─────────────────────────────────────────────────────────────────────────────

export interface MostCommonPatternResult {
  pattern: Record<string, any>;
  usersCount: number;
}

export interface CustomPlanStatsResponse {
  totalCustomWeeklySubscriptions: number;
  totalCustomMonthlySubscriptions: number;
  averageMealsPerWeekOrdered: number;
  averageRevenuePerCustomSubscription: number;
  mostCommonPattern: MostCommonPatternResult | null;
  totalActiveCustomPlanSubscriptions: number;
  totalCustomSubscriptions: number;
  updatedAt: string;
}

/**
 * Cloud Function: getCustomPlanStats
 *
 * Calculates business insights and metrics for custom meal plan subscriptions.
 *
 * Requirements:
 * - Total custom weekly subscriptions: number
 * - Total custom monthly subscriptions: number
 * - Average meals/week ordered: number
 * - Average revenue/custom subscription: ₹
 * - Most common pattern: { pattern, usersCount }
 * - Total active custom plan subscriptions: number
 */
export const getCustomPlanStats = functions.https.onCall(
  async (
    _data: any,
    _context?: functions.https.CallableContext
  ): Promise<CustomPlanStatsResponse> => {
    const db = admin.firestore();

    try {
      const subsSnapshot = await db.collection('subscriptions').get();

      let totalWeekly = 0;
      let totalMonthly = 0;
      let totalActive = 0;
      let totalRevenue = 0;
      let totalCustomCount = 0;

      let weeklyMealsSum = 0;
      let weeklyMealsCount = 0;

      const patternFrequencyMap = new Map<
        string,
        { pattern: Record<string, any>; count: number }
      >();

      subsSnapshot.docs.forEach((docSnap) => {
        const sub = docSnap.data() || {};

        // Determine if subscription is a custom plan
        const isCustom =
          sub.isCustomPlan === true ||
          sub.is_custom_plan === true ||
          sub.subscriptionType === 'custom_weekly' ||
          sub.subscriptionType === 'custom_monthly' ||
          sub.plan_id === 'custom_weekly' ||
          sub.plan_id === 'custom_monthly';

        if (!isCustom) return;

        totalCustomCount += 1;

        const isWeekly =
          sub.billingCycle === 'weekly' ||
          sub.frequency === 'weekly' ||
          sub.subscriptionType === 'custom_weekly' ||
          sub.plan_id === 'custom_weekly';

        const isMonthly =
          sub.billingCycle === 'monthly' ||
          sub.frequency === 'monthly' ||
          sub.subscriptionType === 'custom_monthly' ||
          sub.plan_id === 'custom_monthly';

        if (isWeekly) {
          totalWeekly += 1;
        } else if (isMonthly) {
          totalMonthly += 1;
        } else {
          totalWeekly += 1;
        }

        if (sub.status === 'active') {
          totalActive += 1;
        }

        // Revenue calculation
        const price =
          Number(sub.customPlan?.totalPrice) ||
          Number(sub.total_price) ||
          Number(sub.price) ||
          0;
        totalRevenue += price;

        // Pattern extraction
        const rawPattern =
          sub.customPlan?.pattern ||
          sub.deliveryPattern ||
          sub.delivery_pattern ||
          {};

        const patternMeals = Object.values(rawPattern).reduce<number>(
          (sum: number, count: any) => {
            const num = Number(count);
            return !isNaN(num) && num > 0 ? sum + num : sum;
          },
          0
        );

        const subTotalMeals =
          Number(sub.customPlan?.totalMeals) ||
          Number(sub.totalMeals) ||
          patternMeals;

        if (isWeekly && subTotalMeals > 0) {
          weeklyMealsSum += subTotalMeals;
          weeklyMealsCount += 1;
        }

        // Normalize pattern for frequency counting
        if (Object.keys(rawPattern).length > 0) {
          const sortedEntries = Object.entries(rawPattern)
            .filter(([_, v]) => Number(v) > 0)
            .sort(([a], [b]) => a.localeCompare(b));

          const patternKey = sortedEntries
            .map(([k, v]) => `${k}:${v}`)
            .join(',');

          if (patternKey) {
            const existing = patternFrequencyMap.get(patternKey);
            if (existing) {
              existing.count += 1;
            } else {
              patternFrequencyMap.set(patternKey, {
                pattern: rawPattern,
                count: 1,
              });
            }
          }
        }
      });

      // Compute averages
      const averageMealsPerWeekOrdered =
        weeklyMealsCount > 0
          ? Math.round((weeklyMealsSum / weeklyMealsCount) * 10) / 10
          : 0;

      const averageRevenuePerCustomSubscription =
        totalCustomCount > 0
          ? Math.round(totalRevenue / totalCustomCount)
          : 0;

      // Find most common pattern
      let mostCommonPattern: MostCommonPatternResult | null = null;
      let highestCount = 0;

      patternFrequencyMap.forEach(({ pattern, count }) => {
        if (count > highestCount) {
          highestCount = count;
          mostCommonPattern = { pattern, usersCount: count };
        }
      });

      // Default baseline fallback if no patterns exist yet
      if (!mostCommonPattern && totalCustomCount === 0) {
        mostCommonPattern = {
          pattern: {
            monday: 1,
            tuesday: 1,
            wednesday: 1,
            thursday: 1,
            friday: 1,
            saturday: 2,
            sunday: 2,
          },
          usersCount: 0,
        };
      }

      return {
        totalCustomWeeklySubscriptions: totalWeekly,
        totalCustomMonthlySubscriptions: totalMonthly,
        averageMealsPerWeekOrdered,
        averageRevenuePerCustomSubscription,
        mostCommonPattern,
        totalActiveCustomPlanSubscriptions: totalActive,
        totalCustomSubscriptions: totalCustomCount,
        updatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[getCustomPlanStats] Error calculating stats:', err);
      throw new functions.https.HttpsError(
        'internal',
        err?.message || 'Failed to calculate custom plan statistics.'
      );
    }
  }
);

/**
 * ─── activateExternalSubscriptionAdmin ─────────────────────────────────────────
 * Admin-privileged Cloud Function to activate an external (offline UPI/cash) subscription,
 * set customer active membership, record transaction, and credit vendor payout ledger.
 */
export const activateExternalSubscriptionAdmin = functions.https.onCall(
  async (data, context) => {
    try {
      const {
        userId,
        userName,
        userPhone,
        planType = 'custom_weekly',
        planName,
        subscriptionType = 'custom_weekly',
        billingCycle = 'weekly',
        mealType = 'both',
        dietary = 'veg',
        pattern = {},
        totalMeals = 7,
        totalPrice = 350,
        pricePerMeal = 50,
        paymentMethod = 'upi',
        transactionId,
        paymentNotes = 'Offline transaction recorded by admin',
        vendorId,
        vendorName,
        vendorCostPerMeal = 35,
        vendorTotalPayable,
        startDate,
        deliverySlot = 'lunch',
        deliveryAddress,
      } = data || {};

      if (!userId || typeof userId !== 'string') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'userId is required.'
        );
      }

      const db = admin.firestore();
      const batch = db.batch();
      const subRef = db.collection('subscriptions').doc();
      const subId = subRef.id;

      const startDateObj = startDate ? new Date(startDate) : new Date();
      const daysToAdd = billingCycle === 'monthly' ? 30 : 7;
      const nextBillingDateObj = new Date(startDateObj.getTime() + daysToAdd * 86400000);

      const isCustom = subscriptionType !== 'standard';

      // 1. Subscription Document
      batch.set(subRef, {
        id: subId,
        user_id: userId,
        status: 'active',
        isCustomPlan: isCustom,
        is_custom_plan: isCustom,
        subscriptionType,
        billingCycle,
        frequency: billingCycle,
        plan_id: subscriptionType,
        plan_name:
          planName ||
          (subscriptionType === 'custom_weekly'
            ? 'Weekly Custom Plan'
            : subscriptionType === 'custom_monthly'
            ? 'Monthly Custom Plan'
            : 'Standard Plan'),
        meal_type: mealType,
        dietary: dietary || 'veg',
        deliveryPattern: pattern || {},
        customPlan: isCustom
          ? {
              pattern: pattern || {},
              totalMeals,
              totalPrice,
              pricePerMeal,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }
          : null,
        total_meals: totalMeals,
        totalMeals,
        total_price: totalPrice,
        price: totalPrice,
        vendor_id: vendorId || '',
        vendor_name: vendorName || '',
        is_external_payment: true,
        payment_method: `external_${paymentMethod}`,
        transaction_id: transactionId || `EXT-${Date.now()}`,
        payment_notes: paymentNotes,
        delivery_status: 'ready_for_delivery',
        start_date: admin.firestore.Timestamp.fromDate(startDateObj),
        startDate: admin.firestore.Timestamp.fromDate(startDateObj),
        next_billing_date: admin.firestore.Timestamp.fromDate(nextBillingDateObj),
        nextBillingDate: admin.firestore.Timestamp.fromDate(nextBillingDateObj),
        delivery_address: deliveryAddress || '',
        delivery_slot: deliverySlot || 'lunch',
        custom_meal_config: data.custom_meal_config || data.customMealConfig || null,
        meal_components: data.meal_components || (data.custom_meal_config?.manifestSummary ? [data.custom_meal_config.manifestSummary] : (data.customMealConfig?.manifestSummary ? [data.customMealConfig.manifestSummary] : null)),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        created_by_admin: context?.auth?.uid || 'admin',
      });

      // 2. Payments Record
      const paymentRef = db.collection('payments').doc();
      batch.set(paymentRef, {
        id: paymentRef.id,
        user_id: userId,
        subscription_id: subId,
        amount: totalPrice,
        currency: 'INR',
        status: 'success',
        method: `external_${paymentMethod}`,
        is_external: true,
        transaction_id: transactionId || `EXT-${Date.now()}`,
        notes: paymentNotes,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 3. Vendor Payout & Earnings
      if (vendorId) {
        const payable =
          vendorTotalPayable !== undefined
            ? Number(vendorTotalPayable)
            : Number(vendorCostPerMeal || 35) * Number(totalMeals);

        const vendorPayoutRef = db.collection('vendor_payouts').doc();
        batch.set(vendorPayoutRef, {
          id: vendorPayoutRef.id,
          vendor_id: vendorId,
          vendor_name: vendorName || '',
          subscription_id: subId,
          user_id: userId,
          user_name: userName || '',
          amount: payable,
          cost_per_meal: vendorCostPerMeal || 35,
          total_meals: totalMeals,
          source: 'external_subscription',
          status: 'credited',
          reference_id: transactionId || '',
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Increment vendor balance
        const vendorDocRef = db.collection('users').doc(vendorId);
        batch.set(
          vendorDocRef,
          {
            total_earnings: admin.firestore.FieldValue.increment(payable),
            pending_payout: admin.firestore.FieldValue.increment(payable),
            last_payout_credit_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 4. Update Customer Membership to Active
      const customerDocRef = db.collection('users').doc(userId);
      batch.set(
        customerDocRef,
        {
          is_active_subscriber: true,
          membership_status: 'active',
          active_subscription_id: subId,
          last_subscribed_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();

      return {
        success: true,
        subscriptionId: subId,
        message: 'External subscription successfully activated and vendor credited.',
      };
    } catch (err: any) {
      console.error('[activateExternalSubscriptionAdmin] Error:', err);
      throw new functions.https.HttpsError(
        'internal',
        err?.message || 'Failed to activate external subscription.'
      );
    }
  }
);
