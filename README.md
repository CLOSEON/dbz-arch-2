# <p align="center">🍱 Dabzo v2.0 — Smart Meal Subscriptions</p>

<p align="center">
  <img src="public/logo.png" width="180" alt="Dabzo Logo" />
</p>

<p align="center">
  <strong>The ultimate food marketplace for home-made tiffins and meal subscriptions.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Capacitor-8-blue?style=for-the-badge&logo=capacitor" alt="Capacitor" />
  <img src="https://img.shields.io/badge/Firebase-v9-orange?style=for-the-badge&logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

---

## 🚀 Overview

Dabzo is a modern, high-performance marketplace designed to bridge the gap between home chefs (Vendors) and hungry customers. Built as a high-fidelity Single Page Application (SPA) and wrapped for **Native Mobile (Android/iOS)** using Capacitor, Dabzo delivers a premium, native-feeling experience with the speed of the web.

### ✨ Key Features

- **📱 Native-First Experience**: Smooth transitions, haptic feedback, and custom splash screens/icons.
- **🔔 Real-time Push Notifications**: Powered by Firebase Cloud Functions (v1) for role-based broadcasts.
- **🔐 Multi-Role Architecture**: Dedicated dashboards for **Customers**, **Vendors**, **Delivery**, and **Admin**.
- **💳 Smart Subscriptions**: Manage daily, weekly, and monthly meal plans with ease.
- **⚡ Blazing Fast**: Next.js 15 App Router with optimized static exports.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | [Next.js 15](https://nextjs.org/) (App Router) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) & [Vanilla CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) |
| **Backend/DB** | [Firebase](https://firebase.google.com/) (Firestore, Auth, Storage) |
| **Serverless** | [Firebase Cloud Functions](https://firebase.google.com/docs/functions) (Node 22) |
| **Mobile Bridge** | [Capacitor 8](https://capacitorjs.com/) |

---

## 📦 Project Structure

```bash
├── android/             # Android Native Project (Capacitor)
├── functions/           # Firebase Cloud Functions (Backend Logic)
├── public/              # Static Assets (Logo, Images)
├── resources/           # App Icon & Splash Screen Assets
└── src/
    ├── app/             # App Router Pages (Grouped by Role)
    ├── components/      # UI & Shared Components
    ├── lib/             # Business Logic, Firebase & Auth
    ├── store/           # Zustand State Management
    └── types/           # Global TypeScript Interfaces
```

---

## 🏁 Quick Start

### 1. Installation
```bash
npm install
cd functions && npm install
```

### 2. Development
```bash
npm run dev
```

### 3. Mobile Build (Android)
```bash
npm run build
npx cap sync android
# Open in Android Studio
npx cap open android
```

---

## 🛡 Security & Deployment

- **Admin Oversight**: Vendors must be manually approved by an admin before appearing on the marketplace.
- **Push Engine**: Notifications are triggered securely via server-side Cloud Functions to prevent client-side abuse.
- **Vercel Ready**: Optimized for Vercel deployment with automated edge caching.

---

<p align="center">
  Developed with ❤️ by the Dabzo Team.
</p>
