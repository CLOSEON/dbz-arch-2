import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deleteStorageFileByUrl } from '@/lib/storage';
import { Offer, CreateOfferInput, UpdateOfferInput } from '@/types';

const COLLECTION_NAME = 'offers';

/**
 * Fetch all active promotional offers for the home screen carousel, sorted by sortOrder ascending.
 * Public read access.
 */
export async function getActiveOffers(): Promise<Offer[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('isActive', '==', true),
      orderBy('sortOrder', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
  } catch (error: any) {
    // Graceful fallback if composite index is building: query by isActive and sort in-memory
    console.warn('[Offers] Query with index warning, falling back to local sort:', error?.message);
    const fallbackQuery = query(
      collection(db, COLLECTION_NAME),
      where('isActive', '==', true)
    );
    const snap = await getDocs(fallbackQuery);
    const offers = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
    return offers.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
}

/**
 * Fetch all promotional offers (active and inactive) for admin management, sorted by sortOrder ascending.
 * Admin read access.
 */
export async function getAllOffers(): Promise<Offer[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy('sortOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
}

/**
 * Fetch a single offer by ID.
 */
export async function getOfferById(id: string): Promise<Offer | null> {
  const ref = doc(db, COLLECTION_NAME, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Offer;
}

/**
 * Create a new promotional offer document.
 * Requires admin privileges.
 */
export async function createOffer(data: CreateOfferInput): Promise<string> {
  if (data.linkType === 'kitchen' && !data.linkedKitchenId) {
    throw new Error('linkedKitchenId is required when linkType is "kitchen"');
  }

  // Determine sortOrder if not provided
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined || sortOrder === null) {
    try {
      const all = await getAllOffers();
      const maxSort = all.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), -1);
      sortOrder = maxSort + 1;
    } catch {
      sortOrder = 0;
    }
  }

  const payload = {
    imageUrl: data.imageUrl,
    title: data.title.trim(),
    linkType: data.linkType,
    linkedKitchenId: data.linkType === 'kitchen' ? (data.linkedKitchenId || null) : null,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    sortOrder,
    createdBy: data.createdBy,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), payload);
  return docRef.id;
}

/**
 * Update an existing promotional offer document.
 * Requires admin privileges.
 */
export async function updateOffer(id: string, data: UpdateOfferInput): Promise<void> {
  if (data.linkType === 'kitchen' && !data.linkedKitchenId) {
    throw new Error('linkedKitchenId is required when linkType is "kitchen"');
  }

  const payload: Record<string, any> = {
    ...data,
    updatedAt: Timestamp.now(),
  };

  if (data.linkType === 'none') {
    payload.linkedKitchenId = null;
  }

  if (data.title !== undefined) {
    payload.title = data.title.trim();
  }

  const ref = doc(db, COLLECTION_NAME, id);
  await updateDoc(ref, payload);
}

/**
 * Delete a promotional offer document and cleans up its associated Firebase Storage file.
 * Requires admin privileges.
 */
export async function deleteOffer(id: string): Promise<void> {
  const ref = doc(db, COLLECTION_NAME, id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (data?.imageUrl) {
        await deleteStorageFileByUrl(data.imageUrl);
      }
    }
  } catch (err) {
    console.warn('[Offers] Could not delete offer image from storage:', err);
  }

  await deleteDoc(ref);
}

/**
 * Reorder promotional offers in batch.
 * Updates sortOrder for all items atomically.
 * Requires admin privileges.
 */
export async function reorderOffers(
  newOrderArray: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  if (!newOrderArray || newOrderArray.length === 0) return;

  const batch = writeBatch(db);
  const now = Timestamp.now();

  for (const item of newOrderArray) {
    const ref = doc(db, COLLECTION_NAME, item.id);
    batch.update(ref, {
      sortOrder: item.sortOrder,
      updatedAt: now,
    });
  }

  await batch.commit();
}
