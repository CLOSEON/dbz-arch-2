# Dabzzo v2 — Context Guide for AI Agents

Orientation for anyone (human or agent) working in this repo. Start here, then read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for what's in flight and [CHANGELOG.md](CHANGELOG.md) for what changed and why.

> **This file was rewritten on 2026-09-12.** The previous version documented a single-app `src/` tree that hadn't existed since the monorepo split — every path in it was wrong. If you find a doc here contradicting the code, trust the code and fix the doc.

---

## What Dabzzo is

A meal subscription and delivery platform connecting home-style kitchens (vendors) with customers, served by a rider fleet.

- **Framework:** Next.js 16 (App Router, `output: 'export'` — static export, no server)
- **Backend:** Firebase — Auth, Firestore, Storage, Cloud Functions
- **Mobile:** Capacitor 8 wrapping the `web-main` build
- **State:** Zustand · **Styling:** Tailwind 4 · **Payments:** Razorpay

---

## Repository layout

```
apps/                     five independently-built Next.js apps
  web-main/      customer portal   -> dabzzo.in
  admin-panel/   ops console
  vendor-panel/  kitchen portal
  rider-panel/   delivery fleet
  gig/           marketing landing
packages/                 shared code — see the rule below
  shared-types/    the data model (AppUser, Subscription, Order, Batch, …)
  shared-auth/     Firebase client init, auth-service, AuthGuard, AuthProvider
  shared-lib/      pricing, geo, storage, notifications, offline queue, Zustand stores
  shared-queries/  the 18-module Firestore data-access layer
  shared-ui/       37 shared components
  firestore-rules/ security rules + indexes (firebase.json deploys from here)
functions/                Cloud Functions (13 exported groups)
scripts/                  build, env-sync, and ops scripts
```

### The one rule that matters

**Do not fork shared code back into an app.** These four apps were originally created by copying one into three, and by 2026-09-12 that had produced four different definitions of `AppUser`, four different auth guards, and pricing logic that disagreed with the server about what to charge. Roughly 46,000 lines were removed consolidating it.

If an app needs something the others don't, **add it to the shared package** — either as a field every app carries harmlessly, or as an explicit prop/config. Both patterns are already in use:

- `AuthGuard` takes `allowedRoles` plus per-app loading copy; the role logic is shared.
- `Logo` takes branding props; the markup is shared.
- `AuthProvider` takes a `superadmin` provisioning config; the auth flow is shared.
- `users.ts` cache TTLs are configurable — rider-panel opts into a shorter window in `RiderAppShell.tsx`.

Each app's `src/lib/**` and `src/types/**` files are mostly thin re-exports so existing `@/…` import paths keep working. Edit the package, not the re-export.

---

## Roles and portals

| Role | Portal | Does |
|---|---|---|
| `user` | web-main | Subscribes, tracks deliveries, skips/swaps meals |
| `vendor` | vendor-panel | Menus, prep batches, OTP handoff to riders |
| `delivery` | rider-panel | Trips, GPS, OTP pickup/dropoff, earnings |
| `admin` | admin-panel | Approvals, logistics, reconciliation |

Roles aren't always a flat string. A user may carry a `roles` map (`roles.admin`, `roles.vendor.status === 'verified'`, `roles.delivery`), and `delivery_agent` is a legacy alias for `delivery`. All of that is handled in one place — `packages/shared-auth/src/auth-guard.tsx`. Don't re-implement it.

A hardcoded superadmin email (`closeon.st@gmail.com`) is treated as privileged both client-side and in `firestore.rules`. On sign-in each portal auto-provisions that account into its own role. **This writes to production Firestore**, and vendor/rider variants seed placeholder verification data — see decision D6 in the plan.

---

## Core flows

```
Customer subscribes
  -> subscription doc (status 'active')
  -> cron aggregates active subscriptions into per-vendor prep batches
  -> vendor marks batch ready
  -> dispatch searches for a rider within 2 km, widening on failure
  -> rider enters vendor's pickup OTP, confirms tiffin count
       mismatch -> pickup_discrepancy doc (admin alert)
  -> rider enters customer's dropoff OTP
  -> order 'delivered'; rider payment computed (distance x rate + volume bonus)
```

Order states: `created → vendor_notified → vendor_preparing → vendor_ready → rider_assigned → rider_en_route_pickup → picked_up → out_for_delivery → delivered`, plus `skipped`, `swapped_out/in`, `failed`, `cancelled`.

**Watch out:** `DeliveryStatus` is exported from *two* modules with *different* meanings — `@dabzzo/shared-types` has a legacy 4-value union (marked deprecated), `@dabzzo/shared-types/delivery` has the current 10-value pipeline union. Import from the right one.

---

## Key constraints

**Static export.** `output: 'export'` means no server at runtime. No server components with runtime data, no route handlers, no middleware — `proxy.ts` was removed in Phase 2 precisely because it looked like it was enforcing rate limits and never ran. All data fetching is client-side via the Firestore SDK. The only server-side code is Cloud Functions.

**Env vars come from the repo root.** Next.js reads `.env` from its own cwd, and each app builds in its own directory, so `scripts/sync-env.mjs` copies root env files down before dev/build (wired via `predev`/`prebuild` and `build-web.mjs`). A missing `NEXT_PUBLIC_FIREBASE_*` throws at build rather than silently falling back.

**Security boundary is Firestore rules + Cloud Functions**, never client checks. `AuthGuard` is UX; it decides what to render, not what's permitted. Rules live in `packages/firestore-rules/`.

**Pricing authority is the server.** `functions/src/pricingEngine.ts` recomputes order amounts from Firestore rules; the client cannot set a price. If client and server pricing ever disagree, the server is right — that's how a real ₹0.40/meal discrepancy in admin-panel was found.

**Dynamic routes are awkward** under static export + Capacitor. Prefer query params (`/orders?id=123`).

---

## Working here

```bash
npm install
npm run dev:web          # or dev:admin / dev:vendor / dev:rider / dev:gig
npm run verify           # typecheck x5 + functions typecheck + lint + functions tests
node scripts/build-web.mjs [app]
```

`npm run verify` runs every step unconditionally and prints a summary. **Lint is currently red** (~1,142 errors, mostly `no-explicit-any` on untyped Firestore reads) — that's known and tracked as Phase 3, not something you broke.

To deploy, see [DEPLOYMENT.md](DEPLOYMENT.md) — read the blockers at the top first.

### Adding a feature

1. Types → `packages/shared-types`
2. Queries → `packages/shared-queries` (one module per domain)
3. Shared UI → `packages/shared-ui`; app-specific UI stays in the app
4. Route → `apps/<app>/src/app/…`, wrapped in `AuthGuard`
5. Rules → `packages/firestore-rules/firestore.rules`, tested against the emulator

### Things that will bite you

- `export *` does **not** re-export a default. Four components load via `next/dynamic()` and need `export { default }` too.
- ESLint ignore patterns in `eslint.config.mjs` resolve relative to the **config file**, not cwd. They need a `**/` prefix or a post-build lint scans the whole minified bundle.
- Before deleting anything as unused, check `next/dynamic()` and `import()` — a static-import-only scan wrongly flagged a live component as dead.
- The root `tsconfig.json` maps `@/*` ambiguously and reports false errors across apps. Typecheck per app (`npm run typecheck:apps`), never from the root.
