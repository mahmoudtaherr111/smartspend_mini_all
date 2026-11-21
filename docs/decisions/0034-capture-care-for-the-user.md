# 0034. Capture looks after the user: phone health, the upgrade notice, wallet suggestions and deleting their data

- Status: accepted. Built in `api/lib/capture/care.ts` (`recordHeartbeat`, `runSilentDevices`, `walletOffers`,
  `deleteMyCaptureData`), `releaseHeldEvents` and `captureUsageOf` in `api/lib/capture/intake.ts`, the route
  `POST /api/capture/v1/heartbeat`, `capture.walletOffers`, `capture.answerWalletOffer` and `capture.deleteMyData`,
  the job `capture-silent-devices`, `capture_devices.last_heartbeat_at`, `health` and `silent_notice_at` (migration
  0039), `CaptureHealth.kt` on Android and the app's bank message settings screen.
- Decided and recorded: 2026-10-28, from the capture production plan (§3, §4.3, §9, §12, §14, §18).

## Context
The server could not tell a phone that stopped capturing (access taken away, the app removed or killed) from a user
who made no payments. On an upgrade, held payments only became questions, with nothing telling the user. A card seen
in every message never became a wallet unless the user typed it. And there was no way to delete what capture keeps.

## Decision
1. **Health.** Every twelve hours the sending work reports whether notification access is granted, whether
   notifications may be shown, what waits and when it last captured; never a message. A phone that reports no access
   tells its user once in the app, again only after it reported access in between. The phone itself shows a local
   notification once a day while access is gone, since the server cannot reach it. Every day at 11:00 the job tells
   the user once about an Android phone silent for two days, while they still consent.
2. **Upgrade.** Held payments are released oldest first; those the user or the admin let record on their own are
   recorded, the rest wait for an answer, and one in-app notice says how many. While payments are held, the app shows
   until when the first of them is kept.
3. **Wallets.** A card or account seen in two payments within 60 days with no wallet of those digits is suggested once
   ("لقينا كارت … آخره …"); accepting adds the wallet, declining (or ignoring the card) stops the suggestion.
4. **Deleting.** `capture.deleteMyData` deletes the signals with their texts, the model's queue, the memory, the pairs,
   the ignore lists and the payments still waiting, strips answered payments to tombstones (no card, account, merchant
   or balance), revokes every phone and consent, and leaves the ledger and the month's count as they are.
5. **The settings screen** lists the phones (this one marked) with a stop button each, the ignored cards with adding
   and removing, and the delete button with one confirmation.

## Consequences
- Without push, the server's notices reach a mobile user only on the web app's notifications; the phone's own local
  notification covers lost access.
- Deleting is final; the month's count stays so it cannot be used to reset the free limit.
