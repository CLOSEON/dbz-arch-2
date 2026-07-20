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
const coreAssignRiderTrips = async (vendorId, slot, overrideRadius = 2.0, batchId) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let ordersQuery = db.collection('orders')
        .where('status', '==', 'vendor_ready');
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
        .filter(order => !order.rider_trip_id);
    if (unassignedOrders.length === 0) {
        return { success: true, message: 'No pending unassigned orders found.' };
    }
    const vendorOrdersMap = new Map();
    const vendorIds = new Set();
    unassignedOrders.forEach(order => {
        const vId = order.vendor_id;
        vendorIds.add(vId);
        if (!vendorOrdersMap.has(vId)) {
            vendorOrdersMap.set(vId, []);
        }
        vendorOrdersMap.get(vId).push(order);
    });
    const vendorsSnap = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', Array.from(vendorIds))
        .get();
    const vendorLocations = new Map();
    vendorsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.location?.lat && data.location?.lng) {
            vendorLocations.set(doc.id, { lat: data.location.lat, lng: data.location.lng });
        }
    });
    const driversSnap = await db.collection('driver_profiles')
        .where('isActive', '==', true)
        .get();
    if (driversSnap.empty) {
        return { success: true, message: 'No active riders available for assignment.' };
    }
    const activeRiders = driversSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(rider => rider.currentLocation?.lat != null && rider.currentLocation?.lng != null);
    const batch = db.batch();
    let assignmentsMade = 0;
    for (const rider of activeRiders) {
        const rLat = rider.currentLocation.lat;
        const rLng = rider.currentLocation.lng;
        const eligibleVendors = [];
        for (const [vId, orders] of vendorOrdersMap.entries()) {
            if (orders.length === 0)
                continue;
            const vLoc = vendorLocations.get(vId);
            if (!vLoc)
                continue;
            const distance = (0, geo_1.getDistanceInKm)(rLat, rLng, vLoc.lat, vLoc.lng);
            if (distance <= overrideRadius) {
                eligibleVendors.push({ vId, distance, orders });
            }
        }
        if (eligibleVendors.length === 0)
            continue;
        eligibleVendors.sort((a, b) => a.distance - b.distance);
        let selectedTiffins = [];
        const maxTiffins = 20;
        const selectedVendorsSet = new Set();
        for (const vendor of eligibleVendors) {
            const remainingCapacity = maxTiffins - selectedTiffins.length;
            if (remainingCapacity <= 0)
                break;
            const ordersToTake = vendor.orders.slice(0, remainingCapacity);
            selectedTiffins.push(...ordersToTake);
            selectedVendorsSet.add(vendor.vId);
            const vOrders = vendorOrdersMap.get(vendor.vId);
            vendorOrdersMap.set(vendor.vId, vOrders.filter(o => !ordersToTake.includes(o)));
        }
        if (selectedTiffins.length === 0)
            continue;
        const selectedOrderIds = selectedTiffins.map(o => o.id);
        const selectedVendorIds = Array.from(selectedVendorsSet);
        const selectedBatchIds = Array.from(new Set(selectedTiffins.map(o => o.batch_id).filter(Boolean)));
        const isPartialLoad = selectedTiffins.length < maxTiffins;
        const pickupStops = [];
        let currentLat = rLat;
        let currentLng = rLng;
        let unvisitedVendors = [...selectedVendorIds];
        let sequence = 1;
        while (unvisitedVendors.length > 0) {
            let nearestVendor = '';
            let shortestDistance = Infinity;
            let nearestLoc = { lat: 0, lng: 0 };
            for (const vId of unvisitedVendors) {
                const vLoc = vendorLocations.get(vId);
                const d = (0, geo_1.getDistanceInKm)(currentLat, currentLng, vLoc.lat, vLoc.lng);
                if (d < shortestDistance) {
                    shortestDistance = d;
                    nearestVendor = vId;
                    nearestLoc = vLoc;
                }
            }
            const vendorOrdersCount = selectedTiffins.filter(o => o.vendor_id === nearestVendor).length;
            const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();
            pickupStops.push({
                vendorId: nearestVendor,
                location: nearestLoc,
                sequence,
                distanceKm: shortestDistance,
                expectedTiffinCount: vendorOrdersCount,
                pickupOTP,
                status: 'pending'
            });
            unvisitedVendors = unvisitedVendors.filter(v => v !== nearestVendor);
            currentLat = nearestLoc.lat;
            currentLng = nearestLoc.lng;
            sequence++;
        }
        const tripRef = db.collection('rider_trips').doc();
        batch.set(tripRef, {
            riderId: rider.id,
            assignedOrderIds: selectedOrderIds,
            vendorIds: selectedVendorIds,
            batch_ids: selectedBatchIds,
            pickupStops,
            status: 'pickup_pending',
            isPartialLoad,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        for (const order of selectedTiffins) {
            const orderRef = db.collection('orders').doc(order.id);
            batch.update(orderRef, {
                rider_trip_id: tripRef.id,
                driverId: rider.id,
                agentName: rider.name || 'Dabzzo Rider',
                agentPhone: rider.phone || rider.phoneNumber || '9999999999',
                vehicleNumber: rider.vehicleNumber || 'MH12 AB1234',
                status: 'rider_assigned',
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            const logRef = db.collection('order_status_logs').doc();
            batch.set(logRef, {
                id: logRef.id,
                order_id: order.id,
                from_status: order.status,
                to_status: 'rider_assigned',
                actor: rider.id,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        await (0, events_1.publishEvent)('rider_new_trip', rider.id, 'rider', `rider_trip_assigned_${tripRef.id}`, { stopCount: pickupStops.length });
        for (const vId of selectedVendorIds) {
            await (0, events_1.publishEvent)('vendor_rider_assigned', vId, 'vendor', `vendor_rider_assigned_${vId}_${tripRef.id}`, { tripId: tripRef.id });
        }
        assignmentsMade++;
    }
    if (assignmentsMade > 0) {
        await batch.commit();
        return { success: true, message: `Successfully assigned ${assignmentsMade} trip(s).` };
    }
    else {
        return { success: true, message: 'No riders were within 2km of pending vendors.' };
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
    const { vendorId, slot } = data || {};
    return await (0, exports.coreAssignRiderTrips)(vendorId, slot);
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
    let currentLat = lastPickup?.location?.lat ?? 18.5204;
    let currentLng = lastPickup?.location?.lng ?? 73.8567;
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
    const dropStops = [];
    let unvisited = [...pendingDrops];
    let sequence = 1;
    while (unvisited.length > 0) {
        let nearest = null;
        let shortestDist = Infinity;
        for (const order of unvisited) {
            const oLat = order.delivery_address?.lat ?? 0;
            const oLng = order.delivery_address?.lng ?? 0;
            const d = (0, geo_1.getDistanceInKm)(currentLat, currentLng, oLat, oLng);
            if (d < shortestDist) {
                shortestDist = d;
                nearest = order;
            }
        }
        if (!nearest)
            break;
        dropStops.push({
            orderId: nearest.id,
            customerId: nearest.user_id,
            location: { lat: nearest.delivery_address?.lat ?? 0, lng: nearest.delivery_address?.lng ?? 0 },
            address: nearest.delivery_address?.line1 ?? '',
            landmark: nearest.delivery_address?.landmark ?? '',
            sequence,
            distanceKm: shortestDist,
            status: 'pending',
        });
        currentLat = nearest.delivery_address?.lat ?? currentLat;
        currentLng = nearest.delivery_address?.lng ?? currentLng;
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
    const { tripId, vendorId, otp } = data || {};
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
        if (tripData?.riderId !== context.auth.uid && context.auth.token.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only the assigned rider or admin can verify the pickup OTP.');
        }
        const pickupStops = tripData?.pickupStops || [];
        const stopIndex = pickupStops.findIndex((s) => s.vendorId === vendorId);
        if (stopIndex === -1) {
            throw new functions.https.HttpsError('not-found', 'Vendor stop not found on this trip');
        }
        const stop = pickupStops[stopIndex];
        if (stop.pickupOTP !== otp) {
            return { success: false, message: 'Invalid OTP' };
        }
        if (stop.status === 'completed') {
            return { success: false, message: 'Already picked up' };
        }
        const ordersQuery = db.collection('orders')
            .where('rider_trip_id', '==', tripId)
            .where('vendor_id', '==', vendorId)
            .where('status', 'in', ['rider_assigned', 'vendor_ready', 'created', 'preparing', 'pending', 'notified']);
        const ordersSnap = await t.get(ordersQuery);
        pickupStops[stopIndex].status = 'completed';
        const allDone = pickupStops.every((s) => s.status === 'completed');
        t.update(tripRef, {
            pickupStops,
            status: allDone ? 'pickup_complete' : 'picking_up',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const batchIds = new Set();
        ordersSnap.forEach((doc) => {
            const order = doc.data();
            t.update(doc.ref, { status: 'picked_up', updated_at: admin.firestore.FieldValue.serverTimestamp() });
            if (order.batch_id)
                batchIds.add(order.batch_id);
            const logRef = db.collection('order_status_logs').doc();
            t.set(logRef, {
                id: logRef.id,
                order_id: doc.id,
                from_status: order.status,
                to_status: 'picked_up',
                actor: tripData?.riderId || 'rider',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        batchIds.forEach(batchId => {
            const batchRef = db.collection('batches').doc(batchId);
            t.update(batchRef, {
                status: 'completed',
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        return { success: true, message: 'OTP verified successfully. Orders picked up.', tripId, vendorId };
    });
    if (result.success) {
        await (0, events_1.publishEvent)('vendor_pickup_confirmed', vendorId, 'vendor', `vendor_pickup_${vendorId}_${tripId}`, { tripId });
    }
    return { success: result.success, message: result.message };
});
exports.regeneratePickupOTP = functions.https.onCall(async (data, context) => {
    if (!context?.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { tripId, vendorId } = data || {};
    if (!tripId || !vendorId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing tripId or vendorId');
    }
    if (vendorId !== context.auth.uid && context.auth.token.role !== 'admin') {
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