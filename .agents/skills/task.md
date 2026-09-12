# DABZZO — Security Hardening & Product Completion Tasks

## 🔴 Phase 1: CRITICAL Security Fixes
- [x] Fix storage.rules — require auth, add size/type limits
- [x] Fix firestore.rules — close all 19 security holes
- [x] Delete `_clear-trips` API route
- [x] Fix `create-subscription` API — add auth, validation, rate limiting
- [x] Fix `webhook` API — idempotency, body size limit, dedicated webhook secret
- [x] Fix auth-service.ts — restrict reCAPTCHA bypass to localhost only

## 🟠 Phase 2: DOS Protection & Rate Limiting
- [x] Create Next.js middleware (rate limit, security headers, body size cap)
- [x] Harden next.config.ts — security headers, strict mode
- [x] Fix Cloud Functions auth: `broadcastNotificationV1`, `assignRiderTrips`, `regeneratePickupOTP`

## 🟡 Phase 3: Bug Fixes & Data Integrity
- [x] Fix cronTriggers.ts — uncomment slot logic, remove test hardcode
- [x] Fix swaps.ts — wrong collection reference, async forEach bug
- [x] Fix delivery.ts queries — wrong field names, legacy collection refs
- [x] Fix admin.ts queries — full-collection scan, hardcoded revenue
- [x] Fix authTriggers.ts — prevent admin self-promotion
- [x] Fix matchingTriggers.ts — add auth to `regeneratePickupOTP`
- [x] Fix index.ts — add admin check to `broadcastNotificationV1`

## 🟢 Phase 4: Enhanced Vendor Management
- [x] Create `vendorAdmin.ts` query module
- [x] Create vendor detail page `[vendorId]/page.tsx`
- [x] Enhance vendors list page — search, metrics, suspend toggle, batch actions

## 🔵 Phase 5: Cleanup & Hardening
- [x] Create input validation utilities
- [x] Clean up .gitignore
- [x] Delete/move ~35 loose test scripts
- [x] Move Firebase config to env vars
