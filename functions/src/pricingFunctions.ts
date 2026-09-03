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

import { calculateCustomPlanPrice, CustomPlanType } from './utils/pricingUtils';
import { publishEvent } from './utils/events';

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

    const pattern = data?.pattern;
    if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'pattern is required and must be an object mapping days/dates to meal counts.'
      );
    }

    // Validation: pattern must have at least 1 meal
    const patternMealCount = Object.values(pattern).reduce<number>((sum, val) => {
      const count = Number(val);
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

    // ── 2. Pricing Validation via calculateCustomPlanPrice ────────────────────
    let pricePerMeal = 50; // default baseline
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
          pricePerMeal =
            planType === 'monthly' && pricingData.pricePerMeal > 300
              ? Math.round(pricingData.pricePerMeal / 28)
              : pricingData.pricePerMeal;
        }
      }
    } catch (pricingErr) {
      console.warn('[createCustomPlanSubscription] Error fetching pricing config, using default rate:', pricingErr);
    }

    // Call calculateCustomPlanPrice to verify calculations
    const verification = calculateCustomPlanPrice(planType, pattern, pricePerMeal);

    if (verification.totalMeals !== Number(data.totalMeals)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Validation failed: Provided totalMeals (${data.totalMeals}) does not match calculated total meals (${verification.totalMeals}).`
      );
    }

    const providedTotalPrice = Number(data.totalPrice);
    if (Math.abs(verification.totalPrice - providedTotalPrice) > 0.05) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Validation failed: Provided totalPrice (₹${providedTotalPrice}) does not match calculated total price (₹${verification.totalPrice} at ₹${pricePerMeal}/meal).`
      );
    }

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

    // ── 4. Create Document in "subscriptions" Collection ──────────────────────
    const subRef = db.collection('subscriptions').doc();
    const subscriptionType = planType === 'weekly' ? 'custom_weekly' : 'custom_monthly';
    const vendorId = data?.vendorId || userData?.default_vendor_id || 'default_vendor';
    const paymentId = data?.paymentId || null;
    const razorpayOrderId = data?.razorpayOrderId || null;

    const subscriptionDoc: Record<string, any> = {
      id: subRef.id,
      userId: userId,
      user_id: userId,
      vendor_id: vendorId,
      subscriptionType: subscriptionType,
      plan_id: subscriptionType,
      customPlan: {
        pattern: pattern,
        totalMeals: verification.totalMeals,
        totalPrice: verification.totalPrice,
        pricePerMeal: pricePerMeal,
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

      // For delivery ops
      deliveryPattern: pattern,
      delivery_pattern: pattern,
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

    await subRef.set(subscriptionDoc);

    // ── 5. Link to Payments System Record if Payment Exists ───────────────────
    if (paymentId || razorpayOrderId) {
      try {
        const paymentDocRef = db.collection('payments').doc(paymentId || `pay_${subRef.id}`);
        await paymentDocRef.set(
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
      } catch (payErr) {
        console.warn('[createCustomPlanSubscription] Payment linking note:', payErr);
      }
    }

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
        pricePerMeal: pricePerMeal,
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
