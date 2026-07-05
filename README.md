# <p align="center">🍱 Dabzo v2.0 — Smart Meal Subscriptions</p>

<p align="center">
  <img src="public/logo.png" width="180" alt="Dabzo Logo" />
</p>

<p align="center">
  <strong>The premium food marketplace for home-made tiffins and professional meal subscriptions.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Capacitor-8-blue?style=for-the-badge&logo=capacitor" alt="Capacitor" />
  <img src="https://img.shields.io/badge/Firebase-v12-orange?style=for-the-badge&logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

---

## 🚀 Overview

Dabzo v2.0 is a complete architectural overhaul of the original marketplace, transitioned from a legacy vanilla JS stack to a cutting-edge **Next.js 16 (App Router)** and **React 19** foundation.

Designed as a high-fidelity **Single Page Application (SPA)**, it leverages **Capacitor 8** to provide a seamless, native mobile experience on both Android and iOS. The app bridges the gap between home chefs (Vendors) and customers through a robust subscription-based model.

---

## ✨ Features

### 👤 Customer Experience
- **Seamless Onboarding**: Fast phone-based authentication with OTP.
- **Discovery**: Explore local home-made meal services with detailed vendor profiles.
- **Subscription Management**: Weekly/Monthly plans for Lunch, Dinner, or Both.
- **Real-time Menus**: View daily menus updated by vendors.
- **Rating System**: Leave feedback and rate vendors to maintain quality.
- **Skip a Day**: Skip any scheduled delivery for +0.5 credit (up to 4h before delivery).
- **Swap a Day**: Swap a scheduled meal with another active subscriber.
- **Cancel Skip**: Undo a skip before delivery time — deducts 1 subscription day, refunds 0.5 credit.
- **Upcoming Schedule**: Auto-projected delivery cards for the next 2 days, merged with real orders.
- **Countdown Timers**: Live countdown on each card showing time remaining to skip/swap/cancel skip.
- **Track Today's Order**: One-tap banner linking to the live delivery tracking page.

### 👩‍🍳 Vendor Management
- **Smart Dashboard**: Track active subscribers, revenue, and pending deliveries.
- **Menu Management**: Update daily offerings with easy-to-use interfaces.
- **Subscription Plans**: Custom pricing for different meal types and durations.
- **Discount Codes**: Generate promotional codes to attract more customers.
- **Firebase Storage**: Secure image uploads for kitchens and dishes.

### 🚚 Delivery Operations
- **Order Tracking**: View assigned deliveries with real-time status updates.
- **Navigation**: One-click address viewing for streamlined fulfillment.
- **Status Control**: Mark meals as 'Picked Up' or 'Delivered' to notify customers.

### 🛡️ Admin Oversight
- **Vendor Verification**: Manual approval workflow to ensure quality and safety.
- **Push Engine**: Broadcast role-based notifications to all users or specific groups.
- **Support System**: Integrated ticketing system to handle user queries and disputes.

---

