import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

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
