/**
 * Exercises the signInWebPopup race logic in isolation.
 *
 * Mirrors the real structure from packages/shared-auth/src/auth-service.ts
 * (same grace period, same ordering) with a fake window + fake signInWithPopup,
 * so each of the four user-visible cases can be timed without a browser.
 */

const POPUP_FOCUS_GRACE_MS = 2500;
const POPUP_HARD_TIMEOUT_MS = 3 * 60 * 1000;

function makeWindow() {
  const listeners = {};
  return {
    addEventListener: (k, fn) => { (listeners[k] ||= []).push(fn); },
    removeEventListener: (k, fn) => { listeners[k] = (listeners[k] || []).filter(f => f !== fn); },
    fire: (k) => (listeners[k] || []).slice().forEach(fn => fn()),
    listenerCount: (k) => (listeners[k] || []).length,
  };
}

// Same shape as the real implementation.
async function signInWebPopup({ win, auth, signInPromise }) {
  let onFocus, graceTimer, hardTimer;
  const cleanup = () => {
    if (onFocus) win.removeEventListener('focus', onFocus);
    if (graceTimer) clearTimeout(graceTimer);
    if (hardTimer) clearTimeout(hardTimer);
  };
  try {
    const signIn = signInPromise.then((user) => ({ success: true, user }));
    const cancelled = new Promise((resolve) => {
      onFocus = () => {
        if (graceTimer) clearTimeout(graceTimer);
        graceTimer = setTimeout(() => {
          if (auth.currentUser) return;
          resolve({ success: false, code: 'auth/popup-closed-by-user' });
        }, POPUP_FOCUS_GRACE_MS);
      };
      win.addEventListener('focus', onFocus);
      hardTimer = setTimeout(
        () => resolve({ success: false, code: 'auth/popup-timeout' }),
        POPUP_HARD_TIMEOUT_MS
      );
    });
    return await Promise.race([signIn, cancelled]);
  } catch (err) {
    return { success: false, code: err.code || 'auth/unknown' };
  } finally {
    cleanup();
  }
}

const results = [];
async function scenario(name, fn, expect) {
  const t0 = Date.now();
  let out;
  try { out = await fn(); } catch (e) { out = { success: false, code: 'THREW:' + e.message }; }
  const ms = Date.now() - t0;
  const ok = out.code === expect.code && out.success === expect.success;
  results.push({ name, ok, got: `${out.success}/${out.code || '-'}`, ms });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. Successful sign-in — should resolve immediately, not wait on any timer.
  await scenario('successful login', async () => {
    const win = makeWindow();
    const auth = { currentUser: null };
    const p = wait(150).then(() => { auth.currentUser = { uid: 'u1' }; return { uid: 'u1' }; });
    return signInWebPopup({ win, auth, signInPromise: p });
  }, { success: true, code: undefined });

  // 2. User closes the popup — focus returns, no result ever arrives.
  await scenario('user closes popup', async () => {
    const win = makeWindow();
    const auth = { currentUser: null };
    const never = new Promise(() => {});           // Firebase never settles (the COOP case)
    setTimeout(() => win.fire('focus'), 100);      // popup closed -> opener refocused
    return signInWebPopup({ win, auth, signInPromise: never });
  }, { success: false, code: 'auth/popup-closed-by-user' });

  // 3. Popup blocked — Firebase rejects promptly; must not wait on timers.
  await scenario('popup blocked', async () => {
    const win = makeWindow();
    const auth = { currentUser: null };
    const rejected = wait(50).then(() => { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; throw e; });
    return signInWebPopup({ win, auth, signInPromise: rejected });
  }, { success: false, code: 'auth/popup-blocked' });

  // 4. Network/Firebase error — same, prompt rejection.
  await scenario('network error', async () => {
    const win = makeWindow();
    const auth = { currentUser: null };
    const rejected = wait(50).then(() => { const e = new Error('net'); e.code = 'auth/network-request-failed'; throw e; });
    return signInWebPopup({ win, auth, signInPromise: rejected });
  }, { success: false, code: 'auth/network-request-failed' });

  // 5. The false-positive guard: user alt-tabs back, then sign-in completes.
  //    currentUser is set before the grace elapses, so NO spurious cancel.
  await scenario('alt-tab back, then sign-in completes', async () => {
    const win = makeWindow();
    const auth = { currentUser: null };
    const p = wait(1200).then(() => { auth.currentUser = { uid: 'u2' }; return { uid: 'u2' }; });
    setTimeout(() => win.fire('focus'), 100);      // user switched back while popup still open
    return signInWebPopup({ win, auth, signInPromise: p });
  }, { success: true, code: undefined });

  // 6. Listener hygiene — nothing left attached after settling.
  const win = makeWindow();
  const auth = { currentUser: null };
  await signInWebPopup({ win, auth, signInPromise: wait(20).then(() => ({ uid: 'x' })) });
  results.push({
    name: 'focus listener removed after settle',
    ok: win.listenerCount('focus') === 0,
    got: `${win.listenerCount('focus')} listener(s)`, ms: 0,
  });

  console.log('');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(38)} ${String(r.ms).padStart(5)}ms  -> ${r.got}`);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
})();
