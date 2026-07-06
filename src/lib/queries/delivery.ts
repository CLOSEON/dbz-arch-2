import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  writeBatch,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { Delivery, DeliveryStatus as OldDeliveryStatus } from '@/types';
import type { DeliveryOrder, DriverProfile, DeliveryStatus, RiderTrip, PickupStop, DropStop } from '@/types/delivery';
import { awardUserCredit } from './swaps';
import { createAuditLog } from './audit';

// ==========================================
// BACKWARD COMPATIBILITY LAYER FOR OLD FLIGHTS
// ==========================================

/**
 * Establishes a real-time Firestore listener for all active deliveries assigned to a specific delivery agent.
 * Excludes 'delivered' and 'failed_attempt' statuses.
 * @param deliveryBoyId The UID of the delivery agent.
 * @param callback Triggered with an array of active DeliveryOrders and a boolean indicating if the data is from the local cache.
 * @returns The unsubscribe function to tear down the listener.
 */
export function subscribeToAgentDeliveries(
  deliveryBoyId: string,
  callback: (orders: DeliveryOrder[], fromCache: boolean) => void
): () => void {
  // Simple query on a single field — no composite index required.
  const q = query(
    collection(db, 'orders'),
    where('driverId', '==', deliveryBoyId)
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder))
        .filter((order) => {
          // Filter to only include today's orders
          if (!order.createdAt) return false;
          const createdAt = order.createdAt as { seconds?: number } | string | Date;
          const timestamp = typeof createdAt === 'string'
            ? new Date(createdAt).getTime()
            : createdAt instanceof Date
              ? createdAt.getTime()
              : (createdAt?.seconds ?? 0) * 1000;
          return timestamp >= start.getTime() && timestamp <= end.getTime();
        })
        .sort((a, b) => {
          // Sort by createdAt ascending (oldest first)
          const aTime = (a as any).createdAt?.seconds ?? 0;
          const bTime = (b as any).createdAt?.seconds ?? 0;
          return aTime - bTime;
        });
      callback(list, snap.metadata.fromCache);
    }
  );
}


/**
 * Legacy update function to update location of a user.
 */
export async function updateDeliveryLocation(
  userId: string,
  lat: number,
  lng: number
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    location: {
      lat,
      lng,
      updated_at: Date.now(),
    },
  });
}

/**
 * Legacy function to fetch deliveries for a vendor.
 */
export async function getVendorDeliveries(vendorId: string): Promise<Delivery[]> {
  const q = query(
    collection(db, 'deliveries'),
    where('vendor_id', '==', vendorId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery));
}

/**
 * Legacy function to fetch deliveries for a customer.
 */
export async function getUserDeliveries(userId: string): Promise<Delivery[]> {
  const q = query(
    collection(db, 'deliveries'),
    where('user_id', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery));
}

// ==========================================
// MODERN DABZO 2.0 DELIVERY ENGINE PIPELINE
// ==========================================

/**
 * Establishes a real-time Firestore listener on the customer's active delivery order for a specific date.
 * 
 * @param customerId - The customer's unique user identifier.
 * @param date - Target date string in 'YYYY-MM-DD' format.
 * @param callback - Triggered with the updated DeliveryOrder object or null if none found.
 * @returns The unsubscribe function to tear down the listener.
 */
export function subscribeToMyDelivery(
  customerId: string,
  date: string,
  callback: (order: DeliveryOrder | null) => void
): () => void {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'orders'),
    where('customerId', '==', customerId),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end))
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() } as DeliveryOrder);
    }
  });
}

/**
 * Establishes a real-time tracking listener for all active/online delivery partners in the fleet.
 * Primarily designed for Admin dashboard overview maps.
 * 
 * @param callback - Triggered with an array of active DriverProfiles.
 * @returns The unsubscribe function to tear down the listener.
 */
export function subscribeToAllDriverLocations(
  callback: (drivers: DriverProfile[]) => void
): () => void {
  const q = query(
    collection(db, 'driver_profiles'),
    where('isActive', '==', true)
  );

  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as DriverProfile));
    callback(list);
  });
}

