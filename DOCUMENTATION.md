# Dabzzo v2.0 | Technical Documentation

Dabzzo is a premium, mobile-first marketplace for daily meal subscriptions (tiffin services). This documentation provides a comprehensive overview of the architecture, features, and technical implementation details of the project.

---

## 1. Project Overview
Dabzzo connects local food vendors with customers looking for consistent, high-quality daily meal plans (Lunch/Dinner). The platform handles the entire lifecycle: from discovery and subscription to daily menu updates and delivery tracking.

- **Primary Goal**: Native-level performance on mobile via a single high-quality codebase.
- **Business Model**: Subscription-based meal plans with automated daily tracking.

---

## 2. The Tech Stack

### Core Frameworks
- **Next.js 16 (App Router)**: The backbone of the application, utilized as a Single Page Application (SPA) with static export mode.
- **TypeScript**: Ensuring type safety across all database schemas and component props.
- **Capacitor 8**: The bridge that transforms the web app into a high-performance native Android/iOS application.

### Backend & Infrastructure (Firebase)
- **Firebase Authentication**: Phone-number based OTP login with cross-platform persistence.
- **Cloud Firestore**: Real-time NoSQL database with offline persistence enabled.
- **Firebase Storage**: Asset management with custom CORS policies for mobile access.
- **Firebase Hosting**: High-performance edge delivery with custom cache-control headers.

### UI & Styling
- **Tailwind CSS 4**: Modern, CSS-first styling system with `@theme` variables.
- **Framer Motion**: Fluid, native-feeling transitions and micro-animations.
- **Lucide React**: Premium iconography.
- **Zustand**: Lightweight, high-performance state management for auth and UI states.

---

## 3. Core Features by Role

### 👤 Customer (User)
- **Phone-Only Registration**: Zero-friction onboarding using mobile OTP.
- **Vendor Discovery**: Browse local kitchens with rating and price filters.
- **Smart Subscriptions**: Subscribe to Lunch, Dinner, or Both with automated renewal tracking.
- **Live Order Tracking**: View real-time location of the delivery partner via an integrated interactive map (`/track` page).
- **Track Today's Order button**: A gradient banner on the Orders page that links to `/track` whenever today has an active/scheduled delivery. Turns green when the driver is live.
- **Profile Management**: Update personal info and profile pictures directly from the native gallery.

#### Skip / Swap / Cancel Skip System
- **Skip a Day** (`cancelScheduledTiffin`): Skip any scheduled delivery up to 4 hours before the delivery slot. Earns 0.5 credit. Projects are materialized into real Firestore docs on skip.
- **Cancel Skip** (`undoSkipScheduledTiffin`): Undo a skip before the delivery time passes.
  - Restores delivery to `pending`
  - Deletes original skip credit
  - Deducts 1 day from subscription `next_billing_date` (penalty)
  - Awards 0.5 `cancel_skip_refund` credit back to user
- **Swap a Day** (`requestSwap` / `cancelSwapRequest`): Exchange a scheduled delivery slot with another subscriber.
- **Countdown Timers**: Each card shows a live countdown to the action deadline (4h cutoff for skip/swap, delivery time for cancel skip).

#### Upcoming Schedule (Orders Page)
- Merges real `delivery_orders` (Firestore) with **projected** delivery cards generated from active subscriptions.
- Projected cards fill in gaps for the next 2 days where no real doc exists.
- Deduplicates per slot (keeps newest real doc).
- Filters orphan/ghost skipped orders: must have `subscriptionId` matching an active sub AND `vendorId` matching that sub's vendor.
- Sorted ascending by exact delivery slot time (8am → 11am → 8pm across days).

### 👩‍🍳 Vendor (Partner)
- **Digital Storefront**: Manage kitchen details, bio, and pricing.
- **Daily Menu Management**: Update what's cooking today with instant subscriber notifications.
- **Active Deliveries Map**: Track the location of all assigned delivery partners in real-time.
- **Subscriber Insights**: Track active customers and subscription trends.
- **Account Stability**: Session-hardened dashboard that remembers the vendor after app restarts.

### 🚛 Delivery (Logistics)
- **Task Management**: Real-time list of pickups and deliveries.
- **Continuous Background Tracking**: Capacitor Geolocation broadcasts live GPS to Firebase.
- **Interactive Navigation**: In-app map rendering current location and assigned tasks.
- **Status Updates**: One-tap delivery confirmation (Pending → Delivered).

### 🛡 Admin (Superuser)
- **Fleet Tracking System**: Master map view of all active delivery personnel.
- **User Oversight**: Full control over user accounts and roles.
- **Vendor Approval**: Manually approve or reject new kitchen partners.
- **Support System**: Centralized ticketing for resolving customer/vendor issues.

---

## 4. Technical Architecture Deep-Dive

