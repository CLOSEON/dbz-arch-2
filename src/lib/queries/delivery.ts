import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  writeBatch,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { Delivery, DeliveryStatus as OldDeliveryStatus } from '@/types';
import type { DeliveryOrder, DriverProfile, DeliveryStatus } from '@/types/delivery';

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
  const q = query(
    collection(db, 'delivery_orders'),
    where('driverId', '==', deliveryBoyId),
    where('status', 'not-in', ['delivered', 'failed_attempt']),
    orderBy('status', 'asc'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryOrder));
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
    collection(db, 'delivery_orders'),
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
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'delivery_orders'),
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
  const orderRef = doc(db, 'delivery_orders', orderId);
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
  const orderRef = doc(db, 'delivery_orders', orderId);
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
    const orderRef = doc(db, 'delivery_orders', orderId);
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
    collection(db, 'delivery_orders'),
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
    const notifRef = doc(collection(db, 'delivery_orders', d.id, 'notifications'));
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
    collection(db, 'delivery_orders'),
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
    collection(db, 'delivery_orders'),
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
    const notifRef = doc(collection(db, 'delivery_orders', docSnap.id, 'notifications'));
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
  const notifRef = doc(collection(db, 'delivery_orders', orderId, 'notifications'));
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
  const notifRef = doc(collection(db, 'delivery_orders', batchId, 'notifications'));
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
  const orderRef = doc(db, 'delivery_orders', orderId);
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
  const orderRef = doc(db, 'delivery_orders', orderId);
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
  const orderRef = doc(db, 'delivery_orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('Delivery order does not exist in collection.');
  }

  const data = orderSnap.data() as DeliveryOrder;

  // Calculate tomorrow's exact date bounds
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Generate a clean transaction record in the delivery orders stream
  const newOrderRef = doc(collection(db, 'delivery_orders'));
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
 * if one doesn't already exist. Safe to call multiple times (idempotent per subscription per day).
 *
 * @returns Summary object showing how many orders were created, skipped (already exist), or errored.
 */
export async function generateTodayDeliveries(): Promise<GenerateResult> {
  try {
    const generateFn = httpsCallable<void, GenerateResult>(functions, 'generateTodayDeliveries');
    const result = await generateFn();
    return result.data;
  } catch (err: any) {
    console.error('generateTodayDeliveries Error:', err);
    throw err;
  }
}