/**
 * Fetches all delivery orders registered for a specific vendor on a target day.
 * 
 * @param vendorId - The unique identifier of the vendor kitchen.
 * @param date - The target date string in 'YYYY-MM-DD' format.
 * @returns A promise resolving to an array of DeliveryOrders.
 */
export async function getVendorTodayOrders(
  vendorId: string,
  date: string
): Promise<DeliveryOrder[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setDate(end.getDate() + 5);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'orders'),
    where('vendorId', '==', vendorId),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder));
}

/**
 * Dynamically updates the status of a delivery order and automatically logs corresponding event timestamps.
 * Also synchronizes the driver's current position to the order document once transit begins.
 * Supports backward compatibility for legacy 'deliveries' updates.
 * 
 * @param orderId - The target order identifier.
 * @param status - The new status state (compatible with new and legacy status structures).
 * @param driverId - Optional identifier of the assigned delivery partner.
 */
export async function updateDeliveryStatus(
  orderId: string,
  status: DeliveryStatus | OldDeliveryStatus,
  driverId: string | null = null
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);

  if (orderSnap.exists()) {
    let driverLocation = null;
    if (status === 'out_for_delivery' && driverId) {
      const driverDoc = await getDoc(doc(db, 'driver_profiles', driverId));
      if (driverDoc.exists()) {
        const driverData = driverDoc.data();
        if (driverData.currentLocation) {
          driverLocation = driverData.currentLocation;
        }
      }
    }

    const updateData: any = { status };

    // Set correct timeline audit stamps depending on the status transition
    if (status === 'preparing') updateData['timestamps.preparedAt'] = Timestamp.now();
    if (status === 'picked_up') updateData['timestamps.pickedAt'] = Timestamp.now();
    if (status === 'out_for_delivery') {
      updateData['timestamps.outAt'] = Timestamp.now();
      if (driverLocation) {
        updateData.driverLocation = driverLocation;
      }
    }
    if (status === 'delivered') updateData['timestamps.deliveredAt'] = Timestamp.now();

    await updateDoc(orderRef, updateData);
  } else {
    // Fallback to legacy deliveries collection
    await updateDoc(doc(db, 'deliveries', orderId), {
      status,
      updated_at: Timestamp.now(),
    });
  }
}

/**
 * Reassigns a delivery order to a new driver.
 * 
 * @param orderId - The target order identifier.
 * @param newDriverId - The unique identifier of the new delivery partner.
 */
export async function reassignDriver(
  orderId: string,
  newDriverId: string
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    driverId: newDriverId,
    updatedAt: Timestamp.now()
  });
}

/**
 * Updates a driver's live GPS coordinates in their dedicated fleet profile.
 * 
 * @param driverId - The unique authentication identifier of the driver.
 * @param lat - Decimal latitude.
 * @param lng - Decimal longitude.
 */
export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number
): Promise<void> {
  await setDoc(doc(db, 'driver_profiles', driverId), {
    currentLocation: {
      lat,
      lng,
      updatedAt: Timestamp.now(),
    },
  }, { merge: true });
}

/**
 * Verifies a customer's delivery OTP. If correct, transitions the order status to 'delivered'
 * and records completion timestamps.
 * 
 * @param orderId - The target order identifier.
 * @param enteredOTP - The 4-digit code provided by the customer.
 * @returns Object indicating success status or error details.
 */
export async function verifyDeliveryOTP(
  orderId: string,
  enteredOTP: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return { success: false, error: 'Order not found' };
    }

    const orderData = orderSnap.data() as DeliveryOrder;
    if (orderData.otp !== enteredOTP) {
      return { success: false, error: 'Incorrect OTP' };
    }

    await updateDoc(orderRef, {
      otpVerified: true,
      status: 'delivered',
      'timestamps.deliveredAt': Timestamp.now(),
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'OTP verification failed' };
  }
}

