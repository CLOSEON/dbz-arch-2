# Dabzzo v2 — AI Agents Context Guide

This document is designed as a comprehensive context guide for AI agents working on this project. It provides essential information to understand the codebase, architecture, workflows, and how to implement changes effectively.

---

## 🎯 Quick Summary

**Dabzzo** is a mobile-first meal subscription and delivery platform connecting home-style kitchens (Vendors) with customers, facilitated by a delivery fleet (Riders).

- **Framework:** Next.js 16 (App Router + Static Export)
- **Language:** TypeScript + React 19
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Mobile:** Capacitor 8 (wraps web app into native Android/iOS)
- **State Management:** Zustand
- **Styling:** Tailwind CSS 4 + Framer Motion
- **Database:** Firestore (NoSQL, real-time, offline-capable)

---

## 🏛 Architecture Overview

### Three-Tier Architecture
1. **Frontend (Next.js):** Client-side rendered SPA with Firebase SDK
2. **Backend (Firebase):** Serverless compute, real-time database, auth
3. **Mobile:** Capacitor wraps the web app, adding native capabilities (geolocation, push, etc.)

### Data Flow
```
User Interaction (Component)
  ↓
Zustand Store (state) / React Query (data)
  ↓
Firestore Query Layer (lib/queries/*.ts)
  ↓
Firebase Firestore SDK (real-time listeners)
  ↓
Firestore Database + Cloud Functions
```

---

## 👥 User Roles & Portals

The application serves **four distinct user roles**, each with dedicated portals:

| Role | Portal Path | Key Responsibilities |
|------|-------------|----------------------|
| **Customer** | `/(user)/*` | Subscribe to meals, track deliveries, manage profile |
| **Vendor** | `/(vendor)/*` | Manage menu, view prep schedules, mark batches ready |
| **Rider** | `/(delivery)/*` | Accept trips, track GPS, confirm pickups/drop-offs |
| **Admin** | `/(admin)/*` | Monitor all operations, approve vendors, resolve exceptions |

### Key Features by Role

#### 👤 Customer
- Phone-based OTP login
- Browse vendors and subscribe to daily meal plans
- Real-time order tracking with interactive map
- Skip/Swap/Cancel Skip orders with credit system
- View upcoming projected schedule

#### 👩‍🍳 Vendor
- Digital storefront with kitchen details
- Daily menu management
- Real-time subscriber insights
- View active deliveries on map
- Session persistence across app restarts

#### 🚛 Rider
- Real-time task list (pickups + drop-offs)
- Continuous GPS tracking via Capacitor Geolocation
- Interactive navigation map
- OTP-based secure handoffs with count confirmation
- Earnings dashboard

#### 🛡 Admin
- Bird's-eye view of all operations
- User and vendor management
- Exception monitoring (pickup discrepancies, failed deliveries)
- Accounting & rider payout review
- Master delivery fleet map

---

## 📂 Project Structure

