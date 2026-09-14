// Thin re-export — canonical definitions live in
// packages/shared-types/src/delivery.ts. See IMPLEMENTATION_PLAN.md Phase 1.
//
// NOTE: this module exports a `DeliveryStatus` that is DIFFERENT from the
// `DeliveryStatus` in '@/types' (the latter is the legacy 4-value union,
// explicitly marked deprecated there; this one is the current 10-value
// delivery pipeline union). Kept separate deliberately so every existing
// import site resolves to exactly what it resolved to before.
export * from '@dabzzo/shared-types/delivery';
