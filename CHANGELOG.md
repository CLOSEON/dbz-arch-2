# Changelog

Tracks every change made under [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), one entry per phase. Newest first.

Format per entry: date, phase, files added/changed/removed, and the reason — enough for someone who wasn't in the room to understand what happened and why without re-deriving it.

---

## 2026-09-12 — Phase 1 complete: shared packages, −46,000 lines

Five shared packages now hold everything that must stay consistent across the five apps. Net effect across parts 1–7: **~46,000 lines removed**, with every step verified by typecheck on all 5 apps plus a real static-export build of all 5.

| Package | Holds |
|---|---|
| `@dabzzo/shared-types` | `AppUser`, `Subscription`, `Order`, `Batch`, delivery + payout types |
| `@dabzzo/shared-auth` | Firebase client init, auth-service, AuthGuard, AuthProvider |
| `@dabzzo/shared-lib` | pricing, geo, storage, haptics, notifications, offline queue, all 5 Zustand stores |
| `@dabzzo/shared-queries` | the 18-module Firestore data-access layer |
| `@dabzzo/shared-ui` | 37 shared components incl. a parameterized `Logo` |

### Real bugs found by reconciling the forks

These were not cleanliness problems — each was a live inconsistency between apps:

1. **Weekly pricing mismatch.** `admin-panel`'s `pricing.ts` lacked the weekly-plan formula that `web-main` *and* the server-side `functions/src/pricingEngine.ts` implement. Verified against the server (the actual charging authority): admin computed weekly prices ~₹0.40/meal below what customers are charged.
2. **Cross-portal access gap.** Each app's `auth-guard` applied only its *own* extended-role rule. `vendor-panel` and `rider-panel` both gate with `allowedRoles={[…, 'admin']}`, but neither understood `role === 'superadmin'` — so such a user could reach admin-panel and nowhere else. Now every rule applies to every role named in `allowedRoles`.
3. **`BatchStatus` missing a state.** `vendor-panel`'s copy uniquely had `'picked_up'`, which its own dashboard keys a `Record<BatchStatus, …>` on. The other four copies lacked it.
4. **Unhardened image URLs.** `vendor-panel`'s `getImageUrl` lacked the null-safety and the guard stopping localhost/emulator URLs rendering on production domains.
5. **Build script reported success on failure.** `scripts/build-web.mjs` printed "🎉 completed successfully" even when an app's build failed (it set `exitCode` but printed the banner unconditionally). An intermediate build during this work failed for rider-panel and still ended green. Also fixed: an unknown app name exited 0.
6. **`export *` drops default exports.** Four components are loaded via `next/dynamic()`, which needs the default. Caught by typecheck before shipping.

### Judgement calls, made explicitly

- **Which copy is canonical** was usually decided by *which one actually runs*, not which looked newer. `getVendorStats` and `forceFormBatches` are called only by admin-panel; three apps carried different, never-executed versions. Adopting the more elaborate `getVendorStats` because it "looked better" would have silently changed live vendor financial reporting.
- **Cache TTLs in `users.ts`** were a genuine conflict with no right answer: 5 minutes in three apps, 20 seconds in rider-panel (riders read this mid-delivery). Rather than pick, TTLs are configurable with the 5-minute default; rider-panel opts in via `configureUserCacheTTLs()` in `RiderAppShell.tsx`.

### 11,671 lines of dead code removed

A reachability scan showed nearly every remaining "drifted duplicate" was simply dead: when four apps were bootstrapped by copying one into three, every app got every component, but each is imported by exactly one. `AdminNav` only by admin-panel, `PaymentModal` only by web-main, `TodayMenuCard` only by vendor-panel, and so on.

Two false-positive classes were corrected before anything was deleted: a static-import-only scan wrongly marked `RiderTrackingCard` dead (it is loaded via `next/dynamic()` in web-main), and substring matching flagged `DeliveryNav` because of `useDeliveryNavigation`.

Source files per app afterwards: web-main 99, admin-panel 76, vendor-panel 60, rider-panel 47, gig 2.

---

## 2026-09-12 — Phase 1 (continued): shared AuthGuard

Consolidated the 4 drifted `auth-guard.tsx` copies (web-main, admin-panel, vendor-panel, rider-panel — `gig` never had one) into `packages/shared-auth/src/auth-guard.tsx`, replacing what was actually a dead no-op stub there before (the pre-existing `AuthGuard` in `shared-auth` rendered `children` unconditionally with no role check at all — never wired up to any app, but would have been a real security bug if it had been).

