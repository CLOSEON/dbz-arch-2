/**
 * Helpers for `catch (err: unknown)`.
 *
 * These exist because `catch (err: any)` was used in ~78 places and then read
 * as `err.message`. That is unsound in a way that bites in practice: `throw
 * 'something went wrong'` and a rejected non-Error both yield `undefined` for
 * `.message`, so the user sees an empty toast instead of the reason. Typing the
 * binding as `unknown` forces the narrowing these helpers do.
 */

/** Best-effort human-readable message for anything that can be thrown. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'string') return err || fallback;
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
    // Firebase/Firestore errors sometimes carry only a code.
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string' && c) return c;
  }
  return fallback;
}

/**
 * Error code, where one exists — Firebase uses these for control flow
 * (e.g. 'permission-denied', 'auth/invalid-verification-code').
 */
export function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return undefined;
}
