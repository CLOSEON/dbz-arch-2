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
  unit: string;
  category: string;
  isActive: boolean;
  baseQuantity?: number;
}

export const DEFAULT_ITEM_CATALOG: ItemDefinition[] = [
  { id: 'roti', name: 'Roti', price: 8, unit: 'piece', category: 'staple', isActive: true, baseQuantity: 2 },
  { id: 'rice', name: 'Rice', price: 15, unit: 'bowl', category: 'staple', isActive: true, baseQuantity: 1 },
  { id: 'dal', name: 'Dal', price: 20, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 1 },
  { id: 'sabji', name: 'Sabji', price: 25, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 1 },
  { id: 'salad', name: 'Salad', price: 10, unit: 'portion', category: 'side', isActive: true, baseQuantity: 1 },
  { id: 'paneer', name: 'Paneer Sabji', price: 30, unit: 'bowl', category: 'curry', isActive: true, baseQuantity: 0 },
  { id: 'curd', name: 'Curd / Raita', price: 15, unit: 'portion', category: 'side', isActive: true, baseQuantity: 0 },
  { id: 'sweet', name: 'Chef Sweet', price: 15, unit: 'piece', category: 'dessert', isActive: true, baseQuantity: 0 },
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
