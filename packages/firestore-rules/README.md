# @dabzzo/firestore-rules

The Firestore and Cloud Storage security rules, plus the composite index
definitions. **This is the only copy** — `firebase.json` deploys directly from
here.

## Why this README exists

Until 2026-09-12 there were two copies: these files, and a set at the repo root.
`firebase.json` deployed the root ones; this package described itself as
"canonical" while actually sitting **173 lines behind**. The stale copy was
missing, among other things, the current admin-bypass fallback chain, the
vendor/kitchen legacy-role fallback, and the entire `offers/{offerId}` storage
path — so deploying the "canonical" copy would have quietly tightened and broken
live access rules.

The fix was to delete the duplicate rather than generate one from the other: the
deployed content was moved here and `firebase.json` was repointed, so there is
no sync step that can silently fall behind again.

## Deploying

```bash
npx firebase deploy --only firestore:rules
npx firebase deploy --only storage:rules
npx firebase deploy --only firestore:indexes
```

Test rule changes against the emulator before deploying — these gate every
read and write in the product.
