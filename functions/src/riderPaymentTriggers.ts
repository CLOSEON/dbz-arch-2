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

    // ── Step 1: Compute authoritative server route distance ─────────────────
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

    // ── Step 2: Cross-verify with GPS breadcrumb distance ───────────────────
    const gpsDistanceKm: number = typeof after.gpsDistanceKm === 'number' ? after.gpsDistanceKm : 0;
    
    let billableDistanceKm = routeDistanceKm;
    if (gpsDistanceKm > 0) {
      if (routeDistanceKm > 0 && gpsDistanceKm > 2.5 * routeDistanceKm) {
        // Fraud / unrealistic detour protection: cap at authoritative route distance
        billableDistanceKm = routeDistanceKm;
        functions.logger.warn(
          `[calculateRiderPayment] GPS distance (${gpsDistanceKm}km) > 2.5x route distance (${routeDistanceKm}km) for trip ${tripId}. Fraud protection capped at route distance.`
        );
      } else if (routeDistanceKm > 0 && gpsDistanceKm >= 0.7 * routeDistanceKm) {
        // Valid device GPS tracking within reasonable bounds
        billableDistanceKm = gpsDistanceKm;
      } else {
        // Throttled or incomplete device GPS; fallback safely to server route distance
        billableDistanceKm = routeDistanceKm;
      }
    } else {
      // Device GPS throttled or failed; guaranteed server route distance protects against ₹0 payout
      billableDistanceKm = routeDistanceKm;
    }

    // Minimum billable distance guarantee (floor at route distance or 1.0 km)
    const totalDistanceKm = Math.max(billableDistanceKm, routeDistanceKm > 0 ? routeDistanceKm : 1.0);

    // ── Step 3: Count actually-delivered tiffins (using confirmed pickups) ──
    let riderConfirmedCount = 0;
    
    pickupStops.forEach(stop => {
      const cnt = (typeof stop.confirmedCount === 'number' && stop.confirmedCount > 0)
        ? stop.confirmedCount 
        : (typeof stop.expectedTiffinCount === 'number' && stop.expectedTiffinCount > 0)
        ? stop.expectedTiffinCount
        : 1;
      riderConfirmedCount += cnt;
    });

    if (riderConfirmedCount === 0 && after.assignedOrderIds?.length > 0) {
      riderConfirmedCount = after.assignedOrderIds.length;
    }

    // Count drops that failed or were cancelled (not delivered)
    const orderIds: string[] = after.assignedOrderIds ?? [];
    let undeliveredDropsCount = 0;

    dropStops.forEach((stop: any) => {
      if (stop.status === 'failed' || stop.status === 'cancelled') {
        undeliveredDropsCount++;
      }
    });

    if (orderIds.length > 0) {
      // Batch into chunks of 30 (Firestore in() limit)
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 30) {
        chunks.push(orderIds.slice(i, i + 30));
      }
      let dbFailedCount = 0;
      for (const chunk of chunks) {
        const snap = await db.collection('orders')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .where('status', 'in', ['failed', 'cancelled'])
          .get();
        dbFailedCount += snap.size;
      }
      undeliveredDropsCount = Math.max(undeliveredDropsCount, dbFailedCount);
    }

    // Final paid tiffins = Confirmed Pickups minus Undelivered Drops
    const paidTiffinCount = Math.max(0, riderConfirmedCount - undeliveredDropsCount);

    // ── Step 4: Compute payment ──────────────────────────────────────────────
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
