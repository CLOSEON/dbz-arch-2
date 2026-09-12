# Dabzzo v2 — Implementation Plan (Fix, Harden, Deploy)

**Status:** Draft for review · **Owner:** Engineering · **Generated:** 2026-09-12
**Scope:** Get the 5-app monorepo + Cloud Functions backend from "feature-complete, drifted, undocumented" to "verified, deduplicated, deployment-ready."

This document is the single source of truth for the work. Every phase lists exact files touched, why, and what "done" looks like. As phases land, tick the checkboxes and log the change in [CHANGELOG.md](CHANGELOG.md).

---

## 0. Baseline — what's actually true right now

Verified directly (not assumed) on 2026-09-12:

| Check | Result |
|---|---|
| `tsc --noEmit` — web-main, admin-panel, vendor-panel, rider-panel, gig | ✅ **0 errors**, all 5 |
| `tsc --noEmit` — functions | ❌ Fails — **`functions/node_modules` is not installed**, so every `firebase-functions/*` import resolves to nothing. Not a code bug; a setup gap. |
| `eslint` — web-main | ❌ **369 errors / 214 warnings** (311 `no-explicit-any`, 200 `no-unused-vars`, 23 `set-state-in-effect`, 19 `no-unescaped-entities`, 11 `exhaustive-deps`, 5 `purity`, 5 `immutability`) |
| `eslint` — admin-panel | ❌ **296 errors / 226 warnings** (522 total) |
| `eslint` — vendor-panel | ❌ **241 errors / 98 warnings** (339 total) |
| `eslint` — rider-panel | ❌ **230 errors / 87 warnings** (317 total) |
| `eslint` — gig | ❌ **6 errors / 1 warning** (7 total — much smaller app, 3 source files) |
| **Repo-wide lint total** | **1,142 errors / 626 warnings** (1,768 problems) across the 5 apps |
| Git repository | ❌ **None.** No `.git` anywhere in the tree. Nothing is version-controlled yet. |
| TODO/FIXME/HACK markers | 0 across the whole repo |
| `.agents/skills/task.md` | A prior 5-phase security hardening pass, **fully checked off** (rules, auth, rate limiting, cron fixes, vendor mgmt) |
| Cross-app file duplication | 117 files exist in 2–4 apps. **78 byte-identical, 39 have drifted into 2–4 different versions** (see §2) |
| `functions/lib/` (compiled output) | Present but stale — 22 `src/` files are newer than the last build |

**Read as:** the app layer is typescript-clean and previously security-hardened, but the repo has never been put under version control, the functions workspace was never `npm install`-ed, lint debt is real, and the copy-paste-per-app architecture has already produced four different definitions of the core data model. None of this is exotic — it's exactly what you'd expect from four apps bootstrapped by copying one into three, then evolved independently.

---

## 1. Decisions needed from you before I execute

I'll proceed under the **recommended** default for each unless you say otherwise — flagging these now so nothing gets decided silently on your behalf.

| # | Decision | Recommended default | Why |
|---|---|---|---|
| D1 | Initialize git now and commit the current working tree as `chore: initial commit` before any fixes land? | **Yes, do it first** | Nothing is currently recoverable if a fix goes wrong. This is the safety net for everything below. |
| D2 | For the 39 drifted shared files, when apps have genuinely different logic (e.g. rider-panel's auth-guard supports legacy `delivery_agent` role, vendor-panel's supports multi-role `roles.vendor.status`), should the canonical shared version **support all app-specific variants via config/props** rather than picking one app's version as "correct" and discarding the others' logic? | **Yes** | Picking one blindly would regress real functionality another app depends on. Plan is to merge behavior, not overwrite it. |
| D3 | Delete `RazorpayButton.tsx` + `useRazorpay.ts` (8 files across 4 apps) — confirmed **zero call sites anywhere**, including in web-main where the real checkout path is `PaymentModal.tsx` → `lib/razorpay.ts` directly? | **Yes, delete** | Dead code, unused Razorpay-key-handling surface in 3 apps (admin/vendor/rider) that never need payments client-side at all. |
| D4 | `packages/firestore-rules/{firestore.rules,storage.rules}` is a **377-line-diverged stale copy** of the actually-deployed root `firestore.rules`/`storage.rules` (per `firebase.json`). Delete the stale package copy, or make the root files the generated output of the package (single source of truth)? | **Make `packages/firestore-rules` the single source of truth**, root files become symlinked/copied at deploy time | Two copies of security rules that can silently diverge is the highest-severity kind of drift possible. |
| D5 | Remove `firebase-admin` + `razorpay` npm deps and the unused `lib/firebaseAdmin.ts` from all 4 client apps (confirmed zero imports)? | **Yes** | Service-account-shaped code has no business in a static-exported browser bundle. |

