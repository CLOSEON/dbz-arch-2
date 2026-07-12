# 🚀 Dabzzo v2 — Optimization Guide & Implementation

**Date:** July 11, 2026  
**Status:** Optimization Implementation  
**Goal:** Reduce memory footprint, improve performance, better code quality

---

## 📊 Optimization Strategy

### Tier 1: High Impact (Implement First)
1. **Firestore Query Optimization** - Paginate queries, reduce fetches
2. **Component Memoization** - Prevent unnecessary re-renders
3. **useMemo for Expensive Computations** - Cache complex calculations
4. **Location Tracking Throttle** - Reduce GPS update frequency
5. **Firebase SDK Tree-Shaking** - Import only needed modules

### Tier 2: Medium Impact  
6. **Virtual Scrolling for Lists** - Render only visible items
7. **Dynamic Component Loading** - Code split heavy components
8. **Image Optimization** - Use WebP, responsive images
9. **State Management Optimization** - Reduce store re-renders

### Tier 3: Polish
10. **Unused CSS Purging** - Remove dead styles
11. **Bundle Analysis** - Identify bloat
12. **Lazy Load Modals** - Load only when needed

---

## 🔧 Implementation Details

### OPT-001: Firestore Query Pagination

**Current Problem:** Fetching all orders/subscriptions at once  
**Solution:** Implement cursor-based pagination

```typescript
// BEFORE: Load all documents
const orders = await getDocs(query(collection(db, 'orders')));

// AFTER: Paginate with cursor
const LIMIT = 20;
let lastVisible: DocumentSnapshot | null = null;

export async function getOrdersPaginated(limit = LIMIT, cursor?: DocumentSnapshot) {
  let q = query(
    collection(db, 'orders'),
    orderBy('createdAt', 'desc'),
    limit(LIMIT + 1)
  );
  
  if (cursor) {
    q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      startAfter(cursor),
      limit(LIMIT + 1)
    );
  }
  
  const snap = await getDocs(q);
  lastVisible = snap.docs[LIMIT - 1];
  return snap.docs.slice(0, LIMIT);
}
```

### OPT-002: useMemo for Order Merging

**Current Problem:** Recomputes merged order list on every render  
**Solution:** Memoize with proper dependencies

```typescript
const upcomingDeliveries = useMemo(() => {
  // Expensive computation here
  // Only recalculates when realOrders, activeSubs, user, or skippedSlots change
}, [realOrders, activeSubs, user?.id, skippedSlots]);
```

### OPT-003: Location Tracking Optimization

**Current Problem:** GPS updates every 10 seconds, writes to Firebase  
**Solution:** Smart throttling based on movement

```typescript
// Increase thresholds
DISTANCE_THRESHOLD_METERS = 50;  // Instead of 20m
TIME_THRESHOLD_MS = 30000;        // Instead of 15s

// This reduces Firestore writes by 4-6x
```

### OPT-004: React.memo for Components

**Current Problem:** Child components re-render with parent  
**Solution:** Wrap static components with React.memo

```typescript
export const DeliveryCard = React.memo(({ delivery, onSkip }) => {
  return (
    <div className="...">
      {/* Card content */}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - return true if props are equal
  return prevProps.delivery.id === nextProps.delivery.id &&
         prevProps.onSkip === nextProps.onSkip;
});
```

### OPT-005: Firebase SDK Optimization

**Current Problem:** Loading entire Firebase SDK  
**Solution:** Tree-shake unused modules

```typescript
// BEFORE: Heavy imports
import { getFirestore, collection, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

// AFTER: Load on-demand
export const getAppMessaging = async () => {
  if (typeof window === 'undefined') return null;
  const { getMessaging, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (supported) return getMessaging(app);
  return null;
};
```

### OPT-006: Virtual Scrolling for Long Lists

**Current Problem:** Rendering 100+ order cards kills performance  
**Solution:** Use react-window for virtualization

