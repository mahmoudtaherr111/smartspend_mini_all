# Decisions

Each file records one architecture decision: its context, the decision, and the consequences a contributor must live
with. Records are dated and never rewritten; when a decision changes, add a new record that supersedes the old one and
set the old one's status to "superseded by …".

A record explains why the code looks the way it does. What the code does today is in `docs/atlas/`.

| Record | Decision |
| --- | --- |
| [0001](0001-two-user-tables.md) | Two user tables; a user is the pair of id and type |
| [0002](0002-integrity-in-application-code.md) | No foreign keys; integrity lives in application code |
| [0003](0003-local-first-classification.md) | Local-first classification; a model only chooses categories |
| [0004](0004-commercial-module-scope.md) | Scope of the commercial (B2B) module |
| [0005](0005-provider-key-ring.md) | Provider keys: a key ring over the existing format, resealed on load |
| [0006](0006-gemini-model-chain.md) | Gemini models: a chain of served text models, and the plain Live model for calls |
| [0007](0007-plan-limits-are-admin-settings.md) | What each plan includes is an admin setting, not code |
| [0008](0008-money-movements-and-taxonomy.md) | Purpose before person, money movements as transfers, and one taxonomy |
| [0009](0009-bank-messages-over-the-limit.md) | Bank messages over the monthly limit are kept as suggestions (superseded) |
| [0010](0010-refunds-net-their-category.md) | A refund is spending coming back to its category |
| [0011](0011-embeddings-memory-not-classification.md) | Gemini embeddings serve memory search, not expense classification |
| [0012](0012-classification-without-embeddings.md) | Expense classification has no semantic (embedding) layer |
| [0013](0013-caching-as-one-system.md) | A cache is correct by its key, not by being cleared; one inventory of every cache |
| [0014](0014-migrations-build-the-schema.md) | The migrations build the schema: a guarded reconcile migration, `db:doctor`, and a CI check |
| [0015](0015-roles-before-categories.md) | Every number and every word gets its role before anything is classified |
| [0016](0016-voice-coach-profile.md) | The coach call: the live model reasons, the app computes and writes, behind a rollout |
| [0017](0017-ultra-thinking-mode.md) | Ultra Thinking: a mode the user switches to, on the extended model at LOW, off until qualified |
| [0018](0018-voice-production-boundaries.md) | Durable consent, distributed call ownership, recovery, memory forgetting and measured capacity |
| [0019](0019-verify-consent-speech-before-playback.md) | Complete draft previews and write receipts are verified before audio or captions are released |
| [0020](0020-optional-english-interface.md) | Optional English UI mode with Arabic source of truth and data stability |
| [0022](0022-flutter-mobile-app.md) | One Flutter app in `mobile/` on the same API, native code only where the platform demands it |
| [0023](0023-mobile-app-lock.md) | The mobile app lock: a 6-digit PIN checked by a phone-held key, biometrics bound to the Keystore or Keychain |
| [0024](0024-capture-catalog.md) | The capture catalog: banks, wallets and subscriptions are confirmed data the admin edits |
| [0025](0025-bank-message-model-through-admin-gateway.md) | Bank-message model calls go through the admin gateway, redacted, budgeted, switchable and capped in USD |
| [0026](0026-message-reader-before-the-model.md) | Code-first bank-message reader (superseded by 0049) |
| [0027](0027-one-ledger-writer.md) | One ledger writer: rows of `expenses` are added, changed and removed through `api/services/ledger-writer.ts` |
| [0028](0028-capture-intake-from-phones.md) | Device-token capture intake (confirmation requirement superseded by 0049) |
| [0029](0029-one-payment-one-event.md) | One payment, one event: captured signals are merged by rules that never merge on a guess |
| [0030](0030-capture-memory-and-recording-alone.md) | Capture memory and automatic recording (pair requirement superseded by 0049) |
| [0031](0031-capture-model-queue.md) | Capture model queue (model selection and ask-only behaviour superseded by 0049) |
| [0032](0032-capture-breaker-and-bulk-undo.md) | A bank whose recordings are taken back stops recording on its own, and the admin can undo a bank's recordings in bulk |
| [0033](0033-capture-access-and-ignore-lists.md) | Capture opens per platform and beta list, refuses old builds, caps phones and daily signals, and honours what the user ignores |
| [0034](0034-capture-care-for-the-user.md) | Capture looks after the user: phone health, the upgrade notice, wallet suggestions and deleting their data |
| [0035](0035-capture-merchants-alerts-timeline.md) | Capture merchant handling, alerts and support timeline (merchant handling superseded by 0049) |
| [0036](0036-google-sign-in-nonce.md) | Google sign-in from the app is bound to one sign-in by a nonce the app makes and the server spends once |
| [0037](0037-website-session-cookie-only.md) | The website's session is the HttpOnly cookie alone: the website never stores, reads or sends a token |
| [0038](0038-whatsapp-cloud-api.md) | WhatsApp goes through Meta's official Cloud API, every message through a persistent outbox |
| [0039](0039-clarifications-confirmation-vs-immediate-save.md) | Clarifications use optimistic immediate save with undo banner instead of blocking confirmation modals |
| [0040](0040-real-device-features.md) | Device features are real or hidden |

| [0042](0042-no-codes-until-store-offers.md) | Remove discount and referral code entry points until store offers can be honoured |

| [0043](0043-capture-evidence-before-automatic-recording.md) | Evidence-grounded capture contract (sms-v4 superseded by 0049) |

| [0044](0044-durable-capture-worker-and-admission.md) | Bind queued identity maps cryptographically and reserve capture-only costs and capacity before HTTP |

| [0045](0045-versioned-ledger-cashflow.md) | Versioned ledger cashflow (cutover procedure superseded by 0049) |

| [0046](0046-atomic-capture-bundles.md) | File a captured payment, its fee and its quota in one transaction, and keep later user edits |

| [0047](0047-post-save-feedback-and-explicit-wallet-semantics.md) | Optional purpose questions after saving, renewed automatic consent, and explicit wallet kinds |

| [0048](0048-direct-sms-samples-and-live-contract-fixes.md) | Direct SMS and consented samples (sms-v4 and switch defaults superseded by 0049) |

| [0049](0049-one-capture-path-model-decides.md) | One capture path: the phone sends on keywords, the model decides on labelled numbers, checks that read no words, everything complete recorded on its own |

| [0050](0050-backend-and-console-without-the-website.md) | The server serves the API and the admin console only; the website is parked, and the console has its own styles, kit and client |

| [0051](0051-commitments-ecosystem.md) | Installments, subscriptions, school fees, debts and gam3eyas are one commitments system with five shapes; a payment links on its own only when certain, else the person is asked |

| [0052](0052-understanding-engine.md) | A model reads a sentence into money events and the code verifies the reading with exact checks; taxonomy v2 is the purpose alone; no confidence numbers; stored names kept through a bridge for now |
