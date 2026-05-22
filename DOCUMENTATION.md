# Dabzo v2.0 | Technical Documentation

Dabzo is a premium, mobile-first marketplace for daily meal subscriptions (tiffin services). This documentation provides a comprehensive overview of the architecture, features, and technical implementation details of the project.

---

## 1. Project Overview
Dabzo connects local food vendors with customers looking for consistent, high-quality daily meal plans (Lunch/Dinner). The platform handles the entire lifecycle: from discovery and subscription to daily menu updates and delivery tracking.

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
- **Live Order Tracking**: View real-time location of the delivery partner carrying your daily meal via an integrated interactive map.
- **Profile Management**: Update personal info and profile pictures directly from the native gallery.

### 👩‍🍳 Vendor (Partner)
- **Digital Storefront**: Manage kitchen details, bio, and pricing.
- **Daily Menu Management**: Update what’s cooking today with instant subscriber notifications.
- **Active Deliveries Map**: Track the location of all assigned delivery partners en route with your orders in real-time.
- **Subscriber Insights**: Track active customers and subscription trends.
- **Account Stability**: Session-hardened dashboard that remembers the vendor even after app restarts.

### 🚛 Delivery (Logistics)
- **Task Management**: Real-time list of pickups and deliveries.
- **Continuous Background Tracking**: Leverages Capacitor Geolocation to continuously broadcast live GPS coordinates to Firebase.
- **Interactive Navigation**: In-app map rendering current location and assigned tasks.
- **Status Updates**: Simple, one-tap delivery confirmation (Pending → Delivered).

### 🛡 Admin (Superuser)
- **Fleet Tracking System**: A master map view displaying the live locations of all active delivery personnel across the city.
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
│   ├── shared/   # Reusable UI (Cards, Pills, Toasts)
│   ├── vendor/   # Vendor-specific dashboards
│   └── ui/       # Atom-level components (Buttons, Inputs)
├── lib/          # Core Logic
│   ├── auth/     # Native/Web Auth bridging service
│   ├── queries/  # Firestore data-access layer
│   └── storage/  # Hardened image upload logic
├── store/        # Zustand state (AuthStore, UiStore)
└── types/        # Global TypeScript interfaces
```

### 🔐 Mobile Auth Persistence (The "Bridge")
One of the most complex parts of the app is the **Auth Bridge**. When the app opens on mobile:
1. The **Capacitor Firebase Auth** plugin checks the phone's native keychain for a session.
2. If found, it instantly hydrates the **Zustand AuthStore**.
3. It then signals the **Firebase Web SDK** to ensure the database and storage calls have the correct security tokens.

### 📸 Hardened Image Uploads
To ensure 100% reliability on Android/iOS, we use a custom storage pipeline:
- **Conversion**: Files are read via `FileReader` and converted to `Blob` data.
- **Metadata**: Explicit `contentType` is set to prevent generic binary storage.
- **Resumable**: Uses `uploadBytesResumable` for better handling of shaky mobile networks.
- **Security**: Specific **CORS** policies allow the `https://localhost` origin (the mobile app) to talk to the Firebase bucket.

---

## 5. Deployment & Maintenance

### Web Deployment
```bash
npm run build
firebase deploy --only hosting
```

### Mobile Sync (Capacitor)
```bash
npm run build
npx cap sync android
```

### Key Maintenance Files
- `firestore.rules`: Security logic for database access.
- `storage.rules`: Security logic for image uploads.
- `capacitor.config.ts`: Native app settings (Scheme, App ID).
- `cors.json`: Cross-origin settings for Firebase Storage.

---

## 6. Future Scalability
The project is built using a **Modular Data Layer** (`src/lib/queries`). If you decide to move away from Firebase to a custom backend in the future, you only need to swap out the functions in the `queries` folder—the UI and State logic remain completely unchanged.

---

**Documentation Version**: 2.0.0  
**Author**: Antigravity AI
