import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  runTransaction,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { 
  SwapRequest, 
  SwapBroadcastRecipient, 
  UserCredit, 
  SubscriptionSwapAllowance,
  Delivery,
  AppUser
} from '@/types';
import { createAuditLog } from './audit';

// Haversine distance formula (returns km)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

// ─── Swap Requests ──────────────────────────────────────────────────────────

export async function requestSwap(
  userId: string,
  subscriptionId: string,
  mealId: string,
  deliveryId: string, // the delivery A wants to swap
  myMealType: 'lunch' | 'dinner',
  myLat: number,
  myLng: number,
  myMealSnapshot: any, // What A is eating today
  deliveryObj?: any // The full delivery object if projected
): Promise<string> {
  // 0a. Check active swap rate limit (max 1 open broadcasted swap at a time)
  const activeSwapQ = query(
    collection(db, 'swap_requests'),
    where('initiator_user_id', '==', userId),
    where('status', '==', 'broadcasted')
  );
  const activeSwapSnap = await getDocs(activeSwapQ);
  if (!activeSwapSnap.empty) {
    throw new Error('You already have an active swap request.');
  }

  // 0b. Check 4-hour constraint
  const requestDelRef = doc(db, 'orders', deliveryId);
  const requestDelSnap = await getDoc(requestDelRef);
  if (!requestDelSnap.exists()) {
    throw new Error('Order not found.');
  }
  const requestDelData = requestDelSnap.data();
  const realDeliveryId = deliveryId;
  
  const now = new Date();
  let requestDelDate = new Date();
  if (requestDelData.date) {
    requestDelDate = new Date(requestDelData.date); // canonical order uses YYYY-MM-DD
  } else if (requestDelData.createdAt?.toDate) {
    requestDelDate = requestDelData.createdAt.toDate();
  }
  
  if (requestDelData.delivery_slot === '8am') requestDelDate.setHours(8, 0, 0, 0);
  else if (requestDelData.delivery_slot === '11am') requestDelDate.setHours(11, 0, 0, 0);
  else if (requestDelData.delivery_slot === '8pm') requestDelDate.setHours(20, 0, 0, 0);
  else requestDelDate.setHours(20, 0, 0, 0);

  const hoursRemaining = (requestDelDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursRemaining < 4) {
    throw new Error('Swap is not available less than 4 hours before delivery time.');
  }

  // 0b. Check Collusion (Prevent > 3 matches in 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const matchesQ = query(
    collection(db, 'swap_requests'),
    where('initiator_user_id', '==', userId),
    where('status', '==', 'matched')
  );
  const matchesSnap = await getDocs(matchesQ);
  
  const matchCounts: Record<string, number> = {};
  matchesSnap.docs.forEach(doc => {
    const data = doc.data() as SwapRequest;
    if (data.matched_at && data.matched_with_user_id) {
      const date = data.matched_at.toDate ? data.matched_at.toDate() : new Date(data.matched_at.seconds * 1000);
      if (date >= thirtyDaysAgo) {
        matchCounts[data.matched_with_user_id] = (matchCounts[data.matched_with_user_id] || 0) + 1;
      }
    }
  });
  
  const excludedUsers = new Set<string>();
  Object.entries(matchCounts).forEach(([uId, count]) => {
    if (count >= 3) excludedUsers.add(uId);
  });

  let is_paid = true;
  
  // 1. Check Swap Allowance
  const allowanceRef = doc(db, 'subscription_swap_allowances', subscriptionId);
  const allowanceSnap = await getDoc(allowanceRef);
  
  if (allowanceSnap.exists()) {
    const allowance = allowanceSnap.data() as SubscriptionSwapAllowance;
    if (allowance.free_swaps_used < allowance.free_swaps_total) {
      is_paid = false;
      await updateDoc(allowanceRef, {
        free_swaps_used: allowance.free_swaps_used + 1
      });
    }
  }

  // 2. Create SwapRequest
  const reqRef = doc(collection(db, 'swap_requests'));
  await setDoc(reqRef, {
    id: reqRef.id,
    initiator_user_id: userId,
    initiator_subscription_id: subscriptionId,
    meal_id: mealId,
    order_id: realDeliveryId, // Keep track of the actual order being swapped
    status: 'broadcasted',
    is_paid,
    payment_amount: 50,
    created_at: serverTimestamp(),
  });

  // 3. Broadcast to nearby users with a DIFFERENT meal type today
  const delQ = query(
    collection(db, 'orders'),
    where('status', 'in', ['created', 'vendor_ready', 'vendor_notified'])
  );
  const deliverySnap = await getDocs(delQ);
  
  // Find candidates
  for (const d of deliverySnap.docs) {
    const delivery = d.data() as any; // canonical Order schema
    
    // Ignore self, ignore same meal types, ignore colluders
    if (delivery.user_id === userId) continue;
    if (delivery.meal_type === myMealType) continue; // They must have the opposite meal
    if (excludedUsers.has(delivery.user_id)) continue;
    
    // Use delivery_address snapshot
    if (!delivery.delivery_address?.lat || !delivery.delivery_address?.lng) continue;

    // Check distance
    const dist = getDistance(myLat, myLng, delivery.delivery_address.lat, delivery.delivery_address.lng);
    if (dist <= 2.0) { // 2km radius
      // Create broadcast entry
      const bRef = doc(collection(db, 'swap_broadcasts'));
      await setDoc(bRef, {
        id: bRef.id,
        swap_request_id: reqRef.id,
        recipient_user_id: delivery.user_id,
        recipient_order_id: delivery.order_id || d.id, // the order B has
        distance_km: parseFloat(dist.toFixed(2)),
        meal_snapshot: myMealSnapshot,
        response: 'pending',
        created_at: serverTimestamp()
      });
    }
  }

  await createAuditLog('swap_initiated', userId, undefined, is_paid ? 50 : 0, { mealId, orderId: realDeliveryId, reqId: reqRef.id });

  return reqRef.id;
}

