import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { getDistanceInKm } from './utils/geo';
import { publishEvent } from './utils/events';

const db = admin.firestore();

export const assignRiderTrips = functions.https.onCall(async (data, context) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { vendorId, slot } = data || {};

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  // 1. Fetch unassigned canonical orders that are ready for pickup
  let ordersQuery = db.collection('orders')
    .where('status', '==', 'vendor_ready')
    .where('rider_trip_id', '==', null);
  
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

  const unassignedOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

  // 2. Group unassigned orders by vendor
  const vendorOrdersMap = new Map<string, any[]>();
  const vendorIds = new Set<string>();
  
  unassignedOrders.forEach(order => {
    const vId = order.vendor_id;
    vendorIds.add(vId);
    if (!vendorOrdersMap.has(vId)) {
      vendorOrdersMap.set(vId, []);
    }
    vendorOrdersMap.get(vId)!.push(order);
  });

  // 3. Fetch locations of these vendors
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

  // 4. Fetch active riders and locations
  const driversSnap = await db.collection('driver_profiles')
    .where('isActive', '==', true)
    .get();

  if (driversSnap.empty) {
    return { success: true, message: 'No active riders available for assignment.' };
  }

  const activeRiders = driversSnap.docs
    .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
    .filter(rider => rider.currentLocation?.lat != null && rider.currentLocation?.lng != null);

  const batch = db.batch();
  let assignmentsMade = 0;

  // 5. Match riders to vendors within 2km
  for (const rider of activeRiders) {
    const rLat = rider.currentLocation.lat;
    const rLng = rider.currentLocation.lng;

    let availableTiffins: any[] = [];

    for (const [vId, orders] of vendorOrdersMap.entries()) {
      if (orders.length === 0) continue;
      
      const vLoc = vendorLocations.get(vId);
      if (!vLoc) continue;

      const distance = getDistanceInKm(rLat, rLng, vLoc.lat, vLoc.lng);
      if (distance <= 2.0) {
        availableTiffins.push(...orders);
      }
    }

    if (availableTiffins.length === 0) continue;

    // Pick up to 20 tiffins
    const selectedTiffins = availableTiffins.slice(0, 20);
    const selectedOrderIds = selectedTiffins.map(o => o.id);
    const selectedVendorIds = Array.from(new Set(selectedTiffins.map(o => o.vendor_id)));
    const selectedBatchIds = Array.from(new Set(selectedTiffins.map(o => o.batch_id).filter(Boolean)));
    
    const isPartialLoad = selectedTiffins.length < 20;

    // 6. Routing algorithm (Nearest-Neighbor) for pickups
    const pickupStops: any[] = [];
    let currentLat = rLat;
    let currentLng = rLng;
    let unvisitedVendors = [...selectedVendorIds];
    let sequence = 1;

    while (unvisitedVendors.length > 0) {
      let nearestVendor = '';
      let shortestDistance = Infinity;
      let nearestLoc = { lat: 0, lng: 0 };

      for (const vId of unvisitedVendors) {
        const vLoc = vendorLocations.get(vId)!;
        const d = getDistanceInKm(currentLat, currentLng, vLoc.lat, vLoc.lng);
        if (d < shortestDistance) {
          shortestDistance = d;
          nearestVendor = vId;
          nearestLoc = vLoc;
        }
      }

      const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();

      pickupStops.push({
        vendorId: nearestVendor,
        location: nearestLoc,
        sequence,
        distanceKm: shortestDistance,
        status: 'pending',
        pickupOTP
      });

      unvisitedVendors = unvisitedVendors.filter(v => v !== nearestVendor);
      currentLat = nearestLoc.lat;
      currentLng = nearestLoc.lng;
      sequence++;
    }

    // Create RiderTrip
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

    // Assign canonical orders to the rider
    for (const order of selectedTiffins) {
      const orderRef = db.collection('orders').doc(order.id);
      batch.update(orderRef, {
        rider_trip_id: tripRef.id,
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
      
      const vOrders = vendorOrdersMap.get(order.vendor_id);
      if (vOrders) {
        vendorOrdersMap.set(order.vendor_id, vOrders.filter(o => o.id !== order.id));
      }
    }

    await publishEvent(
      'rider_new_trip',
      rider.id,
      'rider',
      `rider_trip_assigned_${tripRef.id}`,
      { stopCount: pickupStops.length }
    );

    for (const vId of selectedVendorIds) {
      await publishEvent(
        'vendor_rider_assigned',
        vId,
        'vendor',
        `vendor_rider_assigned_${vId}_${tripRef.id}`,
        { tripId: tripRef.id }
      );
    }

    assignmentsMade++;
  }

  if (assignmentsMade > 0) {
    await batch.commit();
    return { success: true, message: `Successfully assigned ${assignmentsMade} trip(s).` };
  } else {
    return { success: true, message: 'No riders were within 2km of pending vendors.' };
  }
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

    // Mark stop completed
    pickupStops[stopIndex].status = 'completed';
    
    const allDone = pickupStops.every((s: any) => s.status === 'completed');
    t.update(tripRef, { 
      pickupStops, 
      status: allDone ? 'pickup_complete' : 'picking_up',
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });

    // Mark canonical orders as picked_up
    const ordersQuery = db.collection('orders')
      .where('rider_trip_id', '==', tripId)
      .where('vendor_id', '==', vendorId)
      .where('status', 'in', ['rider_assigned', 'vendor_ready', 'created']);
    const ordersSnap = await t.get(ordersQuery);

    ordersSnap.forEach((doc) => {
      const order = doc.data();
      t.update(doc.ref, { status: 'picked_up', updated_at: admin.firestore.FieldValue.serverTimestamp() });
      
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
  const { tripId, vendorId } = data || {};
  if (!tripId || !vendorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing tripId or vendorId');
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
