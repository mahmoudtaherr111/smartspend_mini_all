# SmartSpend AI — SMS Ingestion, Apple Pay & External Integrations

> **AI AGENT SSOT:** This document defines the automated SMS captures, WebRTC voice states, WhatsApp pairing SSE endpoints, and Paymob verification gotchas.

---

## 1. 🔌 Integration Data Flows & Targets

| Ingest Channel | Trigger / Source | Authentication | Backend Endpoint |
| :--- | :--- | :--- | :--- |
| **Android Ingestion** | Background SMS capture app (`android-app/`) | `webhookTokens` token | `POST /api/sms/ingest` |
| **Apple Pay iOS** | iOS device push notifications | `webhookTokens` token | `POST /api/sms/ingest` |
| **WhatsApp Bot** | Direct user text / voice audio messages | OTP Pairing | `/api/admin-whatsapp-router` |
| **Paymob Checkout**| User upgrades to Pro / checkout events | HMAC query signature | `POST /api/webhooks/paymob` |

---

## 2. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Zero-Polling WhatsApp OTP via SSE (`GET /api/sse/otp`)
* **Gotcha:** Do not implement a client polling loop to check WhatsApp OTP state.
* **Rule:** Use Server-Sent Events mounted at `/api/sse/otp?phone=X`. When `whatsapp-service.ts` receives OTP confirmation via webhook, it triggers `otpEvents.emit("otp:${phone}", data)`. SSE pushes this instantly with a 15-second keep-alive ping.

### B. Paymob Webhook HMAC Sort Order
* **Gotcha:** Reordering fields will cause HMAC validation to fail, returning `401 Unauthorized`.
* **Rule:** Concatenate standard Paymob fields (`amount_cents`, `created_at`, `currency`, `error_occured`, `has_parent_transaction`, etc.) in strict alphabetical/API order before signing via SHA-512 against `PAYMOB_HMAC_SECRET`.

### C. Android Webhook Token Rotation (`webhookTokens`)
* **Gotcha:** Rotating pairing keys in settings causes Android apps to throw `401 Unauthorized`.
* **Rule:** If the user updates or rotates their pairing token, the Android companion app must re-fetch or re-scan the setup pairing QR code.

### D. Voice Call Connection State & Headless Browsers
* **Gotcha:** During E2E or headless browser testing, the voice call interface may hang on "جاري الاتصال...".
* **Rule:** This is expected behavior in headless automation runs due to missing microphone/WebRTC device access permissions.
