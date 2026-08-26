# SmartSpend AI — SMS Ingestion, Apple Pay & External Integrations

> **AI AGENT SSOT:** This document defines automated SMS ingestion, deterministic text condensation, Apple Pay capture, WhatsApp zero-polling SSE, and Paymob HMAC verification.

---

## 1. 🔌 Integration Data Flows & Targets

| Ingest Channel | Trigger / Source | Authentication | Backend Endpoint |
| :--- | :--- | :--- | :--- |
| **Android Ingestion** | Background SMS capture app (`android-app/`) | `webhookTokens` token | `POST /api/sms/ingest` |
| **Apple Pay iOS** | iOS device push notification shortcuts | `webhookTokens` token | `POST /api/sms/ingest` |
| **WhatsApp Bot** | Direct user text / voice audio messages | OTP Pairing | `/api/admin-whatsapp-router` |
| **Paymob Checkout**| User Pro/Ultra upgrades & checkout events | HMAC SHA-512 signature | `POST /api/webhooks/paymob` |
| **Push Alerts** | WebPush & Firebase Cloud Messaging (FCM) | Active user session | `pushSubscriptions` table |

---

## 2. 📱 Deterministic SMS Input Condensation (`api/lib/sms-rule-parser.ts`)

To prevent token waste on LLM calls, raw bank notifications pass through deterministic condensation before AI invocation:

```
[Raw Bank SMS (~350 chars, 85 tokens)]
├── "البنك التجاري الدولي CIB: تم خصم مبلغ 450.00 جم من بطاقتك المنتهية برقم **4321 
     لدى Carrefour Maadi بتاريخ 25-08-2026 الساعة 14:30. 
     الرصيد المتاح 12,500.00 جم. لأي استفسار اتصل بـ 19666. تطبق الشروط والأحكام."
               │
               ▼ condenseSmsNotification()
[Condensed Payload (~110 chars, 24 tokens) — 71% Token Reduction]
└── "خصم 450.00 EGP من **4321 لدى Carrefour Maadi في 25-08-2026 14:30 الرصيد 12500.00"
```

- **Entity Retention:** Retains action verb, amount, currency, merchant/counterparty, card mask, timestamp, and available balance.
- **In-Memory Deduplication (`aiParseCache`):** Caches parsed transactions with a 15-minute TTL to ensure identical bank SMS notifications incur zero duplicate external API cost.

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
* **Supported Templates:** Supports all major Egyptian banking and fintech SMS structures: CIB, National Bank of Egypt (NBE), Banque Misr, QNB Alahli, Alex Bank, HSBC Egypt, Arab African International Bank (AAIB), Vodafone Cash, InstaPay, Orange Money, Etisalat Cash, and WE Pay.
