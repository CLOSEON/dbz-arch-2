/**
 * DABZZO CENTRAL PRICING ENGINE (Vendor-panel read-only mirror)
 *
 * NOTE: Vendor panel only has read-only access to item manifests and vendor costs.
 * Vendor cannot modify or override prices.
 */

export interface PricingRules {
  vendorDeduction: number;
  margin: number;
  deliveryCharge: number;
  paymentFee: number;
  roundingStrategy: 'round' | 'round_integer' | 'ceil';
}

export const DEFAULT_PRICING_RULES: PricingRules = {
  vendorDeduction: 0.08,
  margin: 0.13,
  deliveryCharge: 11,
  paymentFee: 0.025,
  roundingStrategy: 'round',
};

export interface ItemDefinition {
  id: string;
  name: string;
  price: number;
  customerRate?: number;
  vendorRate?: number;
  rawCost?: number;
  unit: string;
  category: string;
  isActive: boolean;
  baseQuantity?: number;
}

export interface ResolvedItemRates {
  rawCost: number;
  vendorRate: number;
  customerRate: number;
}

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

  if (typeof override === 'number') {
    return deriveRatesFromVendorCost(override, marginPercent);
  }

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

export const DEFAULT_ITEM_CATALOG: ItemDefinition[] = [
  { id: 'roti', name: 'Roti', price: 4, customerRate: 4, vendorRate: 3.25, rawCost: 1.5, unit: 'piece', category: 'staple', isActive: true, baseQuantity: 4 },
  { id: 'rice', name: 'Rice', price: 18, customerRate: 18, vendorRate: 17.33, rawCost: 8.0, unit: 'bowl', category: 'staple', isActive: true, baseQuantity: 1 },
  { id: 'dal', name: 'Dal', price: 16, customerRate: 16, vendorRate: 15.17, rawCost: 7.0, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 1 },
  { id: 'sabji', name: 'Sabji', price: 20, customerRate: 20, vendorRate: 19.50, rawCost: 9.0, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 1 },
  { id: 'salad', name: 'Salad', price: 11, customerRate: 11, vendorRate: 10.83, rawCost: 5.0, unit: 'portion', category: 'side', isActive: true, baseQuantity: 1 },
  { id: 'paneer', name: 'Paneer Sabji', price: 32, customerRate: 32, vendorRate: 30.33, rawCost: 14.0, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 0 },
  { id: 'curd', name: 'Curd / Raita', price: 14, customerRate: 14, vendorRate: 13.00, rawCost: 6.0, unit: 'portion', category: 'side', isActive: true, baseQuantity: 0 },
  { id: 'sweet', name: 'Chef Sweet', price: 18, customerRate: 18, vendorRate: 17.33, rawCost: 8.0, unit: 'piece', category: 'dessert', isActive: true, baseQuantity: 0 },
];

export function getAuditableOrderPrice(orderOrSub: any) {
  const snap = orderOrSub?.pricingSnapshot || orderOrSub?.pricing_snapshot;
  if (snap && typeof snap.finalPrice === 'number') {
    return {
      finalPrice: snap.finalPrice,
      itemTotal: snap.itemTotal,
      vendorCost: snap.vendorCost,
      isSnapshot: true,
      calculatedAt: snap.calculatedAt,
    };
  }
  return {
    finalPrice: Number(orderOrSub?.total_price ?? orderOrSub?.price ?? 0),
    itemTotal: Number(orderOrSub?.total_price ?? orderOrSub?.price ?? 0),
    vendorCost: Number(orderOrSub?.vendor_total_payable ?? orderOrSub?.vendor_cost ?? 0),
    isSnapshot: false,
  };
}