### 📂 Folder Structure
```text
src/
├── app/          # Next.js App Router (Pages & Layouts)
├── components/   # UI System (Shadcn-like components)
│   ├── layout/   # Persistent navigation & headers
│   ├── shared/   # Reusable UI (Cards, Pills, Toasts, SwapVendorModal)
│   ├── delivery/ # DeliveryMap, RiderTrackingCard
│   └── ui/       # Atom-level components (Buttons, Inputs)
├── lib/          # Core Logic
│   ├── auth/     # Native/Web Auth bridging service
│   ├── queries/  # Firestore data-access layer
│   │   ├── delivery.ts       # Skip, Cancel Skip, Undo Skip, Batch ops
│   │   ├── swaps.ts          # Swap request, cancel, matching
│   │   └── subscriptions.ts  # Subscribe, cancel, credits
│   └── storage/  # Hardened image upload logic
├── store/        # Zustand: authStore, uiStore
└── types/        # TypeScript interfaces (delivery, subscription, swap)
```

### 🔄 Data Flow: Skip → Cancel Skip

```
User taps "Skip" on projected card
  → cancelScheduledTiffin(delivery, userId)
      ├── isProjected? → setDoc() new delivery_orders doc with status='skipped'
      │                   fields: subscriptionId, vendorId, customerId, meal, scheduledSlot, createdAt
      └── else → updateDoc() existing doc to status='skipped'
      
      → awardUserCredit({ source: 'cancellation', source_reference_id: deliveryRef.id })

User taps "Cancel Skip"
  → undoSkipScheduledTiffin(delivery, userId)
      ├── Validate status === 'skipped'
      ├── Validate delivery slot time > now
      ├── Find credit doc by source_reference_id === delivery.id
      │     └── Fallback: same-date 'cancellation' credit
      ├── Find active subscription (by subscriptionId, then user_id)
      └── runTransaction:
          ├── delivery_orders[delivery.id].status → 'pending'
          ├── DELETE credit doc
          ├── subscription.next_billing_date -= 1 day
          └── CREATE user_credits { source: 'cancel_skip_refund', credit_amount: 0.5 }
```

---

## 5. Key Business Rules

### Credits
| Event | Credit Change | Source field |
|---|---|---|
| Skip a delivery | +0.5 | `cancellation` |
| Cancel a skip | −0.5 (original deleted) +0.5 (refund) | `cancel_skip_refund` |
| Subscription net after cancel skip | −1 day to next_billing_date | — |

### Time Gates
| Action | Cutoff |
|---|---|
| Skip a delivery | Must be > 4 hours before slot |
| Swap a delivery | Must be > 4 hours before slot |
| Cancel Skip | Must be before slot time (no 4h gate) |

### Ghost Order Filter (UI)
Skipped orders are **only shown** in the Upcoming Schedule if:
1. `subscriptionId` is set AND matches an active subscription
2. `vendorId` is set AND matches that subscription's vendor
3. Delivery slot time is still in the future

This prevents orphaned test/dev documents from appearing in production.

---

## 6. Firestore Collections Reference

| Collection | Purpose | Key Fields |
|---|---|---|
| `users` | User profiles + roles | `role`, `location`, `is_approved` |
| `subscriptions` | Active meal plans | `user_id`, `vendor_id`, `status`, `next_billing_date`, `frequency` |
| `delivery_orders` | Daily delivery tracking | `customerId`, `vendorId`, `subscriptionId`, `status`, `scheduledSlot`, `meal` |
| `user_credits` | Credit wallet | `user_id`, `credit_amount`, `source`, `source_reference_id`, `redeemed` |
| `swap_requests` | Swap marketplace | `initiator_user_id`, `status`, `meal_type` |
| `daily_menus` | Vendor daily menus | `vendor_id`, `date`, `meals` |
| `rider_trips` | Rider GPS tracking | `riderId`, `status`, `vendorIds` |
| `support_tickets` | User support | `submitter_id`, `status` |
| `audit_logs` | Immutable event log | `action`, `userId`, `timestamp` |

---

## 7. Firestore Security Rules Summary

- `delivery_orders`: CRUD by `customerId`, `vendorId`, or `agentId`. **Delete is admin-only.**
- `subscriptions`: Read/Update by `user_id` or `vendor_id`. Delete by `user_id` or admin.
- `user_credits`: Read/Write by `user_id`. Admins have full access.
- `swap_requests`: Create by initiator. Update by anyone (for claiming). Delete by admin.
- `audit_logs`: Create by anyone. Update/Delete: never (immutable).

---

## 8. Development Notes

### Running Locally
```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build check
```

### Environment Variables
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

### Known Constraints
- **Static Export**: `output: 'export'` means no server-side rendering. All data fetching is client-side via Firestore real-time listeners.
- **Capacitor + Dynamic Routes**: Dynamic Next.js routes don't work with Capacitor's file:// protocol. All routes must be statically pre-rendered.
- **Firestore Delete Rules**: Standard users cannot delete `delivery_orders`. Ghost documents should be handled via status updates (`cancelled`) or UI-level filtering.
