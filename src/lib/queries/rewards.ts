import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserCredit, FreeMealVoucher } from '@/types';
import { getUserSubscriptions } from './subscriptions';

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
