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
