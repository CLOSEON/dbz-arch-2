import { DEFAULT_MEAL_COMPONENTS, MealComponent } from '@/types';

/**
 * Build human-readable box manifest from order/subscription custom meal config
 * e.g. "6× Roti, No Rice, 1× Dal, 1× Sabzi, 1× Sweet"
 */
export function getBoxManifest(
  subOrOrder: any,
  catalog: MealComponent[] = DEFAULT_MEAL_COMPONENTS
): {
  manifestText: string;
  isCustomized: boolean;
  componentsList: Array<{ name: string; quantity: number; baseQuantity: number; unit: string }>;
} {
  if (!subOrOrder) {
    return {
      manifestText: 'Standard Thali (4× Roti, 1× Rice, 1× Dal, 1× Sabzi)',
      isCustomized: false,
      componentsList: [],
    };
  }

  // 1. If explicit manifestSummary exists
  const explicitSummary = subOrOrder.custom_meal_config?.manifestSummary;

  // 2. If components object exists
  const componentsObj =
    subOrOrder.custom_meal_config?.components ||
    subOrOrder.customMealConfig?.components ||
    null;

  if (componentsObj && typeof componentsObj === 'object') {
    const parts: string[] = [];
    const list: Array<{ name: string; quantity: number; baseQuantity: number; unit: string }> = [];
    let hasDelta = false;

    catalog.forEach((comp) => {
      const baseQty = comp.baseQuantity ?? 0;
      const qty = componentsObj[comp.id] !== undefined ? Number(componentsObj[comp.id]) : baseQty;

      if (qty !== baseQty) {
        hasDelta = true;
      }

      list.push({
        name: comp.name,
        quantity: qty,
        baseQuantity: baseQty,
        unit: comp.unit,
      });

      if (qty === 0) {
        if (baseQty > 0) {
          parts.push(`No ${comp.name}`);
        }
      } else {
        parts.push(`${qty}× ${comp.name}`);
      }
    });

    const manifestText = parts.length > 0 ? parts.join(', ') : 'Standard Thali';
    return {
      manifestText: explicitSummary || manifestText,
      isCustomized: hasDelta,
      componentsList: list,
    };
  }

  // 3. If meal_components array of strings exists
  if (Array.isArray(subOrOrder.meal_components) && subOrOrder.meal_components.length > 0) {
    return {
      manifestText: subOrOrder.meal_components.join(', '),
      isCustomized: true,
      componentsList: [],
    };
  }

  if (explicitSummary) {
    return {
      manifestText: explicitSummary,
      isCustomized: true,
      componentsList: [],
    };
  }

  return {
    manifestText: 'Standard Thali (4× Roti, 1× Rice, 1× Dal, 1× Sabzi)',
    isCustomized: false,
    componentsList: [],
  };
}