**Real gap found and fixed, not just deduplicated:** each app had grown its own "extended role membership" rule beyond a flat `role` string check — admin-panel treated `role === 'superadmin'` or `roles.admin === true` as admin; vendor-panel treated `roles.vendor.status === 'verified'` or `roles.vendor === true` as vendor; rider-panel treated `role === 'delivery_agent'` or `roles.delivery` as delivery. But each guard only applied *its own* app's rule. Concretely: `vendor-panel` and `rider-panel` both call `<AuthGuard allowedRoles={['vendor'|'delivery', 'admin']}>` — intending admins to reach every portal — but neither guard's `admin` check understood `role === 'superadmin'`, only admin-panel's did. **A user with `role: 'superadmin'` (as opposed to the hardcoded-email or `is_superadmin: true` paths, both of which every guard already handled) could reach admin-panel but not vendor-panel or rider-panel**, despite both explicitly listing `'admin'` in `allowedRoles`. Fixed by applying every extended-membership rule to every role named in `allowedRoles`, not just the app's "home" role — a deliberate widening of access to match what each call site already declared as intent, never a narrowing. Documented inline in the shared component; flagging here since it's a real behavior change, not silent.

Also: `roles` (the multi-role membership map every guard read via `(user as any)?.roles?.x`) was never actually declared on the `AppUser` type — added it properly to `@dabzzo/shared-types` now that a real typed consumer (`AuthGuard`) exists, removing the need for those `any` casts at the type level.

Each app keeps a ~25-line wrapper (`apps/<app>/src/lib/auth/auth-guard.tsx`) that reads its own Zustand store and forwards to the shared component with its own loading-screen copy/color (e.g. admin-panel's dark `bg-slate-950` vs. the others' `bg-ivory`) — the only thing that stayed a per-app fork is presentation, not the security logic. `rider-panel`'s guard also previously computed its `isAllowed` check twice (once in a `useEffect`, once again in the render bail-out) — two copies that happened to agree but could have silently drifted; the shared version computes it once.

**Verified:** typecheck clean on all 5 apps (gig unaffected, has no guard); full builds of web-main, admin-panel, vendor-panel, and rider-panel all succeed.

**Files:** `packages/shared-auth/src/auth-guard.tsx` (rewritten from dead stub), `packages/shared-types/src/index.ts` (`AppUser.roles` added), `apps/{web-main,admin-panel,vendor-panel,rider-panel}/src/lib/auth/auth-guard.tsx` (rewritten as thin wrappers).

---

## 2026-09-12 — Phase 1 (started): shared types + dead-code removal

**`@dabzzo/shared-types` created** — the first of the shared packages the plan calls for. Reconciled the 4 drifted copies of `types/index.ts` into one canonical file at `packages/shared-types/src/index.ts`.

Did this rigorously, not by picking one app's file and hoping: extracted every union type and every interface's field set from all 5 apps' copies and diffed them structurally (script-assisted, not eyeballed) rather than relying on whole-file diffs, which had already misled the earlier planning pass once (see below). Findings:
- All divergences were additive (a narrower app missing fields a wider app had) with **one real conflict**: `vendor-panel`'s `BatchStatus` uniquely included `'picked_up'` — actual code in `apps/vendor-panel/src/app/dashboard/page.tsx` keys a `Record<BatchStatus, ...>` on it. Every other app's copy was missing this value. This is the exact class of bug flagged as a risk in `IMPLEMENTATION_PLAN.md` §2.1 — confirmed real, not hypothetical, and merged in rather than dropped.
- `web-main`'s copy (652 lines) turned out to be the most complete base, not a strict superset as first assumed from a shallower diff — `vendor-panel`'s `picked_up` was the exception. Corrected before merging, not after.
- Every app's `src/types/index.ts` is now a 6-line re-export of `@dabzzo/shared-types` — import call sites (`import { AppUser } from '@/types'`) are unchanged across the whole codebase, only what `@/types` resolves to changed.
- **Verified:** all 5 apps typecheck clean; full builds of `web-main`, `admin-panel`, and `vendor-panel` (the one with the real dependency on `picked_up`) succeed.
- Side effect: web-main's lint errors dropped 369 → 365 (the 4 `no-explicit-any` hits that lived in the old per-app `types/index.ts` no longer exist there).

