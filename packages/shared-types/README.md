# @dabzzo/shared-types

The canonical Dabzzo data model — `AppUser`, `Subscription`, `Order`, `Batch`, pricing types, and everything else in `src/index.ts`.

## Why this exists

Before this package, `types/index.ts` was copy-pasted into all 5 apps (`web-main`, `admin-panel`, `vendor-panel`, `rider-panel`, `gig`) and had drifted into 4 different versions — including a real divergence where `vendor-panel`'s `BatchStatus` had a `'picked_up'` value the other 4 copies didn't know about. See `IMPLEMENTATION_PLAN.md` Phase 1 and `CHANGELOG.md` for the full divergence analysis that went into merging them back into one file.

## Rule going forward

**Do not fork this file.** If an app genuinely needs a field the others don't, add it here — every app carrying a field it doesn't use is a much smaller cost than 4 different definitions of what a `Subscription` is (which is exactly the bug this package fixes).

Each app's `src/types/index.ts` is now a one-line re-export:

```ts
export * from '@dabzzo/shared-types';
```

Import call sites across the app (`import { AppUser } from '@/types'`) are unchanged — only the file that `@/types` resolves to changed.
