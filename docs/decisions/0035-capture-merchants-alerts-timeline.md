# 0035. Captured messages keep their merchant through redaction, admins are alerted in the app, and support sees a user's capture

- Status: accepted. Built in `api/lib/capture/keep-merchants.ts` (`merchantNamesToKeep`, `redactKeeping`), its use
  in the intake's stored text and the model's prompt, `notifyAdmins`, `checkModelQueue` and `captureTimeline` in
  `api/lib/capture/operations.ts`, `captureAdmin.timeline`, and the «تتبّع مستخدم» card of the console's numbers tab.
- Decided and recorded: 2026-10-28, from the capture production plan (§16, §19, §21) and known issue 3 of the bank
  messages page.

## Context
The general redaction masks every capitalised word after من، إلى، to or from, so a merchant written there reached the
model as `[REDACTED_NAME]` and the model could not file the payment. A stopped bank or a stuck model queue showed only in
the console and the logs. Support had no way to see why a user's capture was not working without reading the database.

## Decision
1. **Merchants stay.** Before redaction, the merchant the reader named and names that look like a business (a payment
   gateway's `NAME*SHOP`, a domain, an Arabic shop word with the word after it) are shielded and put back after. In a
   transfer between people nothing is shielded unless the reader said the other side is a merchant, so people's names
   are still removed. A name with four digits in a row is never shielded. The stored text and the model's prompt both
   use it.
2. **Alerts.** Admins (role `admin` in either account table) get an in-app notification when the breaker stops a bank,
   and when a job has waited for the model more than five minutes (checked every minute, once an hour across replicas).
3. **Timeline.** `captureAdmin.timeline` shows one user's phones with their health, consents, the last months' use,
   the last 50 payments (status, kind, bank, reader version, recorded on its own) and the last 20 model jobs, without
   any message text or merchant name.

## Consequences
- The model sees more of the message; a merchant name is not personal data, a person's name in a transfer still is
  removed.
- Admin alerts are in-app only until an alert channel exists.
