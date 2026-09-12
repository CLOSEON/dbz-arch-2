# Deploying Dabzzo

Five static-export web apps on Firebase Hosting, one Cloud Functions codebase, Firestore/Storage rules, and Capacitor mobile builds.

---

## Before the first deploy — blockers

These must be settled or the deploy will ship broken. Each is tracked in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

| # | Blocker | Why it blocks |
|---|---|---|
| 1 | **Rotate the Razorpay secrets.** `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` were hardcoded in `functions/src/razorpayFunctions.ts` as fallback literals (removed in Phase 0). Treat both as compromised. | Anyone who has seen the repo has the live payment credentials. |
| 2 | **Confirm the Functions secrets are actually set.** The hardcoded fallbacks are gone, so a missing value now fails loudly instead of silently using the leaked literal. | If they aren't set, payments and webhooks start failing the moment this ships. Check with `npx firebase functions:secrets:access RAZORPAY_KEY_SECRET`. |
| 3 | **Smoke-test a real checkout.** Phase 2 added ID-token verification to `create-order`, `create-subscription` and `create-vendor-account`. | These are live payment paths. The REST fallback only works when `auth.currentUser` exists at call time. |
| 4 | **Decide D6** — superadmin test-seeding writes fabricated verification data (a sample FSSAI licence, a 4.5★/14-review history) to production Firestore on sign-in. Currently preserved as-is. | Fabricated compliance data in the live `users` collection. |

---

## Environment variables

`scripts/sync-env.mjs` copies the repo-root `.env` / `.env.local` into each app directory before dev and build, because **Next.js reads env files from its own working directory**, and each app builds with its own directory as cwd. It runs automatically via each app's `predev`/`prebuild` and from inside `build-web.mjs`.

Copy `.env.example` → `.env.local` and fill it in. Client config is validated at build time: a missing `NEXT_PUBLIC_FIREBASE_*` var throws rather than silently falling back to a baked-in project (see `packages/shared-auth/src/firebase.ts`).

Server-only secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) must **never** live in a `NEXT_PUBLIC_*` var — that prefix is inlined into the browser bundle. Set them as Functions secrets:

```bash
npx firebase functions:secrets:set RAZORPAY_KEY_SECRET
npx firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
```

---

## Verify before shipping

```bash
npm run verify
```

Runs typecheck across all 5 apps, typecheck on `functions/`, lint across all apps, and the functions test suite — each unconditionally, printing a pass/fail summary (a failing step does not hide the ones after it).

Expected today: typechecks and tests pass; **lint still fails** (~1,142 errors, tracked as Phase 3). Treat lint as known-red until that phase lands, and don't let it mask a new failure elsewhere in the summary.

---

## Full release

Run in this order. Rules first, so tightened access is in place before the code that depends on it.

```bash
# 1. Rules and indexes (deployed from packages/firestore-rules — the only copy)
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
npx firebase deploy --only storage:rules

# 2. Cloud Functions
npm --prefix functions run build
npx firebase deploy --only functions

# 3. Build all 5 web apps (static export)
node scripts/build-web.mjs

# 4. Hosting — all five targets
npx firebase deploy --only hosting
```

`scripts/build-web.mjs` exits non-zero and names the failing apps if any build fails. It previously printed a success banner regardless; check the exit code in CI regardless.

### Single app

```bash
node scripts/build-web.mjs admin-panel
npx firebase deploy --only hosting:admin-panel
```

### Hosting targets

| Target | Output | Site |
|---|---|---|
| `web-main` | `apps/web-main/out` | `dabzo` (dabzzo.in) |
| `vendor-panel` | `apps/vendor-panel/out` | `dabzzo-vendor-panel` |
| `rider-panel` | `apps/rider-panel/out` | `dabzzo-rider-panel` |
| `admin-panel` | `apps/admin-panel/out` | `dabzzo-admin-panel` |
| `gig` | `apps/gig/out` | `dabzzo-gig` |

`/api/razorpay/**` is rewritten to the `razorpayApi` function on every target except `rider-panel` (riders don't take payments).

---

## Mobile (Capacitor)

```bash
node scripts/build-web.mjs web-main   # Capacitor wraps this output
npx cap sync
npx cap open android                  # or: npx cap open ios
```

Bump `versionCode`/`versionName` in `android/app/build.gradle` before any store submission — Play rejects a duplicate `versionCode`.

---

## Rollback

**Hosting** — every deploy is a versioned release; roll back per target from the Firebase console (Hosting → release history → Rollback), or:

```bash
npx firebase hosting:clone dabzofb:<target>:<previous-version> dabzofb:<target>:live
```

**Functions** — no built-in rollback. Check out the previous commit and redeploy:

```bash
git checkout <previous-sha> -- functions/
npm --prefix functions run build
npx firebase deploy --only functions
```

**Rules** — same: previous versions are visible in the Firebase console, and the rules live in git at `packages/firestore-rules/`. Redeploy from a prior commit.

Because of this asymmetry, deploy rules and functions **before** hosting: hosting is the easiest to roll back, so it should be the last thing to change.

---

## Known gaps

- **No CI.** There is no `.github/workflows`; everything above is manual. `npm run verify` is written to be CI-ready when you want it.
- **Lint is red** (~1,142 errors, mostly `no-explicit-any` from untyped Firestore reads). Phase 3.
- **`next@16.2.6` carries 1 critical + 2 high advisories** (D8). Pinned exactly across all 5 apps, so a bump needs its own tested pass.
- **Functions test coverage is partial** — 47 tests over 3 suites; `matchingTriggers`, `swapFunctions`, `authTriggers`, `payoutTriggers` have none. Phase 4.