**Dead code removed (D3, D5 from the plan, both re-confirmed zero call sites immediately before deleting):**
- `RazorpayButton.tsx` + `useRazorpay.ts` — 8 files across all 4 client apps. Confirmed dead everywhere, including web-main, where the real checkout path is `PaymentModal.tsx` → `lib/razorpay.ts` directly.
- `lib/firebaseAdmin.ts` — 4 files, zero imports anywhere.
- `firebase-admin` + `razorpay` npm dependencies removed from all 4 client apps' `package.json`. Root `package.json` keeps `firebase-admin` (genuinely used by 7 scripts under `scripts/` that run at the repo root, e.g. `bootstrap-admin.mjs`) but drops `razorpay` (unused anywhere at root).
- **Verified:** typecheck clean, full builds of `web-main` and `admin-panel` succeed post-removal.

**Root workspace `npm audit`:** 30 → 11 vulnerabilities via non-breaking `npm audit fix`. Remaining 11 (1 critical, 2 high, 8 moderate) all trace back to the pinned `next@16.2.6` (and its `postcss`/`sharp` build-tooling chain) — deliberately **not** force-upgraded mid-refactor, since `next` is exact-pinned across every app and a version bump needs its own isolated testing pass, not to be folded into a types/dead-code cleanup. Tracked as a dedicated near-term task, not silently deferred.

**Files:** `packages/shared-types/` (new — `package.json`, `tsconfig.json`, `src/index.ts`, `README.md`); all 5 apps' `src/types/index.ts`, `package.json`, `next.config.ts` (modified); `RazorpayButton.tsx` × 4, `useRazorpay.ts` × 4, `firebaseAdmin.ts` × 4 (deleted); root `package.json` (modified).

---

## 2026-09-12 — Phase 0: Safety net

**Baseline established:**
- `git init` + baseline commit `9a04ece` (804 files, everything as of session start, nothing changed yet).
- `.gitignore` hardened: added `android/.idea/`, `android/local.properties`, `android/app/build/`, `ios/App/Pods/`, `*.iml`, `.xcuserstate` and related IDE/build-artifact patterns not previously covered.
- `npm --prefix functions install` (529 packages) — `functions/` had never been installed, which is why its `tsc --noEmit` appeared broken. Confirmed clean once installed.
- `npm audit fix` (non-breaking) on `functions/`: 22 → 13 vulnerabilities. Eliminated 1 critical (`websocket-driver`) and all 6 high-severity findings. Remaining 13 moderate are all transitively pinned by `firebase-admin`'s dependency tree on an old `uuid`; fixing those needs a `firebase-admin` major version bump, deliberately deferred (not done silently — would need testing against the actual Cloud Functions before landing).
- `functions` test baseline: 47/47 passing across 3 suites (`deliveryRedesign`, `deliveryTriggers`, `pricingEngine`). A 4th file, `integration.test.ts`, is excluded from the build — see finding below.
- Added `typecheck` npm script to all 5 apps and to `functions/`; added root `npm run verify` (`typecheck:apps` + `typecheck:functions` + `lint:apps` + `test:functions`) as the one command that answers "is anything broken."
- Added `.env.example` (repo root) and `functions/.env.example` — keys only, documents which vars are client-safe vs. server-only-never-NEXT_PUBLIC.
- **Files:** `.gitignore`, `package.json` (root + 5 apps + functions), `.env.example`, `functions/.env.example` — new.

### 🔴 Critical, fixed immediately: hardcoded live Razorpay secrets in source

**Found:** `functions/src/razorpayFunctions.ts` had three `process.env.X || 'literal'` fallbacks using real, live values:
- `RAZORPAY_KEY_ID` → a live (`rzp_live_...`) key id
- `RAZORPAY_KEY_SECRET` → the paired API secret
- `RAZORPAY_WEBHOOK_SECRET` → the webhook HMAC signature secret (also readable via a `NEXT_PUBLIC_*`-named var, which would have leaked it into the browser bundle had anyone ever set that variant)

Anyone who could read this source file had live payment-gateway API access and could forge webhook signatures to fabricate "payment succeeded" events.

**Fixed:** all three fallbacks removed. Each now throws (`HttpsError('failed-precondition', ...)`) or returns `500` if the real env var is missing, instead of silently authenticating with an exposed value. Verified: `functions` typecheck clean, 47/47 tests still pass.

