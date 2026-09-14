# scripts/

## Build & tooling (safe)

| Script | Does |
|---|---|
| `build-web.mjs [app]` | Static-export build for all 5 apps, or one. Exits non-zero and names failures. |
| `sync-env.mjs [app]` | Copies root `.env`/`.env.local` into each app dir. Runs automatically via `predev`/`prebuild`. |
| `verify.mjs` | `npm run verify` — typecheck x5 + functions typecheck + lint + functions tests. |
| `build-android.mjs`, `build-all-apks.mjs` | Capacitor Android builds. |

## ⚠️ Operate on live Firestore

These use the Admin SDK against the **production** project (`dabzofb`) and need
`FIREBASE_SERVICE_ACCOUNT_KEY` or `FIREBASE_SERVICE_ACCOUNT_KEY_PATH`. They
bypass security rules entirely. Read one before running it.

| Script | Risk |
|---|---|
| `clean-old-data.mjs` | **Destructive.** Deletes data. |
| `dedup-riders.mjs`, `dedup-vendors.mjs` | **Destructive.** Merges/removes duplicate records. |
| `bootstrap-admin.mjs` | Grants admin privileges. |
| `approve-rider.mjs`, `switch-rider.mjs` | Mutates rider state/assignment. |
| `generate-trip-for-rider.js` | Writes a trip — test data in a live collection. |
| `check-riders.mjs`, `check_vendors.mjs`, `audit-mock-data.js` | Read-only audits. |
| `audit-delivery-address.mjs` | **Read-only.** Reports the shape of `orders.delivery_address` and whether missing coordinates could be recovered. Run this before the fix below. |
| `fix-delivery-address.mjs` | Backfills coordinates onto orders that lack them. **Dry run unless `--apply`.** Preserves the original in `delivery_address_original`. |
| `test-geo.mjs`, `test-clean-address.mjs` | Local logic checks, no Firestore writes. |

Point these at the Firestore emulator before running against production.
