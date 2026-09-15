# Track Meal page — UX & implementation notes

**App:** `web-main` · **Route:** `src/app/(user)/track/page.tsx` (renders inside the user shell layout)
**Last touched:** 2026-09-15 (full state rewrite) · Changelog: [CHANGELOG.md](../../../CHANGELOG.md)

This document records how the customer Track page works, the states it can be in, why it renders what it renders, and what a future change must not break. Read it alongside the two delivery components it drives.

---

## 1. What the page is

The Track page is the customer's "where is my tiffin" screen. It is a single client component (`'use client'`) that:

1. Lists the current user's `orders` (collection `orders`, filter `user_id`) and `subscriptions` (collection `subscriptions`, filter `user_id` + `status == 'active'`) via Firestore `onSnapshot`.
2. Derives a **current order** (live → delivered → failed) and a **next order** (real or projected from active subscriptions).
3. Subscribes to the assigned driver's `driver_profiles/{driverId}.currentLocation` and the rider trip doc for live GPS.
4. Renders live tracking, delivery summary, failure, or an upcoming-delivery card accordingly.

It is loaded through `next/dynamic` (the consumer of `RiderTrackingCard`) and wrapped in `<Suspense>` because it calls `useSearchParams`.

A **superadmin inspector mode** sits on top (`isSuperadminEmail` / `user.is_superadmin` / `role === 'admin'`): a selector lists active platform deliveries, and admins can impersonate a customer's exact view including the doorstep PIN. This mode was **preserved unchanged**.

---

## 2. Render state matrix

`currentOrder` is the newest of: first live order (`liveOrder`), else `latestDelivered` (newest `delivered`/`failed`). The page then picks exactly one card:

| State | Condition | Renders |
|---|---|---|
| Live | `currentOrder.status ∈ LIVE_STATUSES` (`picking_up`, `out_for_delivery`, `picked_up`, `preparing`, `vendor_ready`, `rider_assigned`) | `<RiderTrackingCard>` (map, ETA, OTP, box tag, rider info) |
| Delivered | `status === 'delivered'` | **`<DeliveryCompleteCard>`** — green summary, date/time, address, "View Orders" |
| Failed | `status === 'failed'` | Compact inline "NOT DELIVERED" card — reason-aware copy + "Contact Support" → `/support` |
| None | no current + no next order | Empty state ("No Active Delivery" 🍱) |
| Loading | `loading` | Spinner ("Connecting live GPS…") |

Plus a **Next Delivery card** whenever `nextOrder` exists: soonest of real `pending`/`preparing` orders and subscription-projected orders (2 days of lunch/dinner slots, skipping slots that already have a real order or are in the past).

Notifications for the current order (subcollection `orders/{id}/notifications`, newest first) are **collapsed behind an "Updates" toggle** and auto-expand only when a `delay_alert` arrives.

---

## 3. Why the rewrite happened (2026-09-15)

Before the rewrite the page had real UX problems:

- **Delivered orders rendered the full live-tracking card.** The countdown, ETA hero, box tag, OTP reveal, and "your rider is on the way" pulse were all meaningless (and in some cases wrong) after `delivered`.
- **Two maps.** A Google-Maps `LiveDeliveryMap` at the top **and** a Leaflet map inside `RiderTrackingCard`. The Google one was dead weight (and added a Maps SDK dependency to the page).
- **Failed deliveries looked like everything else.** There was no distinct failure surface, so a `failed` order was indistinguishable from an in-flight one.
- **ETA was guessed, not read.** `RiderTrackingCard` computed the ETA hero from `mealType` only (`lunch → 13:00`, else `20:00`), ignoring the order's actual `delivery_slot`/`scheduledSlot`.
- **The map was hidden until `out_for_delivery`.** No GPS map for `rider_assigned`/`picked_up` even when location data existed.
- **A no-op rating affordance.** The delivered celebration showed "Tap to rate your experience" stars that nothing listened to.
- **Noise:** a perpetually-open notification feed, a three-line header, a next-order card that repeated the scheduled/status grid.

### The fix, in one line each

- New `DeliveryCompleteCard` owns the delivered surface; the live card's delivered-celebration block was already redundant and left in place for the dynamic-duplicate case only (see §5).
- Deleted the `LiveDeliveryMap` block and its now-unused imports.
- Failed orders get their own compact card.
- `RiderTrackingCard` gained a `scheduledSlot` prop; ETA falls back to meal type when absent.
- `showMap` = `!delivered && !cancelled && hasValidGps` (any rider-active status with GPS shows the map).
- Dead placeholder and rating row removed.
- Notifications → updates toggle; header → one pill + meal + subtitle; next-order card simplified.

---

## 4. Data flow & helper contract

### Delivered timestamp — the shapes it arrives in

Backend writers do not agree on one field:

- `timestamps.deliveredAt` (canonical `DeliveryOrder` model)
- `delivered_at` (top-level — written by `functions/src/deliveryTriggers.ts` `verifyDeliveryOTP` / `updateDeliveryStatus`)
- `deliveredAt` (legacy camelCase on very old docs)

`resolveDeliveredAt(order)` in the page (and a private copy in `DeliveryCompleteCard`) normalizes all of these to a `Date | null`, handling `firebase.Timestamp` (`{seconds}`), `Date`, string, and epoch-number forms. **Any new writer must feed one of these three; if you add a fourth shape, extend both helpers.**

### Order document mapping

`mapOrderDoc()` in the page maps every snapshot into a legacy-friendly shape (`user_id → customerId`, `customer_name → customerName`, `meal`/`meal_type`, `delivery_slot → scheduledSlot`, `delivery_otp/otp`, driver fields, etc.) so the rest of the page and the components can read one consistent object. This mapping is the reason the order objects are typed `any` throughout the page — see §6.

