// Thin re-export. The Firebase client singleton lives in @dabzzo/shared-auth
// so every app shares exactly one app/Firestore instance and one copy of the
// config-from-env logic — see IMPLEMENTATION_PLAN.md Phase 1. Import sites
// across this app (`@/lib/firebase`) are unchanged.
export { auth, db, storage, functions, getAppMessaging } from '@dabzzo/shared-auth';