/**
 * Batch updates all active meal orders for a given vendor on a specific date to the "picked_up" state.
 * Usually executed when a vendor hands over a bulk batch of prepared boxes to a driver.
 * 
 * @param vendorId - The unique identifier of the vendor kitchen.
 * @param date - The target date string in 'YYYY-MM-DD' format.
 */
export async function markVendorOrdersReady(
  vendorId: string,
  date: string
): Promise<void> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'orders'),
    where('vendorId', '==', vendorId),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      status: 'picked_up',
      'timestamps.pickedAt': Timestamp.now(),
    });

    // Add driver notification
    const notifRef = doc(collection(db, 'orders', d.id, 'notifications'));
    batch.set(notifRef, {
      orderId: d.id,
      type: 'ready_for_pickup',
      message: `Your assigned batch #${d.id.slice(-4).toUpperCase()} from the kitchen is ready for handover!`,
      createdAt: Timestamp.now(),
    });
  });

  await batch.commit();
}

/**
 * Retrieves aggregate delivery statistics filtered by status for administrative audit.
 * 
 * @param date - The target audit date in 'YYYY-MM-DD' format.
 * @returns An object matching status keys to daily item counts.
 */
export async function getAdminDeliveryOverview(
  date: string
): Promise<Record<string, number>> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'orders'),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);
  const overview: Record<string, number> = {
    preparing: 0,
    picked_up: 0,
    out_for_delivery: 0,
    delivered: 0,
    failed: 0,
  };

  snap.docs.forEach((d) => {
    const status = d.data().status as string;
    if (status && status in overview) {
      overview[status]++;
    }
  });

  return overview;
}

interface DelayPayload {
  reason: string;
  message?: string;
  newETA: string;
}

/**
 * Broadcasts a delay notification to all subscribers who have active deliveries today.
 * Inserts a notification record into each active order's subcollection.
 * 
 * @param vendorId - The unique identifier of the vendor.
 * @param payload - The details of the delay including reason, optional custom text, and new ETA.
 */
export async function sendDelayNotification(
  vendorId: string,
  payload: DelayPayload
): Promise<void> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  // Get active delivery orders (where status is preparing, picked_up, or out_for_delivery)
  const q = query(
    collection(db, 'orders'),
    where('vendorId', '==', vendorId),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
    where('status', 'in', ['preparing', 'picked_up', 'out_for_delivery'])
  );

  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((docSnap) => {
    // Generate a reference for the notifications subcollection
    const notifRef = doc(collection(db, 'orders', docSnap.id, 'notifications'));
    batch.set(notifRef, {
      orderId: docSnap.id,
      type: 'delay_alert',
      message: `Delay Alert (${payload.reason}): ${payload.message || 'Apologies for the delay.'} Estimated arrival: ${payload.newETA}`,
      createdAt: Timestamp.now(),
    });
  });

  await batch.commit();
}

/**
 * Broadcasts a proximity notification to the customer when the driver is approaching.
 * 
 * @param orderId - The target order identifier.
 * @param etaMinutes - The estimated minutes until arrival.
 */
export async function sendProximityAlert(
  orderId: string,
  etaMinutes: number
): Promise<void> {
  const notifRef = doc(collection(db, 'orders', orderId, 'notifications'));
  await setDoc(notifRef, {
    orderId,
    type: 'driver_approaching',
    message: `Your driver is nearby! Arriving in approximately ${etaMinutes} minutes.`,
    createdAt: Timestamp.now(),
  });
}

/**
 * Triggers an alert to the admin/driver when a vendor is significantly delayed handing over meals.
 * 
 * @param vendorId - The unique identifier of the vendor.
 * @param batchId - The id of the delayed order.
 */
export async function sendVendorDelayAlert(
  vendorId: string,
  batchId: string
): Promise<void> {
  const notifRef = doc(collection(db, 'orders', batchId, 'notifications'));
  await setDoc(notifRef, {
    orderId: batchId,
    vendorId,
    type: 'vendor_delayed_handover',
    message: `Vendor handover is delayed for batch #${batchId.slice(-4).toUpperCase()}.`,
    createdAt: Timestamp.now(),
  });
}

