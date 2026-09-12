import type {
  DocumentData,
  DocumentSnapshot,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from 'firebase/firestore';
import type { StoredOrder, Subscription, AppUser } from '@dabzzo/shared-types';

/**
 * Typed Firestore reads.
 *
 * The query layer was littered with `snap.data() as any`, which switches off
 * checking for the whole document, not just the one field someone wanted. These
 * helpers give a read a real type in one place.
 *
 * Two shapes are provided because the codebase needs both:
 *
 *  - `converter<T>()` is a proper FirestoreDataConverter for use with
 *    `.withConverter()` on a collection or doc reference. Prefer it when you
 *    control the reference, since every read through it is typed automatically
 *    and `id` is folded in.
 *  - `readDoc<T>()` / `readDocs<T>()` type a snapshot you already have, for the
 *    many existing call sites that build references elsewhere.
 *
 * Neither validates at runtime — Firestore documents are whatever was written,
 * and older documents predate the canonical schema. That is why order reads use
 * `StoredOrder` (canonical fields plus the legacy camelCase aliases that real
 * documents still carry) rather than `Order`. The type describes what is
 * actually there, instead of asserting something tidier and being wrong.
 */

/** A FirestoreDataConverter that folds the document id into the shape. */
export function converter<T extends object>(): FirestoreDataConverter<T & { id: string }> {
  return {
    toFirestore(value: T & { id: string }): DocumentData {
      // Never write `id` into the document body — it lives in the path.
      const { id: _id, ...rest } = value as T & { id: string };
      return rest as DocumentData;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot<DocumentData>,
      options?: SnapshotOptions
    ): T & { id: string } {
      return { ...(snapshot.data(options) as T), id: snapshot.id };
    },
  };
}

/** Type an existing snapshot. Returns undefined when the document is absent. */
export function readDoc<T extends object>(
  snap: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>
): (T & { id: string }) | undefined {
  if (!('exists' in snap) || !snap.exists()) return undefined;
  return { ...(snap.data() as T), id: snap.id };
}

/** Type the documents of an existing query snapshot. */
export function readDocs<T extends object>(
  docs: Array<QueryDocumentSnapshot<DocumentData>>
): Array<T & { id: string }> {
  return docs.map((d) => ({ ...(d.data() as T), id: d.id }));
}

// ─── Ready-made converters for the collections read most often ───────────────

/** `orders` — see StoredOrder for why this is not plain `Order`. */
export const orderConverter = converter<StoredOrder>();
export const subscriptionConverter = converter<Subscription>();
export const userConverter = converter<AppUser>();

/** Type an order snapshot, including the legacy aliases real documents carry. */
export function readOrder(
  snap: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>
) {
  return readDoc<StoredOrder>(snap);
}

export function readOrders(docs: Array<QueryDocumentSnapshot<DocumentData>>) {
  return readDocs<StoredOrder>(docs);
}

/**
 * Coordinates from an order's `delivery_address`, which is a string on orders
 * created via subscription and an object on those created by the delivery
 * trigger. Returns undefined for the string form — callers must decide what to
 * do rather than silently reading `.lat` off a string and getting undefined.
 */
export function addressCoords(
  address: string | { lat?: number; lng?: number } | null | undefined
): { lat: number; lng: number } | undefined {
  if (!address || typeof address === 'string') return undefined;
  const { lat, lng } = address;
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  return { lat, lng };
}