**⚠️ Outstanding, requires you:**
1. Rotate both the Razorpay API key secret and the webhook secret in the Razorpay dashboard — treat the old ones as compromised regardless of git history, since they were plaintext in a source file.
2. Before deploying this fix, confirm `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are actually configured in the deployed Cloud Functions environment (`firebase functions:secrets:access RAZORPAY_KEY_SECRET`, or the Firebase console). If they aren't, this fix will make live payments/webhooks start failing the moment it ships — right now they're silently authenticating with the leaked literal instead.

**Files:** `functions/src/razorpayFunctions.ts` — modified.

### 🟠 Root `.env`/`.env.local` never reached any app's build

**Found:** Next.js reads `.env`/`.env.local` from `process.cwd()`. Every app under `apps/*` builds with its own directory as cwd, and none had its own `.env` file — so the root `.env` was inert. The gap was masked by a hardcoded Firebase-project-config fallback baked into `lib/firebase.ts` in all 4 client apps (same anti-pattern as the Razorpay finding, lower severity since Firebase web config isn't secret — but it meant a prior claim in `.agents/skills/task.md` ("Move Firebase config to env vars") wasn't actually true in practice, and a staging/dev build with different env vars would have silently written to production Firestore instead).

**Fixed:**
- New `scripts/sync-env.mjs` copies root `.env`/`.env.local` into each `apps/*` directory (gitignored copies, never committed).
- Wired into every app's `predev`/`prebuild` npm scripts, and into `scripts/build-web.mjs` directly (it calls `next build` via `execSync`, bypassing npm lifecycle hooks).
- Removed the hardcoded Firebase config literal from all 4 apps' `lib/firebase.ts`; replaced with a `requireEnv()` helper that fails loudly on a missing var instead of silently substituting another project's config.
- **Verified end-to-end:** rebuilt all 5 apps from a clean env sync — all succeeded; build logs confirmed `Environments: .env.local, .env` were actually loaded.

**Files:** `scripts/sync-env.mjs` (new), `scripts/build-web.mjs`, `apps/{web-main,admin-panel,vendor-panel,rider-panel}/src/lib/firebase.ts`, all 5 apps' `package.json` — modified.

### 🟡 `eslint.config.mjs` global ignores didn't actually match per-app builds

**Found:** the root `eslint.config.mjs`'s `globalIgnores(['.next/**', 'out/**', 'build/**'])` is resolved relative to the *config file's* directory (repo root), not the invoking cwd. Every app's `"lint": "eslint"` script runs with cwd = `apps/<name>` (via npm workspaces), so those patterns never matched `apps/<name>/out/**` or `apps/<name>/.next/**` at all. As long as no build had run yet in the working tree, this was invisible — nothing existed there to lint. The moment a build runs (exactly what a CI pipeline does before or after lint), a plain `npm run lint` scans the entire minified build output as source: verified this inflates web-main's lint run from 369 errors / 215 warnings to **1,944 errors / 24,104 warnings** on the same source tree.

**Fixed:** patterns changed to `**/.next/**`, `**/out/**`, `**/build/**`, `**/next-env.d.ts` (leading `**/` matches at any depth regardless of invocation directory). Verified: re-ran lint on web-main immediately after a full build — back to 369/215, matching the true source-only baseline.

**Files:** `eslint.config.mjs` — modified. **This would otherwise have broken CI the first time it ran lint after a build**, exactly the scenario Phase 6 (deployment readiness) is meant to catch — caught now instead.

### 🟡 `functions/src/__tests__/integration.test.ts` is orphaned, not just untested

Imports `../../src/lib/queries/{delivery,swaps,credits}` and the *client* `firebase/firestore` SDK — none of which exist under `functions/src/`; those paths and APIs belong to the web apps' query layer (`apps/*/src/lib/queries/*.ts`). It cannot compile from where it sits, which is why `tsconfig.test.json` explicitly excludes it. No app in the monorepo has Jest configured at all, so this file currently has no valid home. Not fixed yet — deferred to Phase 4, documented here rather than left silently excluded.

### Repo-wide lint baseline (post-eslint-config-fix, source only)

| App | Errors | Warnings | Total |
|---|---|---|---|
| web-main | 369 | 215 | 584 |
| admin-panel | 296 | 227 | 523 |
| vendor-panel | 241 | 99 | 340 |
| rider-panel | 230 | 88 | 318 |
| gig | 6 | 1 | 7 |
| **Total** | **1,142** | **630** | **1,772** |

### `npm run verify` redesigned mid-Phase-0

The first version chained steps with `&&`, so a failing `lint:apps` (which is currently guaranteed, given the table above) silently prevented `test:functions` from ever running — the opposite of what a "tell me everything that's broken" script should do. Replaced with `scripts/verify.mjs`, which runs all four steps unconditionally and prints a pass/fail summary at the end, exiting non-zero only if something failed. **Files:** `scripts/verify.mjs` (new), `package.json` (`verify` script now calls it).

No code changes made to app source logic yet beyond the security fixes above — Phase 1 (canonicalize shared code) has not started.