```
DBZARCH2/
├── src/
│   ├── app/                      # Next.js App Router (all pages)
│   │   ├── (user)/              # Customer portal
│   │   │   ├── dashboard/       # Main customer view
│   │   │   ├── orders/          # Upcoming schedule + tracking
│   │   │   ├── track/           # Real-time delivery map
│   │   │   ├── profile/         # User settings
│   │   │   ├── rewards/         # Credits & rewards
│   │   │   └── vendor/detail/   # Vendor details page
│   │   ├── (vendor)/            # Vendor portal
│   │   │   ├── vendor/dashboard/     # Prep schedule
│   │   │   ├── vendor/menu/          # Menu management
│   │   │   ├── vendor/profile/       # Vendor settings
│   │   │   └── vendor/discounts/     # Discount codes
│   │   ├── (delivery)/          # Rider portal
│   │   │   ├── delivery/dashboard/   # Active trips
│   │   │   ├── delivery/earnings/    # Payout info
│   │   │   └── delivery/support/
│   │   ├── (admin)/             # Admin portal
│   │   │   ├── admin/dashboard/      # Overview
│   │   │   ├── admin/users/          # User management
│   │   │   ├── admin/vendors/        # Vendor approvals
│   │   │   ├── admin/delivery/       # Fleet tracking
│   │   │   ├── admin/batches/        # Order aggregation
│   │   │   ├── admin/orders/         # All orders
│   │   │   ├── admin/swaps/          # Swap marketplace
│   │   │   └── admin/support/        # Support tickets
│   │   ├── (auth)/              # Authentication pages
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── admin-login/
│   │   ├── api/                 # API routes (very minimal)
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Root page (splash)
│   │
│   ├── components/              # React components
│   │   ├── layout/             # Persistent navigation, headers
│   │   ├── shared/             # Reusable UI (Cards, Pills, Modals)
│   │   ├── delivery/           # Delivery-specific (Map, Tracker)
│   │   └── ui/                 # Atom-level (Buttons, Inputs, Selects)
│   │
│   ├── lib/                    # Core business logic & utilities
│   │   ├── auth/               # Auth service & auth guard
│   │   │   ├── auth-service.ts # Phone OTP, token refresh
│   │   │   ├── auth-provider.tsx # Auth context setup
│   │   │   └── auth-guard.tsx  # Role-based route protection
│   │   ├── queries/            # Firestore data access layer
│   │   │   ├── users.ts       # User CRUD, profiles
│   │   │   ├── subscriptions.ts # Subscribe, cancel, credits
│   │   │   ├── delivery.ts     # Skip, swap, cancel skip
│   │   │   ├── swaps.ts        # Swap marketplace
│   │   │   ├── menu.ts         # Vendor menus
│   │   │   ├── discounts.ts    # Discount codes
│   │   │   ├── admin.ts        # Admin operations
│   │   │   ├── rewards.ts      # Credits & rewards
│   │   │   └── audit.ts        # Event logging
│   │   ├── delivery/           # Location tracking
│   │   │   └── locationTracker.ts # Capacitor geolocation + Firebase sync
│   │   ├── notifications/      # Push notification setup
│   │   ├── offline/            # Action queue for offline-first
│   │   ├── storage.ts          # Image upload logic
│   │   ├── firebase.ts         # Firebase SDK initialization
│   │   └── utils.ts            # Helper utilities
│   │
│   ├── store/                  # Zustand state stores
│   │   ├── authStore.ts        # User auth state
│   │   ├── uiStore.ts          # UI state (modals, toasts)
│   │   └── index.ts            # Store exports
│   │
│   ├── types/                  # TypeScript interfaces
│   │   ├── index.ts           # Core types (User, Subscription, etc.)
│   │   ├── delivery.ts        # Delivery & trip types
│   │   └── payout.ts          # Rider payment types
│   │
│   └── hooks/                  # Custom React hooks
│
├── public/                     # Static assets
├── functions/                  # Firebase Cloud Functions (if any)
├── firestore.rules             # Firestore Security Rules
├── firestore.indexes.json      # Composite indexes
├── firebase.json               # Firebase config
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── next.config.ts              # Next.js config (static export)
├── tailwind.config.ts          # Tailwind CSS config
├── postcss.config.mjs          # PostCSS config
├── eslint.config.mjs           # ESLint rules
├── capacitor.config.ts         # Capacitor config for mobile
├── components.json             # Component registry
├── README.md                   # Project overview
└── AI_AGENTS_README.md         # This file (agent context)
```

---

## 🗄 Firestore Collections (Database Schema)

### Core Collections