/**
 * Reassigns an active delivery order to a new driver.
 * 
 * @param orderId - The unique identifier of the target delivery order.
 * @param newDriverId - The target driver UID.
 */
export async function reassignDelivery(orderId: string, newDriverId: string): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    driverId: newDriverId,
    driverLocation: null, // Reset live marker tracking
  });
}

/**
 * Flags a delivery order as failed and registers a resolution explanation log.
 * 
 * @param orderId - The unique identifier of the target delivery order.
 * @param reason - Detailed cancellation/failure reason explanation text.
 */
export async function markDeliveryFailed(orderId: string, reason: string): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    status: 'failed',
    failureReason: reason,
    'timestamps.failedAt': Timestamp.now(),
  });
}

/**
 * Cancels a missed order and reschedules an identical shipment for tomorrow's dispatch session.
 * 
 * @param orderId - The unique identifier of the target delivery order.
 */
export async function rescheduleDelivery(orderId: string): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('Delivery order does not exist in collection.');
  }

  const data = orderSnap.data() as DeliveryOrder;

  // Calculate tomorrow's exact date bounds
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Generate a clean transaction record in the delivery orders stream
  const newOrderRef = doc(collection(db, 'orders'));
  await setDoc(newOrderRef, {
    ...data,
    id: newOrderRef.id,
    driverId: null, // Reset driver allocation
    driverLocation: null,
    status: 'preparing',
    otpVerified: false,
    timestamps: {
      preparedAt: null,
      pickedAt: null,
      outAt: null,
      deliveredAt: null,
    },
    createdAt: Timestamp.fromDate(tomorrow),
  });
}

// ==========================================
// ADMIN: GENERATE TODAY'S DELIVERY BATCH
// ==========================================

export interface GenerateResult {
  created: number;
  skipped: number;
  errors: number;
  details: { subId: string; userName: string; status: 'created' | 'skipped' | 'error'; reason?: string }[];
}

/**
 * Reads all active subscriptions and creates a delivery_order for each one today
 * if one doesn't already exist.
 *
 * @param force - When true, bypasses the duplicate-order guard and creates fresh orders
 *                even if orders already exist for today. Useful for testing / re-generation.
 * @returns Summary object showing how many orders were created, skipped (already exist), or errored.
 */
export async function generateTodayDeliveries(force = false): Promise<GenerateResult> {
  try {
    const generateFn = httpsCallable<{ force: boolean }, GenerateResult>(functions, 'generateTodayDeliveries');
    const result = await generateFn({ force });
    return result.data;
  } catch (err: any) {
    console.error('generateTodayDeliveries Error:', err);
    throw err;
  }
}