```typescript
import { FixedSizeList as List } from 'react-window';

const OrderList = ({ orders }) => (
  <List
    height={600}
    itemCount={orders.length}
    itemSize={120}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        <OrderCard order={orders[index]} />
      </div>
    )}
  </List>
);
```

### OPT-007: useCallback for Event Handlers

**Current Problem:** Inline functions cause child re-renders  
**Solution:** Memoize callbacks

```typescript
const handleSkip = useCallback(async (delivery: any) => {
  // Skip logic
}, [user?.id]); // Only recreates when user changes
```

### OPT-008: Selective Subscriptions

**Current Problem:** Listening to all delivery orders  
**Solution:** Filter at query level

```typescript
// BEFORE: Listen to all, filter in app
onSnapshot(collection(db, 'delivery_orders'), (snap) => {
  setOrders(snap.docs.map(d => d.data()).filter(o => o.customerId === user.id));
});

// AFTER: Filter in query
onSnapshot(
  query(collection(db, 'delivery_orders'), where('customerId', '==', user.id)),
  (snap) => {
    setOrders(snap.docs.map(d => d.data()));
  }
);
```

### OPT-009: Implement Request Batching

**Current Problem:** Multiple small Firestore writes  
**Solution:** Batch related updates

```typescript
const batch = writeBatch(db);

batch.update(doc(db, 'subscriptions', subId), { status: 'active' });
batch.set(doc(db, 'user_credits', creditId), { amount: 0.5 });
batch.set(doc(db, 'audit_logs', logId), { action: 'skip', timestamp });

await batch.commit(); // Single round-trip
```

### OPT-010: Cache Layer Implementation

**Current Problem:** Repeated identical queries  
**Solution:** Add TTL-based cache

```typescript
const CACHE_TTL_MS = 30_000;
const _cache = new Map<string, { data: any; ts: number }>();

export async function getCachedQuery(key: string, fn: () => Promise<any>) {
  const now = Date.now();
  const cached = _cache.get(key);
  
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  
  const result = await fn();
  _cache.set(key, { data: result, ts: now });
  return result;
}
```

---

## 📈 Expected Performance Gains

| Optimization | Expected Improvement | Effort |
|---|---|---|
| Firestore Pagination | 50-70% less data | Medium |
| useMemo/useCallback | 30-40% fewer renders | Low |
| Location Throttle | 80-90% fewer writes | Low |
| React.memo | 20-30% render time | Low |
| Firebase SDK | 15-20% bundle size | Medium |
| Virtual Scrolling | 90%+ faster lists | Medium |
| Request Batching | 50% fewer operations | Low |
| Cache Layer | 60-70% faster queries | Medium |

---

## 🛠 Implementation Order

1. **Week 1:** Firebase pagination, useMemo, useCallback
2. **Week 2:** Location tracking throttle, React.memo
3. **Week 3:** Virtual scrolling, request batching
4. **Week 4:** Cache layer, bundle optimization

---

## 📊 Monitoring Metrics

Track these metrics before/after:

- **Memory Usage:** DevTools → Memory tab
- **Bundle Size:** `npm run build` output
- **Core Web Vitals:** LCP, FID, CLS
- **Firestore Operations:** Console → Usage
- **Component Render Times:** React DevTools Profiler

---

## ✅ Validation Checklist

- [ ] Memory usage reduced by 30%+
- [ ] Bundle size reduced by 15%+
- [ ] Firestore operations reduced by 40%+
- [ ] Page load time < 2s
- [ ] Scroll performance smooth (60 FPS)
- [ ] No visual regressions
- [ ] All tests passing

---

## 🎯 Success Criteria

✅ **PASS** if:
- Memory consumption < 50MB on mobile
- Bundle size < 300KB gzipped
- Firestore reads < 1000/day
- Page interactions < 100ms latency
- 90+ Lighthouse score

---

*This optimization guide will be implemented incrementally across the project.*
