/**
 * DABZZO CENTRAL PRICING ENGINE (Web-main client-side isomorphic mirror)
 *
 * Core Business Principle:
 * A subscription is a collection of individual meals, and each meal is a collection of priced items.
 *
 * ITEM -> MEAL -> SELECTED MEALS -> SUBSCRIPTION / ORDER -> CENTRAL PRICING ENGINE -> FINAL CUSTOMER PRICE
 */

export interface PricingRules {
  /** Vendor deduction percentage (e.g. 0.08 for 8%) */
  vendorDeduction: number;
  /** Dabzzo platform food margin percentage (e.g. 0.13 for 13%) */
  margin: number;
  /** Fixed delivery fee added per meal/delivery in ₹ (e.g. 11) */
  deliveryCharge: number;
  /** Payment gateway processing fee (e.g. 0.025 for 2.5% Razorpay fee) */
  paymentFee: number;
  /** Rounding strategy for customer price: 'round' (2 decimals / paise) | 'round_integer' | 'ceil' */
  roundingStrategy: 'round' | 'round_integer' | 'ceil';
  updatedAt?: any;
  updatedBy?: string;
  version?: string;
}

export const DEFAULT_PRICING_RULES: PricingRules = {
  vendorDeduction: 0.08,  // 8%
  margin: 0.13,           // 13%
  deliveryCharge: 11,     // ₹11
  paymentFee: 0.025,      // 2.5%
  roundingStrategy: 'round',
  version: '2.0.0',
};

export type ItemUnit = 'piece' | 'bowl' | 'portion' | 'plate' | 'cup';
export type ItemCategory = 'staple' | 'curry' | 'side' | 'dessert' | 'beverage' | 'other';

export interface ItemDefinition {
  id: string;
  name: string;
  price: number; // Centrally controlled Admin price in ₹
  customerRate?: number;
  vendorRate?: number;
  unit: ItemUnit;
  category: ItemCategory;
  isActive: boolean;
  minQuantity?: number;
  maxQuantity?: number;
  baseQuantity?: number;
  rawCost?: number;
  description?: string;
}

/**
 * Resolved Item Rates Breakdown:
 * rawCost: Raw vendor cost entered by Admin (e.g. ₹1.50 for roti)
 * vendorRate: Internal vendor payout (e.g. ₹1.50 * 65/30 = ₹3.25)
 * customerRate: Customer-facing item price (e.g. ₹3.25 / 0.96 = ₹4.00)
 */
export interface ResolvedItemRates {
  rawCost: number;
  vendorRate: number;
  customerRate: number;
}

/**
 * Derives vendor payout and customer item rate from raw vendor cost.
 * Multiplier = 65 / 30 = 2.166667 (Standard meal ₹65 payout / ₹30 raw cost)
 * Customer rate with 4% monthly margin = vendorRate / 0.96 (rounded)
 */
export function deriveRatesFromVendorCost(
  rawCost: number,
  marginPercent: number = 4
): ResolvedItemRates {
  const safeCost = Math.max(0, Number(rawCost) || 0);
  const vendorPayoutMultiplier = 65 / 30;
  const vendorRate = Math.round(safeCost * vendorPayoutMultiplier * 100) / 100;
  const safeMargin = Math.min(Math.max(marginPercent, 0), 99) / 100;
  const customerRate = Math.max(
    1,
    Math.ceil(vendorRate),
    Math.round(vendorRate / (1 - safeMargin))
  );
  return {
    rawCost: safeCost,
    vendorRate,
    customerRate,
  };
}

/**
 * Resolves component rates considering potential vendor overrides.
 */