| Collection | Primary Purpose | Key Fields | Access Rules |
|---|---|---|---|
| **users** | User profiles + roles | `role`, `name`, `phone`, `location`, `is_approved`, `created_at` | Role-based |
| **subscriptions** | Active meal plans | `user_id`, `vendor_id`, `status`, `frequency`, `next_billing_date`, `meals` | User + Vendor |
| **orders** | Canonical delivery instances | `user_id`, `vendor_id`, `subscription_id`, `status`, `delivery_slot`, `meal_type`, `created_at` | Customer + Vendor + Rider |
| **user_credits** | Credit wallet (rewards) | `user_id`, `credit_amount`, `source`, `source_reference_id`, `redeemed`, `created_at` | User-specific |
| **swap_requests** | Swap marketplace | `initiator_user_id`, `target_user_id`, `status`, `meal_type`, `scheduled_slot`, `created_at` | Public create, user update |
| **daily_menus** | Vendor daily menus | `vendor_id`, `date`, `meals`, `updated_at` | Vendor-specific |
| **batches** | Aggregated orders per vendor | `vendor_id`, `scheduled_time`, `status`, `meal_count`, `orders_list`, `created_at` | Vendor + Rider |
| **rider_trips** | Rider assignments | `rider_id`, `status`, `batches`, `deliveries`, `route`, `created_at` | Rider-specific |
| **support_tickets** | Support requests | `submitter_id`, `role`, `subject`, `status`, `created_at` | Submitter + Admin |
| **pickup_discrepancies** | Ops events (count mismatch) | `trip_id`, `batch_id`, `expected_count`, `actual_count`, `created_at` | Admin-only |
| **failed_delivery_reviews** | Ops events (delivery failed) | `order_id`, `rider_id`, `reason`, `created_at` | Admin-only |
| **rider_payments** | Earnings ledger | `rider_id`, `trip_id`, `amount`, `status`, `created_at` | Rider + Admin |
| **offers** | Promotional carousel cards | `imageUrl`, `title`, `linkType`, `linkedKitchenId`, `isActive`, `sortOrder`, `createdBy` | Public read (active), Admin write |

### Document Status Fields (State Machines)

#### Delivery Order States
```
pending → picked_up → delivered (SUCCESS)
       → skipped
       → failed (requires admin review)
```

#### Subscription States
```
active → cancelled
      → paused
      → expired
```

#### Swap Request States
```
pending → accepted → completed (SUCCESS)
       → rejected
       → expired
```

---

## 🔐 Security & Authentication

### Authentication Flow
1. **Phone OTP:** User enters phone number
2. **Firebase Auth:** OTP sent via Firebase (SMS)
3. **Token Storage:** JWT token stored in `localStorage` (web) + SecureStorage (mobile)
4. **Session Refresh:** Automatic token refresh before expiry
5. **Role Verification:** User role fetched from `users` collection on every auth check

### Firestore Security Rules (Key Patterns)

**Role-based Access Control:**
```javascript
function isAdmin() {
  return request.auth != null && 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

function isVendor() {
  return request.auth != null && 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'vendor';
}

function isDriver() {
  return request.auth != null && 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'delivery';
}
```

**Data Isolation Examples:**
- Customers can CRUD only their own `orders`
- Vendors can CRUD only batches assigned to them
- Riders can CRUD only their assigned trips
- Admins have full access

---

## 🔄 Core Business Workflows

### 1. Subscription & Meal Delivery Pipeline

```
Customer Subscribes
  ↓
subscription doc created with status='active'
  ↓
Cron: Batch Aggregation (Firebase Function)
  ├─ Queries all active subscriptions for vendor V at time T
  ├─ Creates batch doc with total meal count
  └─ Generates projected orders for all subscribed customers
  ↓
Vendor marks batch as "Ready" (Kitchen prep complete)
  ↓
Smart Dispatch (Firebase Function)
  ├─ Search 2km radius for available riders
  ├─ If none available: Expand to 4km, 6km every 5 minutes
  └─ Assign to first rider who accepts
  ↓
Rider Pickup Flow
  ├─ Navigate to kitchen
  ├─ Enter Pickup OTP (provided by vendor)
  ├─ Count & confirm tiffins received
  └─ If mismatch: pickup_discrepancy doc created (Admin alert)
  ↓
Rider Delivery Flow
  ├─ Navigate to customer
  ├─ Enter Drop-off OTP
  └─ If customer unavailable: Timer option (10 min) before marking failed
  ↓
Completion
  ├─ delivery_order status → 'delivered'
  ├─ Rider payment calculated & recorded
  └─ Customer order marked complete
```

