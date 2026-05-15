import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/types';

export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  const q = query(collection(db, 'reviews'), where('vendor_id', '==', vendorId));
  const snap = await getDocs(q);
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
  return reviews.sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));
}

export async function addReview(
  vendorId: string,
  userId: string,
  userName: string,
  rating: number,
  reviewText: string
): Promise<void> {
  await addDoc(collection(db, 'reviews'), {
    vendor_id: vendorId,
    user_id: userId,
    user_name: userName,
    rating,
    review_text: reviewText,
    created_at: Timestamp.now(),
  });
}

export async function editReview(
  reviewId: string,
  rating: number,
  reviewText: string
): Promise<void> {
  await updateDoc(doc(db, 'reviews', reviewId), {
    rating,
    review_text: reviewText,
    updated_at: Timestamp.now(),
  });
}