export function resolveComponentRates(
  comp: { id: string; rawCost?: number; vendorRate?: number; customerRate?: number; price?: number },
  override?: any,
  marginPercent: number = 4
): ResolvedItemRates {
  if (!override) {
    const rawCost = typeof comp.rawCost === 'number' && comp.rawCost > 0 ? comp.rawCost : (comp.id === 'roti' ? 1.5 : 5);
    const derived = deriveRatesFromVendorCost(rawCost, marginPercent);
    const vendorRate = typeof comp.vendorRate === 'number' && comp.vendorRate > 0 ? comp.vendorRate : derived.vendorRate;
    const customerRate = typeof comp.customerRate === 'number' && comp.customerRate > 0
      ? comp.customerRate
      : (typeof comp.price === 'number' && comp.price > 0 ? comp.price : derived.customerRate);
    return { rawCost, vendorRate, customerRate };
  }

  // If override is a plain number (Admin typed raw cost or rate)
  if (typeof override === 'number') {
    return deriveRatesFromVendorCost(override, marginPercent);
  }

  // If override is an object { vendorCost, rawCost, vendorRate, customerRate }
  if (typeof override === 'object') {
    const rawCost = typeof override.vendorCost === 'number'
      ? override.vendorCost
      : (typeof override.rawCost === 'number' ? override.rawCost : (typeof comp.rawCost === 'number' ? comp.rawCost : 1.5));

    const derived = deriveRatesFromVendorCost(rawCost, marginPercent);

    let vendorRate: number;
    if (typeof override.vendorRate === 'number' && override.vendorRate > 0) {
      vendorRate = override.vendorRate;
    } else {
      vendorRate = derived.vendorRate;
    }

    let customerRate: number;
    if (typeof override.customerRate === 'number' && override.customerRate > 0) {
      customerRate = override.customerRate;
    } else {
      customerRate = derived.customerRate;
    }

    return { rawCost, vendorRate, customerRate };
  }

  return deriveRatesFromVendorCost(comp.rawCost || 1.5, marginPercent);
}

/**
 * Authoritative default items with Admin-controlled pricing:
 * Rice ₹15, Dal ₹20, Roti ₹8, Sabji ₹25, Salad ₹10, Paneer ₹30, Curd ₹15
 * Standard Base Meal: 4× Roti (₹6) + 1× Dal (₹7) + 1× Rice (₹8) + 1× Sabzi (₹9) = ₹30 Raw Kitchen Cost
 * Multiplier 65/30 => ₹65 Base Vendor Payout
 * Monthly 4% Margin => Roti ₹4, Rice ₹18, Dal ₹16, Sabji ₹20, Salad ₹11, Sweet ₹18
 */
export const DEFAULT_ITEM_CATALOG: ItemDefinition[] = [
  {
    id: 'roti',
    name: 'Roti',
    price: 4,
    customerRate: 4,
    vendorRate: 3.25,
    unit: 'piece',
    category: 'staple',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 10,
    baseQuantity: 4,
    rawCost: 1.5,
  },
  {
    id: 'rice',
    name: 'Rice',
    price: 18,
    customerRate: 18,
    vendorRate: 17.33,
    unit: 'bowl',
    category: 'staple',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 4,
    baseQuantity: 1,
    rawCost: 8.0,
  },
  {
    id: 'dal',
    name: 'Dal',
    price: 16,
    customerRate: 16,
    vendorRate: 15.17,
    unit: 'bowl',
    category: 'curry',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 4,
    baseQuantity: 1,
    rawCost: 7.0,
  },
  {
    id: 'sabji',
    name: 'Sabji',
    price: 20,
    customerRate: 20,
    vendorRate: 19.50,
    unit: 'bowl',
    category: 'curry',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 4,
    baseQuantity: 1,
    rawCost: 9.0,
  },
  {
    id: 'salad',
    name: 'Salad',
    price: 11,
    customerRate: 11,
    vendorRate: 10.83,
    unit: 'portion',
    category: 'side',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 3,
    baseQuantity: 1,
    rawCost: 5.0,
  },
  {
    id: 'paneer',
    name: 'Paneer Sabji',
    price: 32,
    customerRate: 32,
    vendorRate: 30.33,
    unit: 'bowl',
    category: 'curry',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 3,
    baseQuantity: 0,
    rawCost: 14.0,
  },
  {
    id: 'curd',
    name: 'Curd / Raita',
    price: 14,
    customerRate: 14,
    vendorRate: 13.00,
    unit: 'portion',
    category: 'side',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 3,
    baseQuantity: 0,
    rawCost: 6.0,
  },
  {
    id: 'sweet',
    name: 'Chef Sweet / Dessert',
    price: 18,
    customerRate: 18,
    vendorRate: 17.33,
    unit: 'piece',
    category: 'dessert',
    isActive: true,
    minQuantity: 0,
    maxQuantity: 5,
    baseQuantity: 0,
    rawCost: 8.0,
  },
];