export async function requestVendorSwap(
  userId: string,
  subscriptionId: string,
  deliveryObj: any, // The current canonical order to swap
  targetVendorId: string,
  targetVendorName: string
): Promise<string> {
  // 1. Instant update of initiator's delivery to the new vendor
  const realDeliveryId = deliveryObj.id;
  const originalVendorId = deliveryObj.vendor_id;

  const requestDelRef = doc(db, 'orders', deliveryObj.id);
  await updateDoc(requestDelRef, {
    vendor_id: targetVendorId,
    meal_type: deliveryObj.meal_type,
    updated_at: serverTimestamp()
  });

  // 2. Create SwapRequest
  const reqRef = doc(collection(db, 'swap_requests'));
  await setDoc(reqRef, {
    id: reqRef.id,
    initiator_user_id: userId,
    initiator_subscription_id: subscriptionId,
    meal_id: realDeliveryId,
    order_id: realDeliveryId,
    target_vendor_id: targetVendorId,
    status: 'broadcasted',
    is_paid: true,
    payment_amount: 50,
    created_at: serverTimestamp(),
  });

  // 3. Find active subscribers of the TARGET vendor for today/tomorrow
  const targetSubQ = query(
    collection(db, 'subscriptions'),
    where('vendor_id', '==', targetVendorId),
    where('status', '==', 'active')
  );
  const targetSubSnap = await getDocs(targetSubQ);

  const now = new Date();
  
  // Create broadcasts for target vendor subscribers
  for (const sub of targetSubSnap.docs) {
    const subData = sub.data();
    if (subData.user_id === userId) continue; // Don't broadcast to self
    
    // Check if subscriber actually has an order for this slot
    const targetDateStr = deliveryObj.date || now.toISOString().split('T')[0];
    
    const delQ = query(
      collection(db, 'orders'),
      where('user_id', '==', subData.user_id),
      where('vendor_id', '==', targetVendorId),
      where('date', '==', targetDateStr)
    );
    const delSnap = await getDocs(delQ);
    
    if (delSnap.empty) continue; // Skip if they don't have an order
    const recipientDeliveryId = delSnap.docs[0].id;

    const bRef = doc(collection(db, 'swap_broadcasts'));
    await setDoc(bRef, {
      id: bRef.id,
      swap_request_id: reqRef.id,
      recipient_user_id: subData.user_id,
      recipient_order_id: recipientDeliveryId, // What the recipient is offering up
      distance_km: 0,
      meal_snapshot: { type: deliveryObj.meal_type, original_vendor_id: originalVendorId },
      response: 'pending',
      created_at: serverTimestamp()
    });
  }

  await createAuditLog('swap_initiated', userId, undefined, 50, { reqId: reqRef.id, orderId: realDeliveryId });
  return reqRef.id;
}

