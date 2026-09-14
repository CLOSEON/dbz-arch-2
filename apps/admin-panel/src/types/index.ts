// This file is intentionally a thin re-export. The canonical Dabzzo data
// model lives in packages/shared-types/src/index.ts — see that package's
// README for why, and IMPLEMENTATION_PLAN.md Phase 1 for how the 4 previously
// drifted per-app copies were reconciled. Do not add fields here; add them
// to the shared package so every app stays on one definition.
export * from '@dabzzo/shared-types';