### Rider GPS

When a live order has `driverId`, the page subscribes to `driver_profiles/{driverId}` (live `currentLocation`) and, if `riderTripId` exists, to `rider_trips/{riderTripId}`. `RiderTrackingCard` renders the Leaflet map with the rider marker and (if the order has valid coords) a destination marker; a `MapMover` flies the viewport as GPS updates.

---

## 5. Component contracts

### `DeliveryCompleteCard` (`src/components/delivery/DeliveryCompleteCard.tsx`)

```ts
props: { order: any; vendorName?: string }
```

- Reads `order.deliveredAt | order.delivered_at | order.timestamps?.deliveredAt` via its own `resolveDeliveredAt`.
- Meal name fallback chain: `meal.name` (unless `'Tiffin'`) → `<Type> Tiffin` → `'Tiffin'`.
- Address from `order.address.line1` or `order.delivery_address.line1`.
- CTA is a `<Link href="/orders">` → the orders page (`src/app/(user)/orders/page.tsx`).

### `RiderTrackingCard` (`src/components/delivery/RiderTrackingCard.tsx`)

```ts
props: {
  status: TrackingStatus;
  mealName?: string;
  mealType: 'lunch' | 'dinner' | 'both';   // kept as ETA fallback when no scheduledSlot
  scheduledSlot?: string;                   // new 2026-09-15
  riderName?; riderPhone?; riderRating?; vehicleNumber?;
  otp?; boxTag?;
  driverLocation?: { lat; lng }; destLocation?: { lat; lng };
  onCallRider?: (phone: string) => void; className?;
}
```

- **ETA hero:** `scheduledSlot` wins (`8am → 8:00`, `11am → 11:00`, `8pm → 20:00`); otherwise falls back to `mealType` (`dinner → 20:00`, else `13:00`).
- **`showMap`:** `!delivered && !cancelled && driverLocation` is a valid `{lat,lng}`. The map now appears for `rider_assigned`/`picked_up` too.
- The delivered state keeps a small celebration block, but the page no longer routes to this card when `delivered` — both surfaces exist; the page decides.
- Box tag + OTP card renders for `rider_assigned` / `vendor_ready` / `picked_up` / `out_for_delivery`.

> Both components are **dynamically imported** (`dynamic(..., { ssr: false })`) to avoid SSR issues with `react-leaflet`. A static-import reachability scan once flagged `RiderTrackingCard` as dead code for exactly this reason — do not delete it on a grep-only basis.

---

## 6. Conventions & deliberate decisions

- **`any` is intentional on order data.** The legacy mapping (`mapOrderDoc`) produces a shape that is a superset of `DeliveryOrder` plus snake_case aliases plus nested `timestamps`. The shared `DeliveryOrder` type does not cover this union, and the rest of the page/app reads these objects the same way. Full typing = write a normalization layer; logged as a follow-up, not done in the rewrite.
- **Meal/vendor name helpers live in the page** (`getMealName`, `getVendorName`) and are used consistently by the header, the live card, the delivered card, and the next-order card, so a copy change lands in one place. `getVendorName` also resolves from the active subscription list when the order doesn't carry a vendor name.
- **`boxTag`** is produced by `generateBoxTag()` from `@/lib/boxTag` at render time (not stored on the document).
- **Projected orders** (`isProjected: true`) never fire listeners; the notification effect returns early for them.
- **Superadmin impersonation:** `selectedOrderId`/`selectedCustomerId` flow through `useSearchParams` (`?orderId=`/`?userId=`), auto-select the first in-flight order, and hydrate `users/{id}` for name/phone.

---

## 7. Verification checklist

Run from repo root (or the app dir where noted):

1. `npm run typecheck` (in `apps/web-main`) → 0 errors.
2. `npm run lint` (in `apps/web-main`) → baseline for the touched files is 36 problems (34 errors / 2 warnings), all `no-explicit-any` consistent with the file's existing style.
3. `npm run build:web` (root) → all 5 apps build; web-main succeeds.
4. `npm run test:functions` (root) → 99/99.
5. `npm run dev:web` (root) → boots at `http://localhost:3000`.
6. Manual, with a real/simulated account:
   - **Delivered:** an order with `status: 'delivered'` renders `DeliveryCompleteCard`, shows the normalized date/time, and links to `/orders`. No countdown/OTP/map.
   - **Live:** `out_for_delivery` + driver GPS → Leaflet map + correct slot ETA + OTP/box-tag card.
   - **Failed:** `status: 'failed'` shows the compact "NOT DELIVERED" card with support link.
   - **Notifications:** feed is collapsed; a `delay_alert` notification auto-opens it.
   - **Nav:** Rewards no longer appears in the bottom tab / sidebar; `/rewards` still loads from Profile.

---

## 8. Known follow-ups (not done, logged)

- Type the order shape used by these components (normalization layer) instead of `any`.
- The page still lives entirely in `page.tsx` (~940 lines) — extracting the derivation logic (order mapping, current/next derivation, ETA) into a `lib/` module would unlock unit tests for the delivered/failed/next logic.
- Two `resolveDeliveredAt` copies (page + `DeliveryCompleteCard`) — consolidate into a shared util if they ever diverge further.
- `RiderTrackingCard`'s delivered-celebration block is now unreachable via the page (page swaps to `DeliveryCompleteCard`); it can be deleted once that's confirmed for all callers.
- Repo-wide, `functions/lib/*` compiled output and `apps/**/.next/*` build artifacts remain git-tracked churn (see IMPLEMENTATION_PLAN.md §2.2).