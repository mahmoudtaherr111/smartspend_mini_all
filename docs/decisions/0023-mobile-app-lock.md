# 0023. The mobile app lock: a 6-digit PIN checked by a phone-held key, biometrics bound to the Keystore or Keychain

- Status: accepted and built, in `mobile/packages/device_lock` and `mobile/app/lib/src/features/lock/`.
- Decided and recorded: 2026-10-19.

## Context
Money apps in Egypt are opened on shared and borrowed phones, and a family often knows the phone's own passcode. The
Flutter app ([0022](0022-flutter-mobile-app.md)) needed a lock of its own, a cover in the app switcher and a way to
hide amounts in public (rule 13.2 of [the mobile design rules](../guides/mobile-design.md)).

The web app's lock (`src/providers/BiometricLockProvider.tsx`, `src/lib/biometricAuth.ts`) is one reference, not the
model: its PIN has four digits, is hashed with a fixed salt in `localStorage` next to its failure counter, and its
biometric check trusts a success callback. Decision 0022 named the `local_auth` package for the lock; `local_auth`
answers "recognised or not" only, so a hooked callback or a fingerprint added to the phone later both open the app.

## Decision
1. **A PIN of six digits** (a million choices, as banking apps ask), typed on the app's own pad so no keyboard app
   sees it. Guessable PINs are refused (one digit repeated, runs, repeated pairs or triples, a short list), as NIST SP
   800-63B asks. The PIN pad keeps the phone's digit order in Arabic too.
2. **The PIN is checked by a tag, never stored.** The app keeps a random salt and HMAC-SHA256(salt ‖ PIN) made with a
   key that never leaves the phone: an Android Keystore HMAC key, hardware-backed where the phone has the hardware,
   and on iOS a random key in this device's Keychain (`WhenUnlockedThisDeviceOnly`, not in backups). A copy of the
   app's data alone cannot be brute-forced on Android. The record (salt, tag, failures) sits in
   `flutter_secure_storage`, next to the session token.
3. **Wrong PINs are counted in that record,** so closing the app does not reset them. The first four cost nothing;
   from the fifth the pad waits 30 seconds, then 1, 5, 15 minutes and an hour. The tenth wrong PIN signs out on this
   phone; signing in again (password or Google) proves the person and sets a new PIN. The wait is measured from the
   last failure, and a clock set back restarts it. The screen that changes the lock asks for the PIN through the
   same counter.
4. **Biometrics are bound to a key, not to a callback** (OWASP MASTG-BEST-0036, -0037, MASWE-0022):
   - Android (11 and newer, class 3 biometrics only): an AES-GCM Keystore key that needs a biometric for every use and
     that the Keystore destroys when a fingerprint or face is enrolled. Enrolment seals a random 32-byte secret with
     it; unlocking decrypts it. The framework `BiometricPrompt` is used, so the activity stays a `FlutterActivity`.
   - iOS: the secret is a Keychain item with `.biometryCurrentSet`, which Face ID or Touch ID as enrolled now must
     open; a change is also caught by `evaluatedPolicyDomainState`.
   - The app keeps only the secret's SHA-256 and opens when the returned secret matches. A changed enrolment turns
     biometrics off until the PIN turns them on again. Older Android phones open with the PIN.
5. **When it locks.** A cold start always opens locked. Back from the background, the app locks after the time the
   person chose (at once, 1 minute by default, or 5 minutes), measured on a monotonic stopwatch. The app's own
   biometric prompt does not count as leaving.
6. **What the lock covers.** `LockGate` (in `MaterialApp.builder`) keeps the screens under it in place but not drawn,
   not read by a screen reader and not touchable; Android's back button on the lock leaves the app. While the stored
   lock is being read, nothing of the account shows. A record that cannot be read keeps the lock shut and offers only
   signing out.
7. **The app switcher.** With the lock on, Android 13 and newer keep the app's screenshot out of Recents
   (`setRecentsScreenshotEnabled(false)`), so people can still take screenshots; older Android sets `FLAG_SECURE`,
   the only way there. iOS puts a cover view over the window when the scene stops being active.
8. **Hiding amounts** is a choice of its own, with or without the lock: `MoneyPrivacy` in `smartspend_ui` makes
   `AmountText` and `moneyText` write «•••• ج.م», and a waiting sentence loses its numbers. Review and question sheets
   show amounts, since the person opened them to check them.
9. **Whose lock it is.** Signing out removes the record and both keys; another account signing in never inherits a
   lock. A session that expired keeps it, and signing in again opens the app without asking, since the password was
   just typed.

## Consequences
- The native code lives in a second plugin, `device_lock`, behind a Pigeon contract, and compiles only in CI
  (`.github/workflows/mobile.yml`).
- On iOS the PIN key is in the Keychain, not the Secure Enclave, which holds no HMAC keys; a jailbroken phone can read
  it. The ten-try limit is the protection there.
- A phone restored from a backup or a new phone has no keys: the app asks the person to sign in again.
- The web app's lock is unchanged; its weaknesses stay listed in [accounts](../systems/accounts.md).
