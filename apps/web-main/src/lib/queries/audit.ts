import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { AuditLogType } from '@/types';

export async function createAuditLog(
  type: AuditLogType,
  userId: string,
  targetUserId?: string,
  amount?: number,
  metadata?: any
): Promise<void> {
  const ref = doc(collection(db, 'audit_logs'));
  await setDoc(ref, {
    id: ref.id,
    type,
    user_id: userId,
    target_user_id: targetUserId || null,
    amount: amount || null,
    metadata: metadata || null,
    created_at: serverTimestamp(),
  });
}
