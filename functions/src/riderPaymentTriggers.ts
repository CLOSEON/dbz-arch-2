import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

const db = admin.firestore();

// ─── Payment constants ────────────────────────────────────────────────────────
const BASE_RATE_PER_KM = 10;          // ₹10 per km
const TIFFIN_BONUS_THRESHOLD = 14;    // bonus only kicks in after 14 tiffins
const TIFFIN_BONUS_PER_EXTRA = 7;     // ₹7 per each tiffin beyond the threshold

/**
 * Firestore trigger: fires when a RiderTrip transitions to status = 'completed'.
 *
 * Payment formula:
 *   totalDistanceKm = Σ pickupStop.distanceKm + Σ dropStop.distanceKm
 *   basePayment     = totalDistanceKm × ₹10
 *   tiffinBonus     = max(0, deliveredCount − 14) × ₹7
 *   totalPayment    = basePayment + tiffinBonus
 *
 * Authoritative distance is the server-computed optimized route distance.
 * gpsDistanceKm (real GPS breadcrumbs accumulated by the tracker) is stored
 * alongside as a fraud-detection cross-check — never used in payment formula.
 */
export const calculateRiderPayment = functions.firestore
  .document('rider_trips/{tripId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as any;
    const after = change.after.data() as any;

    // Only fire on the exact transition → 'completed'
    if (before.status === after.status || after.status !== 'completed') return null;

    const tripId = change.after.id;
    const riderId: string = after.riderId;

    if (!riderId) {
      functions.logger.error(`[calculateRiderPayment] Trip ${tripId} has no riderId.`);
      return null;
    }

    // Guard: don't double-calculate (idempotency)
    const existingPayment = await db.collection('rider_payments')
      .where('riderTripId', '==', tripId)
      .limit(1)
      .get();
    if (!existingPayment.empty) {
      functions.logger.warn(`[calculateRiderPayment] Payment already exists for trip ${tripId}. Skipping.`);
      return null;
    }

    // ── Step 1: Get GPS-tracked distance ─────────────────────────────────────
    // GPS-tracked distance (real device path, accumulated by locationTracker)
    // As per RIDER_LOGIC.md, this is the authoritative source for payment.
    const gpsDistanceKm: number = typeof after.gpsDistanceKm === 'number' ? after.gpsDistanceKm : 0;
    const totalDistanceKm = gpsDistanceKm; // Used for payment

    // We can also calculate route distance for analytics/fraud checks, but it's not used for payment.
    const pickupStops: any[] = after.pickupStops ?? [];
    const dropStops: any[] = after.dropStops ?? [];
    const pickupDistanceKm: number = pickupStops.reduce(
      (sum: number, s: any) => sum + (typeof s.distanceKm === 'number' ? s.distanceKm : 0),
      0
    );
    const dropDistanceKm: number = dropStops.reduce(
      (sum: number, s: any) => sum + (typeof s.distanceKm === 'number' ? s.distanceKm : 0),
      0
    );
    const routeDistanceKm = pickupDistanceKm + dropDistanceKm;

    // ── Step 2: Count actually-delivered tiffins (using confirmed pickups) ──
    let riderConfirmedCount = 0;
    
    // 1. Sum up all tiffins the rider physically verified at pickup
    pickupStops.forEach(stop => {
      riderConfirmedCount += (typeof stop.confirmedCount === 'number' ? stop.confirmedCount : 0);
    });

    // 2. Count any drops that failed due to customer unavailability
    const orderIds: string[] = after.assignedOrderIds ?? [];
    let unavailableDropsCount = 0;

    if (orderIds.length > 0) {
      // Batch into chunks of 30 (Firestore in() limit)
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 30) {
        chunks.push(orderIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        // Query the 'orders' collection (which is canonical in DBZ ARCH 2)
        const snap = await db.collection('orders')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .where('status', '==', 'failed')
          .where('failure_reason', '==', 'customer_unavailable')
          .get();
        unavailableDropsCount += snap.size;
      }
    }

    // 3. Final paid tiffins = Confirmed Pickups minus Unavailable Drops
    const paidTiffinCount = Math.max(0, riderConfirmedCount - unavailableDropsCount);

    // ── Step 3: Compute payment ──────────────────────────────────────────────
    const basePayment = parseFloat((totalDistanceKm * BASE_RATE_PER_KM).toFixed(2));
    const extraTiffins = Math.max(0, paidTiffinCount - TIFFIN_BONUS_THRESHOLD);
    const tiffinBonus = extraTiffins * TIFFIN_BONUS_PER_EXTRA;
    const totalPayment = parseFloat((basePayment + tiffinBonus).toFixed(2));

    // ── Step 4: Write RiderPayment record ────────────────────────────────────
    const paymentRef = db.collection('rider_payments').doc();
    await paymentRef.set({
      riderTripId: tripId,
      riderId,
      totalDistanceKm: parseFloat(totalDistanceKm.toFixed(4)),
      routeDistanceKm: parseFloat(routeDistanceKm.toFixed(4)),
      basePayment,
      tiffinBonus,
      paidTiffinCount,
      totalPayment,
      calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
    });

    functions.logger.info(
      `[calculateRiderPayment] Trip ${tripId} → Payment ₹${totalPayment} ` +
      `(base ₹${basePayment} for ${totalDistanceKm.toFixed(2)}km + ` +
      `bonus ₹${tiffinBonus} for ${extraTiffins} extra tiffins, ${paidTiffinCount} paid)`
    );

    return null;
  });