// ==========================================
// USER: CANCEL SCHEDULED TIFFIN (SKIP DAY)
// ==========================================
export async function cancelScheduledTiffin(delivery: any, userId: string): Promise<{ success: boolean; creditsEarned: number }> {
  const deliveryRef = doc(db, 'orders', delivery.id);
  
  const snap = await getDoc(deliveryRef);
  if (!snap.exists()) throw new Error('Order not found.');
  const data = snap.data() as any;
  if (data.user_id && data.user_id !== userId) throw new Error('Unauthorized.');
  
  const currentStatus = data.status;
  const batchId = data.batch_id;
  const scheduledSlot = data.delivery_slot;

  if (['swapped_out', 'swapped_in', 'skipped', 'picked_up', 'out_for_delivery', 'delivered', 'completed', 'failed'].includes(currentStatus)) {
    throw new Error(`Cannot skip delivery in status: ${currentStatus}`);
  }

  const now = new Date();
  let deliveryDate = new Date();
  if (data.date) {
    deliveryDate = new Date(data.date);
  }
  
  if (scheduledSlot === '8am') {
    deliveryDate.setHours(8, 0, 0, 0);
  } else if (scheduledSlot === '11am') {
    deliveryDate.setHours(11, 0, 0, 0);
  } else if (scheduledSlot === '8pm') {
    deliveryDate.setHours(20, 0, 0, 0);
  } else {
    deliveryDate.setHours(13, 0, 0, 0);
  }

  const hoursRemaining = (deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursRemaining < 4 && !batchId) {
    if (hoursRemaining < 0) {
      throw new Error('Delivery time has already passed.');
    }
  }

  // Tiered credit logic: 0.5 before 12hrs, 0.2 after, no hard cutoff (if batched, allowed up to delivery)
  let creditsEarned = hoursRemaining >= 12 ? 0.5 : 0.2;

  await awardUserCredit({
    user_id: userId,
    credit_amount: creditsEarned,
    source: 'cancellation',
    source_reference_id: deliveryRef.id,
  });

  // Handle Batch logic if order was locked
  if (batchId) {
    // 1. Decrement batch count
    const batchRef = doc(db, 'batches', batchId);
    try {
       const batchSnap = await getDoc(batchRef);
       if (batchSnap.exists()) {
         const currentCount = batchSnap.data().total_count || 0;
         await updateDoc(batchRef, {
           total_count: Math.max(0, currentCount - 1),
           updated_at: serverTimestamp()
         });
       }
    } catch (err) {
       console.error("Failed to decrement batch:", err);
    }
  }

  await updateDoc(deliveryRef, {
    status: 'skipped',
    updated_at: serverTimestamp()
  });
  
  // Create OrderStatusLog
  const logRef = doc(collection(db, 'order_status_logs'));
  await setDoc(logRef, {
    id: logRef.id,
    order_id: deliveryRef.id,
    from_status: currentStatus,
    to_status: 'skipped',
    actor: userId,
    timestamp: serverTimestamp()
  });

  await createAuditLog('delivery_cancelled', userId, undefined, creditsEarned, { orderId: deliveryRef.id });

  return { success: true, creditsEarned };
}