If you want to skip straight to execution, say so and I'll proceed with all defaults above.

---

## 2. Issue inventory (concrete, file-referenced)

### 2.1 Critical — data model / logic drift

| File (relative to each app's `src/`) | Copies | Versions | What's different |
|---|---|---|---|
| `types/index.ts` | 4 | **4** | web-main/admin-panel carry pricing-override fields (`fluctuationMarginOverride`, `componentRatesOverride`, `rawKitchenCost`, `vendorMarginPercent`, `vendorPayout`, `algorithmicPricing`) that vendor-panel/rider-panel/gig's copies don't know about. If any app writes those fields to Firestore, apps reading the older type get silently-untyped data. |
| `lib/auth/auth-guard.tsx` | 4 | **4** | Each app's role check is genuinely different: web-main uses a flat `role` string + hardcoded superadmin email; admin-panel adds `isAdminUser()` from `auth-service`; vendor-panel adds multi-role `roles.vendor.status === 'verified'`; rider-panel adds legacy `delivery_agent` role name and restructures the render/redirect order entirely. None of this is wrong per se — it's just forked instead of parameterized, so a fix to the superadmin-bypass logic (say) has to be manually applied 4 times and already hasn't been. |
| `app/(auth)/login/page.tsx` | 4 | **4** | Per-app branding/copy, expected to differ, but currently forked at the full-file level with no shared skeleton. |
| `lib/queries/subscriptions.ts`, `users.ts`, `admin.ts`, `delivery.ts`, `vendorAdmin.ts`, `pricing.ts` | 4 each | 2–3 | Firestore query layer — the exact layer `AI_AGENTS_README.md` calls "the data access layer," forked and drifting per app. |
| `lib/razorpay.ts`, `hooks/useRazorpay.ts` | 4 each | 2 | See D3 — the hook path is dead everywhere; `lib/razorpay.ts` (used by `PaymentModal.tsx`) has drifted between a version with a `vendor_id` param and one with a cached-script-loader helper. |
| `firestore.rules` / `storage.rules` (root) vs `packages/firestore-rules/*` | 2 | 2 | 377-line diff. The package copy is missing the current admin-bypass fallback chain, the vendor/kitchen legacy-role fallback, and the entire `offers/{offerId}` storage path. **The package copy would be actively wrong if deployed.** |

### 2.2 High — dead code / unused surface

- `RazorpayButton.tsx` + `useRazorpay.ts` — 8 files, 4 apps, **zero call sites** anywhere (D3).
- `lib/firebaseAdmin.ts` + `firebase-admin`/`razorpay` deps — present in all 4 client apps' `package.json`, **zero imports** of `firebaseAdmin.ts` anywhere (D5).
- `apps/web-main/src/proxy.ts` and `apps/admin-panel/src/proxy.ts` — implement UA blocklist, body-size cap, and rate limiting, but both apps build with `output: 'export'` (confirmed in each `next.config.ts`), meaning **no Next.js server ever runs them in production.** `vendor-panel`/`rider-panel` don't even have a `proxy.ts` despite carrying the same `lib/server/rate-limit.ts` + `validate.ts` helper files. The real perimeter is the `razorpayApi` Cloud Function — that's where request-size/rate limits actually need to live, and per `functions/src/razorpayFunctions.ts` route dispatch, that's already partially true; needs a completeness check per route (`create-order`, `verify-payment`, `create-subscription`, `create-vendor-account`, `webhook`).
- `functions/lib/*` compiled output committed to the tree but stale relative to `functions/src/*` — should be `.gitignore`'d (it's a build artifact) once git is initialized.
- Root `app/` (2-file Next.js stub with default boilerplate title "Next.js") — not one of the 5 real apps, not referenced by `firebase.json` hosting, not linked from `package.json` `dev:*`/`build:*` scripts. Looks like leftover scaffold from before the monorepo split.

