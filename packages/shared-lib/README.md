# @dabzzo/shared-lib

Shared non-UI helpers: pricing math, geo, storage, formatting utilities.

## Why this exists

These modules were copy-pasted across the apps and had drifted. Two of the merges here fixed real bugs, not just duplication — see `CHANGELOG.md` for detail:

- **`pricing.ts`** — `admin-panel`'s copy was missing the weekly-plan special case that `web-main` and, critically, the server-side `functions/src/pricingEngine.ts` both implement. Admin was computing weekly prices ~₹0.40/meal lower than what customers are actually charged. The canonical version here is the one that matches the server (the actual charging authority).
- **`storage.ts`** — `vendor-panel`'s `getImageUrl` was missing the null-safety and the guard that stops localhost/emulator URLs leaking into production pages.

## Rule going forward

Do not fork these back into apps. Each app's `src/lib/<name>.ts` is a thin re-export; add changes here so every app gets them.
