import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Delivery, DeliveryStatus } from '@/types';

export async function getAssignedDeliveries(deliveryBoyId: string): Promise<Delivery[]> {
  const q = query(
    collection(db, 'deliveries'),
    where('assigned_to', '==', deliveryBoyId)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery));
  return list.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
}

export async function updateDeliveryStatus(
  deliveryId: string,
  status: DeliveryStatus
): Promise<void> {
  await updateDoc(doc(db, 'deliveries', deliveryId), {
    status,
    updated_at: Timestamp.now(),
  });
}
