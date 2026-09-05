import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { getDistanceInKm } from './utils/geo';
import { publishEvent } from './utils/events';

const db = admin.firestore();

export const coreAssignRiderTrips = async (vendorId?: string, slot?: string, overrideRadius: number = 2.0, batchId?: string) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  // 1. Query potential orders
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

  // 2. Filter for unassigned orders that belong to a batch
  const unassignedOrders = ordersSnap.docs
    .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
    .filter(order => !order.rider_trip_id && order.batch_id);

  if (unassignedOrders.length === 0) {
    return { success: true, message: 'No pending unbatched unassigned orders found.' };
  }

  // Group by batch_id
  const batchMap = new Map<string, { vendorId: string, orders: any[] }>();
  const vendorIds = new Set<string>();
  
  unassignedOrders.forEach(order => {
    // If specific batchId is passed, only consider that batch
    if (batchId && order.batch_id !== batchId) return;

    vendorIds.add(order.vendor_id);
    if (!batchMap.has(order.batch_id)) {
      batchMap.set(order.batch_id, { vendorId: order.vendor_id, orders: [] });
    }
    batchMap.get(order.batch_id)!.orders.push(order);
  });

  if (batchMap.size === 0) {
    return { success: true, message: 'No matching batches found.' };
  }

  // 3. Get Vendor locations
  const vendorsSnap = await db.collection('users')
    .where(admin.firestore.FieldPath.documentId(), 'in', Array.from(vendorIds))
    .get();

  const vendorLocations = new Map<string, { lat: number; lng: number }>();
  vendorsSnap.docs.forEach(doc => {
    const data = doc.data() as any;
    if (data.location?.lat && data.location?.lng) {
      vendorLocations.set(doc.id, { lat: data.location.lat, lng: data.location.lng });
    }
  });

  // 4. Get active riders
  const driversSnap = await db.collection('driver_profiles')
    .where('isActive', '==', true)
    .get();

  if (driversSnap.empty) {
    return { success: true, message: 'No active riders available for assignment.' };
  }

  let activeRiders = driversSnap.docs
    .map(doc => {
      const data = doc.data() as any;
      const currentLocation = (data.currentLocation?.lat != null && data.currentLocation?.lng != null)
        ? data.currentLocation
        : { lat: 18.5204, lng: 73.8567 }; // Pune default fallback for standby riders
      return { id: doc.id, ...data, currentLocation };
    });

  // Exclude riders who are already on an active trip
  const activeTripsSnap = await db.collection('rider_trips')
    .where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping'])
    .get();
  
  const busyRiderIds = new Set<string>();
  activeTripsSnap.docs.forEach(doc => {
    busyRiderIds.add(doc.data().riderId);
  });

  activeRiders = activeRiders.filter(r => !busyRiderIds.has(r.id));

  if (activeRiders.length === 0) {
    return { success: true, message: 'All active riders are currently busy with other trips.' };
  }

  // 5. Assign 1 Batch to 1 Rider
  const batch = db.batch();
  let assignmentsMade = 0;
  
  const batchesToAssign = Array.from(batchMap.entries());

  for (const [bId, batchInfo] of batchesToAssign) {
    if (activeRiders.length === 0) break; // No more riders

    const vLoc = vendorLocations.get(batchInfo.vendorId) || { lat: 18.5204, lng: 73.8567 };

    // Find nearest rider
    let nearestRiderIdx = -1;
    let shortestDist = Infinity;

    for (let i = 0; i < activeRiders.length; i++) {
      const r = activeRiders[i];
      const d = getDistanceInKm(r.currentLocation.lat, r.currentLocation.lng, vLoc.lat, vLoc.lng);
      if (d < shortestDist && d <= Math.max(overrideRadius, 25.0)) {
        shortestDist = d;
        nearestRiderIdx = i;
      }
    }

    if (nearestRiderIdx === -1) continue; // No rider within radius

    const selectedRider = activeRiders[nearestRiderIdx];
    
    // Remove rider from pool so they only get 1 batch
    activeRiders.splice(nearestRiderIdx, 1);

    const tripRef = db.collection('rider_trips').doc();
    const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();

    // Create pickup stop for this batch's vendor
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
      riderName: selectedRider.name || 'Dabzzo Rider',
      riderPhone: selectedRider.phone || selectedRider.phoneNumber || '9900990044',
      vehicleType: selectedRider.vehicleType || 'Motorcycle',
      assignedOrderIds: batchInfo.orders.map(o => o.id),
      vendorIds: [batchInfo.vendorId],
      batch_ids: [bId],
      pickupStops,
      status: 'pickup_pending',
      isPartialLoad: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update batch document with the pickup OTP so vendor screen shows exact matching code
    const batchRef = db.collection('batches').doc(bId);
    batch.update(batchRef, {
      pickup_otp: pickupOTP,
      status: 'ready',
      rider_id: selectedRider.id,
      trip_id: tripRef.id,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    for (const order of batchInfo.orders) {
      const orderRef = db.collection('orders').doc(order.id);
      const deliveryOtp = order.delivery_otp || order.otp || Math.floor(1000 + Math.random() * 9000).toString();
      batch.update(orderRef, {
        rider_trip_id: tripRef.id,
        driverId: selectedRider.id,
        agentName: selectedRider.name || 'Dabzzo Rider',
        agentPhone: selectedRider.phone || selectedRider.phoneNumber || '9900990044',
        vehicleNumber: selectedRider.vehicleNumber || 'MH12 AB1234',
        delivery_otp: deliveryOtp,
        otp: deliveryOtp,
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

    await publishEvent(
      'rider_new_trip',
      selectedRider.id,
      'rider',
      `rider_trip_assigned_${tripRef.id}`,
      { stopCount: 1 }
    );

    await publishEvent(
      'vendor_rider_assigned',
      batchInfo.vendorId,
      'vendor',
      `vendor_rider_assigned_${batchInfo.vendorId}_${tripRef.id}`,
      { tripId: tripRef.id }
    );

    assignmentsMade++;
  }

  if (assignmentsMade > 0) {
    await batch.commit();
    return { success: true, message: `Successfully assigned ${assignmentsMade} batch(es) to riders.` };
  } else {
    return { success: true, message: 'No riders were within range of pending batches.' };
  }
};

export const assignRiderTrips = functions.https.onCall(async (data, context) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  // Admin Check
  if (context.auth.token.role !== 'admin') {
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can assign rider trips.');
    }
  }

  const { vendorId, slot, radius } = data || {};
  const maxRadius = typeof radius === 'number' && radius > 0 ? Math.min(radius, 5.0) : 2.0;
  return await coreAssignRiderTrips(vendorId, slot, maxRadius);
});

/**
 * Firestore trigger: when a RiderTrip status changes to "pickup_complete",
 * compute the optimised drop route (Nearest-Neighbor) and store it as dropStops.
 */
export const computeDropRoute = functions.firestore
  .document('rider_trips/{tripId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as any;
    const after = change.after.data() as any;

    // Only fire when transitioning into pickup_complete
    if (before.status === after.status || after.status !== 'pickup_complete') return null;

    const tripId = change.after.id;
    const tripRef = db.collection('rider_trips').doc(tripId);

    // Determine starting point: last completed pickup stop location
    const pickupStops: any[] = after.pickupStops ?? [];
    const lastPickup = [...pickupStops].reverse().find((s: any) => s.status === 'completed');
    let currentLat: number = lastPickup?.location?.lat ?? 18.5204; // Pune fallback
    let currentLng: number = lastPickup?.location?.lng ?? 73.8567;

    // Fetch all picked_up orders for this trip
    const orderIds: string[] = after.assignedOrderIds ?? [];
    if (orderIds.length === 0) return null;

    // Firestore in() only supports 30 items; chunk if needed
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 30) {
      chunks.push(orderIds.slice(i, i + 30));
    }

    const allOrders: any[] = [];
    for (const chunk of chunks) {
      const snap = await db.collection('orders')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.docs.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    }

    // Build list of pending drops (exclude already-delivered)
    const pendingDrops = allOrders.filter(
      (o) => o.status !== 'delivered' && o.status !== 'failed'
    );

    if (pendingDrops.length === 0) return null;

    // Nearest-Neighbor TSP for drop route
    const dropStops: any[] = [];
    let unvisited = [...pendingDrops];
    let sequence = 1;

    while (unvisited.length > 0) {
      let nearest: any = null;
      let shortestDist = Infinity;

      for (const order of unvisited) {
        const oLat: number = order.delivery_address?.lat ?? 0;
        const oLng: number = order.delivery_address?.lng ?? 0;
        const d = getDistanceInKm(currentLat, currentLng, oLat, oLng);
        if (d < shortestDist) {
          shortestDist = d;
          nearest = order;
        }
      }

      if (!nearest) break;

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

    await publishEvent(
      'rider_route_ready',
      after.riderId,
      'rider',
      `rider_route_ready_${tripId}`,
      { tripId, stopCount: dropStops.length }
    );

    functions.logger.info(`[computeDropRoute] Trip ${tripId}: ${dropStops.length} drop stops computed.`);
    return null;
  });

/**
 * Callable function for a rider to verify the vendor's pickup OTP.
 */
export const verifyPickupOTP = functions.https.onCall(async (data, context) => {
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
    
    // Auth check: Must be the assigned rider or an admin
    if (tripData?.riderId !== context.auth!.uid && context.auth!.token.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only the assigned rider or admin can verify the pickup OTP.');
    }

    const pickupStops = tripData?.pickupStops || [];
    const stopIndex = pickupStops.findIndex((s: any) => s.vendorId === vendorId);
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

    // Mark canonical orders as picked_up
    const ordersQuery = db.collection('orders')
      .where('rider_trip_id', '==', tripId)
      .where('vendor_id', '==', vendorId)
      .where('status', 'in', ['rider_assigned', 'vendor_ready', 'created', 'preparing', 'pending', 'notified']);
    const ordersSnap = await t.get(ordersQuery);

    // Mark stop completed
    pickupStops[stopIndex].status = 'completed';
    
    const allDone = pickupStops.every((s: any) => s.status === 'completed');
    t.update(tripRef, { 
      pickupStops, 
      status: allDone ? 'pickup_complete' : 'picking_up',
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });

    const batchIds = new Set<string>();

    ordersSnap.forEach((doc) => {
      const order = doc.data();
      t.update(doc.ref, { status: 'picked_up', updated_at: admin.firestore.FieldValue.serverTimestamp() });
      if (order.batch_id) batchIds.add(order.batch_id);
      
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
    await publishEvent(
      'vendor_pickup_confirmed',
      vendorId,
      'vendor',
      `vendor_pickup_${vendorId}_${tripId}`,
      { tripId }
    );
  }

  return { success: result.success, message: result.message };
});

export const regeneratePickupOTP = functions.https.onCall(async (data, context) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { tripId, vendorId } = data || {};
  if (!tripId || !vendorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing tripId or vendorId');
  }

  // Auth check: Must be the vendor associated with this stop or an admin
  if (vendorId !== context.auth!.uid && context.auth!.token.role !== 'admin') {
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
    const stopIndex = pickupStops.findIndex((s: any) => s.vendorId === vendorId);
    if (stopIndex === -1) {
      throw new functions.https.HttpsError('not-found', 'Vendor stop not found on this trip');
    }

    const stop = pickupStops[stopIndex];
    if (stop.status === 'completed') {
      return { success: false, message: 'Already picked up' };
    }

    // Generate new OTP
    const newOTP = Math.floor(1000 + Math.random() * 9000).toString();
    pickupStops[stopIndex].pickupOTP = newOTP;

    t.update(tripRef, { pickupStops, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    return { success: true, message: 'OTP regenerated', otp: newOTP };
  });
});
