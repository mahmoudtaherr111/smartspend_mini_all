# 0033. Capture opens per platform and beta list, refuses old builds, caps phones and daily signals, and honours what the user ignores

- Status: accepted. Built in `api/lib/capture/access.ts` (`captureOpenFor`, `olderThan`, `takeDailySignals`),
  `api/lib/capture/markers.ts` and table `capture_markers`, `capture_usage.signal_day` and `signals` (migration 0038),
  the routes in `api/capture-v1-routes.ts`, `capture.ignored`, `capture.ignore` and `capture.unignore`, the plan number
  `capture_devices`, the settings `capture_platforms`, `capture_beta_users` and `capture_daily_signal_limit`, and the
  version header on Android.
- Decided and recorded: 2026-10-28, from the capture production plan (§4.2, §4.3, §9, §12, §14, §23).

## Context
`capture_enabled` opened capture to every user and both platforms at once, with no way to run the closed beta the plan
calls for. Any build could keep sending after the contract changed. Every plan could register five phones, a phone
could send without a daily ceiling, a family member's card on the same phone was asked about forever, and a message
that only gave a balance was thrown away.

## Decision
1. **Who.** Capture is open when `capture_enabled` is on, the device's platform is in `capture_platforms`
   (`android,ios`), and, when `capture_beta_users` is not empty, the user (`local:12`, `oauth:7`) is on it. The routes
   answer 503 otherwise; `capture.status` says it is closed and `capture.registerDevice` refuses.
2. **Old builds.** A phone sends its version in `X-Client-Version`; one older than `CAPTURE_MIN_CLIENT_VERSION` is
   answered 426 `update_required` on signals and actions. The phone keeps its queue and the card asks for an update.
   A phone that sends no version is not refused, so builds already installed keep working.
3. **How much.** Phones per user come from the plan number `capture_devices` (2 free, 5 Pro and Ultra; 0 means none).
   Signals per user and Cairo day are capped by `capture_daily_signal_limit` (1,000): past it a batch is answered 429
   with `Retry-After` until midnight, counted in `capture_usage`.
4. **What the user ignores.** A card or account by its last three digits, or a phrase (folded the way Arabic is
   compared, at least three letters, never a word every bank message has); up to 30. A matching message is answered
   `ignored` (`user_ignored`) and nothing of it is kept.
5. **A balance alone.** A message the reader reads as a balance with no movement, from a catalog source, sets the
   balance of the one wallet whose last digits it names, when the message is newer than what the wallet holds.

## Consequences
- The closed beta is a setting: a list of users, then an empty list for everyone.
- A balance the reader does not find (some Arabic wordings) moves nothing; the reader learns them from real messages.
