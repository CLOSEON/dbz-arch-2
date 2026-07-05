import * as admin from 'firebase-admin';

export type EventType =
  // Customer events
  | 'order_confirmed'
  | 'swap_window_closing'
  | 'skip_window_closing'
  | 'meal_prep_started'
  | 'meal_picked_up'
  | 'rider_en_route'
  | 'meal_delivered'
  | 'delivery_failed'
  // Vendor events
  | 'tiffin_count_confirmed'
  | 'vendor_rider_assigned'
  | 'vendor_pickup_confirmed'
  // Rider events
  | 'rider_new_trip'
  | 'rider_route_ready'
  | 'rider_delay_reminder';

export interface SystemEvent {
  type: EventType;
  recipientId: string; // userId, vendorId, or riderId
  recipientRole: 'customer' | 'vendor' | 'rider' | 'admin';
  deduplicationKey: string; // uniquely identifies this specific event instance
  payload: Record<string, any>;
  createdAt: admin.firestore.FieldValue;
  processed: boolean;
}

/**
 * Publishes an event to the system_events collection.
 */
export async function publishEvent(
  type: EventType,
  recipientId: string,
  recipientRole: 'customer' | 'vendor' | 'rider' | 'admin',
  deduplicationKey: string,
  payload: Record<string, any>
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('system_events').add({
    type,
    recipientId,
    recipientRole,
    deduplicationKey,
    payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    processed: false
  });
  
  console.log(`[publishEvent] Published ${type} for ${recipientRole} ${recipientId} (key: ${deduplicationKey})`);
}
