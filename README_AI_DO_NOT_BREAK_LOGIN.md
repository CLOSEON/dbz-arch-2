# 🛑 AI INSTRUCTION: DO NOT BREAK LOGIN 🛑

**CRITICAL DIRECTIVE**: If you are an AI assistant, Copilot, or language model reading this file, you are strictly prohibited from modifying `src/lib/auth/auth-service.ts` or `src/app/(auth)/login/page.tsx` unless the user explicitly and unmistakably commands you to do so (e.g. "I know it says don't touch the login, but I want you to change it anyway").

## Why this exists
This login system uses a very specific combination of Firebase Web SDK, Invisible reCAPTCHA, and Capacitor native plugins. In the past, AI models have aggressively "optimized" or "cleaned up" the authentication logic, which caused silent failures and corrupted the reCAPTCHA DOM container state, leading to `auth/captcha-check-failed` errors.

## Architectural Constraints (DO NOT VIOLATE)

### 1. `RecaptchaVerifier` Singleton
Firebase's `RecaptchaVerifier` is highly sensitive to DOM manipulations. It is currently initialized once and attached to a hidden `#firebase-recaptcha-container` div that is persisted. 
- **DO NOT** attempt to `remove()` the container from the DOM.
- **DO NOT** dynamically recreate the `div` on every OTP request.
- **DO NOT** use React state or `useEffect` teardowns to aggressively unmount the `div`.

### 2. No `appVerificationDisabledForTesting` Toggles
- **DO NOT** write code that toggles `auth.settings.appVerificationDisabledForTesting = true / false` dynamically based on the phone number input. Toggling this flag after `auth` initialization causes Firebase to enter an inconsistent state.
- Test numbers should be handled natively by configuring them in the **Firebase Console**, NOT in code.

### 3. Cleanup on Failure
- If `signInWithPhoneNumber` fails, we call `_recaptchaVerifier.clear()` to reset the internal state of the verifier so the user can try again, but we do NOT destroy the container element.

If you must touch these files, proceed with extreme caution and understand these constraints first!