### 2. Skip / Cancel Skip Workflow

```
Customer taps "Skip" on upcoming order card
  ↓
cancelScheduledTiffin(orderId, userId)
  ├─ If projected: create new orders doc with status='skipped'
  └─ Else: update existing doc to status='skipped'
  ↓
Award 0.5 credit to user
  ↓
Customer taps "Cancel Skip" (within cutoff time)
  ↓
undoSkipScheduledTiffin(orderId, userId)
  ├─ Validate: status === 'skipped' AND slot time > now
  ├─ Delete 0.5 credit (cancellation source)
  ├─ Update order.status → 'created'
  ├─ Subscription.next_billing_date -= 1 day (penalty)
  └─ Award 0.5 cancel_skip_refund credit
```

### 3. Rider Compensation Algorithm

**Calculation (Firebase Function Trigger):**
```
base_pay = calculateDistance(pickupLoc, dropoffLocs) × rate_per_km

if trip.tiffin_count > 15:
  volume_bonus = (trip.tiffin_count - 15) × 7₹

total = base_pay + volume_bonus
```

**Payment Recording:**
```
Create rider_payments doc with:
  - rider_id, trip_id, amount, status='pending'
  
Cron: Payout Settlement (daily)
  - Mark status → 'paid'
  - Record to accounting ledger
```

---

## ⚡ Key Implementation Patterns

### 1. Firestore Query Layer (lib/queries/*.ts)

All Firestore operations go through typed query functions:

```typescript
// Example: Subscribe to a vendor's meals
export async function subscribeToVendor(vendorId: string) {
  const docRef = doc(db, 'subscriptions', vendorId);
  return onSnapshot(docRef, (snapshot) => {
    const data = snapshot.data();
    // Type-safe access: data.vendor_id, data.status, etc.
  });
}

// Example: Create order (transaction to ensure consistency)
export async function createOrder(order: Order) {
  const batch = writeBatch(db);
  
  // Atomic multi-document write
  batch.set(doc(db, 'orders', order.id), order);
  batch.update(doc(db, 'subscriptions', order.subscription_id), {
    status: 'active'
  });
  
  await batch.commit();
}
```

**Key Points:**
- All queries are async
- Use `onSnapshot` for real-time listeners (subscribe)
- Use `getDocs` or `getDoc` for one-time reads
- Use `writeBatch` or `runTransaction` for multi-doc operations
- Always include error handling + loading states

### 2. Zustand Store Pattern (store/*.ts)

Global state for auth, UI, and user preferences:

```typescript
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

// Usage in components:
export function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();
  // Component logic
}
```

**Stores:**
- `authStore`: Current user, auth status, role
- `uiStore`: Modal states, toast notifications, theme

### 3. Component Structure (components/)

**Atomic Design Pattern:**
```
components/
├── ui/              # Reusable atoms (Button, Input, Card)
├── shared/          # Molecules (SubscriptionCard, ModalsSwap)
├── delivery/        # Domain-specific (DeliveryMap, Tracker)
└── layout/          # Persistent (Navbar, Sidebar)
```

**Naming Convention:**
- `Button.tsx` (basic UI)
- `SubscriptionCard.tsx` (business entity)
- `DeliveryTracker.tsx` (feature-specific)

### 4. Real-Time Data Sync (Capacitor + Firebase)

**Location Tracking:**
```typescript
// In lib/delivery/locationTracker.ts
export async function startBackgroundTracking(riderId: string) {
  // Uses Capacitor.Geolocation to continuously track GPS
  // Broadcasts every 10 seconds to Firestore rider_trips.location
  
  watchPosition(
    async (position) => {
      await updateDoc(doc(db, 'rider_trips', tripId), {
        current_location: {
          lat: position.latitude,
          lng: position.longitude,
        },
        last_updated: serverTimestamp(),
      });
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
```

---

## 🛠 Development Setup & Commands

### Installation
```bash
# Install dependencies
npm install

# Install Capacitor platforms (for mobile testing)
npx cap add android
npx cap add ios
```

