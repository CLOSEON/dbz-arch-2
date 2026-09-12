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
exports.regeneratePickupOTP = exports.verifyPickupOTP = exports.computeDropRoute = exports.assignRiderTrips = exports.coreAssignRiderTrips = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const geo_1 = require("./utils/geo");
const events_1 = require("./utils/events");
const db = admin.firestore();
const coreAssignRiderTrips = async (vendorId, slot, overrideRadius = 10.0, batchId) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let ordersQuery = db.collection('orders')
        .where('status', 'in', ['created', 'preparing', 'vendor_ready']);
    if (vendorId) {
        ordersQuery = ordersQuery.where('vendor_id', '==', vendorId);
    }
    if (slot) {
        ordersQuery = ordersQuery.where('delivery_slot', '==', slot);
    }
    const ordersSnap = await ordersQuery.get();
    if (ordersSnap.empty) {
        return { success: true, message: 'No pending unassigned orders found.' };
    }
    const unassignedOrders = ordersSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(order => !order.rider_trip_id && order.batch_id);
    if (unassignedOrders.length === 0) {
        return { success: true, message: 'No pending unbatched unassigned orders found.' };
    }
    const batchMap = new Map();
    const vendorIds = new Set();
    unassignedOrders.forEach(order => {
        if (batchId && order.batch_id !== batchId)
            return;
        vendorIds.add(order.vendor_id);
        if (!batchMap.has(order.batch_id)) {
            batchMap.set(order.batch_id, { vendorId: order.vendor_id, orders: [] });
        }
        batchMap.get(order.batch_id).orders.push(order);
    });
    if (batchMap.size === 0) {
        return { success: true, message: 'No matching batches found.' };
    }
    const vendorsSnap = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', Array.from(vendorIds))
        .get();
    const vendorLocations = new Map();
    vendorsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.location?.lat && data.location?.lng) {
            vendorLocations.set(doc.id, { lat: data.location.lat, lng: data.location.lng });
        }
        else if (data.coordinates?.lat && data.coordinates?.lng) {
            vendorLocations.set(doc.id, { lat: data.coordinates.lat, lng: data.coordinates.lng });
        }
        else {
            vendorLocations.set(doc.id, { lat: 21.1458, lng: 79.0882 });
        }
    });
    const driversSnap = await db.collection('driver_profiles')
        .where('isActive', '==', true)
        .get();
    if (driversSnap.empty) {
        return { success: true, message: 'No active riders available for assignment.' };
    }
    let activeRiders = driversSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(rider => rider.currentLocation?.lat != null && rider.currentLocation?.lng != null);
    const activeTripsSnap = await db.collection('rider_trips')
        .where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping'])
        .get();
    const busyRiderIds = new Set();
    activeTripsSnap.docs.forEach(doc => {
        busyRiderIds.add(doc.data().riderId);
    });
    activeRiders = activeRiders.filter(r => !busyRiderIds.has(r.id));
    if (activeRiders.length === 0) {
        return { success: true, message: 'All active riders are currently busy with other trips.' };
    }
    const batch = db.batch();
    let assignmentsMade = 0;
    const batchesToAssign = Array.from(batchMap.entries());
    for (const [bId, batchInfo] of batchesToAssign) {
        if (activeRiders.length === 0)
            break;
        const vLoc = vendorLocations.get(batchInfo.vendorId);
        if (!vLoc)
            continue;
        let nearestRiderIdx = -1;
        let shortestDist = Infinity;
        for (let i = 0; i < activeRiders.length; i++) {
            const r = activeRiders[i];
            const d = (0, geo_1.getDistanceInKm)(r.currentLocation.lat, r.currentLocation.lng, vLoc.lat, vLoc.lng);
            if (d < shortestDist && d <= overrideRadius) {
                shortestDist = d;
                nearestRiderIdx = i;
            }
        }
        if (nearestRiderIdx === -1)
            continue;
        const selectedRider = activeRiders[nearestRiderIdx];
        activeRiders.splice(nearestRiderIdx, 1);
        const batchDocRef = db.collection('batches').doc(bId);
        const batchSnap = await batchDocRef.get();
        let pickupOTP = batchSnap.data()?.pickup_otp;
        if (!pickupOTP) {
            pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();
        }
        const tripRef = db.collection('rider_trips').doc();
        const pickupStops = [{
                vendorId: batchInfo.vendorId,
                location: vLoc,
                sequence: 1,
                distanceKm: shortestDist,
                expectedTiffinCount: batchInfo.orders.length,
                pickupOTP,
                status: 'pending'
            }];
        batch.set(tripRef, {
            riderId: selectedRider.id,
            assignedOrderIds: batchInfo.orders.map(o => o.id),
            vendorIds: [batchInfo.vendorId],
            batch_ids: [bId],
            pickupStops,
            slot: batchInfo.orders[0]?.delivery_slot || '11am',
            status: 'pickup_pending',
            isPartialLoad: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        batch.update(batchDocRef, {
            trip_id: tripRef.id,
            rider_id: selectedRider.id,
            rider_name: selectedRider.name || 'Dabzzo Rider',
            pickup_otp: pickupOTP,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        for (const order of batchInfo.orders) {
            const orderRef = db.collection('orders').doc(order.id);
            batch.update(orderRef, {
                rider_trip_id: tripRef.id,
                trip_id: tripRef.id,
                driverId: selectedRider.id,
                rider_id: selectedRider.id,
                agentName: selectedRider.name || 'Dabzzo Rider',
                agentPhone: selectedRider.phone || selectedRider.phoneNumber || '9999999999',
                vehicleNumber: selectedRider.vehicle_number || selectedRider.vehicleNumber || 'MH12 AB1234',
                status: 'rider_assigned',
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            const logRef = db.collection('order_status_logs').doc();
            batch.set(logRef, {
                id: logRef.id,
                order_id: order.id,
                from_status: order.status,
                to_status: 'rider_assigned',
                actor: selectedRider.id,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        await (0, events_1.publishEvent)('rider_new_trip', selectedRider.id, 'rider', `rider_trip_assigned_${tripRef.id}`, { stopCount: 1 });
        await (0, events_1.publishEvent)('vendor_rider_assigned', batchInfo.vendorId, 'vendor', `vendor_rider_assigned_${batchInfo.vendorId}_${tripRef.id}`, { tripId: tripRef.id });
        assignmentsMade++;
    }
    if (assignmentsMade > 0) {
        await batch.commit();
        return { success: true, message: `Successfully assigned ${assignmentsMade} batch(es) to riders.` };
    }
    else {
        return { success: true, message: 'No riders were within range of pending batches.' };
    }
};
exports.coreAssignRiderTrips = coreAssignRiderTrips;
exports.assignRiderTrips = functions.https.onCall(async (data, context) => {
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }
    if (context.auth.token.role !== 'admin') {
        const userDoc = await db.collection('users').doc(context.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can assign rider trips.');
        }
    }
    const { vendorId, slot, radius } = data || {};
    const maxRadius = typeof radius === 'number' && radius > 0 ? Math.min(radius, 5.0) : 2.0;
    return await (0, exports.coreAssignRiderTrips)(vendorId, slot, maxRadius);
});
exports.computeDropRoute = functions.firestore
    .document('rider_trips/{tripId}')
    .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'pickup_complete')
        return null;
    const tripId = change.after.id;
    const tripRef = db.collection('rider_trips').doc(tripId);
    const pickupStops = after.pickupStops ?? [];
    const lastPickup = [...pickupStops].reverse().find((s) => s.status === 'completed');
    let currentLat = lastPickup?.location?.lat ?? 21.1458;
    let currentLng = lastPickup?.location?.lng ?? 79.0882;
    const orderIds = after.assignedOrderIds ?? [];
    if (orderIds.length === 0)
        return null;
    const chunks = [];
    for (let i = 0; i < orderIds.length; i += 30) {
        chunks.push(orderIds.slice(i, i + 30));
    }
    const allOrders = [];
    for (const chunk of chunks) {
        const snap = await db.collection('orders')
            .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
            .get();
        snap.docs.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    }
    const pendingDrops = allOrders.filter((o) => o.status !== 'delivered' && o.status !== 'failed');
    if (pendingDrops.length === 0)
        return null;
    const missingCoordOrders = pendingDrops.filter(o => {
        const lat = o.delivery_address?.lat ?? o.address?.lat;
        const lng = o.delivery_address?.lng ?? o.address?.lng;
        return !lat || !lng || (lat === 0 && lng === 0);
    });
    const userCoordMap = new Map();
    if (missingCoordOrders.length > 0) {
        const uids = Array.from(new Set(missingCoordOrders.map(o => o.user_id || o.customerId).filter(Boolean)));
        for (let i = 0; i < uids.length; i += 30) {
            const chunk = uids.slice(i, i + 30);
            try {
                const uSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
                uSnap.docs.forEach(d => {
                    const uData = d.data();
                    const lat = uData.location?.lat ?? uData.coordinates?.lat;
                    const lng = uData.location?.lng ?? uData.coordinates?.lng;
                    if (lat && lng && (lat !== 0 || lng !== 0)) {
                        userCoordMap.set(d.id, { lat, lng });
                    }
                });
            }
            catch (uErr) {
                functions.logger.warn('[computeDropRoute] Failed fetching user coordinates:', uErr);
            }
        }
    }
    const dropStops = [];
    let unvisited = [...pendingDrops];
    let sequence = 1;
    while (unvisited.length > 0) {
        let nearest = null;
        let shortestDist = Infinity;
        let resolvedLatForNearest = currentLat;
        let resolvedLngForNearest = currentLng;
        for (const order of unvisited) {
            let oLat = order.delivery_address?.lat ?? order.address?.lat;
            let oLng = order.delivery_address?.lng ?? order.address?.lng;
            if (!oLat || !oLng || (oLat === 0 && oLng === 0)) {
                const custId = order.user_id || order.customerId;
                const userCoords = custId ? userCoordMap.get(custId) : null;
                if (userCoords) {
                    oLat = userCoords.lat;
                    oLng = userCoords.lng;
                }
                else {
                    oLat = currentLat + 0.005;
                    oLng = currentLng + 0.005;
                }
            }
            const d = (0, geo_1.getDistanceInKm)(currentLat, currentLng, oLat, oLng);
            if (d < shortestDist) {
                shortestDist = d;
                nearest = order;
                resolvedLatForNearest = oLat;
                resolvedLngForNearest = oLng;
            }
        }
        if (!nearest)
            break;
        const distKm = parseFloat(shortestDist.toFixed(2));
        dropStops.push({
            orderId: nearest.id,
            customerId: nearest.user_id || nearest.customerId,
            location: { lat: resolvedLatForNearest, lng: resolvedLngForNearest },
            address: nearest.delivery_address?.line1 || nearest.address?.line1 || '',
            landmark: nearest.delivery_address?.landmark || nearest.address?.landmark || '',
            sequence,
            distanceKm: distKm,
            status: 'pending',
        });
        currentLat = resolvedLatForNearest;
        currentLng = resolvedLngForNearest;
        unvisited = unvisited.filter((o) => o.id !== nearest.id);
        sequence++;
    }
    await tripRef.update({
        dropStops,
        status: 'dropping',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await (0, events_1.publishEvent)('rider_route_ready', after.riderId, 'rider', `rider_route_ready_${tripId}`, { tripId, stopCount: dropStops.length });
    functions.logger.info(`[computeDropRoute] Trip ${tripId}: ${dropStops.length} drop stops computed.`);
    return null;
});
exports.verifyPickupOTP = functions.https.onCall(async (data, context) => {
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { tripId, vendorId, otp, confirmedCount } = data || {};
    if (!tripId || !vendorId || !otp) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing tripId, vendorId, or otp');
    }
    const tripRef = db.collection('rider_trips').doc(tripId);
    const result = await db.runTransaction(async (t) => {
        const tripSnap = await t.get(tripRef);
        if (!tripSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Trip not found');
        }
        const tripData = tripSnap.data();
        if (tripData?.riderId !== context.auth.uid && context.auth.token?.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only the assigned rider or admin can verify the pickup OTP.');
        }
        const pickupStops = tripData?.pickupStops || [];
        const stopIndex = pickupStops.findIndex((s) => s.vendorId === vendorId);
        if (stopIndex === -1) {
            throw new functions.https.HttpsError('not-found', 'Vendor stop not found on this trip');
        }
        const stop = pickupStops[stopIndex];
        const enteredOTP = String(otp || '').trim();
        const stopOTP = String(stop.pickupOTP || '').trim();
        let isOtpValid = stopOTP.length > 0 && stopOTP === enteredOTP;
        if (!isOtpValid && tripData?.batch_ids?.length) {
            for (const bId of tripData.batch_ids) {
                const bDoc = await t.get(db.collection('batches').doc(bId));
                if (bDoc.exists) {
                    const bData = bDoc.data();
                    if ((bData?.vendor_id === vendorId || bData?.vendorId === vendorId) && String(bData?.pickup_otp || '').trim() === enteredOTP) {
                        isOtpValid = true;
                        break;
                    }
                }
            }
        }
        if (!isOtpValid) {
            return { success: false, message: 'Invalid OTP' };
        }
        if (stop.status === 'completed') {
            return { success: false, message: 'Already picked up' };
        }
        const expectedCount = Number(stop.expectedTiffinCount || 0);
        const parsedConfirmed = confirmedCount !== undefined && confirmedCount !== null ? Number(confirmedCount) : expectedCount;
        const actualCount = isNaN(parsedConfirmed) ? expectedCount : parsedConfirmed;
        const countDiscrepancy = actualCount - expectedCount;
        pickupStops[stopIndex].status = 'completed';
        pickupStops[stopIndex].confirmedCount = actualCount;
        pickupStops[stopIndex].discrepancy = countDiscrepancy;
        pickupStops[stopIndex].verifiedAt = admin.firestore.Timestamp.now();
        const allDone = pickupStops.every((s) => s.status === 'completed');
        const targetOrderStatus = allDone ? 'out_for_delivery' : 'picked_up';
        const ordersQuery = db.collection('orders')
            .where('rider_trip_id', '==', tripId)
            .where('vendor_id', '==', vendorId)
            .where('status', 'in', ['rider_assigned', 'vendor_ready', 'created', 'preparing', 'pending', 'notified']);
        const ordersSnap = await t.get(ordersQuery);
        const otherSnap = allDone
            ? await t.get(db.collection('orders')
                .where('rider_trip_id', '==', tripId)
                .where('status', '==', 'picked_up'))
            : null;
        const batchIds = new Set();
        ordersSnap.forEach((doc) => {
            const order = doc.data();
            if (order.batch_id)
                batchIds.add(order.batch_id);
        });
        const tripBatchIds = tripData?.batch_ids || [];
        const fallbackBatchDocs = [];
        const fallbackOrderDocs = [];
        if (batchIds.size === 0 && tripBatchIds.length > 0) {
            for (const bId of tripBatchIds) {
                const batchDoc = await t.get(db.collection('batches').doc(bId));
                if (batchDoc.exists) {
                    const bData = batchDoc.data();
                    if (bData?.vendor_id === vendorId || bData?.vendorId === vendorId) {
                        batchIds.add(bId);
                        fallbackBatchDocs.push(batchDoc);
                        const bOrderIds = bData?.order_ids || [];
                        for (const oId of bOrderIds) {
                            const oDoc = await t.get(db.collection('orders').doc(oId));
                            if (oDoc.exists) {
                                fallbackOrderDocs.push(oDoc);
                            }
                        }
                    }
                }
            }
        }
        t.update(tripRef, {
            pickupStops,
            status: allDone ? 'pickup_complete' : 'picking_up',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        ordersSnap.forEach((doc) => {
            const order = doc.data();
            t.update(doc.ref, {
                status: targetOrderStatus,
                picked_up_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            const logRef = db.collection('order_status_logs').doc();
            t.set(logRef, {
                id: logRef.id,
                order_id: doc.id,
                from_status: order.status,
                to_status: targetOrderStatus,
                actor: tripData?.riderId || 'rider',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        if (otherSnap) {
            otherSnap.forEach((doc) => {
                t.update(doc.ref, {
                    status: 'out_for_delivery',
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        }
        fallbackOrderDocs.forEach((oDoc) => {
            t.update(oDoc.ref, {
                status: targetOrderStatus,
                picked_up_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            const logRef = db.collection('order_status_logs').doc();
            t.set(logRef, {
                id: logRef.id,
                order_id: oDoc.id,
                from_status: oDoc.data()?.status || 'vendor_ready',
                to_status: targetOrderStatus,
                actor: tripData?.riderId || 'rider',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        batchIds.forEach(batchId => {
            const batchRef = db.collection('batches').doc(batchId);
            const batchPayload = {
                status: 'picked_up',
                picked_up_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            };
            if (countDiscrepancy !== 0) {
                batchPayload.tiffinCountDiscrepancy = countDiscrepancy;
                batchPayload.riderConfirmedCount = actualCount;
            }
            t.update(batchRef, batchPayload);
        });
        return {
            success: true,
            message: allDone ? 'Pickup complete! All tiffins collected — out for delivery 🛵' : 'Kitchen stop verified.',
            allDone,
            countDiscrepancy,
            expectedCount,
            actualCount,
            tripId,
            vendorId
        };
    });
    if (result.success) {
        await (0, events_1.publishEvent)('vendor_pickup_confirmed', vendorId, 'vendor', `vendor_pickup_${vendorId}_${tripId}`, { tripId });
        if (result.countDiscrepancy && result.countDiscrepancy !== 0) {
            const dbSnap = await db.collection('users').where('role', '==', 'admin').get();
            dbSnap.docs.forEach((adminDoc) => {
                (0, events_1.publishEvent)('delivery_failed', adminDoc.id, 'admin', `count_discrepancy_${tripId}_${vendorId}_${adminDoc.id}`, {
                    tripId,
                    vendorId,
                    message: `Tiffin count discrepancy: expected ${result.expectedCount}, rider confirmed ${result.actualCount} (variance: ${result.countDiscrepancy}).`
                }).catch(e => console.warn('Discrepancy alert error:', e));
            });
        }
    }
    return {
        success: result.success,
        message: result.message,
        allDone: result.allDone,
        discrepancy: result.countDiscrepancy
    };
});
exports.regeneratePickupOTP = functions.https.onCall(async (data, context) => {
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { tripId, vendorId } = data || {};
    if (!tripId || !vendorId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing tripId or vendorId');
    }
    if (vendorId !== context.auth.uid && context.auth.token?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the vendor associated with this stop or an admin can regenerate the OTP.');
    }
    const tripRef = db.collection('rider_trips').doc(tripId);
    return await db.runTransaction(async (t) => {
        const tripSnap = await t.get(tripRef);
        if (!tripSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Trip not found');
        }
        const tripData = tripSnap.data();
        const pickupStops = tripData?.pickupStops || [];
        const stopIndex = pickupStops.findIndex((s) => s.vendorId === vendorId);
        if (stopIndex === -1) {
            throw new functions.https.HttpsError('not-found', 'Vendor stop not found on this trip');
        }
        const stop = pickupStops[stopIndex];
        if (stop.status === 'completed') {
            return { success: false, message: 'Already picked up' };
        }
        const newOTP = Math.floor(1000 + Math.random() * 9000).toString();
        pickupStops[stopIndex].pickupOTP = newOTP;
        t.update(tripRef, { pickupStops, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true, message: 'OTP regenerated', otp: newOTP };
    });
});
//# sourceMappingURL=matchingTriggers.js.map