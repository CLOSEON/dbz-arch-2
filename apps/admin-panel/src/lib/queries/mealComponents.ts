import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  MealComponent,
  DEFAULT_MEAL_COMPONENTS,
} from '@/types';

export const MEAL_COMPONENTS_DOC_PATH = {
  collection: 'system_settings',
  docId: 'meal_components',
};

/**
 * Fetch the global meal component catalog from Firestore.
 * Falls back to DEFAULT_MEAL_COMPONENTS if not yet initialized.
 */
export async function getMealComponentsCatalog(): Promise<MealComponent[]> {
  try {
    const docRef = doc(db, MEAL_COMPONENTS_DOC_PATH.collection, MEAL_COMPONENTS_DOC_PATH.docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.components) && data.components.length > 0) {
        return data.components as MealComponent[];
      }
    }
  } catch (err) {
    console.warn('[getMealComponentsCatalog] Failed to load catalog, using defaults:', err);
  }

  return [...DEFAULT_MEAL_COMPONENTS];
}

/**
 * Save the global meal component catalog to Firestore.
 */
export async function saveMealComponentsCatalog(
  components: MealComponent[],
  updatedBy: string = 'admin'
): Promise<void> {
  const docRef = doc(db, MEAL_COMPONENTS_DOC_PATH.collection, MEAL_COMPONENTS_DOC_PATH.docId);
  await setDoc(
    docRef,
    {
      components,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

/**
 * Calculate component deltas against base thali quantities.
 */
export function calculateComponentDeltas(
  selectedQuantities: Record<string, number>,
  catalog: MealComponent[] = DEFAULT_MEAL_COMPONENTS,
  vendorOverrides?: Record<string, any>
) {
  let customerDeltaPerMeal = 0;
  let vendorDeltaPerMeal = 0;
  const breakdown: Array<{
    component: MealComponent;
    selectedQty: number;
    baseQty: number;
    delta: number;
    customerAdjustment: number;
    vendorAdjustment: number;
  }> = [];

  catalog.forEach((comp) => {
    if (!comp.isActive) return;

    const baseQty = comp.baseQuantity ?? 0;
    const selectedQty = selectedQuantities[comp.id] !== undefined
      ? selectedQuantities[comp.id]
      : baseQty;

    const delta = selectedQty - baseQty;
    const customerRate = comp.customerRate ?? 0;

    // Resolve vendor rate (checking override first)
    const override = vendorOverrides?.[comp.id];
    let vendorRate = comp.vendorRate ?? 0;
    if (typeof override === 'number') {
      vendorRate = override;
    } else if (override && typeof override.vendorRate === 'number') {
      vendorRate = override.vendorRate;
    }

    const customerAdjustment = delta * customerRate;
    const vendorAdjustment = delta * vendorRate;

    customerDeltaPerMeal += customerAdjustment;
    vendorDeltaPerMeal += vendorAdjustment;

    breakdown.push({
      component: comp,
      selectedQty,
      baseQty,
      delta,
      customerAdjustment,
      vendorAdjustment,
    });
  });

  return {
    customerDeltaPerMeal,
    vendorDeltaPerMeal,
    breakdown,
  };
}

/**
 * Format human-readable manifest text (e.g. "6× Roti, No Rice, 1× Dal, 1× Sabzi, 1× Sweet")
 */
export function buildBoxManifest(
  selectedQuantities?: Record<string, number>,
  catalog: MealComponent[] = DEFAULT_MEAL_COMPONENTS
): string {
  if (!selectedQuantities || Object.keys(selectedQuantities).length === 0) {
    return 'Standard Thali (4× Roti, 1× Rice, 1× Dal, 1× Sabzi)';
  }

  const parts: string[] = [];

  catalog.forEach((comp) => {
    const qty = selectedQuantities[comp.id] !== undefined
      ? selectedQuantities[comp.id]
      : comp.baseQuantity;

    if (qty === 0) {
      if (comp.baseQuantity > 0) {
        parts.push(`No ${comp.name}`);
      }
    } else {
      parts.push(`${qty}× ${comp.name}`);
    }
  });

  return parts.length > 0 ? parts.join(', ') : 'Standard Thali';
}

/**
 * Calculate the standard base thali vendor payout from components and vendor overrides.
 * e.g. 4× Roti + 1× Rice + 1× Sabzi + 1× Dal
 */
export function calculateBaseVendorCost(
  catalog: MealComponent[] = DEFAULT_MEAL_COMPONENTS,
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

