# Dabzzo 🍱

Dabzzo is a smart home-style meal subscription and delivery platform that connects local home-style kitchens (Vendors) with customers, facilitated by an intelligent batch dispatch system and dedicated rider fleet.

The platform is architected as a production-grade monorepo powered by Next.js 16 (Turbopack, App Router) and Firebase (Firestore, Cloud Functions, Authentication, Cloud Storage, and Multi-Site Hosting).

---

## 🏗️ Monorepo Architecture

```
DBZARCH2/
├── apps/
│   ├── web-main/       # Customer Portal (Meal subscriptions, daily tracking, swap planner)
│   ├── vendor-panel/   # Kitchen Partner Portal (Batch prep, subscriptions, menu, OTP handoff)
│   ├── rider-panel/    # Delivery Fleet App (Trip dispatch, OTP pickups/dropoffs, earnings)
│   ├── admin-panel/    # Operations Command Console (Approvals, logistics, reconciliation)
│   └── gig/            # Marketing & Partner Onboarding Landing Site
├── packages/
│   ├── shared-ui/      # Common UI primitives, loaders, tokens, and navigation shells
│   ├── firestore-rules/# Production security rules and access control definitions
│   └── functions/      # Shared serverless types and trigger interfaces
├── functions/          # 29 Firebase Cloud Functions (TypeScript, Node.js runtime)
└── scripts/            # Monorepo build and multi-app static export orchestrators
```

---

## 🎨 Brand Identity & Design System

- **Signature Palette:**
  - **Dabzzo Primary:** `#E68A00` (Warm Heritage Orange)
  - **Canvas & Neutral:** `#FAF8F5` / `#F8FAFC` (Clean Ivory & Slate)
  - **Accent & Status:** Emerald (`#059669` / `#10B981`) for verified kitchens & fleet, Slate (`#0F172A`) for operations.
- **Typography:** Custom Serif brand wordmark hierarchy paired with crisp, accessible sans-serif interfaces.
- **2D Geometry:** Minimalist 2D concentric vector circles, arc accents, and subtle dot-matrix patterns for high-engagement interfaces without muddy gradients.
- **Micro-Animations:** Hardware-accelerated 3-tier metallic tiffin loading animation with soft ambient glow rings and steam wisps.

---

## 👥 Portals & User Roles

### 1. Customer (`user` / `customer`)
- **Daily Meal Subscriptions:** Flexible Lunch, Dinner, and Full-Day meal plans.
- **Weekly Planner & Swaps:** Swap between partner kitchens or pause deliveries with real-time allowance tracking.
- **Live Tracking:** Real-time GPS rider and delivery state tracking with OTP-verified dropoffs.
- **Payment & Credits:** Integrated Razorpay checkout with webhook-verified credit allocations and auto-renewals.

### 2. Kitchen Partner (`vendor`)
- **Prep Schedules:** Automated subscription aggregation into morning & evening kitchen prep batches.
- **Batch Handoffs:** Secure vendor-to-rider handoff with Pickup OTP verification and tiffin count confirmation.
- **Menu & Capacity:** Real-time slot management, active subscriber counts, and daily dish customization.

### 3. Delivery Fleet (`delivery` / `rider`)
- **Proximity Dispatch:** Smart dispatch restricted to a strict 2.0 km radius from the kitchen for freshness.
- **Multi-Order Trips:** Grouped batch pickups with optimized dropoff sequencing.
- **Secure Handoffs:** Dual OTP verification (Pickup OTP from vendor, Drop-off OTP from customer).
- **Earnings Ledger:** Automatic distance and volume-based compensation calculations.

### 4. Admin Operations (`admin`)
- **Command Center:** Live visibility over all active batches, rider locations, and subscriber health.
- **Kitchen & Fleet Approvals:** Granular onboarding review for vendors and rider KYC.
- **Exception Resolution:** Instant flags and resolution workflows for pickup count discrepancies or failed delivery reviews.
- **Financial Reconciliation:** Vendor settlement monitoring, rider payout audits, and Razorpay webhook logs.

---

## ⚙️ Core Business Logic & Cloud Functions

- **Automated Batching (`cronTriggers.ts`):** Aggregates recurring subscriptions into synchronized preparation batches for vendors ahead of meal cut-off times.
- **2.0 km Proximity Dispatch (`matchingTriggers.ts`, `cronTriggers.ts`):** Enforces a strict 2km rider dispatch radius to guarantee fast meal delivery from kitchen to customer.
- **Swap Concurrency (`cronTriggers.ts`):** Resolves pending swap requests synchronously before batch generation to eliminate order collisions.
- **Canonical Orders Consolidation (`deliveryTriggers.ts`):** Centralizes all meal instances under the canonical `orders` collection schema.
- **Server-Side Payment Webhooks (`razorpay/webhook`):** Admin SDK authenticated webhook handler for idempotent payment verification, subscription activation, and credit ledger writes.

---

## 🔒 Security & Data Integrity

- **Firestore Security Rules:** Role-Based Access Control (RBAC) enforcing admin-only writes on sensitive financial and logistics collections (`user_credits`, `payment_history`, `payment_subscriptions`, `subscription_swap_allowances`, `orders`).
- **Serverless API Authentication:** All Razorpay order creation and verification routes authenticate requests using Firebase Admin SDK (`adminAuth.verifyIdToken`).
- **Data Isolation:** Kitchens only access their assigned prep batches; riders only access assigned trips; customers only read their own orders.

---

## 🚀 Development & Deployment

### Prerequisites
- Node.js >= 18.x
- Firebase CLI (`firebase-tools`)

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building & Deploying Multi-App Hosting
```bash
# Build all 5 web apps with static export
node scripts/build-web.mjs

# Deploy Cloud Functions
npx firebase deploy --only functions

# Deploy Firestore Rules
npx firebase deploy --only firestore:rules

# Deploy all 5 Firebase Hosting targets
npx firebase deploy --only hosting
```

### Production Hosting Targets
- **Customer Web App:** [https://dabzo.web.app](https://dabzo.web.app) (`dabzzo.in`)
- **Vendor Portal:** [https://dabzzo-vendor-panel.web.app](https://dabzzo-vendor-panel.web.app)
- **Rider Portal:** [https://dabzzo-rider-panel.web.app](https://dabzzo-rider-panel.web.app)
- **Admin Console:** [https://dabzzo-admin-panel.web.app](https://dabzzo-admin-panel.web.app)
- **Gig / Landing:** [https://dabzzo-gig.web.app](https://dabzzo-gig.web.app)

---

## 📄 License
Private & Proprietary © Dabzzo. All rights reserved.
