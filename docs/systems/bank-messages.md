# Bank and wallet messages

Automatic capture of bank, wallet and payment messages: the user pays any way (a card, Apple Pay, InstaPay,
Vodafone Cash, a bank transfer), the phone sends the message, and the ledger shows it as spending or income with its
details, without the user typing anything. One path since [decision 0049](../decisions/0049-one-capture-path-model-decides.md):
the phone sends what holds a keyword, the model decides what it means, and the code only keeps the model honest.
Android captures SMS (the SMS build) and bank and wallet app notifications; iPhone capture is not built.

- Facts generated from the code, with diagrams: [docs/atlas/systems/bank-messages.md](../atlas/systems/bank-messages.md)
- The same story for readers who do not read code: [docs/ar/systems/bank-messages.md](../ar/systems/bank-messages.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`, `mobile/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| The phone's filter | `CaptureGate.kt` in `mobile/packages/bank_capture/android/src/main/kotlin/com/smartspend/bank_capture/`, the list in `gate.keywords` of `/config` | Sends a message whose title or text holds one of the owner's 31 keywords; keeps everything else on the phone |
| Capture on Android | `BankNotificationListener`, `SmsReceiver.kt` (`SmsReceiver`, `SmsCapture`, `SmsInbox`), `CaptureQueue`, `CaptureWork.kt`, `CaptureNotifier`, `CaptureActionReceiver` | Reads bank and wallet app notifications and, in the SMS build, SMS as they arrive and the last 30 days on request; keeps them encrypted until sent; shows the server's notice with undo |
| Intake routes | `api/capture-v1-routes.ts` (`/api/capture/v1/signals`, `/config`, `/notices`, `/notices/ack`, `/actions`, `/heartbeat`), shapes in `contracts/capture-intake.ts` | What phones call with a device token |
| Intake | `api/lib/capture/intake.ts` (`admitSignal`, `ingestSignals`, `placeSignal`, `mayRecordAlone`, `suggestLedgerEntry`, `answerEvent`) | Who is admitted, the sealed signal and its job, placing a reading, where it is filed, and the user's answers |
| Privacy | `api/lib/capture/privacy.ts` (`prepareCaptureText`, `looksLikeOneTimeCode`), `api/lib/anonymizer.ts`, `api/lib/capture/vault.ts` | Hides phones, cards, accounts, references, codes, e-mails and IBANs before anything is stored or sent; drops one-time codes; seals the private values to the signal |
| Model worker | `api/lib/capture/ai-queue.ts` (`drainCaptureModel`, `readingFromModel`, `takeCaptureNotices`) | Claims each job with a lease, asks the model outside a transaction, places the reading under the user's lock, leaves the notice |
| Model contract | `api/lib/capture/model-contract.ts` (`labelAmounts`, `checkCaptureReply`, `proposeCapturePosting`, `CAPTURE_SYSTEM_PROMPT`), prompt `sms-v5` | What the model is asked, what is accepted back, and the posting in pounds ([below](#the-reading-sms-v5)) |
| Model transport | `api/lib/capture/model-reader.ts` (`readCaptureWithModel`, `captureRoutes`), `api/lib/capture/admission.ts` | The admin's routes for the `sms` purpose or the server's Gemini key, durable reservations and cost caps, the cost ledger |
| Matching | `api/lib/capture/events.ts#matchSignal`, `api/lib/capture/fees.ts` | One payment, one event: the SMS and the app's notification, a fee sent apart, the two legs of an own transfer |
| Questions | `api/lib/capture/questions.ts`, `capture.nextQuestion`, `capture.answerQuestion` | "What was this for?" after saving, for a user who turned it on |
| Memory | `api/lib/capture/memory.ts` | Where the user files a merchant or person, used before the model's category |
| Devices, consent, care | `api/lib/capture/devices.ts`, `api/lib/capture/consent.ts`, `api/lib/capture/care.ts`, `api/lib/capture/access.ts` | Device tokens, what the user agreed to, phone health, deleting the user's data, who capture is open to |
| Admin | `api/capture-admin-router.ts`, `api/lib/capture/operations.ts`, the console's رسايل البنوك section and `src/components/admin/settings/AdminCaptureSection.tsx` | The catalog, the numbers, the breaker, the bulk undo, the switches |
| The app's screens | `mobile/app/lib/src/features/capture/`, `mobile/app/lib/src/features/more/bank_capture_card.dart` | Turning capture on, SMS permission and import, the switches (AI reading, questions, samples), what waits for the user |
| Admin alerts | `notifyAdmins`, kept under its name in `api/lib/capture/operations.ts` and now in `api/services/admin-alerts.ts` | The breaker and the stalled model queue tell the admins in the app, once an hour |
| Simulator | `api/lib/capture/simulator.ts#simulateCaptureMessage`, `captureAdmin.simulate`, the console tab «جرّب رسالة» (`admin/src/pages/bank/MessageTest.tsx`) | Sends a message's text (the sender is optional: it only names the bank) through the production path into the signed-in admin's own ledger, with a simulator device and that admin's consents, and shows what the user meets: the phone's notice, then the row as the app lists it, or why nothing was recorded; the steps behind it fold away |
| Benchmark | `api/qa/capture-benchmark.ts` (`npm run bench:capture`), the frozen set `api/qa/fixtures/capture-heldout-v9.json` | Scores the production reading path with a real model on a case file, printing no message text |

## The path, step by step
1. **The phone.** A notification of an app the catalog lists, or (SMS build) an SMS, is sent when its folded text holds
   a keyword (`CaptureGate.keeps`): lower case, ASCII digits, Arabic letter variants and no diacritics, compared as a
   substring. The list is the server's `gate.keywords`; the build's own copy (`CaptureGate.DEFAULT_KEYWORDS`) is used
   until a config arrives. Nothing else is judged on the phone. Signals wait encrypted in `CaptureQueue` and are sent
   in batches of up to 20 with the device token; an SMS imported from the inbox is marked `imported`.
2. **Admission** (`admitSignal`). An app notification must come from an app the catalog lists; an SMS from a person's
   number (eight digits or more) is ignored; the server checks the keyword again (`holdsCaptureKeyword`). Which bank
   sent it is looked up (`sourceForPackage`, `sourceForSender`, which matches registered sender ids and else the
   source's own names: "CIB", "VF-Cash", "BanqueMisr") for display and the admin's pause; it is never required.
3. **Privacy** (`prepareCaptureText`). Phones, cards, accounts, references, codes, e-mails, IBANs and any leftover
   run of ten digits become numbered markers (`[PHONE_1]`); the values stay on the server, sealed to the signal
   (`sealCaptureText`). Names of shops and people are not masked: the model needs them to tell a shop from a person.
   A one-time code (`looksLikeOneTimeCode`) is ignored and nothing of it is stored.
4. **Keeping.** A signal is kept once per phone id (a retry with other text is refused), redacted, with one
   `capture_ai_jobs` row, and the phone is answered `queued`; the request wakes the worker.
5. **Reading** (`readCaptureWithModel`). The model reads the labelled message ([below](#the-reading-sms-v5)) through
   the admin's routes for `sms`, or the server's Gemini key with gemini-3.5-flash-lite then gemini-3.1-flash-lite.
   A reply that fails its checks is asked of the next route. A provider that is down is retried after 30 s, 1 min, 2 min
   and so on up to an hour, for a day; nothing is lost while it is down.
6. **Placing** (`placeSignal`). The reading is matched with the user's recent events; a new payment counts against
   the month's limit (over it, it is held). A complete reading is recorded on its own (`mayRecordAlone`); a possible
   duplicate, a source the admin paused, a foreign charge without its pound value or a transfer without a direction
   waits in the app's list for the user. Declined, on hold, codes, offers, statements and balances record nothing; a
   balance still moves the one wallet whose last digits it names, when the user said that wallet holds their money.
7. **The phone again.** The notice ("اتسجلت · …", with undo) is fetched by `NoticeWorker` and acknowledged once shown.

## The reading (sms-v5)
The code labels every amount-shaped number of the redacted message (`labelAmounts`: `{N1:1,250.00}`, with the
currency written next to it, dates, times, percents, masked cards and markers left alone) and sends the sender id and
the labelled message. The model answers status (completed, declined, pending, not a transaction), kind, direction,
the labels of the amount, its pound value, the fee and the balance, whether the fee is included, the other side and
its type, the method, a category and subcategory id from the taxonomy, and whether it is a subscription. It never
writes a number. The checks (`checkCaptureReply`) read no words, so they hold for any bank:
- the reply's shape; a provider that does not enforce the schema may misspell a side field, which then counts as
  absent; only the status and the amount must be exact;
- a completed movement names an amount label that exists and is above zero, and not the same label as the balance;
- a fee equal to the amount, a label that does not exist, a party that is a label or an account marker, and a
  category that does not fit the direction are dropped, not the reading;
- the direction comes from the kind when the kind has one (purchase, bill, top-up, withdrawal, fee, card payment,
  installment are out; salary, refund, cashback, deposit are in); the model gives it for a transfer, interest or a
  loan; a move between the user's own accounts with no direction is filed as leaving the first one.

`proposeCapturePosting` gives the pounds: a written EGP amount, or the EGP equivalent of a foreign one; a separate fee
is added on money going out, an included one subtracted; money coming in is recorded as it arrived.

Measured on the frozen set of 60 invented messages written before the prompt (`api/qa/fixtures/capture-heldout-v9.json`,
2026-11-05): gemini-3.5-flash-lite 60/60 (p50 1.1 s), qwen3.8-27b on Groq 60/60 (p50 0.6 s), gemini-3.1-flash-lite
57/60 (two provider errors and one own-account move without a direction, since filed). These are invented messages:
real messages are the measure (`npm run bench:capture -- --cases <private file>`).

## The ledger row
`recordEventInTx` writes through the ledger writer (decision 0027): source `sms`, `clientRequestId` `cap:e<event>`,
the date of the message, the card's wallet when one wallet has those digits, no bank text. Everything is spending or
income (the owner's rule): money sent to anyone is spending, money received is income. The user's own money changing
pockets (own accounts, ATM, cash deposit, card repayment) keeps its direction and stays out of the totals
(`contracts/ledger-movement.ts`, decision 0045). The line reads as a person would say it (`ledgerDescription`):
"إرسال إلى Sara Mostafa · CIB", "استلام من Mona Adel · فودافون كاش", "شراء · TALABAT EGYPT · WE Pay"; a phone shows
only its last four digits. The details keep the fee, the method, the party and its type, the card or account suffix,
the balance after it and the original amount. A fee becomes a linked row bundled with its payment.

Where it is filed: the user's memory of this merchant or person, then the subscription catalog, then the model's
category and subcategory, then «متنوعات / عام» (or other income). A user who turned on «اسألني اتصرفت في إيه»
(`purpose_questions`) is asked about payments left at the general category or sent to a person, at most two
notifications a day; the answer edits the same row and is remembered.

## Switches and the first start
- `capture_enabled` is on unless the admin sets it to `false`; the platforms and the beta list narrow it.
- The user's consent: `capture` and `ai_reading` at text version `2026-11-05` (`CAPTURE_CONSENT_TEXT_VERSION`); older
  grants stop counting. `purpose_questions` and `message_samples` are the user's own switches.
- `capture_questions_enabled` (on unless set to `false`) lets users turn questions on.
- `capture_paused_sources`: those banks' payments are read and wait for the user instead of being recorded; the
  breaker (`runCaptureBreaker`) adds a bank when too many of its recordings are undone.
- `capture_financial_version` must be `cashflow-v1` before anything is recorded. The `cashflow-cutover` job
  (`api/jobs/cashflow-cutover-job.ts`) runs at boot and every ten minutes until it is: it migrates the ledger in
  batches and turns the flag on when no legacy row is left; with rows it cannot resolve it tells the admins and waits
  (`npm run ledger:cashflow` then shows them).
- Costs: `capture_ai_daily_cost_cap_usd`, `capture_ai_tokens_free`, `capture_ai_concurrency`, `sms_ai_enabled`.

## Data
- `capture_sources` and `subscription_catalog`: the catalog, shared by all users (`0029_capture_sources.sql`).
- `capture_devices`, `capture_consents`, `capture_signals` (a kept signal, deleted after 30 days):
  `0031_capture_intake.sql`; device health `0039_capture_device_health.sql`.
- `capture_events` (one payment and the keys signals are matched on): `0032_capture_events.sql`,
  `0033_capture_signals_drop_review.sql`, `0037_capture_events_source.sql`.
- `capture_usage` (the month's count, the held ones, the day's signals and questions): `0034_capture_usage.sql`,
  `0038_capture_markers.sql` (with `capture_markers`, the cards and phrases a user ignores).
- `capture_memory` and `capture_user_pairs`: `0035_capture_memory.sql`. Pairs are no longer written: everything
  complete is recorded on its own.
- `capture_ai_jobs` (one row per signal: status, attempts, lease, outcome, the event and the notice), kept 7 days, a
  waiting one 30: `0036_capture_ai_jobs.sql`; `capture_ai_days`, `capture_ai_accounts`, `capture_ai_reservations`
  (cost and token reservations): `0044_fantastic_unus.sql`.
- `capture_questions`: `0046_sour_valkyrie.sql`. `capture_samples` (redacted text, the facts and the posting, with the
  admin switch and the user's consent, 365 days): `0047_round_shriek.sql`.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| What the phone sends | `CAPTURE_KEYWORDS` in `api/lib/capture/intake.ts`, `CaptureGate.DEFAULT_KEYWORDS`, `contracts/capture-fixtures/phone-gate.json` (all three equal) | `api/lib/capture/phone-gate-fixtures.test.ts`, `CaptureGateTest` |
| Who is admitted, and what is kept | `admitSignal`, `ingestSignals` in `api/lib/capture/intake.ts`; `api/lib/capture/privacy.ts` | `api/lib/capture/intake.test.ts`, `api/lib/capture/privacy.test.ts`, `tests/capture-intake.test.ts` |
| What the model is asked and accepted back | `api/lib/capture/model-contract.ts`; change `CAPTURE_PROMPT_VERSION` with the prompt | `api/lib/capture/model-contract.test.ts`, then `npm run bench:capture` on the frozen set and real messages |
| Which models read, and the costs | the AI providers screen, purpose `sms`; `api/lib/capture/model-reader.ts` | `api/lib/capture/model-reader.test.ts` |
| Retries, placing, notices | `api/lib/capture/ai-queue.ts` | `tests/capture-intake.test.ts`, `tests/capture-automatic.test.ts` |
| When signals are one payment | `api/lib/capture/events.ts`, `api/lib/capture/fees.ts` | `api/lib/capture/events.test.ts`, `tests/capture-automatic.test.ts` |
| What is recorded alone, filing, the line | `mayRecordAlone`, `suggestLedgerEntry`, `ledgerDescription` in `api/lib/capture/intake.ts` | `api/lib/capture/intake.test.ts`, `tests/capture-intake.test.ts` |
| Questions after saving | `api/lib/capture/questions.ts`, `_QuestionsSwitch` in `bank_capture_card.dart` | `tests/capture-automatic.test.ts`, `mobile/app/test/capture_test.dart` |
| The ledger cutover | `api/jobs/cashflow-cutover-job.ts`, `api/services/financial-migration.ts` | `tests/cashflow-cutover-job.test.ts`, `tests/financial-migration.test.ts` |
| Banks, wallets, apps, subscriptions | `api/lib/capture/seed-sources.ts`, `api/lib/capture/seed-subscriptions.ts`, or the console | `api/lib/capture/catalog.test.ts` |

## Rules for changes here
1. Never log message text, codes, phones or names (golden rule 10): log an event, ids and outcome codes.
2. Nothing leaves the server before `prepareCaptureText`, one message of one user per call, and the model is the
   admin's `sms` route or the server's own key, behind the switch, the budget and the caps.
3. No check may depend on how one bank words a message. A new rule must hold for a message from a bank nobody has
   seen: prefer labels, arithmetic and the kind over word lists.
4. Score a prompt or check change on the frozen set before and after, and never edit that set to fit a result; a new
   failure shape gets a new invented case in a new file.
5. Money-moving writes go through the ledger writer in the transaction that marks the event, scoped to the user and
   user type. The bank's text never enters the ledger or a log.
6. Messages in tests and fixtures are invented: the repository is public.

## Tests
`api/lib/capture/model-contract.test.ts` checks the labels, the checks, the posting and the prompt.
`api/lib/capture/intake.test.ts` checks admission, the reading the worker places, filing and what is recorded alone.
`api/lib/capture/model-reader.test.ts` checks the transport against a fake provider (the labelled message, the
reservation and the bill, the next route on a bad reply or an outage, the server key without an admin route).
`api/lib/capture/privacy.test.ts` checks what is hidden, what is kept and the one-time-code drop.
`api/lib/capture/events.test.ts` checks every merge rule. `tests/capture-intake.test.ts` and
`tests/capture-automatic.test.ts` (`npm run test:db`) run the routes, the worker and the ledger on MySQL with a stub
model: any bank recorded on its own, a code stored nowhere, an outage then recording, the SMS and the app's
notification recorded once, the same words twice asked about, a foreign charge finished by the user once, a deleted
payment not brought back, a refund in its purchase's category, the wallet and its balance, the limit and the upgrade,
the memory, undo, the breaker and the bulk undo, access, consent, fees, own transfers, questions and samples.
`tests/cashflow-cutover-job.test.ts` checks the automatic cutover. `CaptureGateTest` runs the phone's cases in Kotlin;
`mobile/app/test/capture_test.dart` the app's screens and switches.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** iPhone capture is not built: iOS gives apps no SMS. Nothing has run on a real phone: this machine cannot
   run an Android emulator, so the path was proved from the phone's HTTP calls to the ledger with a real model.
2. **Gap.** The SMS build (`-Psmartspend.sms=true`, the `smartspend-sms-apk` artifact of `.github/workflows/android-release.yml`) may not
   go to Google Play before the SMS declaration is approved; the store build has notifications only.
3. **Gap.** A payment announced by the bank's SMS and its app's notification is joined when both name the same card,
   account or merchant, or the same balance (`matchSignal`); if neither message names any of them, two rows appear.
4. **Gap.** No export of `capture_samples` exists yet (`api/lib/capture/samples.ts`).
5. **Debt.** The phone sends any message with a keyword, so a one-time code that mentions a purchase reaches the server,
   which drops it before storing (`looksLikeOneTimeCode`); a code the rule misses would reach the model.
6. **Gap.** Without an admin route for `sms`, only Gemini on the server's key reads; a second provider needs its key
   and prices in the console.

## Related systems
- [Money](money.md): the ledger, wallets and the totals that leave own moves out.
- [Recording spending](expense-capture.md): typed, spoken and photographed entries.
- [AI providers and usage limits](ai-platform.md): the routes, budgets and the cost ledger.
- [Admin console, support and growth tools](admin.md): the capture section, the catalog and the numbers.
- [Server platform and data](platform.md): background jobs, retention and storage classes.