## 🛠 Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) | App Router with Static Export (`output: 'export'`) |
| **Runtime** | [React 19](https://react.dev/) | Latest features including improved hooks and hydration. |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) | Modern utility-first CSS with CSS-in-JS capabilities. |
| **State** | [Zustand](https://github.com/pmndrs/zustand) | Lightweight, persistent client-side state management. |
| **Database** | [Firestore](https://firebase.google.com/docs/firestore) | Real-time NoSQL database with offline persistence. |
| **Auth** | [Firebase Auth](https://firebase.google.com/docs/auth) | Native phone authentication support. |
| **Backend** | [Cloud Functions](https://firebase.google.com/docs/functions) | Serverless logic for secure operations (Node 22). |
| **Mobile** | [Capacitor 8](https://capacitorjs.com/) | Native bridge for Android/iOS integration. |
| **Images** | [Firebase Storage](https://firebase.google.com/docs/storage) | Secure asset hosting and retrieval. |

---

## 📦 Project Structure

```bash
├── android/             # Android Studio project files (Capacitor generated)
├── functions/           # Firebase Cloud Functions (Server-side logic)
│   ├── src/             # Logic for notifications, webhooks, and cron jobs
│   └── package.json     # Backend dependencies (Node 22)
├── public/              # Global static assets (logos, icons)
├── resources/           # Mobile-specific assets (Splash screens, Adaptive icons)
└── src/
    ├── app/             # Role-based App Router structure
    │   ├── (admin)/     # Protected Admin dashboard routes
    │   ├── (auth)/      # Login and Registration flows
    │   ├── (delivery)/  # Delivery agent interface
    │   ├── (user)/      # Customer-facing marketplace and profile
    │   └── (vendor)/    # Vendor management tools
    ├── components/      # Atomic UI components and layout wrappers
    ├── hooks/           # Custom React hooks for Firebase & UI logic
    ├── lib/             # Shared utilities, Firebase config, and API wrappers
    │   └── queries/     # Firestore data-access layer
    │       ├── delivery.ts   # Skip, Cancel Skip, Swap logic
    │       ├── swaps.ts      # Swap matching and cancellation
    │       └── subscriptions.ts
    ├── store/           # Zustand stores (Auth, UI, Vendor context)
    └── types/           # Centralized TypeScript interfaces
```

---

## 🏁 Quick Start

### 1. Prerequisites
- Node.js 22+
- Firebase CLI (`npm i -g firebase-tools`)
- Android Studio (for mobile development)

### 2. Installation
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd functions && npm install && cd ..
```

### 3. Environment Setup
Create a `.env.local` file in the root:
```env
# Firebase Client Config (Safe for browser)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dabzofb
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Mobile (Capacitor)
```bash
npm run build
npx cap sync android
npx cap open android
```

---

## 🔄 Skip / Cancel Skip Business Logic

> **IMPORTANT — Do not change this logic without reviewing the full flow.**

### Skipping a Delivery (+0.5 credit)
- User can skip any scheduled delivery up to **4 hours before** the delivery slot.
- A `delivery_orders` Firestore doc is created with `status: 'skipped'`.
- The user is awarded **0.5 credit** (`user_credits` doc with `source: 'cancellation'`, `source_reference_id: deliveryDoc.id`).

### Cancelling a Skip (–1 subscription day, +0.5 credit refund)
- User can cancel a skip any time **before the delivery slot time** passes.
- **Step 1**: The `delivery_orders` doc is restored to `status: 'pending'`.
- **Step 2**: The original 0.5 skip credit is **deleted** (matched by `source_reference_id === delivery.id`, with date-based fallback).
- **Step 3**: The active subscription's `next_billing_date` is **decremented by 1 day** (penalty for reversing).
- **Step 4**: A new **0.5 credit** (`source: 'cancel_skip_refund'`) is added back — the "half that stays".

**Net effect**: User loses 1 subscription day, retains 0.5 credit, and delivery is resumed.

### Anti-abuse protection
- The subscription day is **always deducted** regardless of whether the original credit was redeemed. This prevents skip-cancel cycling for free meals.
- Ghost/orphan skipped orders (no active `subscriptionId` or `vendorId`) are filtered out of the UI automatically.

---

## 📱 Mobile Builds (APK)

The latest debug APK is available in the [releases](./releases) folder.

**To update the APK:**
1. Generate a new build in Android Studio (`Build > Build Bundle(s) / APK(s) > Build APK(s)`).
2. Copy the generated `.apk` from `android/app/build/outputs/apk/debug/` to the `releases/` folder.
3. Commit and push the changes.

> [!TIP]
> For production distribution, consider using GitHub Releases or the Play Store Console.

---

## 🏗 Architecture & Design Patterns

- **Static Export Flow**: Since Capacitor requires static assets, the project uses `output: 'export'` in `next.config.ts`. All routing is handled client-side via the Next.js router.
- **Persistence**: Firestore is configured with `persistentLocalCache`, allowing the app to function partially offline and sync once connectivity is restored.
- **Role-Based Access**: Security is enforced at two levels:
  1. **Frontend**: Middleware and Auth Guards redirect users based on their `role` stored in the Auth Store.
  2. **Database**: Firestore Security Rules prevent unauthorized read/writes based on UID and Role attributes.
- **Projected Orders**: The upcoming schedule is generated client-side by projecting active subscriptions into delivery cards for the next 2 days. Real Firestore docs (created on skip/swap) take priority over projections via slot deduplication.

---

## 🛡 Security & Deployment

- **Vendor Onboarding**: Vendors are created with `is_approved: false`. Access to the marketplace is blocked until an Admin manually updates their status.
- **Notification Engine**: The `broadcastNotificationV1` Cloud Function ensures that only authenticated Admins can trigger system-wide alerts.
- **Firestore Rules**: Delivery orders can only be created/updated by the `customerId`, `vendorId`, or `agentId`. Delete is admin-only.
- **Production Builds**: The project is optimized for deployment on Vercel (Web) and via Play Store/App Store (Mobile).

---

<p align="center">
  Developed with ❤️ by the Dabzo Team.
</p>
