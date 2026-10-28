# 0028. Phones send captured notifications with a device token to `/api/capture/v1`, and the user confirms each one first

- Status: accepted. The server side is built: `contracts/capture-intake.ts`, `api/capture-v1-routes.ts`,
  `api/lib/capture/{devices,consent,intake}.ts`, the `capture.*` procedures in `api/capture-router.ts` and the
  tables `capture_devices`, `capture_consents`, `capture_signals` (migration 0031). The Android capture in
  `mobile/packages/bank_capture` and the app's screens follow. Off until the closed beta (`capture_enabled`).
- Decided and recorded: 2026-10-27, from the capture production plan (owner, red-team review, a consult with
  Antigravity).

## Context
The old intake (an Android companion app and an iPhone Shortcut posting to a public route with a plaintext token)
was removed. The new one runs inside the Flutter app (decision 0022): Kotlin reads bank, wallet and messaging-app
notifications, and later Swift App Intents receive what Shortcuts automations pass. Both run while the app is closed,
often for days, and a local session lasts seven days without refresh; the session code also reads any
`Authorization: Bearer` token as a session. The reader (decision 0026) is accurate on its corpus, but that corpus is
written for this public repository: nobody has measured it on real messages yet.

## Decision
1. **A device token, not the session.** `capture.registerDevice` gives an installation a token (`cap_` and 32 random
   bytes) shown once and stored as its SHA-256. It is sent in the `X-Capture-Device` header and can only send
   signals, read the capture config and answer that device's own notifications from the last 48 hours. Registering
   the installation again replaces it; revoking every session (sign-out everywhere, a password change) and deleting
   the account revoke it. A resolved token is cached five minutes with the user's auth version; when the version moves
   the device row is read again, which never revokes by itself because a plan change moves it too.
2. **Plain HTTP routes under `/api/capture/v1`** (`signals`, `config`, `actions`): native code needs status codes,
   `Retry-After` and a body limit (64 KB, 20 signals of 2,000 characters). The shapes live in
   `contracts/capture-intake.ts`; the phones test against the same examples. This is the exception to mobile rule 3
   ("no mobile-only API"): no browser can capture notifications, and the routes answer only device tokens.
3. **The phone drops little; the server is strict.** A phone drops only codes, personal senders, apps outside the
   catalog and what the user chose to ignore, because what it drops is lost. The server refuses an app's notification
   from an app the catalog does not list, ignores a messaging app's message from a person's number, asks an unknown
   SMS sender for a card, an account or a balance, and keeps only what the reader reads as money that moved. Nothing
   else is stored.
4. **Every transaction waits for the user (P1 of the plan).** A kept signal is `review`: the phone shows a notice the
   server wrote in the phone's language, with "سجّل" and "مش مصروف" when the amount is certain and in pounds, and the
   app lists the rest. Only the user's answer writes the ledger, through the ledger writer (decision 0027), in one
   transaction with the signal's new status, as `source = 'sms'` with `clientRequestId = 'cap:<signal>'`, so a repeated
   tap writes one row. The bank's text never enters the ledger. Recording on its own comes later, per bank and kind,
   once real messages have measured the reader.
5. **Little is kept, briefly.** A kept signal holds the text redacted (`redactWithFindings`) and the reader's fields,
   read before redaction, for 30 days. Consent is a row per grant with the version of the text the user read, kept
   when it is taken back (Law 151/2020).
6. **The admin can stop it**: `capture_enabled` (off by default) refuses every signal with 503 and tells phones to
   stop through `/config`.

## Consequences
- The ledger shows captured rows like the old intake's (`sms`), so the statistics count them as automated without a
  change.
- The model reader (decision 0025) is not called yet: a reading without an amount is ignored, and one the reader is
  unsure of waits for the user like any other.
- Merging several signals of one payment, auto-recording, the monthly limit, iPhone capture and the model come in the
  next steps of the plan, each with its own record where it changes how the system is built.
