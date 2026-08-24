import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserCredit, FreeMealVoucher } from '@/types';
import { getUserSubscriptions } from './subscriptions';
import { createAuditLog } from './audit';

export interface RewardsData {
  totalCredits: number;
  availableVouchers: FreeMealVoucher[];
  hasActiveSubscription: boolean;
}

export async function getRewardsData(userId: string): Promise<RewardsData> {
  const creditsQ = query(
    collection(db, 'user_credits'),
    where('user_id', '==', userId),
    where('redeemed', '==', false)
  );

  const vouchersQ = query(
    collection(db, 'free_meal_vouchers'),
    where('user_id', '==', userId),
    where('status', '==', 'available')
  );

  const [creditsSnap, vouchersSnap, subscriptions] = await Promise.all([
    getDocs(creditsQ),
    getDocs(vouchersQ),
    getUserSubscriptions(userId)
  ]);

  let totalCredits = 0;
  creditsSnap.docs.forEach(doc => {
    totalCredits += (doc.data() as UserCredit).credit_amount;
  });

  const availableVouchers = vouchersSnap.docs.map(doc => {
    return { id: doc.id, ...doc.data() } as FreeMealVoucher;
  });

  const hasActiveSubscription = subscriptions.length > 0;

  return {
    totalCredits: parseFloat(totalCredits.toFixed(1)),
    availableVouchers,
    hasActiveSubscription
  };
}

export async function redeemVoucher(userId: string, voucherId: string, subscriptionId: string): Promise<void> {
  const voucherRef = doc(db, 'free_meal_vouchers', voucherId);
  const subRef = doc(db, 'subscriptions', subscriptionId);

  await runTransaction(db, async (transaction) => {
    const voucherSnap = await transaction.get(voucherRef);
    if (!voucherSnap.exists()) {
      throw new Error("Voucher not found.");
    }
    const voucherData = voucherSnap.data() as FreeMealVoucher;
    if (voucherData.status !== 'available') {
      throw new Error("Voucher is already used.");
    }
    if (voucherData.user_id !== userId) {
      throw new Error("Voucher does not belong to this user.");
    }

    const subSnap = await transaction.get(subRef);
    if (!subSnap.exists()) {
      throw new Error("Subscription not found.");
    }
    const subData = subSnap.data();
    if (subData.status !== 'active') {
      throw new Error("Subscription is not active.");
    }

    // 1. Mark voucher as used
    transaction.update(voucherRef, {
      status: 'used',
      used_at: serverTimestamp()
    });

    // 2. Add 1 day to subscription
    let currentNextBilling = subData.next_billing_date?.toDate?.();
    if (!currentNextBilling) {
      const createdDate = subData.created_at?.toDate?.() || new Date();
      currentNextBilling = new Date(createdDate.getTime());
      const frequency = subData.frequency || 'weekly';
      currentNextBilling.setDate(currentNextBilling.getDate() + (frequency === 'monthly' ? 30 : 7));
    }
    
    const newDate = new Date(currentNextBilling.getTime());
    newDate.setDate(newDate.getDate() + 1); // 1 day added per voucher
    
    transaction.update(subRef, {
      next_billing_date: Timestamp.fromDate(newDate),
      updated_at: serverTimestamp()
    });
  });

  // 3. Create Audit Log
  await createAuditLog('credit_redeemed', userId, undefined, 1, { result: 'voucher_redeemed_for_1_day' });
}
