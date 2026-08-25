import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';

/**
 * Migration Script: Migrate from delivery_orders to orders collection.
 * 
 * Instructions: 
 * Run this one-time script to convert old 'delivery_orders' to canonical 'orders'.
 */
export async function migrateDeliveryOrdersToCanonicalOrders() {
  console.log('Starting migration of delivery_orders to canonical orders...');
  
  const oldOrdersSnap = await getDocs(collection(db, 'delivery_orders'));
  console.log(`Found ${oldOrdersSnap.size} legacy delivery_orders to migrate.`);

  let migratedCount = 0;

  for (const oldDoc of oldOrdersSnap.docs) {
    const data = oldDoc.data();
    
    // Construct new order schema
    const legacyId = oldDoc.id;
    
    // Extract date from createdAt
    let dateStr = '';
    if (data.createdAt?.toDate) {
      dateStr = data.createdAt.toDate().toISOString().split('T')[0];
    } else if (data.created_at?.toDate) {
      dateStr = data.created_at.toDate().toISOString().split('T')[0];
    } else {
      dateStr = new Date().toISOString().split('T')[0];
    }
    
    // Determine meal type (lunch or dinner)
    let mealType = 'lunch';
    if (data.meal?.type) mealType = data.meal.type;
    else if (data.meal_type) mealType = data.meal_type;
    
    // Determine delivery slot
    let deliverySlot = data.scheduledSlot || data.delivery_slot;
    if (!deliverySlot) {
      deliverySlot = mealType === 'dinner' ? '8pm' : '11am';
    }
    
    // Generate new order_id format (ORD-YYYY-MM-DD-SEQ)
    // Here we'll just use the old ID to prevent collision, but structure it.
    // If you want strict ORD- date format, we can do ORD-{date}-{legacyId}
    const newOrderId = `ORD-${dateStr}-${legacyId}`;
    
    // Address extraction (snapshotting from data if exists)
    let deliveryAddress = data.delivery_address || data.address || {
      street: 'Legacy Address',
      city: 'Unknown'
    };

    const canonicalOrder = {
      order_id: newOrderId,
      legacy_order_id: legacyId, // Crucial for traceability
      user_id: data.customerId || data.user_id || 'unknown',
      subscription_id: data.subscriptionId || data.subscription_id || null,
      date: dateStr,
      meal_type: mealType,
      delivery_slot: deliverySlot,
      vendor_id: data.vendorId || data.vendor_id || null,
      batch_id: data.batch_id || null,
      delivery_address: deliveryAddress,
      status: mapLegacyStatusToCanonical(data.status),
      swap_ref: data.swap_ref || null,
      skip_ref: data.skip_ref || null,
      rider_trip_id: data.riderTripId || data.rider_trip_id || null,
      created_at: data.createdAt || data.created_at || serverTimestamp(),
      updated_at: serverTimestamp()
    };

    try {
      const newOrderRef = doc(db, 'orders', newOrderId);
      await setDoc(newOrderRef, canonicalOrder);
      migratedCount++;
    } catch (e) {
      console.error(`Failed to migrate order ${legacyId}:`, e);
    }
  }

  console.log(`Migration complete! Successfully migrated ${migratedCount}/${oldOrdersSnap.size} orders.`);
}

function mapLegacyStatusToCanonical(oldStatus: string): string {
  // Canonical statuses: created, vendor_notified, vendor_preparing, vendor_ready, rider_assigned, 
  // rider_en_route_pickup, picked_up, out_for_delivery, delivered, skipped, swapped_out, swapped_in, failed, completed
  
  if (!oldStatus) return 'created';
  
  switch(oldStatus.toLowerCase()) {
    case 'pending':
    case 'created':
      return 'created';
    case 'vendor_notified':
      return 'vendor_notified';
    case 'preparing':
    case 'vendor_preparing':
      return 'vendor_preparing';
    case 'ready':
    case 'vendor_ready':
      return 'vendor_ready';
    case 'rider_assigned':
      return 'rider_assigned';
    case 'pickup_in_progress':
    case 'rider_en_route_pickup':
      return 'rider_en_route_pickup';
    case 'picked_up':
      return 'picked_up';
    case 'out_for_delivery':
    case 'dropping':
      return 'out_for_delivery';
    case 'delivered':
    case 'completed':
      return 'delivered'; // Use delivered as the active end state before completed
    case 'skipped':
    case 'cancelled':
      return 'skipped';
    case 'swapped':
    case 'swapped_out':
      return 'swapped_out';
    case 'swapped_in':
      return 'swapped_in';
    case 'failed':
      return 'failed';
    default:
      return 'created';
  }
}
