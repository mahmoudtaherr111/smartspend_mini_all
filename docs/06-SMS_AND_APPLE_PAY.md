# SmartSpend AI — SMS Ingestion, Apple Pay & External Integrations

> **AI AGENT SSOT:** This document defines automated SMS ingestion, deterministic text condensation, Apple Pay capture, WhatsApp zero-polling SSE, and Paymob HMAC verification.

---

## 1. Actual capture surfaces (journey branch, 2026-09-06)

| Channel | Actual source | Authentication | Endpoint / next step |
| --- | --- | --- | --- |
| Android companion | `NotificationListenerService`: notification `EXTRA_BIG_TEXT` or `EXTRA_TEXT`, selected package/sender filters; not the SMS inbox | Webhook token | `POST /api/sms/ingest` → durable review draft |
| iPhone settings guide | Shortcuts **Message** automation; current guide filters messages containing EGP | Webhook token | Same ingestion endpoint → durable review draft |
| Wallet card tap | Apple provides a distinct Transaction automation trigger; not equivalent to arbitrary notification access | Depends on shortcut | Actual payload from the linked iCloud shortcut is unverified |
| Image / screenshot | Mapped Gemini vision model extracts all visible document events; Zod checks evidence | Authenticated Pro/Ultra/admin | `image.parseReceipt` → durable review draft |
| WhatsApp OTP | Pairing verification events | OTP pairing | Existing SSE flow below |
| Paymob checkout | Product subscription payment webhook | HMAC | Existing payment webhook below |

The UI links an external iCloud shortcut. Its internals have not been verified against `api/lib/shortcut-generator.ts`; do not assume they are the same artifact. Android package coverage and OS behaviour still need signed APK/device validation. See the [research and journey design](reviews/classification-journey-design-2026-09-06.md).

## 2. Evidence → question → financial record

`notificationInputSchema` → `notificationToDraft` → `financialCaptures` → `capture.list/answer/confirm` → transaction + expense details + rollups + saved receipt.

- OTP/authentication messages are discarded before persistence/provider calls. Remaining input is bounded at the HTTP and schema boundaries.
- Explicit currency amounts are distinguished from balance, fees, references and account digits. Incoming credit is not assumed to be salary; a credit-card purchase is not income.
- Recognized subscription merchants suggest a purpose. Renewal/recurrence requires explicit evidence; Amazon/Fawry alone do not reveal the purchased product.
- This branch **requires review for notification and image captures**. It does not claim automatic completion of all-bank classification. The new notification path currently makes no LLM calls; semantic enrichment is a pending release gate.
- Typed answers carry capture ID, event ID and optimistic version; owner ID/type always come from authenticated server context. Other events and source evidence survive an answer.
- Confirm locks, revalidates and saves the complete draft with its details and rollups in one database transaction. Repeat confirmation returns the same saved receipt.
- Unknown facts remain unknown. Pending/rejected transactions, unsupported currency/refund/debt, cropped sources and unresolved reconciliation cannot be silently saved as EGP expenses.
- Android persists an owner/endpoint-scoped queue before delivery. Only an acknowledged response removes an item. Queue capacity is 500; full queue and pairing errors need attention. Notification loss outside the app's access is not recoverable from this API.
- `rawSmsEvents` is the legacy log. New notifications live in `financialCaptures`; the review inbox shows them. The legacy admin SMS table has not yet been adapted to the new store.
- Review expires after 30 days; the retention job prunes non-saved captures 7 days after expiry. Saved captures remain for idempotent receipts; account purge includes both owner types. Saved evidence redaction/minimization needs an explicit lifecycle design.

`api/lib/sms-rule-parser.ts` remains for other callers/tests; its former condensation/AI-save path is no longer the ingestion route above. Do not cite its old 71% token reduction example as measured production savings.

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Zero-Polling WhatsApp OTP via SSE (`GET /api/sse/otp`)
* **Gotcha:** Do not implement a client polling loop to check WhatsApp OTP pairing status.
* **Rule:** Connect to the Server-Sent Events stream mounted at `/api/sse/otp?phone=X`. When `whatsapp-service.ts` validates OTP confirmation, it triggers `otpEvents.emit("otp:${phone}", data)`. SSE pushes `{ verified: true }` instantly to the frontend with a 15-second keep-alive ping.

### B. Paymob Webhook HMAC Field Concatenation Order
* **Gotcha:** Any deviation in field sorting or omission of empty string keys causes HMAC validation to fail, returning `401 Unauthorized`.
* **Rule:** Concatenate standard Paymob transaction fields (`amount_cents`, `created_at`, `currency`, `error_occured`, `has_parent_transaction`, `id`, `integration_id`, `is_3d_secure`, `is_auth`, `is_capture`, `is_refunded`, `is_standalone_payment`, `is_voided`, `order.id`, `owner`, `pending`, `source_data.pan`, `source_data.sub_type`, `source_data.type`, `success`) in strict alphabetical order before computing HMAC SHA-512 against `PAYMOB_HMAC_SECRET`.

### C. Android Webhook Token Rotation (`webhookTokens`)
* **Gotcha:** Rotating pairing keys in user settings causes Android background services to receive `401 Unauthorized`.
* **Rule:** Token rotation generates a new token row in `webhookTokens`. The Android companion app must be updated via the in-app setup QR code.

### D. Multi-Provider Bank Template Compatibility
* **Coverage is unverified:** public documentation establishes transaction families, not a complete catalogue of production SMS templates. Unknown formats must be retained for review and measured by bank/app/OS. Synthetic fixtures are development tests, not evidence of all-bank compatibility.