### 2.3 Medium — quality debt

- **web-main lint: 369 errors, 214 warnings.** Dominant patterns:
  - `no-explicit-any` ×311 — mostly Firestore doc casts (`data() as any`) and Razorpay window global casts. Fixable with typed Firestore converters + a proper `Window.Razorpay` ambient type.
  - `no-unused-vars` ×200 — dead imports/params, safe autofix candidate for most.
  - `set-state-in-effect` ×23, `exhaustive-deps` ×11, `purity` ×5, `immutability` ×5 — React-Compiler-era lint rules (Next 16 ships these); each needs a real look since they flag actual render-loop/stale-closure risk, not just style.
  - `no-unescaped-entities` ×19 — trivial JSX apostrophe/quote fixes.
  - admin-panel (522), vendor-panel (339), rider-panel (317) follow the same distribution (dominated by `no-explicit-any` and `no-unused-vars` from the same forked Firestore-query/type patterns — expect most of these to collapse automatically once Phase 1's typed converters replace the per-app `as any` casts). gig is materially cleaner (7 problems total, 3 source files, minimal forked logic).
- `functions/` has 4 Jest test files (`deliveryRedesign`, `deliveryTriggers`, `integration`, `pricingEngine`) covering only a slice of the 13 exported function groups — `matchingTriggers`, `swapFunctions`, `authTriggers`, `adminManagementTriggers`, `notificationTriggers`, `payoutTriggers`, `riderPaymentTriggers` have no tests today.
- `AI_AGENTS_README.md` (25 KB, the largest doc in the repo) documents a single-app `src/` tree that hasn't existed since the `apps/*` split — every path in it is wrong for an agent trying to follow it today.

### 2.4 Low — housekeeping

- `.env` in repo root has real secrets (`RAZORPAY_KEY_SECRET`, Firebase config). `.gitignore` already excludes `.env*`, but there's no `.env.example` to tell a new dev/agent what variables exist without exposing values.
- `scripts/` mixes one-off ops scripts (`approve-rider.mjs`, `bootstrap-admin.mjs`) with test scripts (`test-clean-address.mjs`, `test-geo.mjs`) with no README explaining which are safe to run against production data.

---

## 3. Phased plan

### Phase 0 — Safety net (½ day)
- [ ] **D1:** `git init`, add a real `.gitignore` pass (confirm `functions/lib/`, `.next/`, `out/`, `android/.gradle` etc. are excluded — mostly already are), commit as baseline.
- [ ] `npm --prefix functions install`, re-run `tsc --noEmit` in `functions/` to confirm the `firebase-functions/*` resolution errors disappear (expected: yes, since they're all module-not-found, not type errors).
- [ ] `npm --prefix functions run test` (Jest) — capture current pass/fail as the real baseline, not an assumption.
- [ ] Add root script `npm run verify` = typecheck + lint across every workspace in one command, so "is it broken" has one answer going forward.
- [ ] Write `.env.example` (keys only, no values) at repo root and `functions/.env.example` if functions consume any env vars directly.

**Done when:** `npm run verify` exists and its output is the tracked baseline; `git log` has commit 1; functions build and test.

### Phase 1 — Canonicalize shared code (2–3 days, highest leverage)
Create/extend shared packages so there is exactly **one** definition of anything that must stay consistent across apps, while preserving each app's real behavioral differences as configuration, not forks.

- [ ] New package `packages/shared-types` (or extend `shared-auth`) — merge the 4 `types/index.ts` variants into one superset type file. Every app imports from `@dabzzo/shared-types` instead of a local copy.
- [ ] `packages/shared-auth`: make `auth-guard.tsx` accept the role-check behavior each app needs today (superadmin bypass, multi-role vendor check, legacy `delivery_agent` alias) via an `allowedRoles` + `roleResolver` pattern, so app-specific nuance survives as an explicit parameter instead of a silent fork. Wire all 4 apps to import it (they already declare the dependency and `transpilePackages` — just not using it, per the earlier grep).
- [ ] Consolidate `lib/queries/{subscriptions,users,admin,delivery,vendorAdmin,pricing}.ts` into `packages/shared-firestore` (new) or into `shared-auth` alongside the Firestore client init — reconcile the 2–3 drifted versions of each into one, diffed line-by-line, keeping the newest/most-fixed logic per §2.1.
- [ ] Move the 78 byte-identical duplicated files (Nav components, `Logo.tsx`, `VendorCard.tsx`, `MainNavbar.tsx`, etc.) into `packages/shared-ui`, replacing per-app copies with imports. Zero behavior change since they're already identical — pure dedup.
- [ ] **D3:** Delete `RazorpayButton.tsx` + `useRazorpay.ts` from all 4 apps.
- [ ] **D5:** Remove `lib/firebaseAdmin.ts` + `firebase-admin`/`razorpay` from all 4 client `package.json`s.
- [ ] Delete the root `app/` stub (§2.2) after confirming with you it's not a deploy target (it isn't referenced anywhere).

**Done when:** `types/index.ts`, `auth-guard.tsx`, and the query layer exist in exactly one place each; `tsc --noEmit` still passes on all 5 apps; app-specific behavior (rider legacy role, vendor multi-role, admin superadmin) still works, now as explicit config.

### Phase 2 — Security & rules consolidation (1 day)
- [ ] **D4:** Make `packages/firestore-rules/{firestore.rules,storage.rules}` the source of truth; regenerate the root copies from it (script or symlink) so `firebase.json`'s deploy target and the package can never diverge again.
- [ ] Audit `functions/src/razorpayFunctions.ts` route-by-route (`create-order`, `verify-payment`, `create-subscription`, `create-vendor-account`, `webhook`) for auth check + input validation + idempotency, since this is the actual perimeter now that client-side `proxy.ts` is confirmed non-functional under static export.
- [ ] Decide fate of `proxy.ts`/`lib/server/{rate-limit,validate}.ts`: either delete (if the Cloud Functions layer is judged sufficient) or document explicitly in each app's README that they are inert under static export and why they're kept (e.g., for a future non-static deploy mode).
- [ ] Re-run the full `.agents/skills/task.md` checklist once against the *current* code to confirm nothing regressed silently while it sat unverified.

**Done when:** one rules source of truth exists; every `razorpayApi` route has a documented auth/validation/idempotency story; `proxy.ts` fate is decided and documented, not just left ambiguous.

### Phase 3 — Lint & correctness cleanup (2 days, scales with final numbers)
- [ ] Run `eslint --fix` where safe (unused-vars, unescaped-entities) across all 5 apps; hand-fix the rest.
- [ ] Replace `data() as any` Firestore casts with typed converters (`withConverter<T>()`) using the now-canonical types from Phase 1 — this alone should collapse most of the 311 `no-explicit-any` hits in web-main and its counterparts.
- [ ] Add an ambient `Window.Razorpay` type instead of `(window as any).Razorpay` casts.
- [ ] Triage every `set-state-in-effect` / `exhaustive-deps` / `purity` / `immutability` hit individually — these are React-Compiler-era rules flagging real render-loop or stale-closure risk in a 19-app... sorry, 5-app codebase running React 19 + Next 16; not stylistic.
- [ ] Fold final admin-panel/vendor-panel/rider-panel/gig lint numbers into this checklist once the background run (kicked off during this planning session) completes.

**Done when:** `npm run verify` is lint-clean (0 errors) across every workspace; warnings triaged and either fixed or explicitly suppressed with a comment explaining why.

### Phase 4 — Test coverage for core business logic (1–2 days)
- [ ] Add Jest coverage for the untested function groups: `matchingTriggers` (2 km proximity dispatch + radius widening), `swapFunctions` (swap-request state machine), `authTriggers` (self-promotion prevention — already fixed per task.md, needs a regression test so it can't silently regress), `payoutTriggers`/`riderPaymentTriggers` (distance × rate + volume bonus math).
- [ ] Confirm `npm --prefix functions run test` runs cleanly in CI-equivalent conditions (fresh install, no local state).

**Done when:** every exported Cloud Function group in `functions/src/index.ts` has at least one test exercising its core path.

### Phase 5 — Documentation (½ day, can run in parallel with any phase above)
- [ ] Rewrite `AI_AGENTS_README.md` to reflect the real `apps/*` + `packages/*` monorepo layout — every path in the current version is stale.
- [ ] Add a `README.md` to each new/changed shared package (`shared-types`, `shared-auth`, `shared-ui`, `firestore-rules`) explaining what's canonical there and why apps must not fork it again.
- [ ] Add `scripts/README.md` labeling each script safe/destructive and what it touches (production Firestore vs. local emulator).
- [ ] Maintain [CHANGELOG.md](CHANGELOG.md) — one entry per phase, listing exact files added/changed/removed. (Stub created alongside this plan; first real entry lands with Phase 0.)

**Done when:** a fresh agent or developer can onboard from `README.md` → `AI_AGENTS_README.md` and find every path they read about.

### Phase 6 — Deployment readiness (1 day)
- [ ] `node scripts/build-web.mjs` (all 5 apps) — confirm every `apps/*/out` directory builds clean with the Phase 1–3 changes in place.
- [ ] Confirm `.firebaserc` targets match `firebase.json` hosting blocks (5 targets: web-main, vendor-panel, rider-panel, admin-panel, gig).
- [ ] `npx firebase deploy --only firestore:rules --dry-run`-equivalent check (emulator) after Phase 2's rules consolidation.
- [ ] `npm --prefix functions run build` + confirm secrets (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, webhook secret) are configured via Firebase Functions config/secrets, not baked into source.
- [ ] Capacitor/Android: confirm `npx cap sync` runs clean against the rebuilt `web-main/out`; check `android/` version code bump policy before any store submission.
- [ ] Write a one-page `DEPLOYMENT.md`: exact command sequence for a full release (build → rules → functions → hosting → mobile sync), plus rollback steps (`firebase hosting:clone` to a previous release, functions redeploy of previous git tag).

**Done when:** a single documented command sequence takes the repo from `main` to all 5 hosting targets + functions + mobile sync, with a rollback path.

---

## 4. What changes / what gets added — manifest

This is the concrete "what are we touching" list, kept in sync as phases execute:

**New:**
- `packages/shared-types/` (or extension of `shared-auth`)
- `packages/shared-firestore/` (query layer)
- `.env.example`
- `CHANGELOG.md`
- `DEPLOYMENT.md`
- `scripts/README.md`
- README per shared package

**Modified:**
- All 4 client apps' `package.json` (remove `firebase-admin`, `razorpay` deps)
- `types/index.ts`, `lib/auth/auth-guard.tsx`, `lib/queries/*.ts` in all 4 apps → become thin re-exports of shared packages
- `AI_AGENTS_README.md` (full rewrite)
- `packages/firestore-rules/{firestore.rules,storage.rules}` (becomes canonical; root files regenerated from it)
- `functions/src/razorpayFunctions.ts` (validation/idempotency audit fixes, if any found)
- `.gitignore` (verify `functions/lib/` etc. are covered post-git-init)

**Removed:**
- `RazorpayButton.tsx` + `useRazorpay.ts` × 4 apps (8 files)
- `lib/firebaseAdmin.ts` × 4 apps
- Root `app/` stub (pending your confirmation)
- Duplicate copies of the 78 identical + 39 reconciled files, once re-pointed at shared packages

---

## 5. Sequencing & effort

| Phase | Effort | Depends on |
|---|---|---|
| 0 — Safety net | 0.5 day | — |
| 1 — Canonicalize shared code | 2–3 days | 0 |
| 2 — Security & rules | 1 day | 1 (types needed for query layer changes) |
| 3 — Lint cleanup | 2 days | 1 (typed converters need canonical types) |
| 4 — Test coverage | 1–2 days | 0 (functions installed) |
| 5 — Documentation | 0.5 day | can run parallel throughout |
| 6 — Deployment readiness | 1 day | 1, 2, 3 |

**Total: ~8–10 working days** for one engineer/agent working sequentially; phases 3–5 can overlap with 2 if split across more than one contributor.

---

## 6. Next step

Tell me to proceed and I'll start Phase 0 immediately (git init + baseline commit, install `functions/` deps, run the real test baseline, add `npm run verify`) — or flag any of the D1–D5 decisions above you want to change first.
