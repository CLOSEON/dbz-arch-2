# @dabzzo/shared-queries

The Firestore data-access layer — one definition per query, shared by all apps.

## Why this exists

These 18 modules (~5,000 lines) were copy-pasted into four apps. Twelve were byte-identical; six had drifted. Each app's `src/lib/queries/<name>.ts` is now a thin re-export.

## How the drifted files were reconciled

The deciding question was usually **which copy actually runs**, not which looks newer — several divergent copies were dead code in apps that never call them.

| Module | Canonical source | Why |
|---|---|---|
| `subscriptions.ts` | web-main | Only web-main calls `createSubscription`; its version is a superset (total_meals, custom meal config, authoritative pricing snapshot). |
| `delivery.ts` | admin-panel | Only admin-panel calls `forceFormBatches`, and its copy has a today-only guard (`order.date !== todayStr`) the three dead copies lack. |
| `vendorAdmin.ts` | admin-panel | Only admin-panel calls `getVendorStats`. Its flat-commission calculation is what has actually been running; the other apps carried a more elaborate payout-records version that never executed. Taking the "better-looking" one would have silently changed live vendor financial reporting. |
| `admin.ts` | web-main | Superset (`fetchCustomPlanStats`); identical otherwise. |
| `users.ts` | merged | See cache TTLs below. |
| `pricing.ts` | web-main | The apparent diff was import placement only. |

## Cache TTLs in `users.ts`

The per-app copies disagreed and **neither was wrong**: web-main/admin-panel/vendor-panel cached profiles and vendors for 5 minutes; rider-panel deliberately used 20 seconds so riders see fresh data mid-delivery. Picking one would have either multiplied Firestore reads for three apps or made rider data up to 5 minutes stale.

The TTLs are therefore configurable, defaulting to 5 minutes. `rider-panel` opts into the shorter window in `RiderAppShell.tsx` via `configureUserCacheTTLs()`. If you add an app that needs different freshness, do the same — don't fork the module.
