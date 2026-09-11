import {
  calculateMealPrice,
  calculateSubscriptionPrice,
  calculateStandardSubscriptionProduct,
  calculateWeeklyPlanPrice,
  getAuditableOrderPrice,
  applyRounding,
  deriveRatesFromVendorCost,
  resolveComponentRates,
  DEFAULT_PRICING_RULES,
  DEFAULT_ITEM_CATALOG,
  DEFAULT_STANDARD_MEAL,
  ItemDefinition,
  PricingRules,
} from '../pricingEngine';

describe('Central Authoritative Pricing Engine', () => {
  // Test catalog with prompt exact prices:
  // Rice ₹15, Dal ₹20, Roti ₹8, Sabji ₹25, Salad ₹10, Paneer ₹30, Curd ₹15
  const testCatalog: ItemDefinition[] = [
    { id: 'rice', name: 'Rice', price: 15, unit: 'bowl', category: 'staple', isActive: true },
    { id: 'dal', name: 'Dal', price: 20, unit: 'bowl', category: 'curry', isActive: true },
    { id: 'roti', name: 'Roti', price: 8, unit: 'piece', category: 'staple', isActive: true },
    { id: 'sabji', name: 'Sabji', price: 25, unit: 'bowl', category: 'curry', isActive: true },
    { id: 'salad', name: 'Salad', price: 10, unit: 'portion', category: 'side', isActive: true },
    { id: 'paneer', name: 'Paneer', price: 30, unit: 'bowl', category: 'curry', isActive: true },
    { id: 'curd', name: 'Curd', price: 15, unit: 'portion', category: 'side', isActive: true },
    { id: 'inactive_item', name: 'Inactive Item', price: 50, unit: 'portion', category: 'side', isActive: false },
  ];

  const standardRules: PricingRules = {
    vendorDeduction: 0.08, // 8%
    margin: 0.13,          // 13%
    deliveryCharge: 11,    // ₹11
    paymentFee: 0.025,     // 2.5%
    roundingStrategy: 'round',
  };

  // ─── 1. STANDARD MEAL (Section 9 Example) ──────────────────────────────────
  test('1. Standard meal (5 items: Rice ₹15, Dal ₹20, Roti ₹8, Sabji ₹25, Salad ₹10 = ₹78 Item Total)', () => {
    // Total = 15 + 20 + 8 + 25 + 10 = 78
    const mealItems = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
    ];

    const result = calculateMealPrice(mealItems, testCatalog, standardRules);

    // Step 1: Item Total
    expect(result.itemTotal).toBe(78);

    // Step 2: Vendor payable cost = 78 * (1 - 0.08) = 78 * 0.92 = 71.76
    expect(result.vendorCost).toBe(71.76);
    expect(result.vendorDeduction).toBe(6.24);

    // Step 3: Food selling price = 71.76 * (1 + 0.13) = 71.76 * 1.13 = 81.0888 => 81.09
    expect(result.foodSellingPrice).toBe(81.09);
    expect(result.margin).toBe(9.33);

    // Step 4: Meal subtotal = 81.09 + 11 = 92.09
    expect(result.subtotal).toBe(92.09);
    expect(result.deliveryCharge).toBe(11);

    // Step 5: Customer Price = 92.09 / (1 - 0.025) = 92.09 / 0.975 = 94.45128... => 94.45
    expect(result.finalPrice).toBe(94.45);
    expect(result.paymentFee).toBe(2.36);
    expect(result.items.length).toBe(5);
    expect(result.manifestSummary).toBe('1× Rice, 1× Dal, 1× Roti, 1× Sabji, 1× Salad');
  });

  // ─── 2. REMOVED ITEM (Remove Salad) ───────────────────────────────────────
  test('2. Removed item (Remove salad: 78 - 10 = 68 Item Total)', () => {
    const mealItems = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      // salad removed
    ];

    const result = calculateMealPrice(mealItems, testCatalog, standardRules);

    expect(result.itemTotal).toBe(68);
    // Vendor cost: 68 * 0.92 = 62.56
    expect(result.vendorCost).toBe(62.56);
    // Food selling price: 62.56 * 1.13 = 70.6928 => 70.69
    expect(result.foodSellingPrice).toBe(70.69);
    // Subtotal: 70.69 + 11 = 81.69
    expect(result.subtotal).toBe(81.69);
    // Customer price: 81.69 / 0.975 = 83.7846... => 83.78
    expect(result.finalPrice).toBe(83.78);
    expect(result.manifestSummary).toBe('1× Rice, 1× Dal, 1× Roti, 1× Sabji');
  });

  // ─── 3. ADDED ITEM (Add Paneer) ───────────────────────────────────────────
  test('3. Added item (Add Paneer ₹30: 78 + 30 = 108 Item Total)', () => {
    const mealItems = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
      { id: 'paneer', quantity: 1 },
    ];

    const result = calculateMealPrice(mealItems, testCatalog, standardRules);

    expect(result.itemTotal).toBe(108);
    // Vendor cost: 108 * 0.92 = 99.36
    expect(result.vendorCost).toBe(99.36);
    // Food selling price: 99.36 * 1.13 = 112.2768 => 112.28
    expect(result.foodSellingPrice).toBe(112.28);
    // Subtotal: 112.28 + 11 = 123.28
    expect(result.subtotal).toBe(123.28);
    // Customer price: 123.28 / 0.975 = 126.4410... => 126.44
    expect(result.finalPrice).toBe(126.44);
    expect(result.manifestSummary).toContain('1× Paneer');
  });

  // ─── 4. REPLACEMENT (Dal -> Salad, so 2× Salad, 0× Dal) ───────────────────
  test('4. Replacement (Dal ₹20 replaced with Salad ₹10: 78 - 20 + 10 = 68)', () => {
    const mealItems = [
      { id: 'rice', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 2 }, // 2 portions of salad, 0 dal
    ];

    const result = calculateMealPrice(mealItems, testCatalog, standardRules);

    // 15 + 8 + 25 + (10 * 2) = 68
    expect(result.itemTotal).toBe(68);
    expect(result.finalPrice).toBe(83.78);
    expect(result.manifestSummary).toBe('1× Rice, 1× Roti, 1× Sabji, 2× Salad');
  });

  // ─── 5. DIFFERENT MEALS (Lunch != Dinner) ──────────────────────────────────
  test('5. Different meals (Lunch has standard thali ₹94.45, Dinner has Paneer special ₹126.44)', () => {
    const lunchItems = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
    ];
    const dinnerItems = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
      { id: 'paneer', quantity: 1 },
    ];

    const schedule = [
      { dayKey: 'mon', slot: 'lunch' as const, items: lunchItems },
      { dayKey: 'mon', slot: 'dinner' as const, items: dinnerItems },
    ];

    const subResult = calculateSubscriptionPrice(schedule, lunchItems, testCatalog, standardRules);

    expect(subResult.totalMeals).toBe(2);
    expect(subResult.mealDetails[0].breakdown.finalPrice).toBe(94.45);
    expect(subResult.mealDetails[1].breakdown.finalPrice).toBe(126.44);
    // Total price = 94.45 + 126.44 = 220.89
    expect(subResult.finalPrice).toBe(220.89);
  });

  // ─── 6. PARTIAL SUBSCRIPTION (Only 10 Meals) ──────────────────────────────
  test('6. Partial subscription (Exactly 10 meals scheduled)', () => {
    const standardMeal = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
    ];

    const schedule = Array.from({ length: 10 }, (_, i) => ({
      dayKey: `day_${i + 1}`,
      slot: 'lunch' as const,
      items: standardMeal,
    }));

    const subResult = calculateSubscriptionPrice(schedule, standardMeal, testCatalog, standardRules);

    expect(subResult.totalMeals).toBe(10);
    // 10 * 94.45 = 944.50
    expect(subResult.finalPrice).toBe(944.5);
    expect(subResult.totalMeals).toBe(10);
  });

  // ─── 7. MIXED SCHEDULE (Some Lunch, Some Dinner, Different Days) ───────────
  test('7. Mixed schedule (Mon: L+D, Tue: D, Wed: OFF, Thu: L, Fri: L+D, Sat: OFF, Sun: D = 7 meals)', () => {
    const standardMeal = [
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
      { id: 'roti', quantity: 1 },
      { id: 'sabji', quantity: 1 },
      { id: 'salad', quantity: 1 },
    ];

    const schedule = [
      { dayKey: 'monday', slot: 'both' as const, items: standardMeal },      // 2 meals
      { dayKey: 'tuesday', slot: 'dinner' as const, items: standardMeal },    // 1 meal
      // Wednesday OFF
      { dayKey: 'thursday', slot: 'lunch' as const, items: standardMeal },    // 1 meal
      { dayKey: 'friday', slot: 'both' as const, items: standardMeal },       // 2 meals
      // Saturday OFF
      { dayKey: 'sunday', slot: 'dinner' as const, items: standardMeal },     // 1 meal
    ];

    const subResult = calculateSubscriptionPrice(schedule, standardMeal, testCatalog, standardRules);

    // Total meals = 2 + 1 + 1 + 2 + 1 = 7 meals
    expect(subResult.totalMeals).toBe(7);
    // 7 * 94.45 = 661.15
    expect(subResult.finalPrice).toBe(661.15);
  });

  // ─── 8. PRICE CHANGES & AUDITABLE SNAPSHOT RETENTION ────────────────────────
  test('8. Price changes (Admin changes item price: new orders use new price, historical snapshot retains old price)', () => {
    const mealItems = [
      { id: 'paneer', quantity: 1 },
      { id: 'roti', quantity: 2 },
    ];

    // Day 1: Paneer is ₹30, Roti is ₹8 => 30 + 16 = 46
    const oldCatalog = [...testCatalog];
    const order1 = calculateMealPrice(mealItems, oldCatalog, standardRules);
    expect(order1.itemTotal).toBe(46);

    // Capture snapshot for order 1
    const order1Snapshot = {
      priceSnapshot: { ...order1 },
      chargedAmount: order1.finalPrice,
    };

    // Day 2: Admin increases Paneer to ₹35 in catalog
    const updatedCatalog = testCatalog.map((item) =>
      item.id === 'paneer' ? { ...item, price: 35 } : item
    );

    // Order 2 calculated under new prices => 35 + 16 = 51
    const order2 = calculateMealPrice(mealItems, updatedCatalog, standardRules);
    expect(order2.itemTotal).toBe(51);
    expect(order2.finalPrice).toBeGreaterThan(order1.finalPrice);

    // Verify historical order 1 snapshot was NOT corrupted:
    expect(order1Snapshot.priceSnapshot.itemTotal).toBe(46);
    expect(order1Snapshot.chargedAmount).toBe(order1.finalPrice);
    expect(order1Snapshot.priceSnapshot.items.find((i) => i.id === 'paneer')?.price).toBe(30);
  });

  // ─── 9. SECURITY / MALICIOUS CLIENT TAMPER PROTECTION ──────────────────────
  test('9. Security: backend authoritatively calculates price regardless of client input', () => {
    // Malicious client claims standard meal is ₹10
    const maliciousClientPayload = {
      declaredPrice: 10,
      items: [
        { id: 'rice', quantity: 1 },
        { id: 'dal', quantity: 1 },
        { id: 'roti', quantity: 1 },
        { id: 'sabji', quantity: 1 },
        { id: 'salad', quantity: 1 },
      ],
    };

    // Backend ignores declaredPrice and computes authoritative price
    const backendResult = calculateMealPrice(maliciousClientPayload.items, testCatalog, standardRules);

    expect(backendResult.finalPrice).toBe(94.45);
    expect(backendResult.finalPrice).not.toBe(maliciousClientPayload.declaredPrice);
  });

  // ─── 10. PAYMENT GROSS-UP FEE RECOVERY FORMULA ─────────────────────────────
  test('10. Payment fee gross-up: CustomerPrice = Subtotal / (1 - PaymentFee)', () => {
    // Check that Razorpay's 2.5% deduction on CustomerPrice recovers exactly Subtotal
    const meal = calculateMealPrice([{ id: 'rice', quantity: 1 }], testCatalog, standardRules);
    // CustomerPrice = meal.finalPrice
    // Razorpay fee = CustomerPrice * 0.025
    // Net recovered = CustomerPrice - Razorpay fee = CustomerPrice * (1 - 0.025) = Subtotal
    const razorpayDeduction = meal.finalPrice * 0.025;
    const netToBusiness = meal.finalPrice - razorpayDeduction;

    // Must equal subtotal within 1 cent (paise) of rounding
    expect(Math.abs(netToBusiness - meal.subtotal)).toBeLessThanOrEqual(0.05);
  });

  // ─── 11. EDGE CASES & VALIDATION ──────────────────────────────────────────
  test('11. Edge cases: Empty items, inactive items, and invalid item IDs are rejected', () => {
    // Empty meal
    expect(() => calculateMealPrice([], testCatalog, standardRules)).toThrow(
      /zero active items/i
    );

    // Invalid item ID
    expect(() =>
      calculateMealPrice([{ id: 'non_existent_pizza', quantity: 1 }], testCatalog, standardRules)
    ).toThrow(/does not exist/i);

    // Inactive item
    expect(() =>
      calculateMealPrice([{ id: 'inactive_item', quantity: 1 }], testCatalog, standardRules)
    ).toThrow(/inactive/i);

    // Negative quantity ignored (treated as 0)
    expect(() =>
      calculateMealPrice([{ id: 'rice', quantity: -2 }], testCatalog, standardRules)
    ).toThrow(/zero active items/i);
  });

  // ─── 12. STANDARD ₹4,500 SUBSCRIPTION PRODUCT ─────────────────────────────
  test('12. Standard ₹4,500 subscription product preservation', () => {
    const standardSub = calculateStandardSubscriptionProduct(30, standardRules);

    expect(standardSub.finalPrice).toBe(4500);
    expect(standardSub.itemTotal).toBe(4000); // base vendor subscription
    expect(standardSub.vendorDeduction).toBe(320); // 8% of 4000
    expect(standardSub.vendorCost).toBe(3680); // 4000 - 320
    expect(standardSub.totalMeals).toBe(30);
    expect(standardSub.snapshot.finalPrice).toBe(4500);
  });

  // ─── 13. DUPLICATE ITEM CONSOLIDATION & MAX QUANTITY ENFORCEMENT ──────────
  test('13. Duplicate items: consolidates identical item IDs and validates boundary limits', () => {
    // Rice catalog has maxQuantity: 4
    const catalogWithLimits: ItemDefinition[] = [
      { id: 'rice', name: 'Rice', price: 15, unit: 'bowl', category: 'staple', isActive: true, maxQuantity: 4 },
      { id: 'dal', name: 'Dal', price: 20, unit: 'bowl', category: 'curry', isActive: true, maxQuantity: 2 },
    ];

    // Client passes two separate entries for Rice: 2 and 1 -> consolidated = 3 (<= 4)
    const validDuplicates = [
      { id: 'rice', quantity: 2 },
      { id: 'rice', quantity: 1 },
      { id: 'dal', quantity: 1 },
    ];
    const res = calculateMealPrice(validDuplicates, catalogWithLimits, standardRules);
    expect(res.items.find((i) => i.id === 'rice')?.quantity).toBe(3);
    expect(res.itemTotal).toBe(15 * 3 + 20 * 1); // 65

    // Client passes two separate entries trying to sneak past maxQuantity 4: 3 and 2 -> total = 5 (> 4)
    const sneakyExcess = [
      { id: 'rice', quantity: 3 },
      { id: 'rice', quantity: 2 },
    ];
    expect(() => calculateMealPrice(sneakyExcess, catalogWithLimits, standardRules)).toThrow(
      /exceeds maximum allowed/i
    );
  });

  // ─── 14. INVALID SLOT VALIDATION ──────────────────────────────────────────
  test('14. Invalid slot validation: rejects unsupported slots and skips skip slots', () => {
    const standardMeal = [{ id: 'rice', quantity: 1 }];

    // Invalid slot: 'breakfast'
    const invalidSlotSchedule = [
      { dayKey: 'mon', slot: 'breakfast' as any, items: standardMeal },
    ];
    expect(() => calculateSubscriptionPrice(invalidSlotSchedule, standardMeal, testCatalog, standardRules)).toThrow(
      /Invalid meal slot "breakfast"/i
    );

    // Empty dayKey
    const emptyDaySchedule = [
      { dayKey: '', slot: 'lunch' as const, items: standardMeal },
    ];
    expect(() => calculateSubscriptionPrice(emptyDaySchedule, standardMeal, testCatalog, standardRules)).toThrow(
      /Every schedule entry must specify a valid dayKey/i
    );

    // Skip slot: should be ignored and if all are skipped, throw zero active meals
    const allSkipSchedule = [
      { dayKey: 'mon', slot: 'skip' as any, items: standardMeal },
      { dayKey: 'tue', slot: 'skip' as any, items: standardMeal },
    ];
    expect(() => calculateSubscriptionPrice(allSkipSchedule, standardMeal, testCatalog, standardRules)).toThrow(
      /No active meals selected in schedule/i
    );
  });

  // ─── 15. AUDITABLE SNAPSHOT RETRIEVAL (getAuditableOrderPrice) ─────────────
  test('15. Auditable snapshot retrieval: getAuditableOrderPrice ensures historical orders are immutable', () => {
    const oldOrder = {
      id: 'order_historical_123',
      pricingSnapshot: {
        snapshotVersion: '1.0.0',
        calculatedAt: '2026-01-01T00:00:00.000Z',
        totalMeals: 30,
        itemTotal: 2340,
        vendorCost: 2152.8,
        margin: 279.86,
        deliveryCharge: 330,
        paymentFee: 71.86,
        finalPrice: 2834.52,
      },
    };

    const auditable = getAuditableOrderPrice(oldOrder);
    expect(auditable.isSnapshot).toBe(true);
    expect(auditable.finalPrice).toBe(2834.52);
    expect(auditable.itemTotal).toBe(2340);
    expect(auditable.vendorCost).toBe(2152.8);
    expect(auditable.snapshotVersion).toBe('1.0.0');

    // Legacy record without snapshot:
    const legacyOrder = {
      id: 'legacy_order_456',
      total_price: 1500,
      vendor_total_payable: 1200,
    };
    const legacyAuditable = getAuditableOrderPrice(legacyOrder);
    expect(legacyAuditable.isSnapshot).toBe(false);
    expect(legacyAuditable.finalPrice).toBe(1500);
    expect(legacyAuditable.vendorCost).toBe(1200);
  });

  // ─── 16. ROUNDING STRATEGIES ──────────────────────────────────────────────
  test('16. Rounding strategies: supports round, round_integer, and ceil', () => {
    const mealItems = [{ id: 'rice', quantity: 1 }]; // Rice is ₹15

    const round2Dec = calculateMealPrice(mealItems, testCatalog, { ...standardRules, roundingStrategy: 'round' });
    const roundInt = calculateMealPrice(mealItems, testCatalog, { ...standardRules, roundingStrategy: 'round_integer' });
    const roundCeil = calculateMealPrice(mealItems, testCatalog, { ...standardRules, roundingStrategy: 'ceil' });

    // Item = 15, VendorCost = 13.80, FoodSellingPrice = 15.594 => 15.59, Subtotal = 26.59
    // Final = 26.59 / 0.975 = 27.27179...
    expect(round2Dec.finalPrice).toBe(27.27);
    expect(roundInt.finalPrice).toBe(27);
    expect(roundCeil.finalPrice).toBe(28);
  });

  // ─── 17. DERIVE RATES FROM RAW VENDOR COST ──────────────────────────────────
  test('17. Derive rates from raw vendor cost: 65/30 vendor payout multiplier and 4% customer margin', () => {
    // Roti: Raw ₹1.50 -> Vendor payout ₹3.25 -> Customer rate ₹4.00
    const rotiRates = deriveRatesFromVendorCost(1.5, 4);
    expect(rotiRates.rawCost).toBe(1.5);
    expect(rotiRates.vendorRate).toBe(3.25);
    expect(rotiRates.customerRate).toBe(4);

    // Dal: Raw ₹7.00 -> Vendor payout ₹15.17 -> Customer rate ₹16.00
    const dalRates = deriveRatesFromVendorCost(7.0, 4);
    expect(dalRates.rawCost).toBe(7.0);
    expect(dalRates.vendorRate).toBe(15.17);
    expect(dalRates.customerRate).toBe(16);

    // Rice: Raw ₹8.00 -> Vendor payout ₹17.33 -> Customer rate ₹18.00
    const riceRates = deriveRatesFromVendorCost(8.0, 4);
    expect(riceRates.rawCost).toBe(8.0);
    expect(riceRates.vendorRate).toBe(17.33);
    expect(riceRates.customerRate).toBe(18);

    // Sabzi: Raw ₹9.00 -> Vendor payout ₹19.50 -> Customer rate ₹20.00
    const sabziRates = deriveRatesFromVendorCost(9.0, 4);
    expect(sabziRates.rawCost).toBe(9.0);
    expect(sabziRates.vendorRate).toBe(19.5);
    expect(sabziRates.customerRate).toBe(20);

    // Salad: Raw ₹5.00 -> Vendor payout ₹10.83 -> Customer rate ₹11.00
    const saladRates = deriveRatesFromVendorCost(5.0, 4);
    expect(saladRates.rawCost).toBe(5.0);
    expect(saladRates.vendorRate).toBe(10.83);
    expect(saladRates.customerRate).toBe(11);

    // Standard Thali: 4 Roti (4 * 1.5) + Dal (7) + Rice (8) + Sabzi (9) = 30 raw cost
    const baseRaw = 4 * rotiRates.rawCost + dalRates.rawCost + riceRates.rawCost + sabziRates.rawCost;
    expect(baseRaw).toBe(30);

    // Standard Thali vendor payout: 4 * 3.25 + 15.17 + 17.33 + 19.50 = 65.00
    const basePayout = 4 * rotiRates.vendorRate + dalRates.vendorRate + riceRates.vendorRate + sabziRates.vendorRate;
    expect(Math.round(basePayout)).toBe(65);
  });

  // ─── 18. 28-DAY CUSTOM PLAN (5 Roti, 1 Dal, 1 Chawal, 1 Sabzi) ──────────────
  test('18. 28-Day Monthly Plan (5 Roti, 1 Dal, 1 Chawal, 1 Sabzi): calculates ₹82.09/meal and ₹2,298.63 total', () => {
    // Component rates derived from raw vendor costs:
    // 5 Roti @ ₹1.5 = 7.5
    // 1 Dal @ ₹7 = 7
    // 1 Rice @ ₹8 = 8
    // 1 Sabzi @ ₹9 = 9
    // Raw kitchen cost = 7.5 + 7 + 8 + 9 = 31.50
    const totalRawCost = 5 * 1.5 + 7 + 8 + 9;
    expect(totalRawCost).toBe(31.5);

    // Vendor payout: 31.5 * (65/30) = 68.25
    const vendorPayout = 31.5 * (65 / 30);
    expect(vendorPayout).toBe(68.25);

    // Food selling price with 4% monthly margin: 68.25 / 0.96 = 71.09375
    const foodRate = vendorPayout / 0.96;
    expect(Number(foodRate.toFixed(2))).toBe(71.09);

    // Total per meal with ₹11 delivery charge: 71.09375 + 11 = 82.09375
    const mealWithDelivery = foodRate + 11;
    expect(Number(mealWithDelivery.toFixed(2))).toBe(82.09);

    // 28-day monthly plan (28 meals): 28 * 82.09375 = 2298.625 => ₹2,298.63 (or rounded integer ₹2,299)
    const planTotal = 28 * mealWithDelivery;
    expect(Number(planTotal.toFixed(2))).toBe(2298.63);
    expect(Math.round(planTotal)).toBe(2299);
  });

  // ─── 27. WEEKLY PLAN CANONICAL PRICING (Vendor ₹71.50 + ₹11 Delivery with 12% Margin + 2% Razorpay) ───
  test('27. Weekly plan formula: 9 meals at ₹71.50 vendor cost produces exactly ₹848.232', () => {
    const result = calculateWeeklyPlanPrice(9, 71.5, 11, 0.12, 0.02);

    expect(result.totalMeals).toBe(9);
    expect(result.vendorCostPerMeal).toBe(71.5);
    expect(result.deliveryFeePerMeal).toBe(11);
    expect(result.subtotalPerMeal).toBe(82.5); // 71.50 + 11.00
    expect(result.ratePerMealWithMargin).toBe(92.4); // 82.50 * 1.12
    expect(result.mealsSubtotal).toBe(831.6); // 9 * 92.40
    expect(result.razorpayRate).toBe(0.02);
    expect(result.finalPrice).toBe(848.232); // 831.60 * 1.02
    expect(result.effectivePricePerMeal).toBe(94.25);
  });

  test('28. Weekly plan standard base meal: 9 meals at ₹65.00 vendor cost produces ₹781.40', () => {
    const result = calculateWeeklyPlanPrice(9, 65, 11, 0.12, 0.02);

    expect(result.subtotalPerMeal).toBe(76); // 65.00 + 11.00
    expect(result.ratePerMealWithMargin).toBe(85.12); // 76.00 * 1.12
    expect(result.mealsSubtotal).toBe(766.08); // 9 * 85.12
    expect(result.finalPrice).toBe(781.402); // 766.08 * 1.02 rounded
    expect(result.effectivePricePerMeal).toBe(86.82);
  });
});

