import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { getDistanceInKm } from './utils/geo';
import { publishEvent } from './utils/events';

const db = admin.firestore();

export const coreAssignRiderTrips = async (vendorId?: string, slot?: string, overrideRadius: number = 10.0, batchId?: string) => {
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
    } else if (data.coordinates?.lat && data.coordinates?.lng) {
      vendorLocations.set(doc.id, { lat: data.coordinates.lat, lng: data.coordinates.lng });
    } else {
      // Fallback coordinates for Central Nagpur so dispatch never drops unlocated vendors
      vendorLocations.set(doc.id, { lat: 21.1458, lng: 79.0882 });
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
    .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
    .filter(rider => rider.currentLocation?.lat != null && rider.currentLocation?.lng != null);

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

    const vLoc = vendorLocations.get(batchInfo.vendorId);
    if (!vLoc) continue;

    // Find nearest rider
    let nearestRiderIdx = -1;
    let shortestDist = Infinity;

    for (let i = 0; i < activeRiders.length; i++) {
      const r = activeRiders[i];
      const d = getDistanceInKm(r.currentLocation.lat, r.currentLocation.lng, vLoc.lat, vLoc.lng);
      if (d < shortestDist && d <= overrideRadius) {
        shortestDist = d;
        nearestRiderIdx = i;
      }
    }

    if (nearestRiderIdx === -1) continue; // No rider within radius

    const selectedRider = activeRiders[nearestRiderIdx];
    
    // Remove rider from pool so they only get 1 batch
    activeRiders.splice(nearestRiderIdx, 1);

    // Fetch batch to get existing OTP
    const batchDocRef = db.collection('batches').doc(bId);
    const batchSnap = await batchDocRef.get();
    let pickupOTP = batchSnap.data()?.pickup_otp;
    
    if (!pickupOTP) {
      pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();
    }

    const tripRef = db.collection('rider_trips').doc();

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
    let currentLat: number = lastPickup?.location?.lat ?? 21.1458; // Central Nagpur fallback
    let currentLng: number = lastPickup?.location?.lng ?? 79.0882;

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

    // Pre-fetch user coordinates for any drops missing delivery coordinates
    const missingCoordOrders = pendingDrops.filter(o => {
      const lat = o.delivery_address?.lat ?? o.address?.lat;
      const lng = o.delivery_address?.lng ?? o.address?.lng;
      return !lat || !lng || (lat === 0 && lng === 0);
    });

    const userCoordMap = new Map<string, { lat: number; lng: number }>();
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
        } catch (uErr) {
          functions.logger.warn('[computeDropRoute] Failed fetching user coordinates:', uErr);
        }
      }
    }

    // Nearest-Neighbor TSP for drop route
    const dropStops: any[] = [];
    let unvisited = [...pendingDrops];
    let sequence = 1;

    while (unvisited.length > 0) {
      let nearest: any = null;
      let shortestDist = Infinity;
      let resolvedLatForNearest = currentLat;
      let resolvedLngForNearest = currentLng;

      for (const order of unvisited) {
        let oLat = order.delivery_address?.lat ?? order.address?.lat;
        let oLng = order.delivery_address?.lng ?? order.address?.lng;

        // Fallback: If coordinates are missing or (0, 0), lookup user profile or apply non-zero geographic fallback
        if (!oLat || !oLng || (oLat === 0 && oLng === 0)) {
          const custId = order.user_id || order.customerId;
          const userCoords = custId ? userCoordMap.get(custId) : null;
          if (userCoords) {
            oLat = userCoords.lat;
            oLng = userCoords.lng;
          } else {
            // Valid platform fallback: offset by ~600m to prevent (0,0) distortion or 0 distance collapse
            oLat = currentLat + 0.005;
            oLng = currentLng + 0.005;
          }
        }

        const d = getDistanceInKm(currentLat, currentLng, oLat, oLng);
        if (d < shortestDist) {
          shortestDist = d;
          nearest = order;
          resolvedLatForNearest = oLat;
          resolvedLngForNearest = oLng;
        }
      }

      if (!nearest) break;

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
 * Accepts confirmedCount, checks for variance against expected tiffins,
 * records discrepancy, and updates order statuses to 'out_for_delivery' when all pickups complete.
 */
export const verifyPickupOTP = functions.https.onCall(async (data, context) => {
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
    
    // Auth check: Must be the assigned rider or an admin
    if (tripData?.riderId !== context.auth!.uid && context.auth!.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only the assigned rider or admin can verify the pickup OTP.');
    }

    const pickupStops = tripData?.pickupStops || [];
    const stopIndex = pickupStops.findIndex((s: any) => s.vendorId === vendorId);
    if (stopIndex === -1) {
      throw new functions.https.HttpsError('not-found', 'Vendor stop not found on this trip');
    }

    const stop = pickupStops[stopIndex];
    const enteredOTP = String(otp || '').trim();
    const stopOTP = String(stop.pickupOTP || '').trim();
    let isOtpValid = stopOTP.length > 0 && stopOTP === enteredOTP;

    // Also check vendor's batch pickup_otp if available
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

    // Mark stop completed and stamp confirmed count & discrepancy
    pickupStops[stopIndex].status = 'completed';
    pickupStops[stopIndex].confirmedCount = actualCount;
    pickupStops[stopIndex].discrepancy = countDiscrepancy;
    pickupStops[stopIndex].verifiedAt = admin.firestore.Timestamp.now();

    const allDone = pickupStops.every((s: any) => s.status === 'completed');
    const targetOrderStatus = allDone ? 'out_for_delivery' : 'picked_up';

    // 1. ALL READS FIRST (Firestore transactions require all reads before any writes)
    const ordersQuery = db.collection('orders')
      .where('rider_trip_id', '==', tripId)
      .where('vendor_id', '==', vendorId)
      .where('status', 'in', ['rider_assigned', 'vendor_ready', 'created', 'preparing', 'pending', 'notified']);
    const ordersSnap = await t.get(ordersQuery);

    const otherSnap = allDone
      ? await t.get(
          db.collection('orders')
            .where('rider_trip_id', '==', tripId)
            .where('status', '==', 'picked_up')
        )
      : null;

    // Collect batch IDs belonging specifically to THIS vendor stop
    const batchIds = new Set<string>();
    ordersSnap.forEach((doc) => {
      const order = doc.data();
      if (order.batch_id) batchIds.add(order.batch_id);
    });

    // Fallback: If orders query found no batch_id, inspect trip batch_ids belonging to THIS vendor
    const tripBatchIds: string[] = tripData?.batch_ids || [];
    const fallbackBatchDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const fallbackOrderDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    if (batchIds.size === 0 && tripBatchIds.length > 0) {
      for (const bId of tripBatchIds) {
        const batchDoc = await t.get(db.collection('batches').doc(bId));
        if (batchDoc.exists) {
          const bData = batchDoc.data();
          if (bData?.vendor_id === vendorId || bData?.vendorId === vendorId) {
            batchIds.add(bId);
            fallbackBatchDocs.push(batchDoc);
            const bOrderIds: string[] = bData?.order_ids || [];
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

    // 2. NOW EXECUTE ALL WRITES (all reads completed above)
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

    // Update associated batches for this vendor to 'picked_up'
    batchIds.forEach(batchId => {
      const batchRef = db.collection('batches').doc(batchId);
      const batchPayload: any = {
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
    await publishEvent(
      'vendor_pickup_confirmed',
      vendorId,
      'vendor',
      `vendor_pickup_${vendorId}_${tripId}`,
      { tripId }
    );

    if (result.countDiscrepancy && result.countDiscrepancy !== 0) {
      const dbSnap = await db.collection('users').where('role', '==', 'admin').get();
      dbSnap.docs.forEach((adminDoc) => {
        publishEvent(
          'delivery_failed',
          adminDoc.id,
          'admin',
          `count_discrepancy_${tripId}_${vendorId}_${adminDoc.id}`,
          {
            tripId,
            vendorId,
            message: `Tiffin count discrepancy: expected ${result.expectedCount}, rider confirmed ${result.actualCount} (variance: ${result.countDiscrepancy}).`
          }
        ).catch(e => console.warn('Discrepancy alert error:', e));
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

export const regeneratePickupOTP = functions.https.onCall(async (data, context) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { tripId, vendorId } = data || {};
  if (!tripId || !vendorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing tripId or vendorId');
  }

  // Auth check: Must be the vendor associated with this stop or an admin
  if (vendorId !== context.auth!.uid && context.auth!.token?.role !== 'admin') {
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
