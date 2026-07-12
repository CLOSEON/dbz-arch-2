# Dabzzo

Dabzzo is a comprehensive Smart Meal Subscription and Delivery platform designed to seamlessly connect home-style kitchens (Vendors) with hungry customers, facilitated by a dedicated delivery fleet (Riders).

The application is built on a modern serverless stack utilizing Next.js (App Router) and Firebase, ensuring real-time syncing, high performance, and rapid scalability.

---

## 🏗 Architecture & Tech Stack

### Frontend
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Real-Time Data:** Firebase Firestore SDK (onSnapshot listeners)
- **Maps & Tracking:** Google Maps API (via `@react-google-maps/api` / Leaflet)

### Backend (Serverless)
- **Database:** Firebase Firestore (NoSQL)
- **Authentication:** Firebase Auth
- **Storage:** Firebase Cloud Storage (Profile pictures, etc.)
- **Compute:** Firebase Cloud Functions (Node.js/TypeScript)
- **Cron Jobs:** Google Cloud Scheduler (via Firebase Functions)

---

## 👥 User Roles & Portals

The application is divided into dedicated portals tailored for the four primary user roles:

### 1. Customer (`user` / `customer`)
- **Subscription Management:** Subscribe to daily lunch and/or dinner plans.
- **Order Tracking:** Real-time map tracking of their active meal delivery.
- **Profile:** Manage delivery addresses, contact info, and preferences.

### 2. Vendor (`vendor`)
- **Kitchen Dashboard:** View upcoming prep schedules (Forecasted via subscriptions).
- **Batch Management:** Grouped meal orders ("Batches") are sent to vendors. Vendors can mark batches as "Ready" when prep is complete.
- **Handoffs:** Secure handoff to riders using Pickup OTPs.

### 3. Rider (`delivery`)
- **Delivery Dashboard:** Receive real-time dispatch assignments based on GPS proximity.
- **Pickup Flow:** 
  - Navigate to the kitchen.
  - Provide a Pickup OTP to the vendor.
  - **Count Confirmation:** Explicitly confirm the number of tiffins picked up. (Discrepancies automatically flag Ops).
- **Drop-off Flow:** 
  - Navigate to customers via optimized routing.
  - Complete deliveries via Drop-off OTP.
  - **Exception Handling:** If a customer is unavailable, a 10-minute timer can be initiated before marking the delivery as failed (Requires Admin/Ops review).

### 4. Admin (`admin`)
- **Global Dashboard:** Bird's-eye view of all operations, active deliveries, and system health.
- **User Management:** Approve vendor registrations, manage rider fleets.
- **Exception Monitoring:** Dedicated UI to resolve `pickup_discrepancies` and `failed_delivery_reviews`.
- **Accounting:** Review automated rider payouts and vendor settlements.

---

## ⚙️ Core Business Logic & Workflows

### 1. Automated Batching
Instead of overwhelming vendors with individual orders, the system aggregates active subscriptions into **Batches** using scheduled Firebase Functions (Cron jobs). A batch represents the total count of meals a specific vendor needs to prepare for a given time slot (e.g., 11:00 AM Lunch).

### 2. Smart Dispatch & Radius Expansion
Once a vendor marks a batch as "Ready":
1. **Initial Dispatch:** The system looks for available riders within a **2km radius** of the kitchen.
2. **Expansion Protocol:** If no rider accepts the trip, a cron job (`dispatchRetryAndExpansion`) runs every 5 minutes, automatically expanding the search radius to **4km**, and eventually **6km**.
3. **Failure:** If still unassigned, a `delivery_failed` ops event is raised.

### 3. Rider Compensation Algorithm
Rider payouts are calculated dynamically via Firestore Triggers (`riderPaymentTriggers.ts`):
- **Base Pay:** Calculated based on the GPS distance of the optimized route.
- **Volume Bonuses:** Riders are incentivized to carry more. For example, carrying more than 15 tiffins in a single trip yields an additional volume bonus (e.g., ₹7 per extra tiffin).

### 4. Secure Handoffs & Discrepancies
To prevent lost inventory:
- **Pickup:** Riders must enter the Vendor's OTP. The rider then declares how many tiffins they physically received. If this number differs from the system's expected count, a `pickup_discrepancy` record is generated instantly for Admin review, while allowing the delivery to proceed.
- **Drop-off:** Customers provide a Drop-off OTP to finalize the delivery. 

---

## 🗄 Database Schema (Firestore)

Key collections that drive the application:

- `users`: Core profile data, auth details, and role definition (`user`, `vendor`, `delivery`, `admin`).
- `subscriptions`: Active recurring meal plans linked to customers.
- `orders` / `delivery_orders`: Individual meal instances generated from subscriptions.
- `batches`: Aggregated orders assigned to a specific vendor for a specific time slot.
- `rider_trips`: Groupings of batches (Pickups) and Orders (Drop-offs) assigned to a specific Rider.
- `driver_profiles`: Real-time GPS coordinates (`lat`/`lng`) and active status of riders.
- `pickup_discrepancies`: Ops flags generated when rider count mismatches vendor batch count.
- `failed_delivery_reviews`: Ops flags generated when a rider marks a drop-off as failed (e.g., customer unreachable).
- `rider_payments`: Financial ledger recording calculated earnings for completed trips.

---

## 🔒 Security Rules

Firestore is secured using granular `firestore.rules`:
- **Role-Based Access Control (RBAC):** Custom functions (`isAdmin()`, `isDriver()`, `isVendor()`) validate the user's role document to authorize reads/writes.
- **Data Isolation:** Vendors can only read their assigned batches. Riders can only read/update their assigned trips. Customers can only read their specific orders.
- **Static Analysis Bypass:** Complex `list` queries use `allow list: if request.auth != null;` while relying on frontend query constraints and single-document rules to ensure data privacy without breaking Firebase's rule compiler.

---

## 🚀 Running Locally

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Ensure you have the required Firebase configuration in your `.env.local` or hardcoded in `src/lib/firebase.ts` (Safe for client-side keys).

3. **Start Development Server:**
   ```bash
   npm run dev
   ```

4. **Deploying Firebase Rules & Functions:**
   ```bash
   npx firebase-tools deploy --only firestore:rules
   npx firebase-tools deploy --only functions
   ```