export async function cancelSwapRequest(deliveryId: string, userId: string): Promise<{ success: boolean }> {
  // Find the swap request
  const q = query(
    collection(db, 'swap_requests'),
    where('initiator_user_id', '==', userId),
    where('order_id', '==', deliveryId),
    where('status', '==', 'broadcasted')
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('No active swap request found for this order.');
  
  const batch = db;
  // We don't use batch here easily because we need to query broadcasts too
  for (const requestDoc of snap.docs) {
    // Delete the request
    await updateDoc(requestDoc.ref, { status: 'cancelled' });
    
    // Cancel broadcasts
    const bQ = query(
      collection(db, 'swap_broadcasts'),
      where('swap_request_id', '==', requestDoc.id)
    );
    const bSnap = await getDocs(bQ);
    bSnap.docs.forEach(async (bDoc) => {
      await updateDoc(bDoc.ref, { response: 'cancelled' });
    });
  }

  // Restore the delivery status just in case (though it might still just be pending/preparing)
  // Actually, swapping doesn't change the delivery status to 'swapped' until it's matched!
  // So there's nothing to revert on the delivery doc, other than we just let the UI know it's no longer requested.

  return { success: true };
}

export async function acceptSwap(broadcastId: string, recipientUserId: string): Promise<boolean> {
  let success = false;
  let broadcastData: any = null;
  let reqData: any = null;

  await runTransaction(db, async (transaction) => {
    const broadcastRef = doc(db, 'swap_broadcasts', broadcastId);
    const broadcastSnap = await transaction.get(broadcastRef);
    if (!broadcastSnap.exists()) return;

    broadcastData = broadcastSnap.data();
    if (broadcastData.response !== 'pending') return; // already acted upon

    const reqRef = doc(db, 'swap_requests', broadcastData.swap_request_id);
    const reqSnap = await transaction.get(reqRef);
    if (!reqSnap.exists()) return;

    reqData = reqSnap.data() as SwapRequest & { delivery_id: string };
    if (reqData.status !== 'broadcasted') return; // Someone else got it or it expired

    // We are the first! Claim it.
    transaction.update(reqRef, {
      status: 'matched',
      matched_with_user_id: recipientUserId,
      matched_at: serverTimestamp()
    });

    transaction.update(broadcastRef, {
      response: 'accepted',
      responded_at: serverTimestamp()
    });

    // Award credit to recipient (0.3)
    const creditRef = doc(collection(db, 'user_credits'));
    transaction.set(creditRef, {
      id: creditRef.id,
      user_id: recipientUserId,
      credit_amount: 0.3,
      source: 'swap_accept',
      source_reference_id: reqRef.id,
      redeemed: false,
      created_at: serverTimestamp()
    });

    // Swap deliveries: The recipient gives up their current meal and gets the initiator's meal.
    const originalVendorId = broadcastData.meal_snapshot?.original_vendor_id;
    const recipientOrderRef = doc(db, 'orders', broadcastData.recipient_order_id);
    
    // We update the recipient's order to reflect the new vendor.
    // In a fully robust system we might mark the old one 'swapped_out' and create a new one 'swapped_in'.
    // For now, we update the existing one and mark its status as 'swapped_in' to match the authoritative lifecycle.
    transaction.update(recipientOrderRef, {
      vendor_id: originalVendorId || 'unknown_vendor',
      status: 'swapped_in',
      updated_at: serverTimestamp()
    });

    // Create an order status log for the recipient
    const logRef = doc(collection(db, 'order_status_logs'));
    transaction.set(logRef, {
      id: logRef.id,
      order_id: broadcastData.recipient_order_id,
      from_status: 'created', // Assumed from_status
      to_status: 'swapped_in',
      actor: recipientUserId,
      timestamp: serverTimestamp()
    });

    // If this was a C2C swap (where initiator didn't get an instant swap via vendor swap), 
    // we would also update the initiator's order to 'swapped_out'. 
    // The previous logic relied on the initiator's order already being updated in requestVendorSwap.
    // For requestSwap (C2C), we must update the initiator's order as well!
    const initiatorOrderRef = doc(db, 'orders', reqData.order_id);
    transaction.update(initiatorOrderRef, {
      status: 'swapped_out',
      updated_at: serverTimestamp()
    });
    
    const initLogRef = doc(collection(db, 'order_status_logs'));
    transaction.set(initLogRef, {
      id: initLogRef.id,
      order_id: reqData.order_id,
      from_status: 'created', 
      to_status: 'swapped_out',
      actor: recipientUserId,
      timestamp: serverTimestamp()
    });

    success = true;
  });

  if (success && broadcastData && reqData) {
    await createAuditLog('swap_matched', reqData.initiator_user_id, recipientUserId, reqData.payment_amount, { reqId: reqData.id });
    await createAuditLog('credit_earned', recipientUserId, reqData.initiator_user_id, 0.3, { source: 'swap_accept', reqId: reqData.id });

    const q = query(
      collection(db, 'swap_broadcasts'),
      where('swap_request_id', '==', broadcastData.swap_request_id),
      where('response', '==', 'pending')
    );
    const others = await getDocs(q);
    others.forEach((o) => {
      if (o.id !== broadcastId) {
        updateDoc(o.ref, { response: 'expired' });
      }
    });
  }

  return success;
}

export async function declineSwap(broadcastId: string): Promise<void> {
  const ref = doc(db, 'swap_broadcasts', broadcastId);
  await updateDoc(ref, {
    response: 'declined',
    responded_at: serverTimestamp()
  });
}

// ─── User Credits ───────────────────────────────────────────────────────────

export async function awardUserCredit(
  payload: Omit<UserCredit, 'id' | 'created_at' | 'redeemed' | 'redeemed_at'>
): Promise<string> {
  const ref = doc(collection(db, 'user_credits'));
  await setDoc(ref, {
    ...payload,
    id: ref.id,
    redeemed: false,
    created_at: serverTimestamp(),
  });
  
  await createAuditLog('credit_earned', payload.user_id, undefined, payload.credit_amount, { source: payload.source, refId: payload.source_reference_id });
  
  return ref.id;
}

export async function redeemCreditsForDays(userId: string, subscriptionId: string): Promise<number> {
  // 1. Fetch unredeemed credits OUTSIDE transaction
  const q = query(
    collection(db, 'user_credits'),
    where('user_id', '==', userId)
  );
  const snap = await getDocs(q);
  
  let totalUnredeemed = 0;
  const creditDocs = snap.docs
    .map(d => ({ ref: d.ref, data: d.data() as UserCredit }))
    .filter(c => c.data.redeemed === false);
  
  for (const creditDoc of creditDocs) {
    totalUnredeemed += creditDoc.data.credit_amount;
  }
  
  let daysAdded = Math.floor(totalUnredeemed);
  if (daysAdded < 1) {
    throw new Error("Not enough credits to redeem. Minimum 1 credit required.");
  }

  creditDocs.sort((a, b) => (a.data.created_at?.seconds || 0) - (b.data.created_at?.seconds || 0));

  await runTransaction(db, async (transaction) => {
    const subRef = doc(db, 'subscriptions', subscriptionId);
    const subSnap = await transaction.get(subRef);
    if (!subSnap.exists()) {
      throw new Error("Subscription not found.");
    }
    const subData = subSnap.data();

    let amountToRedeem = daysAdded; // 1 credit = 1 day
    
    // 2. Consume credits
    for (const creditDoc of creditDocs) {
      if (amountToRedeem <= 0) break;
      
      const amountInDoc = creditDoc.data.credit_amount;
      if (amountInDoc <= amountToRedeem) {
        transaction.update(creditDoc.ref, { 
          redeemed: true, 
          redeemed_at: serverTimestamp() 
        });
        amountToRedeem -= amountInDoc;
      } else {
        const remainder = amountInDoc - amountToRedeem;
        transaction.update(creditDoc.ref, { 
          redeemed: true, 
          redeemed_at: serverTimestamp() 
        });
        const newCreditRef = doc(collection(db, 'user_credits'));
        transaction.set(newCreditRef, {
          user_id: creditDoc.data.user_id,
          source: creditDoc.data.source,
          credit_amount: remainder,
          redeemed: false,
          created_at: serverTimestamp(),
          ...(creditDoc.data.source_reference_id && { source_reference_id: creditDoc.data.source_reference_id })
        });
        amountToRedeem = 0;
      }
    }
    
    // 3. Add days to subscription
    
    let currentNextBilling = subData.next_billing_date?.toDate?.();
    if (!currentNextBilling) {
      const createdDate = subData.created_at?.toDate?.() || new Date();
      currentNextBilling = new Date(createdDate.getTime());
      const frequency = subData.frequency || 'weekly';
      currentNextBilling.setDate(currentNextBilling.getDate() + (frequency === 'monthly' ? 30 : 7));
    }
    
    const newDate = new Date(currentNextBilling.getTime());
    newDate.setDate(newDate.getDate() + daysAdded);
    
    transaction.update(subRef, {
      next_billing_date: Timestamp.fromDate(newDate),
      updated_at: serverTimestamp()
    });
  });

  if (daysAdded > 0) {
    await createAuditLog('credit_redeemed', userId, undefined, daysAdded, { result: 'days_added_to_sub' });
  }

  return daysAdded;
}

// ─── Swap Allowances ────────────────────────────────────────────────────────

export async function getSubscriptionSwapAllowance(subscriptionId: string): Promise<SubscriptionSwapAllowance | null> {
  const q = query(
    collection(db, 'subscription_swap_allowances'),
    where('subscription_id', '==', subscriptionId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as SubscriptionSwapAllowance;
}

export async function processExpiredSwaps(): Promise<void> {
  const q = query(
    collection(db, 'swap_requests'),
    where('status', '==', 'broadcasted')
  );
  
  const snap = await getDocs(q);
  const batchUpdates = [];
  const now = new Date();
  
  for (const d of snap.docs) {
    const data = d.data() as SwapRequest & { delivery_id: string };
    let shouldExpire = false;

    // 1. Check if it's been more than 2 hours since creation as a baseline
    if (data.created_at) {
      const createdDate = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at.seconds * 1000);
      if ((now.getTime() - createdDate.getTime()) > 2 * 60 * 60 * 1000) {
        shouldExpire = true;
      }
    }
    
    if (!shouldExpire) {
      // 2. Fetch associated delivery to see if it's past delivery time or already completed/cancelled
      const delSnap = await getDoc(doc(db, 'deliveries', data.delivery_id));
      if (!delSnap.exists()) {
        shouldExpire = true; // Orphaned
      } else {
        const delivery = delSnap.data() as Delivery;
        if (delivery.status !== 'pending') {
          shouldExpire = true;
        } else {
          // Check if it's past the delivery window (1:00 PM for lunch, 8:00 PM for dinner)
          const deliveryDate = new Date();
          if (delivery.meal_type === 'lunch') deliveryDate.setHours(13, 0, 0, 0);
          else deliveryDate.setHours(20, 0, 0, 0);
          
          if (now.getTime() > deliveryDate.getTime()) {
            shouldExpire = true;
          }
        }
      }
    }

    if (shouldExpire) {
      batchUpdates.push(updateDoc(d.ref, { status: 'company_fulfilled' }));
      // Also expire pending broadcasts for this request
      const bQ = query(
        collection(db, 'swap_broadcasts'),
        where('swap_request_id', '==', d.id),
        where('response', '==', 'pending')
      );
      const bSnap = await getDocs(bQ);
      for (const b of bSnap.docs) {
        batchUpdates.push(updateDoc(b.ref, { response: 'expired' }));
      }
    }
  }
  
  await Promise.all(batchUpdates);
}
