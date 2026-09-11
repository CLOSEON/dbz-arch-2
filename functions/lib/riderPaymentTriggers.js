"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRiderPayment = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const db = admin.firestore();
const BASE_RATE_PER_KM = 10;
const TIFFIN_BONUS_THRESHOLD = 14;
const TIFFIN_BONUS_PER_EXTRA = 7;
exports.calculateRiderPayment = functions.firestore
    .document('rider_trips/{tripId}')
    .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'completed')
        return null;
    const tripId = change.after.id;
    const riderId = after.riderId;
    if (!riderId) {
        functions.logger.error(`[calculateRiderPayment] Trip ${tripId} has no riderId.`);
        return null;
    }
    const existingPayment = await db.collection('rider_payments')
        .where('riderTripId', '==', tripId)
        .limit(1)
        .get();
    if (!existingPayment.empty) {
        functions.logger.warn(`[calculateRiderPayment] Payment already exists for trip ${tripId}. Skipping.`);
        return null;
    }
    const pickupStops = after.pickupStops ?? [];
    const dropStops = after.dropStops ?? [];
    const pickupDistanceKm = pickupStops.reduce((sum, s) => sum + (typeof s.distanceKm === 'number' ? s.distanceKm : 0), 0);
    const dropDistanceKm = dropStops.reduce((sum, s) => sum + (typeof s.distanceKm === 'number' ? s.distanceKm : 0), 0);
    const routeDistanceKm = pickupDistanceKm + dropDistanceKm;
    const gpsDistanceKm = typeof after.gpsDistanceKm === 'number' ? after.gpsDistanceKm : 0;
    let billableDistanceKm = routeDistanceKm;
    if (gpsDistanceKm > 0) {
        if (routeDistanceKm > 0 && gpsDistanceKm > 2.5 * routeDistanceKm) {
            billableDistanceKm = routeDistanceKm;
            functions.logger.warn(`[calculateRiderPayment] GPS distance (${gpsDistanceKm}km) > 2.5x route distance (${routeDistanceKm}km) for trip ${tripId}. Fraud protection capped at route distance.`);
        }
        else if (routeDistanceKm > 0 && gpsDistanceKm >= 0.7 * routeDistanceKm) {
            billableDistanceKm = gpsDistanceKm;
        }
        else {
            billableDistanceKm = routeDistanceKm;
        }
    }
    else {
        billableDistanceKm = routeDistanceKm;
    }
    const totalDistanceKm = Math.max(billableDistanceKm, routeDistanceKm > 0 ? routeDistanceKm : 1.0);
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
    const orderIds = after.assignedOrderIds ?? [];
    let undeliveredDropsCount = 0;
    dropStops.forEach((stop) => {
        if (stop.status === 'failed' || stop.status === 'cancelled') {
            undeliveredDropsCount++;
        }
    });
    if (orderIds.length > 0) {
        const chunks = [];
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
    const paidTiffinCount = Math.max(0, riderConfirmedCount - undeliveredDropsCount);
    const basePayment = parseFloat((totalDistanceKm * BASE_RATE_PER_KM).toFixed(2));
    const extraTiffins = Math.max(0, paidTiffinCount - TIFFIN_BONUS_THRESHOLD);
    const tiffinBonus = extraTiffins * TIFFIN_BONUS_PER_EXTRA;
    const totalPayment = parseFloat((basePayment + tiffinBonus).toFixed(2));
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
    functions.logger.info(`[calculateRiderPayment] Trip ${tripId} → Payment ₹${totalPayment} ` +
        `(base ₹${basePayment} for ${totalDistanceKm.toFixed(2)}km + ` +
        `bonus ₹${tiffinBonus} for ${extraTiffins} extra tiffins, ${paidTiffinCount} paid)`);
    return null;
});
//# sourceMappingURL=riderPaymentTriggers.js.map