export interface StandardMealDefinition {
  id: string;
  name: string;
  isActive: boolean;
  itemQuantities: Record<string, number>;
  description?: string;
}

export const DEFAULT_STANDARD_MEAL: StandardMealDefinition = {
  id: 'standard_veg_thali',
  name: 'Standard Veg Thali',
  isActive: true,
  itemQuantities: {
    rice: 1,
    dal: 1,
    roti: 2,
    sabji: 1,
    salad: 1,
  },
  description: '1× Rice, 1× Dal, 2× Roti, 1× Sabji, 1× Salad',
};

export interface SelectedItemInput {
  id: string;
  quantity: number;
}

export interface MealPricingBreakdown {
  itemTotal: number;
  vendorDeductionRate: number;
  vendorDeduction: number;
  vendorCost: number;
  marginRate: number;
  margin: number;
  foodSellingPrice: number;
  deliveryCharge: number;
  subtotal: number;
  paymentFeeRate: number;
  paymentFee: number;
  finalPrice: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
    unit: string;
  }>;
  manifestSummary: string;
}

export function applyRounding(value: number, strategy: PricingRules['roundingStrategy'] = 'round'): number {
  if (strategy === 'ceil') {
    return Math.ceil(value);
  }
  if (strategy === 'round_integer') {
    return Math.round(value);
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateMealPrice(
  selectedItems: SelectedItemInput[] | Record<string, number>,
  catalog: ItemDefinition[] = DEFAULT_ITEM_CATALOG,
  rules: PricingRules = DEFAULT_PRICING_RULES
): MealPricingBreakdown {
  const catalogMap = new Map<string, ItemDefinition>();
  catalog.forEach((item) => {
    catalogMap.set(item.id.toLowerCase().trim(), item);
  });

  // Normalize selected items into array
  const rawItemsArray: SelectedItemInput[] = Array.isArray(selectedItems)
    ? selectedItems
    : Object.entries(selectedItems || {}).map(([id, quantity]) => ({ id, quantity: Number(quantity) }));

  // Consolidate duplicate item IDs and validate numeric quantities
  const consolidatedMap = new Map<string, number>();
  for (const sel of rawItemsArray) {
    if (!sel || !sel.id) continue;
    const cleanId = String(sel.id).toLowerCase().trim();
    if (!cleanId) continue;
    const qty = Number(sel.quantity);
    if (isNaN(qty) || !Number.isFinite(qty) || qty <= 0) {
      continue; // Skip zero, negative, or non-finite quantities
    }
    consolidatedMap.set(cleanId, (consolidatedMap.get(cleanId) || 0) + qty);
  }

  let itemTotal = 0;
  const pricedItems: MealPricingBreakdown['items'] = [];
  const manifestParts: string[] = [];

  for (const [cleanId, qty] of consolidatedMap.entries()) {
    const itemDef = catalogMap.get(cleanId);
    if (!itemDef || !itemDef.isActive) continue;

    // Validate quantity boundaries if specified
    if (itemDef.maxQuantity !== undefined && qty > itemDef.maxQuantity) {
      continue;
    }

    const itemPrice = typeof itemDef.price === 'number' ? itemDef.price : (itemDef.customerRate || 10);
    const lineTotal = applyRounding(itemPrice * qty);
    itemTotal += lineTotal;

    pricedItems.push({
      id: itemDef.id,
      name: itemDef.name,
      price: itemPrice,
      quantity: qty,
      total: lineTotal,
      unit: itemDef.unit || 'portion',
    });

    manifestParts.push(`${qty}× ${itemDef.name}`);
  }

  itemTotal = applyRounding(itemTotal);

  // Step 2: Apply vendor deduction
  const vendorDeductionRate = rules.vendorDeduction;
  const rawVendorCost = itemTotal * (1 - vendorDeductionRate);
  const vendorCost = applyRounding(rawVendorCost);
  const vendorDeduction = applyRounding(itemTotal - vendorCost);

  // Step 3: Apply business margin
  const marginRate = rules.margin;
  const rawFoodSellingPrice = vendorCost * (1 + marginRate);
  const foodSellingPrice = applyRounding(rawFoodSellingPrice);
  const margin = applyRounding(foodSellingPrice - vendorCost);

  // Step 4: Add delivery charge
  const deliveryCharge = applyRounding(rules.deliveryCharge);
  const subtotal = applyRounding(foodSellingPrice + deliveryCharge);

  // Step 5: Payment fee gross-up
  const paymentFeeRate = rules.paymentFee;
  const divisor = Math.max(0.01, 1 - paymentFeeRate);
  const rawFinalPrice = subtotal / divisor;
  const finalPrice = applyRounding(rawFinalPrice, rules.roundingStrategy);
  const paymentFee = applyRounding(finalPrice - subtotal);

  const manifestSummary = manifestParts.length > 0 ? manifestParts.join(', ') : 'Empty Meal';

  return {
    itemTotal,
    vendorDeductionRate,
    vendorDeduction,
    vendorCost,
    marginRate,
    margin,
    foodSellingPrice,
    deliveryCharge,
    subtotal,
    paymentFeeRate,
    paymentFee,
    finalPrice,
    items: pricedItems,
    manifestSummary,
  };
}

export interface SubscriptionMealSlotInput {
  dayKey: string;
  slot: 'lunch' | 'dinner' | 'both';
  items?: SelectedItemInput[] | Record<string, number>;
  lunchItems?: SelectedItemInput[] | Record<string, number>;
  dinnerItems?: SelectedItemInput[] | Record<string, number>;
}

export interface PricingSnapshot {
  snapshotVersion: string;
  calculatedAt: string;
  pricingRules: PricingRules;
  totalMeals: number;
  itemTotal: number;
  vendorDeductionRate: number;
  vendorDeduction: number;
  vendorCost: number;
  marginRate: number;
  margin: number;
  foodSellingPrice: number;
  deliveryCharge: number;
  subtotal: number;
  paymentFeeRate: number;
  paymentFee: number;
  finalPrice: number;
  standardMealUnitSnapshot?: MealPricingBreakdown;
  meals: Array<{
    dayKey: string;
    slot: 'lunch' | 'dinner';
    itemTotal: number;
    vendorCost: number;
    finalPrice: number;
    manifest: string;
    items: MealPricingBreakdown['items'];
  }>;
}

export interface SubscriptionPricingBreakdown {
  totalMeals: number;
  mealDetails: Array<{
    dayKey: string;
    slot: 'lunch' | 'dinner';
    breakdown: MealPricingBreakdown;
  }>;
  itemTotal: number;
  vendorDeduction: number;
  vendorCost: number;
  margin: number;
  foodSellingPrice: number;
  deliveryCharge: number;
  subtotal: number;
  paymentFee: number;
  finalPrice: number;
  pricingRules: PricingRules;
  snapshot?: PricingSnapshot;
}

export function calculateSubscriptionPrice(
  schedule: SubscriptionMealSlotInput[],
  defaultItems: SelectedItemInput[] | Record<string, number> = DEFAULT_STANDARD_MEAL.itemQuantities,
  catalog: ItemDefinition[] = DEFAULT_ITEM_CATALOG,
  rules: PricingRules = DEFAULT_PRICING_RULES
): SubscriptionPricingBreakdown {
  const mealDetails: SubscriptionPricingBreakdown['mealDetails'] = [];

  let aggregateItemTotal = 0;
  let aggregateVendorDeduction = 0;
  let aggregateVendorCost = 0;
  let aggregateMargin = 0;
  let aggregateFoodSellingPrice = 0;
  let aggregateDeliveryCharge = 0;
  let aggregateSubtotal = 0;
  let aggregatePaymentFee = 0;
  let aggregateFinalPrice = 0;

  for (const entry of schedule) {
    const dayKey = (entry.dayKey || '').trim();
    if (!dayKey) continue;

    const slot = entry.slot;
    if (slot === 'lunch' || slot === 'dinner') {
      const itemsToPrice = entry.items || (slot === 'lunch' ? entry.lunchItems : entry.dinnerItems) || defaultItems;
      const breakdown = calculateMealPrice(itemsToPrice, catalog, rules);

      mealDetails.push({ dayKey, slot, breakdown });
      aggregateItemTotal += breakdown.itemTotal;
      aggregateVendorDeduction += breakdown.vendorDeduction;
      aggregateVendorCost += breakdown.vendorCost;
      aggregateMargin += breakdown.margin;
      aggregateFoodSellingPrice += breakdown.foodSellingPrice;
      aggregateDeliveryCharge += breakdown.deliveryCharge;
      aggregateSubtotal += breakdown.subtotal;
      aggregatePaymentFee += breakdown.paymentFee;
      aggregateFinalPrice += breakdown.finalPrice;
    } else if (slot === 'both') {
      const lunchItems = entry.lunchItems || entry.items || defaultItems;
      const dinnerItems = entry.dinnerItems || entry.items || defaultItems;

      const lunchBreakdown = calculateMealPrice(lunchItems, catalog, rules);
      const dinnerBreakdown = calculateMealPrice(dinnerItems, catalog, rules);

      mealDetails.push(
        { dayKey, slot: 'lunch', breakdown: lunchBreakdown },
        { dayKey, slot: 'dinner', breakdown: dinnerBreakdown }
      );

      aggregateItemTotal += lunchBreakdown.itemTotal + dinnerBreakdown.itemTotal;
      aggregateVendorDeduction += lunchBreakdown.vendorDeduction + dinnerBreakdown.vendorDeduction;
      aggregateVendorCost += lunchBreakdown.vendorCost + dinnerBreakdown.vendorCost;
      aggregateMargin += lunchBreakdown.margin + dinnerBreakdown.margin;
      aggregateFoodSellingPrice += lunchBreakdown.foodSellingPrice + dinnerBreakdown.foodSellingPrice;
      aggregateDeliveryCharge += lunchBreakdown.deliveryCharge + dinnerBreakdown.deliveryCharge;
      aggregateSubtotal += lunchBreakdown.subtotal + dinnerBreakdown.subtotal;
      aggregatePaymentFee += lunchBreakdown.paymentFee + dinnerBreakdown.paymentFee;
      aggregateFinalPrice += lunchBreakdown.finalPrice + dinnerBreakdown.finalPrice;
    }
  }

  const totalMeals = mealDetails.length;
  const itemTotal = applyRounding(aggregateItemTotal);
  const vendorDeduction = applyRounding(aggregateVendorDeduction);
  const vendorCost = applyRounding(aggregateVendorCost);
  const margin = applyRounding(aggregateMargin);
  const foodSellingPrice = applyRounding(aggregateFoodSellingPrice);
  const deliveryCharge = applyRounding(aggregateDeliveryCharge);
  const subtotal = applyRounding(aggregateSubtotal);
  const finalPrice = applyRounding(aggregateFinalPrice, rules.roundingStrategy);
  const paymentFee = applyRounding(finalPrice - subtotal);

  const snapshot: PricingSnapshot = {
    snapshotVersion: rules.version || '2.0.0',
    calculatedAt: new Date().toISOString(),
    pricingRules: { ...rules },
    totalMeals,
    itemTotal,
    vendorDeductionRate: rules.vendorDeduction,
    vendorDeduction,
    vendorCost,
    marginRate: rules.margin,
    margin,
    foodSellingPrice,
    deliveryCharge,
    subtotal,
    paymentFeeRate: rules.paymentFee,
    paymentFee,
    finalPrice,
    meals: mealDetails.map((m) => ({
      dayKey: m.dayKey,
      slot: m.slot,
      itemTotal: m.breakdown.itemTotal,
      vendorCost: m.breakdown.vendorCost,
      finalPrice: m.breakdown.finalPrice,
      manifest: m.breakdown.manifestSummary,
      items: m.breakdown.items,
    })),
  };

  return {
    totalMeals,
    mealDetails,
    itemTotal,
    vendorDeduction,
    vendorCost,
    margin,
    foodSellingPrice,
    deliveryCharge,
    subtotal,
    paymentFee,
    finalPrice,
    pricingRules: rules,
    snapshot,
  };
}

/**
 * Calculates standard pre-packaged subscription (e.g. ₹4,500 monthly subscription, ₹4,000 base vendor)
 * Preserves existing product while structuring under the central pricing snapshot architecture.
 */
export function calculateStandardSubscriptionProduct(
  totalMeals: number = 30,
  rules: PricingRules = DEFAULT_PRICING_RULES
): SubscriptionPricingBreakdown {
  const baseVendorTotal = 4000;
  const vendorDeduction = applyRounding(baseVendorTotal * rules.vendorDeduction);
  const vendorCost = applyRounding(baseVendorTotal - vendorDeduction); // ₹3,680
  const finalCustomerPrice = 4500;
  const deliveryCharge = applyRounding(rules.deliveryCharge * totalMeals);
  const foodSellingPrice = applyRounding(finalCustomerPrice - deliveryCharge);
  const margin = applyRounding(foodSellingPrice - vendorCost);
  const subtotal = applyRounding(foodSellingPrice + deliveryCharge);
  const paymentFee = applyRounding(finalCustomerPrice - subtotal);

  const dummySchedule: SubscriptionMealSlotInput[] = Array.from({ length: totalMeals }, (_, i) => ({
    dayKey: `day_${i + 1}`,
    slot: 'lunch',
  }));

  const standardMeal = calculateMealPrice(DEFAULT_STANDARD_MEAL.itemQuantities, DEFAULT_ITEM_CATALOG, rules);

  const snapshot: PricingSnapshot = {
    snapshotVersion: rules.version || '2.0.0',
    calculatedAt: new Date().toISOString(),
    pricingRules: { ...rules },
    totalMeals,
    itemTotal: baseVendorTotal,
    vendorDeductionRate: rules.vendorDeduction,
    vendorDeduction,
    vendorCost,
    marginRate: rules.margin,
    margin,
    foodSellingPrice,
    deliveryCharge,
    subtotal,
    paymentFeeRate: rules.paymentFee,
    paymentFee,
    finalPrice: finalCustomerPrice,
    standardMealUnitSnapshot: standardMeal,
    meals: dummySchedule.map((d) => ({
      dayKey: d.dayKey,
      slot: 'lunch' as const,
      itemTotal: applyRounding(baseVendorTotal / totalMeals),
      vendorCost: applyRounding(vendorCost / totalMeals),
      finalPrice: applyRounding(finalCustomerPrice / totalMeals),
      manifest: standardMeal.manifestSummary,
      items: standardMeal.items,
    })),
  };

  return {
    totalMeals,
    mealDetails: dummySchedule.map((d) => ({
      dayKey: d.dayKey,
      slot: 'lunch' as const,
      breakdown: standardMeal,
    })),
    itemTotal: baseVendorTotal,
    vendorDeduction,
    vendorCost,
    margin,
    foodSellingPrice,
    deliveryCharge,
    subtotal,
    paymentFee,
    finalPrice: finalCustomerPrice,
    pricingRules: rules,
    snapshot,
  };
}

// ─── 9. AUDITABLE HISTORICAL ORDER / SUBSCRIPTION PRICE RETRIEVAL ───────────

export interface AuditablePriceResult {
  finalPrice: number;
  itemTotal: number;
  vendorCost: number;
  margin: number;
  deliveryCharge: number;
  paymentFee: number;
  isSnapshot: boolean;
  calculatedAt?: string;
  snapshotVersion?: string;
}

export function getAuditableOrderPrice(orderOrSub: any): AuditablePriceResult {
  const snap: PricingSnapshot | undefined =
    orderOrSub?.pricingSnapshot || orderOrSub?.pricing_snapshot;

  if (snap && typeof snap.finalPrice === 'number') {
    return {
      finalPrice: snap.finalPrice,
      itemTotal: snap.itemTotal,
      vendorCost: snap.vendorCost,
      margin: snap.margin,
      deliveryCharge: snap.deliveryCharge,
      paymentFee: snap.paymentFee,
      isSnapshot: true,
      calculatedAt: snap.calculatedAt,
      snapshotVersion: snap.snapshotVersion,
    };
  }

  const finalPrice = Number(orderOrSub?.total_price ?? orderOrSub?.price ?? orderOrSub?.total_amount ?? 0);
  const vendorCost = Number(orderOrSub?.vendor_total_payable ?? orderOrSub?.vendor_cost ?? 0);

  return {
    finalPrice,
    itemTotal: finalPrice,
    vendorCost,
    margin: 0,
    deliveryCharge: 0,
    paymentFee: 0,
    isSnapshot: false,
  };
}


