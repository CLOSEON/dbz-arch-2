import { Timestamp } from 'firebase/firestore';

/**
 * Canonical payout status lifecycle.
 * - 'pending'    → Record created; awaiting disbursement processing.
 * - 'processing' → Payout has been picked up for disbursement.
 * - 'paid'       → Funds have been successfully transferred to the agent.
 */
export type PayoutStatus = 'pending' | 'processing' | 'paid';

/**
 * Represents a single agent payout record stored in the 'agent_payouts' collection.
 * One document is created automatically by the Cloud Function each time a delivery
 * transitions to 'delivered'. This is the canonical, server-authoritative source
 * of truth for agent earnings — never calculate earnings client-side.
 *
 * Firestore path: agent_payouts/{payoutId}
 */
export interface AgentPayout {
  /** Auto-generated Firestore document ID of the payout record */
  id: string;
  /** UID of the delivery agent who completed the delivery */
  agentId: string;
  /** The delivery order ID this payout is tied to (maps to deliveries/{deliveryId}) */
  deliveryId: string;
  /** Fixed monetary payout amount in INR (₹40 per delivery) */
  amount: number;
  /** Timestamp when the payout record was created (i.e. when the delivery completed) */
  date: Timestamp;
  /** Current disbursement state of this payout */
  status: PayoutStatus;
}

/**
 * Firestore converter helper — use this when building typed collection references
 * to ensure data returned from Firestore queries is correctly typed as AgentPayout.
 *
 * @example
 * const payoutsRef = collection(db, 'agent_payouts').withConverter(agentPayoutConverter);
 * const q = query(payoutsRef, where('agentId', '==', uid), orderBy('date', 'desc'));
 */
export const agentPayoutConverter = {
  toFirestore(payout: AgentPayout) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...data } = payout;
    return data;
  },
  fromFirestore(snapshot: { id: string; data: () => Record<string, unknown> }): AgentPayout {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      agentId: data.agentId as string,
      deliveryId: data.deliveryId as string,
      amount: data.amount as number,
      date: data.date as Timestamp,
      status: data.status as PayoutStatus,
    };
  },
};

// ─── Rider Trip Payment ───────────────────────────────────────────────────────

/**
 * Server-computed payment record created when a RiderTrip transitions to 'completed'.
 * All values are authoritative — never recalculate client-side.
 *
 * Distance used: sum of optimized route segment distances (pickup + drop stops),
 * with gpsDistanceKm stored as a fraud-detection cross-check field.
 *
 * Firestore path: rider_payments/{paymentId}
 */
export interface RiderPayment {
  /** Auto-generated Firestore document ID */
  id: string;
  /** ID of the completed RiderTrip this payment is for */
  riderTripId: string;
  /** UID of the rider who completed the trip */
  riderId: string;
  /**
   * Authoritative distance in km: sum of all pickupStop.distanceKm + dropStop.distanceKm
   * computed server-side from real vendor/customer GPS coordinates.
   */
  totalDistanceKm: number;
  /**
   * GPS-accumulated distance in km, tracked in real-time via the device's location watcher.
   * Stored for fraud-detection cross-checking against the route distance.
   */
  gpsDistanceKm: number;
  /** Base pay = totalDistanceKm × ₹10 */
  basePayment: number;
  /**
   * Per-tiffin bonus: ₹7 × max(0, deliveredCount - 14).
   * Zero if fewer than 15 tiffins were delivered.
   */
  tiffinBonus: number;
  /** Total delivered tiffin count in this trip */
  deliveredCount: number;
  /** Total payment = basePayment + tiffinBonus */
  totalPayment: number;
  /** Timestamp when this record was computed */
  calculatedAt: Timestamp;
  /** Processing state — starts 'pending' until admin disburses */
  status: PayoutStatus;
}

export const riderPaymentConverter = {
  toFirestore(p: RiderPayment) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...data } = p;
    return {
      ...data,
      paidTiffinCount: p.deliveredCount,
    };
  },
  fromFirestore(snapshot: { id: string; data: () => Record<string, unknown> }): RiderPayment {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      riderTripId: data.riderTripId as string,
      riderId: data.riderId as string,
      totalDistanceKm: data.totalDistanceKm as number,
      gpsDistanceKm: data.gpsDistanceKm as number,
      basePayment: data.basePayment as number,
      tiffinBonus: data.tiffinBonus as number,
      deliveredCount: (data.deliveredCount ?? data.paidTiffinCount ?? 0) as number,
      totalPayment: data.totalPayment as number,
      calculatedAt: data.calculatedAt as Timestamp,
      status: data.status as PayoutStatus,
    };
  },
};

