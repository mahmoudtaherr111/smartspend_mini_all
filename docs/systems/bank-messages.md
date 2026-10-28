# Bank and wallet messages

Automatic capture of bank, wallet and payment messages, so a transaction is recorded without the user typing it. It
is being rebuilt from scratch: the old intake (the Android companion app, the iPhone Shortcut, the public ingest route,
the rule parser, the filing and the suggestions over the monthly limit, and the setup screens) was removed. The new
intake's server side is built ([below](#the-intake-phones-send-the-user-confirms)): phones register for a device token
and send notifications to `/api/capture/v1`, the reader reads them, and every transaction waits for the user to confirm
it before the ledger is written ([decision 0028](../decisions/0028-capture-intake-from-phones.md)). The Flutter app's
Android capture sends them ([below](#on-the-phone)); iPhone capture comes later. The admin's switch `capture_enabled`
is off, so nothing is captured until the closed beta.

- Facts generated from the code, with diagrams: [docs/atlas/systems/bank-messages.md](../atlas/systems/bank-messages.md)
- The same story for readers who do not read code: [docs/ar/systems/bank-messages.md](../ar/systems/bank-messages.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Capture catalog | `api/lib/capture/catalog.ts`, tables `capture_sources` and `subscription_catalog`; `capture.sources` in `api/capture-router.ts`; `captureAdmin.*` in `api/capture-admin-router.ts`; the console's رسايل البنوك section (`src/components/admin/capture/AdminCaptureTab.tsx#AdminCaptureTab`) | Which banks, wallets and apps are read, and which subscriptions card charges are recognised as ([decision 0024](../decisions/0024-capture-catalog.md)) |
| Intake routes | `api/capture-v1-routes.ts` (`POST /api/capture/v1/signals`, `GET /api/capture/v1/config`, `POST /api/capture/v1/actions`), shapes in `contracts/capture-intake.ts` | What phones call with a device token: send signals, read the config, answer a notification's button |
| Intake | `api/lib/capture/intake.ts` (`gateSignal`, `ingestSignals`, `suggestLedgerEntry`, `buildNotice`, `answerSignal`) | The server's filter, what is kept of a signal, where it would be filed, the notice, and the answer through the ledger writer |
| Devices and consent | `api/lib/capture/devices.ts`, `api/lib/capture/consent.ts`; `capture.registerDevice`, `capture.devices`, `capture.revokeDevice`, `capture.status`, `capture.setConsent` | The device tokens and what the user agreed to |
| Review | `capture.pending`, `capture.answer` in `api/capture-router.ts` | The transactions waiting for the user, and their answer |
| Reader | `api/lib/capture/reader/read.ts#readMessage` | Layer one: reads one message into a reading with its confidence and evidence, without a model ([below](#the-message-reader)) |
| Model reader | `api/lib/capture/ai-reader.ts#readMessageWithModel` | Layer two: the model the admin chose for bank messages reads one message, behind a switch, the plan budget and a daily cost cap ([below](#the-model-reader-not-connected-yet)) |
| Reply contract | `api/lib/sms-ai-contract.ts` | What the model is asked, the reply schema, the checks a reply must pass, and `SmsParseResult`, a reply in the ledger's terms |
| Redaction | `api/lib/anonymizer.ts#redactWithFindings` | Removes card and account digits, IBANs, phones, references, e-mails, codes and people's names before the text leaves for a model |
| Admin controls | the `sms` purpose in the AI providers screen (`contracts/ai-models.ts`); `sms_ai_enabled` and `sms_ai_daily_cost_cap_usd` in `src/components/admin/settings/AdminSmsAiSection.tsx`; `capture_enabled` in `system_settings` | Which provider and model read messages, the switch that stops the model, the daily cost cap in USD, and the switch that opens capture |
| Capture on Android | `mobile/packages/bank_capture` (Kotlin: `BankNotificationListener`, `CaptureGate`, `CaptureQueue`, `CaptureWork.kt`, `CaptureNotifier`, `CaptureActionReceiver`; the Pigeon contract in `mobile/packages/bank_capture/pigeons/bank_capture_api.dart`) | Reads bank, wallet and messaging-app notifications, drops codes and personal messages, keeps the rest encrypted until sent, sends them with the device token and shows the server's notice with its buttons ([below](#on-the-phone)) |
| The app's screens | `mobile/app/lib/src/features/capture/` (`CaptureConnector`, `CaptureReviewScreen`), the card in `mobile/app/lib/src/features/more/bank_capture_card.dart` | Turning capture on (consent, a device token, the native side connected), notification access, what waits to be sent, and the transactions waiting for the person |

Transactions recorded by the old intake stay in the ledger with source `sms`, and the statistics still count them as
automated income and spending ([Money](money.md)).

## Who is read: the capture catalog
[Decision 0024](../decisions/0024-capture-catalog.md). Two shared tables with no user data:
- `capture_sources`: every bank, wallet, payment network, fintech, telecom operator and messaging app whose
  notifications are read: Arabic and English names, countries, Android packages, SMS sender ids, the names messages
  use for it, notes, an order and a status. A package is listed only once Google Play shows it under the company's
  own developer account, a sender id only once a real message shows it; the seed has no sender ids yet. One app
  belongs to one source, and a bank's wallet app belongs to the bank.
- `subscription_catalog`: the subscriptions recognised in a card charge's merchant name, by words compared without
  case and never inside a longer word, the longest winning (`api/lib/capture/catalog.ts#subscriptionForMerchant`), with
  a spending category and subcategory from the taxonomy and a renewal cycle. A store (Google Play, Apple) bills for
  other developers.

The seed (`api/lib/capture/seed-sources.ts`, `api/lib/capture/seed-subscriptions.ts`) is written at boot by the
`seed-capture-catalog` job, under a lock, on the servers that run background jobs, and by the console's «حمّل البيانات
الأصلية» button (`captureAdmin.syncSeed`): a missing slug is inserted and a seeded row nobody edited is updated. An
admin's edit (`captureAdmin.saveSource`, `setSourceStatus`, `saveSubscription`, `setSubscriptionStatus`) marks the
row, and the seed never overwrites it; `captureAdmin.restoreSeed` gives a seeded row back as shipped. A save refuses a
slug already used and an Android package another source owns.

Each server process keeps one copy (`getCaptureCatalog`), reloaded every five minutes or within ten seconds of an
admin change on any process (the `capturecataloggen` generation). `capture.sources` gives a signed-in phone the active
sources (slug, kind, names, packages, sender ids) and a `version`, so a phone keeps its copy until the catalog changes.

## The intake: phones send, the user confirms
[Decision 0028](../decisions/0028-capture-intake-from-phones.md).
1. **A device token.** The app calls `capture.registerDevice` (platform, an installation id, labels) while signed in;
   it refuses while `capture_enabled` is off, past ten registrations an hour and past five active devices. The token
   (`cap_` and 32 random bytes) is returned once and stored as its SHA-256 in `capture_devices`; registering the same
   installation again replaces it. Native code sends it in `X-Capture-Device`. A resolved token is cached five minutes
   with the user's auth version; when that moves, the row is read again, so a revoked device stops at its next
   request. `revokeAllSessions` (sign-out everywhere, a password change) revokes every device, and account deletion
   deletes them (`api/services/user-purge-service.ts`).
2. **Consent.** `capture.setConsent` records `capture` or `ai_reading` with the version of the text the user read
   (`CAPTURE_CONSENT_TEXT_VERSION`) and refuses an older text; taking it back keeps the row with `revoked_at`.
3. **`POST /api/capture/v1/signals`**: up to 20 signals (the phone's id, the channel, the app, the SMS sender, title,
   text, when it arrived) in 64 KB, six batches a minute per device. Without a valid token 401, switched off 503, a bad
   body 400, without the `capture` consent 403. Each signal: older than 30 days or more than an hour ahead is
   `rejected`; one the user's account already has answers with its status and is not stored again; then the filter
   (`gateSignal`): an app's notification must come from an app the catalog lists (`unknown_app`), an SMS may come
   through any messaging app but not from a person's number (`personal_sender`), an SMS sender the catalog does not
   know needs a card, an account or a balance in the text (`unknown_sender`), and the reader must read money that
   moved (its `not_transaction` reasons, `no_amount`; a message without an amount from a catalog source the reader is
   unsure of is kept for the model). What fails is answered `ignored` and nothing of it is stored.
   What passes is kept in `capture_signals`: the text redacted, an HMAC of it, and the reader's fields
   (`SignalReading`: kind, direction, confidence, amount and pound equivalent, fee, balance, card and account
   suffixes, the other side, when and whether the message gave the time, the source). Each signal is taken in a
   transaction that first locks the user's account row, so two batches of one user are matched one after the other.
3b. **The model's queue** ([decision 0031](../decisions/0031-capture-model-queue.md), `api/lib/capture/ai-queue.ts`):
   when the reader is unsure and the user agreed to `ai_reading` (with `sms_ai_enabled` on), the signal is kept with a
   job in `capture_ai_jobs` and answered `queued`; without that consent a reading with no amount is `ignored`. The
   request wakes a worker in its process (three at a time), and the protected job `capture-ai-sweep` reads every minute
   what was left. The worker claims a due job with `FOR UPDATE SKIP LOCKED` and a one-minute lease, asks the model
   outside any transaction (a failure is tried again after 30 seconds and two minutes, three calls in all), then places
   the signal as below under the user's lock (`placeSignal`). The model's reading (`readingFromModel`: kind, direction
   and amounts from the model, card, balance and reference from the reader) is `likely`, never recorded on its own, and
   its notice has both buttons. When the model is not used the reader's reading is asked about if it has an amount, else
   the signal is dropped; a reading of no money moved keeps nothing. The notice waits on the job until the phone takes it
   from `GET /api/capture/v1/notices` (each once, with how many still wait).
3a. **One payment, one event** ([decision 0029](../decisions/0029-one-payment-one-event.md),
   `api/lib/capture/events.ts#matchSignal`): the signal joins an event of the last three days of the same user, or
   starts one in `capture_events`. It joins on the bank's reference (an HMAC) with the same amount within a day; on the
   same words from another of the user's phones within ten minutes; from another channel (device, channel and source)
   with the same money, both directions known and no conflicting card (last three digits), merchant or balance of the
   same account within five minutes (fifteen when both messages give the same minute), when that channel is not on the
   event yet; as the pound posting of a foreign charge with the same card and merchant within three days; or as the
   other leg of a transfer between the user's own accounts when both legs say so. The same words from the same channel
   within five minutes start their own event marked as a possible duplicate, and the user is asked. A joining signal
   fills what the event lacked (card, merchant, reference, balance, the pound amount). A new event is answered
   `review` with a notice in the phone's language: the source's name, the kind, the amount and the merchant (isolated so
   Latin keeps its direction), the filing, a line saying it may be the payment before when it is a possible duplicate,
   and the buttons "record" and "dismiss" only when the reading is certain and in pounds; otherwise the notice asks to
   open the app. A signal that joins an event waiting for an answer is answered `merged`, or `review` again when it
   brought a foreign charge's pound amount; one that joins an answered event gets that answer (`recorded`, or
   `dismissed` for a dismissed or deleted one). A card or account suffix matching exactly one of the user's wallets
   puts the event on that wallet.
4. **Where it would be filed** (`suggestLedgerEntry`): a purchase whose merchant the subscription catalog knows goes
   where the catalog says, any other purchase to متنوعات; a bill to فواتير, a recharge to شحن رصيد, a fee to رسوم
   بنكية, an installment to أقساط, a salary to مرتب, interest and cashback to their income, a refund to مرتجعات
   واسترداد (decision 0010, until the purchase can be found), and ATM withdrawals, deposits, transfers and card
   payments to تحويل with their direction.
5. **The answer** (`answerEvent`): from the notification's button (`POST /api/capture/v1/actions` with the event's
   id, only for events that device started in the last 48 hours) or from the app (`capture.answer`, which may choose
   another category or give the pound amount of a foreign charge). "record" writes the ledger row through the ledger
   writer in the same transaction that marks the event `recorded`: source `sms`, `clientRequestId` `cap:e<event>`, the
   amount in pounds, the date the message gives, the event's wallet, a description made of the other side and the
   source's name, no `raw_text`, and the capture's ids in `parsed_metadata.capture`; the streak counts it, since the
   user tapped. A refund whose merchant has a recorded event in the 90 days before, of at least its amount, is a
   negative expense in that purchase's category (decision 0010) and links to it. When the event has a wallet and a
   balance, the wallet's balance becomes the message's if the message is newer than what the wallet holds
   (`balance_source = 'bank_message'`). A transfer between the user's own accounts is one transfer row. "dismiss"
   marks the event. An answered event keeps its answer, so a repeated tap writes one row. Deleting the ledger row
   marks its event `deleted` (`api/services/ledger-writer.ts#deleteLedgerEntry`), so a late signal of the same payment
   does not bring it back.
6. **`GET /api/capture/v1/config`**: whether capture is on, the user's consents, the oldest build allowed, the catalog's
   sources and version, the phone's filter lists (`CAPTURE_GATE`: words for codes and for money) and the batch limits.
8. **Memory and recording on its own** ([decision 0030](../decisions/0030-capture-memory-and-recording-alone.md),
   `api/lib/capture/memory.ts`). The filing comes from the user's own memory first (`capture_memory`: a merchant by its
   key, a person by an HMAC of their address or name), learned from the user's answer and from an edit of a recorded
   row's category (`updateLedgerEntry` teaches it in the edit's transaction); then the subscription catalog; then the
   kind's default (`suggestLedgerEntry`, which says where its filing came from). A new payment is recorded in the
   intake's own transaction, without the streak, when `mayRecordAlone` allows it: a certain reading in pounds, not a
   possible duplicate, from a source not in `capture_paused_sources`, of a pair the admin lists in
   `capture_auto_pairs` (`cib:card_purchase`, `*:card_purchase`) or the user agreed to, and not a transfer to or from a
   person at or above `capture_p2p_ask_above`. Its answer is `recorded` with a notice "اتسجلت …" (marked when the filing
   is only the kind's default) and an `undo` button; `undo` from that device deletes the row through the ledger writer,
   gives the month's count back and turns the pair back to asking. Recording a payment as it was read (no amount typed)
   counts one more for its pair in `capture_user_pairs`; after three in a row `capture.autoOffers` lists the pair and
   `capture.setAuto` records the user's answer. A payment that waits for an answer is a notification only for the first
   `capture_daily_question_notices` (2) of the Cairo day; the rest are answered `review` without a notice and wait in
   the app. The admin edits these in the settings' capture section (`src/components/admin/settings/AdminCaptureSection.tsx`).

7. **The monthly limit** (the owner's decision, decision 0028): `capture_monthly_limit_<plan>` (`contracts/plan-features.ts`,
   50 on Free, none on Pro and Ultra, edited in the admin's plans tab) counts the new payments of a Cairo month in
   `capture_usage`. A new event the reader is sure or fairly sure of reserves one under the user's lock (an unsure
   one counts only if the user records it); over the limit it is `held`: kept with its reading, no notice, no ledger,
   up to 200 at a time and for 60 days. The first held payment of a month is answered `held` with a notice saying so
   ("وصلت لحد الشهر…"); the payment that reaches 80% of the limit adds how many are left to its notice. Dismissing a
   payment gives its count back. When the user's plan has no limit, the held payments of the last two months come back
   as payments waiting for an answer at the next request (`releaseHeldEvents`, called by the intake, `capture.status`
   and `capture.pending`). `capture.status` returns the month's use, the limit and the held count. The plans page shows
   the limit (`pro.planCatalog`, the row `bank_messages`, only while capture is open), and for no limit that what was
   missed in the last two months is recorded on subscribing.

## On the phone
Android only for now; the plugin is `mobile/packages/bank_capture`, and capture runs without Flutter.
1. **Turning it on** (the More screen's card): the person reads what is read and kept and agrees (`capture.setConsent`),
   the app registers this installation (`capture.registerDevice`, with an id kept in the phone's preferences so
   registering again replaces the same device) and hands the token, the account (`local:12`), the API's origin and the
   interface language to the native side (`connect`), asks to show notifications (Android 13) and opens the
   notification access screen. Signing out calls `disconnect`, which forgets the token, the queue and what was seen;
   an expired session does not.
2. **The listener** (`BankNotificationListener`, its component name kept so granted access survives updates): an app
   neither the catalog (from `/config`) nor the phone's default SMS app names is refused before its notification is
   read; group summaries and ongoing notifications are skipped. The text is the newest message of a conversation with
   its sender and time, else the long text, the inbox lines or the short text. The filter (`CaptureGate`, fixed code
   fed by the `/config` lists, its cases shared with the server in `contracts/capture-fixtures/phone-gate.json`) drops
   a person's number in a messaging app, a one-time code (a code word and four to eight digits with no currency word)
   and a text without a digit. A notification the system posts again (the same key, time and text) is kept once.
3. **The queue** (`CaptureQueue`, the framework's SQLite): each signal with its text and title encrypted by an AES-GCM
   key in the Android Keystore, for the account it was captured for; a signal of another account or older than 30
   days is dropped.
4. **Sending** (`CaptureWork.kt`): one unique WorkManager chain, expedited when the system allows, needing a network,
   retried with backoff, and a send every six hours as a safety net. It reads `/config` when it is six hours old, sends
   up to five batches, deletes every signal the server answered, and shows each `review` notice (`CaptureNotifier`):
   private on the lock screen, in the interface language, with the server's buttons. A 401 forgets the token and the
   queue; a 403 or 503 keeps the queue and reads the config again. After a batch with a `queued` result,
   `NoticeWorker` fetches `/notices` ten seconds later and shows each one, asking again while some still wait (five
   tries).
5. **The buttons** (`CaptureActionReceiver`): "record", "not mine" or, on a payment recorded on its own, "undo"; the
   notice goes at once and `ActionWorker` sends the answer to `/api/capture/v1/actions` until the server has it, without
   opening the app.
6. **The card** also holds the switch for `ai_reading` (letting the admin's model read unclear messages), on or off at
   any time.
7. **The review screen** (`/more/capture`): the offer to record a bank and kind on their own when there is one, then
   the waiting transactions with their source, amount, merchant and filing; "record" or "not mine", and the pounds of a
   foreign charge typed first.

## The message reader
[Decision 0026](../decisions/0026-message-reader-before-the-model.md). `api/lib/capture/reader/read.ts#readMessage` is
layer one of the rebuilt capture: a pure function that reads one notification into a `Reading` (kind, direction,
amount and currency, pound equivalent, fee, balance or available limit, minimum due, card and account suffixes, the
other side with a merchant key or a phone tail or an InstaPay address, when, reference, a subscription hint),
with a confidence (`certain`, `likely`, `unsure`), the fields it missed, and its evidence with positions in the
original text. `api/lib/capture/reader/explain.ts#explainReading` turns that evidence into one Arabic sentence.
- Steps, all in `api/lib/capture/reader/`: `api/lib/capture/reader/normalize.ts` (two views of the text with a position map) → `api/lib/capture/reader/spans.ts` (typed
  pieces, first claim wins) and `api/lib/capture/reader/lexicon.ts` (Arabic and English words with ids) → `api/lib/capture/reader/clauses.ts` →
  `api/lib/capture/reader/kind.ts` (non-transactions first, then the strongest money verb; equal opposing verbs make it unsure) →
  `api/lib/capture/reader/roles.ts` (each amount's role) → `api/lib/capture/reader/counterparty.ts` → `api/lib/capture/reader/when.ts` (Cairo time, a missing year from the
  receive date).
- `api/lib/capture/reader/fixtures.ts` builds the benchmark corpus from bank, wallet and payment shapes, written for this public
  repository; `api/lib/capture/reader/reader-benchmark.test.ts` fails under each field's floor or when the reader is certain and wrong
  (`npm run bench:capture` prints the table).
- The intake calls it for every signal (`api/lib/capture/intake.ts#gateSignal`); what it is unsure of goes to the
  model's queue when the user agreed.

## The model reader
`api/lib/capture/ai-reader.ts#readMessageWithModel` is called by the queue's worker. It takes one message and the user (id, type, plan, the sender, a
provider already recognised) and returns the reply that passed the contract, that reply in the ledger's terms, and an
outcome; when the model was not asked or its reply is not used, the outcome says why ([decision 0025](../decisions/0025-bank-message-model-through-admin-gateway.md)).
It checks, in this order, and stops at the first refusal:
1. a user to charge (`no_user` without one) and the admin's switch `sms_ai_enabled` (`disabled` when it is `false`);
2. the text is condensed (`api/lib/capture/ai-reader.ts#condenseMessage`: greetings, hotlines, links, promotions,
   security warnings, terms and sign-offs go; when that loses every digit the cleaned text is used) and redacted
   (`api/lib/anonymizer.ts#redactWithFindings`): card and account digits, IBANs, Egyptian phone numbers, reference
   numbers, e-mails, codes and the names after من، إلى، لـ، to, from or Dear become markers such as `[REDACTED_CARD]`;
   amounts, balances, fees, dates and merchants stay. The sender is redacted the same way. The last four digits of a
   card stay on the server;
3. a per-user cache kept in memory for 15 minutes, keyed by the prompt version and the exact prompt (it stores and
   hands out copies; `cache_hit`);
4. the routes: the models the admin assigned to the `sms` purpose for the user's plan, in their priority order
   ([AI platform](ai-platform.md#choosing-a-provider)), and no built-in provider behind them. With none configured,
   `GEMINI_API_KEY` with the model `mapModelName("flash")` resolves to (temporary); with neither, `no_route`;
5. the plan budget, `assertAiBudget` on the `sms` channel (`budget`; the burst guard counts `ai_sms` events);
6. the daily cap `sms_ai_daily_cost_cap_usd` (0 means none): what the ledger holds for `sms` since Cairo midnight,
   across all users, plus the most this call could cost at the routes' prices (`api/lib/ai-pricing.ts`). With a cap,
   a route without a price is left out, and none left means the cap is reached (`cost_cap`; a cap that cannot be
   read counts as reached).

Then one call carries this one message of this one user (`executeLlmChain`, with low thinking and at most 512 output
tokens). Its attempts go to the [AI cost ledger](ai-platform.md#how-a-call-is-recorded) at each provider's price, and
the tokens to the user's plan budget (`trackAiTokens`); a call that fails is recorded too (`failed`).

The message reaches the model as one JSON string (`sms-v2`), so nothing inside it can end it. The reply is checked by
`api/lib/sms-ai-contract.ts` (`SMS_PROMPT_VERSION`): the kind of message (card purchase, ATM
withdrawal, wallet send, salary, declined, one-time code…), direction (`in`, `out`, `internal`), amount and currency,
EGP equivalent, fee, balance, counterparty type, rail, category from `contracts/categories.ts`, a subscription hint and a
confidence per field. It is discarded (`invalid_reply`) when the amount is not written in the redacted text, the
currency is not an ISO code, the category is not in the list or the direction does not fit the kind; a fee, balance,
EGP equivalent or merchant not written in the text is dropped. A valid reply is `parsed`, or `not_transaction` for a
declined payment, a hold, a code, an offer, a statement or a balance, or `needs_review` for a foreign amount with no
EGP equivalent in the text, which is not used as pounds.

## Data
- `capture_sources` and `subscription_catalog`: the capture catalog above, shared by all users.
- `capture_devices` (one row per installation: the token's hash, labels, last seen, revoked), `capture_consents` (one
  row per grant, kept after it is taken back) and `capture_signals` (a kept signal with its event, deleted after 30
  days by the retention job): migration `db/migrations/0031_capture_intake.sql`.
- `capture_events` (one payment: its status, the keys signals are matched on, its channels, wallet, ledger row and the
  refund's purchase; the first signal's reading while it waits or is held, cleared on the answer): migrations
  `db/migrations/0032_capture_events.sql`, `db/migrations/0033_capture_signals_drop_review.sql` and
  `db/migrations/0034_capture_usage.sql`. One never answered goes after 30 days, a held one after 60, an answered one
  after 400.
- `capture_usage` (one row per user and Cairo month: the payments counted against the limit, the held ones, whether
  the user was told, and the day's questions): migration `db/migrations/0034_capture_usage.sql`.
- `capture_memory` (one row per user and merchant or person: where the user files it) and `capture_user_pairs` (one
  row per user, bank and kind: the confirmations in a row, whether the offer was made and taken), and
  `capture_events.auto_recorded`: migration `db/migrations/0035_capture_memory.sql`.
- `capture_ai_jobs` (one row per signal waiting for the model: its status, attempts, lease, outcome, the event it
  became and the notice the phone has not taken yet), deleted after seven days: migration
  `db/migrations/0036_capture_ai_jobs.sql`.
- The old intake's tables, `webhook_tokens` (one token per user) and `raw_sms_events` (every message as received,
  with account digits and balances, and the suggestions waiting over the limit), were dropped by
  `db/migrations/0030_drop_old_bank_messages.sql`, raw messages and waiting suggestions included.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| What is kept, ignored or refused, and the notice | `api/lib/capture/intake.ts` | `api/lib/capture/intake.test.ts` |
| What the model reads, retries and leaves for the phone | `api/lib/capture/ai-queue.ts`; the route in `api/capture-v1-routes.ts`; `NoticeWorker` in `CaptureWork.kt` | `api/lib/capture/ai-queue.test.ts`, `tests/capture-intake.test.ts` |
| When signals are one payment | `api/lib/capture/events.ts` (`matchSignal`, `MATCH_WINDOWS`) | `api/lib/capture/events.test.ts` |
| What is recorded without a question, and the memory | `mayRecordAlone` in `api/lib/capture/intake.ts`, `api/lib/capture/memory.ts`; the settings in the admin's capture section | `api/lib/capture/intake.test.ts`, `tests/capture-intake.test.ts` |
| The routes, the device token and the answer | `api/capture-v1-routes.ts`, `api/lib/capture/devices.ts`, `api/capture-router.ts` | `tests/capture-intake.test.ts` (`npm run test:db`) |
| How a message is read without a model | `api/lib/capture/reader/` | `api/lib/capture/reader/read.test.ts`, `api/lib/capture/reader/reader-benchmark.test.ts`, `npm run bench:capture` |
| Which provider and model read messages | the AI providers screen, purpose «قراءة رسايل البنوك والمحافظ» (`sms`) | `api/lib/capture/ai-reader.test.ts` |
| Whether the model is asked, and its daily cap | the `sms_ai_enabled` and `sms_ai_daily_cost_cap_usd` settings; the order of the checks in `api/lib/capture/ai-reader.ts` | `api/lib/capture/ai-reader.test.ts` |
| What the model is asked and what is accepted back | `api/lib/sms-ai-contract.ts` (prompt, schema, checks, `SmsParseResult`); change `SMS_PROMPT_VERSION` with it | `api/lib/sms-ai-contract.test.ts` |
| What is removed before a model sees the text | `api/lib/anonymizer.ts`; the condensing in `api/lib/capture/ai-reader.ts` | `api/lib/anonymizer.test.ts`, `api/lib/capture/ai-reader.test.ts` |
| The banks, wallets, apps and subscriptions shipped with the app | `api/lib/capture/seed-sources.ts`, `api/lib/capture/seed-subscriptions.ts` (confirm every package on Google Play and every sender id from a real message) | `api/lib/capture/catalog.test.ts` |
| Them in production, without a deploy | the console's رسايل البنوك section | `src/components/admin/capture/AdminCaptureTab.test.tsx` |

## Rules for changes here
1. Never log message text (golden rule 10 in the root `AGENTS.md`): the model reader logs an event with the user, the
   provider, the model, the outcome or the message's length (`sms.parse.cache_hit`, `sms.ai.read`, `sms.ai.skipped`,
   `sms.ai.reply_rejected` with the names of the failed checks), never the text, the amount or the category.
2. Nothing reaches a model before `redactWithFindings`, and one call carries one message of one user: never batch
   messages of different users into one prompt. A model is only the one the admin assigned to `sms` (or, until then,
   the server's Gemini key), behind the switch, the budget and the cap.
3. The reader comes first; the model reads only what the reader is unsure of. A model call per message costs money.
4. A recorded signal is a money-moving write: it goes through the ledger writer (decision 0027) in the transaction
   that marks the signal, and every read and write is scoped to the device's or the session's user and user type.
5. The bank's text never enters the ledger or a log: it stays redacted with the signal for 30 days.
6. Messages and examples in tests and fixtures are invented: the repository is public.

## Tests
`api/lib/capture/intake.test.ts` checks the filter (a purchase is kept with its card and merchant, a code is ignored,
an unlisted app is refused, a person's SMS is ignored, any messaging app is taken for a known bank, an unknown sender
needs a card), the filings and the notice (Arabic and English, isolated Latin, no buttons for a foreign amount).
`api/lib/capture/events.test.ts` checks every merge rule (the SMS and the app's notification join, two coffees from
one channel stay two, the same words twice are asked about, another phone's copy joins, a card, merchant or balance
conflict keeps them apart, three and four digit cards, the reference, the same-minute window, the pound posting, a
transfer between the user's own accounts and only then).
`tests/capture-intake.test.ts` (`npm run test:db`) runs the routes and the answer against MySQL: a retried signal is
kept once, repeated taps write one ledger row without the bank's text, the app's own filing and a dismissal, the SMS
and the app's notification asked about once, the same words twice asked about, a deleted row not brought back, a
refund in its purchase's category, the wallet and its balance, a Google account with the same id seeing and answering
nothing, a revoked device, missing consent and the switch refused, and the model's queue (no amount and no consent is
dropped; the model's reading asked once through the notices and recorded on the answer; a reading of no money keeps
nothing; three failures fall back to the reader's reading). `api/lib/capture/ai-queue.test.ts` checks how a reply
becomes a reading.
`api/lib/capture/phone-gate-fixtures.test.ts` keeps the phone's shared cases on the lists the server sends, and
`CaptureGateTest` in `mobile/packages/bank_capture/android/src/test` runs them in Kotlin (the Mobile workflow).
`mobile/app/test/capture_test.dart` checks turning capture on, the switch being off, signing out, and the review screen.
`api/lib/capture/reader/read.test.ts` and `api/lib/capture/reader/reader-benchmark.test.ts` check the reader.
`api/lib/sms-ai-contract.test.ts` checks the reply contract without a model (an amount, currency, category or direction
that fails is discarded, a merchant or balance not in the text is dropped, declined and promotional kinds are never
transactions, a foreign amount without its EGP equivalent is not used). `api/lib/capture/ai-reader.test.ts` runs the
model reader against a fake provider (the admin's route is used and nothing else, the server key without one, a
redacted prompt, one message per call, the switch, the budget and the cap, what a rejected reply leaves) and checks that
condensing drops boilerplate and keeps every amount and card. `api/lib/anonymizer.test.ts` checks what redaction
removes and what it keeps. `api/lib/capture/catalog.test.ts` checks the seed (unique slugs, one owner per app, every
licensed bank, no guessed sender id), the lookups by app, sender and merchant name, the admin's input rules and which
rows the seed may write.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** iPhone capture is not built: the card on an iPhone only opens the Shortcuts app. There is no push: a
   question from the model the phone did not fetch within about a minute shows only in the app. The Android side was compiled and tested only in CI; it
   has not run on a real phone yet.
2. **Debt.** Until the admin assigns a model to the `sms` purpose, `readMessageWithModel` falls back to
   `GEMINI_API_KEY` with `mapModelName("flash")` (`smsRoutes` in `api/lib/capture/ai-reader.ts`). It is meant to go
   once the key is registered as a provider in the console (decision 0025).
3. **Gap.** Redaction masks every name-like word after من، إلى، to or from, so a merchant written there ("from AMAZON",
   "من كارفور") reaches the model as `[REDACTED_NAME]`; merchants written after لدى or at are kept.

4. **Gap.** The merge windows are guesses until real messages measure them. A hold the bank settles later is not
   joined to its charge (the reader reads a hold as no transaction), and a transfer that might be between the user's
   own accounts without both legs saying so is asked about as two payments.

## Related systems
- The Flutter app in `mobile/`: not a system page; its rules are in `mobile/AGENTS.md`.
- [Money](money.md): the ledger, where transactions recorded by the old intake stay, and the cards and wallets screen.
- [Recording spending](expense-capture.md): typed, spoken and photographed entries.
- [AI providers and usage limits](ai-platform.md): the admin's routes, the budget and the cost ledger the model call
  goes through.
- [Admin console, support and growth tools](admin.md): the capture catalog tabs and the bank-message model's settings.
- [Server platform and data](platform.md): the retention job and storage classes.
