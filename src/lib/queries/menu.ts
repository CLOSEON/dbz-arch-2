import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DailyMenu } from '@/types';

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getDailyMenu(vendorId: string, dateStr: string): Promise<DailyMenu | null> {
  const docId = `${vendorId}_${dateStr}`;
  const snap = await getDoc(doc(db, 'daily_menu', docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DailyMenu;
}

export async function saveDailyMenu(vendorId: string, dateStr: string, data: Partial<DailyMenu>): Promise<void> {
  const docId = `${vendorId}_${dateStr}`;
  await setDoc(doc(db, 'daily_menu', docId), {
    ...data,
    vendor_id: vendorId,
    date: dateStr,
    updated_at: Timestamp.now(),
  }, { merge: true });
}