export async function undoSkipScheduledTiffin(delivery: any, userId: string): Promise<{ success: boolean; mode: 'credit' | 'day' }> {
  const deliveryRef = doc(db, 'orders', delivery.id);
  const snap = await getDoc(deliveryRef);
  if (!snap.exists()) throw new Error('Order not found.');
  const data = snap.data() as any;
  if (data.user_id && data.user_id !== userId) throw new Error('Unauthorized.');

  if (data.status !== 'skipped') {
    throw new Error(`Order is not skipped. Current status: ${data.status}`);
  }

  // ── Time constraint: only block if delivery time has already passed ────────
  const now = new Date();
  let baseDate = data.date ? new Date(data.date) : now;
  
  const deliveryMoment = new Date(baseDate);
  if (data.delivery_slot === '8am') deliveryMoment.setHours(8, 0, 0, 0);
  else if (data.delivery_slot === '11am') deliveryMoment.setHours(11, 0, 0, 0);
  else if (data.delivery_slot === '8pm') deliveryMoment.setHours(20, 0, 0, 0);
  else deliveryMoment.setHours(13, 0, 0, 0);

  if (deliveryMoment.getTime() < now.getTime()) {
    throw new Error('Cannot undo a skip — the delivery time has already passed.');
  }

  // ── Fetch ALL user credit docs ─────────────────────────────────────────────
  const allCreditsSnap = await getDocs(
    query(collection(db, 'user_credits'), where('user_id', '==', userId))
  );

  let skipCreditDoc = allCreditsSnap.docs.find(d => d.data().source_reference_id === delivery.id) ?? null;
  if (!skipCreditDoc) {
    const deliveryDateStr = baseDate.toLocaleDateString('en-CA');
    skipCreditDoc = allCreditsSnap.docs.find(d => {
      const cData = d.data();
      if (cData.source !== 'cancellation') return false;
      const ca = cData.created_at?.toDate?.() ?? cData.createdAt?.toDate?.();
      if (!ca) return false;
      return ca.toLocaleDateString('en-CA') === deliveryDateStr;
    }) ?? null;
  }

  const totalAvailableCredits = allCreditsSnap.docs.reduce((sum, d) => {
    const cData = d.data();
    if (cData.redeemed === true) return sum;
    return sum + (cData.credit_amount ?? 0);
  }, 0);

  const useCredit = totalAvailableCredits >= 0.5;
  let creditDocToDelete = skipCreditDoc && skipCreditDoc.data().redeemed !== true
    ? skipCreditDoc
    : allCreditsSnap.docs.find(d => d.data().redeemed !== true && d.data().credit_amount === 0.5) ?? null;

  const subId = data.subscription_id ?? null;
  let subRef: ReturnType<typeof doc> | null = null;

  if (!useCredit) {
    if (subId) {
      const directSnap = await getDocs(
        query(collection(db, 'subscriptions'),
          where('user_id', '==', userId),
          where('status', '==', 'active'))
      );
      const matchedDoc = directSnap.docs.find(d => d.id === subId) ?? directSnap.docs[0] ?? null;
      if (matchedDoc) subRef = matchedDoc.ref;
    }
    if (!subRef) {
      const subSnap = await getDocs(
        query(collection(db, 'subscriptions'),
          where('user_id', '==', userId),
          where('status', '==', 'active'))
      );
      if (!subSnap.empty) subRef = subSnap.docs[0].ref;
    }
  }

  await runTransaction(db, async (transaction) => {
    let subData: Record<string, any> | null = null;
    if (subRef) {
      const subSnap = await transaction.get(subRef);
      if (subSnap.exists()) subData = subSnap.data();
    }

    const newStatus = data.batch_id ? 'vendor_ready' : 'created';
    transaction.update(deliveryRef, {
      status: newStatus,
      updated_at: serverTimestamp(),
    });
    
    const logRef = doc(collection(db, 'order_status_logs'));
    transaction.set(logRef, {
      id: logRef.id,
      order_id: delivery.id,
      from_status: 'skipped',
      to_status: newStatus,
      actor: userId,
      timestamp: serverTimestamp()
    });

    if (useCredit) {
      if (creditDocToDelete) transaction.delete(creditDocToDelete.ref);
    } else {
      if (skipCreditDoc) transaction.delete(skipCreditDoc.ref);

      if (subRef && subData) {
        let nextBilling: Date = subData.next_billing_date?.toDate?.() ?? null;
        if (!nextBilling) {
          const created = subData.created_at?.toDate?.() ?? new Date();
          nextBilling = new Date(created);
          nextBilling.setDate(nextBilling.getDate() + (subData.frequency === 'monthly' ? 30 : 7));
        }

        const adjusted = new Date(nextBilling);
        adjusted.setDate(adjusted.getDate() - 1);
        transaction.update(subRef, {
          next_billing_date: Timestamp.fromDate(adjusted),
          updated_at: serverTimestamp(),
        });

        const refundRef = doc(collection(db, 'user_credits'));
        transaction.set(refundRef, {
          user_id: userId,
          source: 'cancel_skip_refund',
          credit_amount: 0.5,
          redeemed: false,
          created_at: serverTimestamp(),
          source_reference_id: delivery.id,
        });
      }
    }
  });

  await createAuditLog('undo_skip', userId, undefined, useCredit ? -0.5 : 0.5, { orderId: delivery.id });
  return { success: true, mode: useCredit ? 'credit' : 'day' };
}

/**
 * Subscribes to the active RiderTrip for a specific driver.
 */
export function subscribeToActiveRiderTrip(
  driverId: string,
  callback: (trip: RiderTrip | null) => void
): () => void {
  const q = query(
    collection(db, 'rider_trips'),
    where('riderId', '==', driverId),
    where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping'])
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() } as RiderTrip);
    }
  });
}

/**
 * Updates a RiderTrip document.
 */
export async function updateRiderTrip(
  tripId: string,
  updateData: Partial<RiderTrip>
): Promise<void> {
  const tripRef = doc(db, 'rider_trips', tripId);
  await updateDoc(tripRef, { ...updateData, updatedAt: serverTimestamp() });
}
