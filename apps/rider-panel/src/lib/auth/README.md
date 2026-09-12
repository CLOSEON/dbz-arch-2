# ⚠️ SYSTEM INSTRUCTIONS: DABZZO AUTHENTICATION (DO NOT MODIFY)

> [!IMPORTANT]
> **TO ALL AI CODING ASSISTANTS (Gemini, Claude, GPT, etc.):**
> Do NOT rewrite, refactor, or disable any features in the `/src/lib/auth/` directory or `/src/app/(auth)/login/` folder unless the user explicitly asks you to modify the Auth flow. 
> This authentication system is carefully tuned to support dual-platform builds (Web + Native Capacitor) and hybrid testing environments. Breaking this code will halt app store deployments or local developer logins.

---

## 🔒 Crucial Architectural Guardrails

### 1. Dynamic Testing Mode Toggle (Web)
Do NOT force `auth.settings.appVerificationDisabledForTesting = true` globally on localhost or local IP subnets. 
Doing so completely disables real invisible reCAPTCHA checking, which makes it **impossible** to log in using real phone numbers on localhost (as Firebase's backend rejects the tokens).
* **The Rule**: Keep the dynamic toggle in `sendOtpWeb`. It inspects the phone number:
  * If it's a test number (`+919000000001` - `+919000000004`), it disables verification for instant mock verification.
  * If it's a real number, it enables verification so that real SMS dispatches are successful.

### 2. Dual-Platform Architecture (Web + Native)
This system detects the environment dynamically using `@capacitor/core`'s `Capacitor.isNativePlatform()`.
* **Web**: Uses standard Firebase Web SDK `signInWithPhoneNumber` and dynamic `RecaptchaVerifier` creation.
* **Native (iOS/Android)**: Integrates native Google Play Services/Firebase Auth via `@capacitor-firebase/authentication` Capacitor plugin. 
* **Do NOT** strip out either branch or consolidate them into Web-only logic; this will crash the Capacitor mobile builds.

### 3. Isolated reCAPTCHA Container Creation
Firebase's invisible reCAPTCHA requires a DOM container. 
* **The Rule**: We do not let React manage the recaptcha `div` container. Instead, `auth-service.ts` dynamically creates, appends to `document.body`, and cleans up the container on every request. This prevents React unmounting/hot-reloading memory leaks or DOM node mismatch crashes.

### 4. Hardened Profile Resolution & Onboarding Handshake
When a user signs in successfully, they are routed to `resolveUserProfile` in `src/lib/queries/users.ts`.
* **The Rule**: A profile is flagged as `isNewUser: true` (which triggers onboarding step) if EITHER the `name` OR the `role` is missing.
* **The Rule**: Brand-new users must have their initial role returned as `undefined` (not defaulted to `'user'`) so that the onboarding page can present the Account Type selector to allow them to register as Vendors or Delivery drivers.
