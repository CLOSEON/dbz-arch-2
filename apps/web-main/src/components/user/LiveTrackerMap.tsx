// Thin re-export — canonical version lives in packages/shared-ui.
// See IMPLEMENTATION_PLAN.md Phase 1.
// Re-exports the default too: next/dynamic() imports rely on it, and
// `export *` alone does not carry a default export through.
export * from '@dabzzo/shared-ui/user/LiveTrackerMap';
export { default } from '@dabzzo/shared-ui/user/LiveTrackerMap';