### Running Locally
```bash
# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Firebase & Capacitor Workflows
```bash
# Sync web app to native platforms
npx cap sync

# Copy latest web build to native
npx cap copy

# Open Android Studio
npx cap open android

# Open Xcode
npx cap open ios

# Deploy Firestore rules
npx firebase deploy --only firestore:rules

# Deploy Cloud Functions
npx firebase deploy --only functions
```

---

## 📋 Common Tasks for AI Agents

### ✅ Adding a New Feature

1. **Define Types**
   - Add TypeScript interfaces to `src/types/index.ts` or domain-specific file
   - Include JSDoc comments for clarity

2. **Create Firestore Query**
   - Add function to `src/lib/queries/<domain>.ts`
   - Use proper error handling + TypeScript
   - Include comments about RBAC requirements

3. **Build Component**
   - Create component in `src/components/<domain>/` or `src/components/shared/`
   - Use Zustand store for state if needed
   - Use Firestore query via `useEffect` + `onSnapshot`

4. **Add Route**
   - Create folder/page under appropriate portal (`src/app/(role)/...`)
   - Add auth guard via `AuthGuard` wrapper
   - Include loading + error states

5. **Update Firestore Rules**
   - Edit `firestore.rules`
   - Test with Firebase emulator
   - Deploy via `firebase deploy --only firestore:rules`

### ✅ Fixing a Bug

1. **Identify Scope:** Frontend (React/Tailwind), Logic (Firestore query), or Mobile (Capacitor)
2. **Reproduce:** Follow steps to recreate issue
3. **Locate Code:** Use grep to find relevant files
4. **Test Fix:** Use dev environment first
5. **Verify:** Test on mobile if relevant

### ✅ Modifying Database Logic

1. **Understand Current State:** Read relevant query functions
2. **Check RBAC:** Ensure new rules follow security patterns
3. **Use Transactions:** For multi-document changes
4. **Add Type Safety:** Update TypeScript types
5. **Test Atomicity:** Ensure consistent state after failures

### ✅ Optimizing Performance

1. **Identify Bottleneck:** Check network tab, profile rendering
2. **Use Real-Time Listeners Wisely:** Don't subscribe to entire collections
3. **Batch Operations:** Use `writeBatch` for multiple writes
4. **Index Composite Queries:** Check `firestore.indexes.json`
5. **Paginate Results:** For large result sets, use cursor-based pagination

---

## ⚠️ Critical Constraints & Best Practices

### 1. Static Export (No Server-Side Rendering)
```typescript
// Next.js is configured with: output: 'export'
// This means:
// ✓ All routes must be static (no dynamic server logic)
// ✓ Data fetching MUST be client-side (onSnapshot, getDocs)
// ✗ No getServerSideProps() or revalidate
// ✗ No dynamic routes with [id] (unless pre-generated)
```

### 2. Capacitor + Dynamic Routes
```typescript
// Problem: Dynamic routes like /orders/[orderId] don't work with Capacitor
// Solution: Either:
// A) Use query params: /orders?id=123
// B) Pre-render all routes statically
// C) Use client-side navigation with state
```

### 3. Firestore Delete Sensitivity
```typescript
// Problem: Firestore doesn't support soft deletes by default
// Solution: Use status fields instead
// ✓ orders { status: 'skipped' | 'cancelled' }
// ✗ DELETE orders docs (only admins, use sparingly)
```

### 4. Role-Based Access (RBAC)
```typescript
// Always verify user role BOTH:
// A) Frontend (authStore.user.role)
// B) Firestore rules (security-critical operations)
// Never trust frontend auth state alone
```

### 5. Offline-First Considerations
```typescript
// Capacitor app may go offline suddenly
// Use actionQueue (lib/offline/actionQueue.ts) to queue failed operations
// Retry when connection restored
```

---

## 🧪 Testing & Validation

### Running Tests
```bash
# (Project doesn't have automated tests yet - manual testing required)
# Test on web: npm run dev
# Test on mobile: npx cap run android / npx cap run ios
```

### Testing Checklist
- [ ] User auth flow (login, logout, role verification)
- [ ] Subscription creation & cancellation
- [ ] Order skip/swap workflows
- [ ] Real-time location tracking (rider GPS)
- [ ] Payment calculation accuracy
- [ ] Offline action queueing
- [ ] Push notification delivery
- [ ] Firestore rule enforcement

---

## 🚨 Troubleshooting Guide

### Issue: "User not authenticated"
- Check `authStore.isAuthenticated`
- Verify token in localStorage/SecureStorage
- Test `Auth.currentUser()` in browser console

### Issue: "Firestore permission denied"
- Check `firestore.rules` for role verification
- Ensure user role doc exists in `users` collection
- Verify RBAC function (isAdmin, isVendor, etc.) logic

### Issue: "Real-time listener not updating"
- Confirm `onSnapshot` is properly subscribed
- Check Firestore composite indexes (`firestore.indexes.json`)
- Look for client-side query filters preventing results

### Issue: "Location not tracking on mobile"
- Verify `Capacitor.Geolocation` permission granted
- Check `locationTracker.ts` interval (default 10s)
- Ensure Firebase has write permission to `rider_trips`

### Issue: "Build fails: route not found"
- Remember: static export requires all routes pre-rendered
- For dynamic routes, use query params instead: `/orders?id=123`
- Pre-generate routes in `next.config.ts` if needed

---

## 📚 Additional Resources

- **Existing Docs:** Read `AI_AGENTS_README.md`, `README.md`, and `src/lib/auth/README.md`
- **Firestore Rules:** Check `firestore.rules` for access patterns
- **Firestore Indexes:** Check `firestore.indexes.json` for query performance
- **Firebase Config:** Check `firebase.json` for project settings
- **Type Definitions:** Check `src/types/` for all data models

---

## 🎓 Quick Reference: When to Use What

| Task | Where | How |
|------|-------|-----|
| Query Firestore | `src/lib/queries/*.ts` | Use `onSnapshot` or `getDocs` with proper error handling |
| Global State | `src/store/*.ts` (Zustand) | Use `create()` hook, access via `useStore()` |
| UI Component | `src/components/` | Atomic design: start in `ui/`, move to `shared/` if reusable |
| Page/Route | `src/app/(role)/feature/page.tsx` | Use layout grouping `(role)`, wrap with `AuthGuard` |
| Business Logic | `src/lib/queries/` or Cloud Functions | Client-side for reads, Cloud Functions for atomic multi-doc writes |
| Styling | Tailwind CSS (in component className) | Use `@theme` variables for consistency |
| Mobile Feature | `src/lib/delivery/` | Use Capacitor plugins, sync to Firebase |
| Type Definition | `src/types/` | Define once, reuse everywhere |

---

## 🤝 Contributing Guidelines for Agents

1. **Always read existing code first** — learn the patterns before implementing new features
2. **Preserve TypeScript types** — don't use `any`, define proper interfaces
3. **Follow folder structure** — new queries go in `src/lib/queries/`, components in `src/components/`
4. **Add error handling** — all async operations need try-catch + user feedback
5. **Test on mobile** — even web features need mobile testing via Capacitor
6. **Document RBAC** — comment why security rules are needed
7. **Use real-time listeners wisely** — unsubscribe on component unmount to prevent memory leaks
8. **Avoid hardcoding** — use environment variables for configs

---

## 📞 Support & Debugging

- **Firebase Console:** https://console.firebase.google.com
- **Firestore Emulator:** `firebase emulators:start` (for local testing)
- **Browser DevTools:** Check Network tab for Firestore queries
- **Capacitor Plugins:** https://capacitorjs.com/docs/plugins
- **Tailwind Docs:** https://tailwindcss.com/docs
- **Zustand Docs:** https://github.com/pmndrs/zustand

---

**Last Updated:** July 11, 2026  
**Maintained by:** CLOSEON Development Team  
**For:** AI Agents & Development Contributors
