# Bank and wallet messages

Automatic capture of bank, wallet and payment messages, so a transaction is recorded without the user typing it. It
is being rebuilt from scratch: the old intake (the Android companion app, the iPhone Shortcut, the public ingest route,
the rule parser, the filing and the suggestions over the monthly limit, and the setup screens) was removed. What exists
today are the parts the new intake is built on: the catalog of who is read, the reader that reads a message without a
model, and the admin's model for what the reader is unsure of. **Nothing receives messages yet**: no route, no phone and
no screen sends one to the server.

- Facts generated from the code, with diagrams: [docs/atlas/systems/bank-messages.md](../atlas/systems/bank-messages.md)
- The same story for readers who do not read code: [docs/ar/systems/bank-messages.md](../ar/systems/bank-messages.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Capture catalog | `api/lib/capture/catalog.ts`, tables `capture_sources` and `subscription_catalog`; `capture.sources` in `api/capture-router.ts`; `captureAdmin.*` in `api/capture-admin-router.ts`; the console's رسايل البنوك section (`src/components/admin/capture/AdminCaptureTab.tsx#AdminCaptureTab`) | Which banks, wallets and apps are read, and which subscriptions card charges are recognised as ([decision 0024](../decisions/0024-capture-catalog.md)) |
| Reader | `api/lib/capture/reader/read.ts#readMessage` | Layer one: reads one message into a reading with its confidence and evidence, without a model ([below](#the-new-message-reader-not-connected-yet)) |
| Model reader | `api/lib/capture/ai-reader.ts#readMessageWithModel` | Layer two: the model the admin chose for bank messages reads one message, behind a switch, the plan budget and a daily cost cap ([below](#the-model-reader-not-connected-yet)) |
| Reply contract | `api/lib/sms-ai-contract.ts` | What the model is asked, the reply schema, the checks a reply must pass, and `SmsParseResult`, a reply in the ledger's terms |
| Redaction | `api/lib/anonymizer.ts#redactWithFindings` | Removes card and account digits, IBANs, phones, references, e-mails, codes and people's names before the text leaves for a model |
| Admin controls | the `sms` purpose in the AI providers screen (`contracts/ai-models.ts`); `sms_ai_enabled` and `sms_ai_daily_cost_cap_usd` in `src/components/admin/settings/AdminSmsAiSection.tsx` | Which provider and model read messages, the switch that stops the model, and the daily cost cap in USD |
| The Flutter app | `mobile/packages/bank_capture` ([decision 0022](../decisions/0022-flutter-mobile-app.md)) | Where capture on the phone will live. Today it only tells the app how the phone can capture (the notification listener on Android, a Shortcuts automation on iOS), whether the user allowed it, and opens the screen where they can; nothing is read, queued or posted |

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

## The new message reader (not connected yet)
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
- Nothing calls it yet: the new intake connects the reader first and the model only for `unsure` readings.

## The model reader (not connected yet)
`api/lib/capture/ai-reader.ts#readMessageWithModel` takes one message and the user (id, type, plan, the sender, a
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

The reply is checked by `api/lib/sms-ai-contract.ts` (`SMS_PROMPT_VERSION`): the kind of message (card purchase, ATM
withdrawal, wallet send, salary, declined, one-time code…), direction (`in`, `out`, `internal`), amount and currency,
EGP equivalent, fee, balance, counterparty type, rail, category from `contracts/categories.ts`, a subscription hint and a
confidence per field. It is discarded (`invalid_reply`) when the amount is not written in the redacted text, the
currency is not an ISO code, the category is not in the list or the direction does not fit the kind; a fee, balance,
EGP equivalent or merchant not written in the text is dropped. A valid reply is `parsed`, or `not_transaction` for a
declined payment, a hold, a code, an offer, a statement or a balance, or `needs_review` for a foreign amount with no
EGP equivalent in the text, which is not used as pounds.

## Data
- `capture_sources` and `subscription_catalog`: the capture catalog above, shared by all users.
- The old intake's tables, `webhook_tokens` (one token per user) and `raw_sms_events` (every message as received,
  with account digits and balances, and the suggestions waiting over the limit), were dropped by
  `db/migrations/0030_drop_old_bank_messages.sql`, raw messages and waiting suggestions included.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
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
4. When the intake is connected, a saved message is a money-moving write: one transaction with the rollup delta
   (`api/AGENTS.md`, rule 4), and every read and write scoped to the message's user.
5. Messages and examples in tests and fixtures are invented: the repository is public.

## Tests
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
1. **Gap.** No intake: nothing receives a message from a phone, and neither the reader nor the model reader is called
   by any route. The new intake (signals, merging and Android capture in the Flutter app) is the next step.
2. **Debt.** Until the admin assigns a model to the `sms` purpose, `readMessageWithModel` falls back to
   `GEMINI_API_KEY` with `mapModelName("flash")` (`smsRoutes` in `api/lib/capture/ai-reader.ts`). It is meant to go
   once the key is registered as a provider in the console (decision 0025).
3. **Gap.** Redaction masks every name-like word after من، إلى، to or from, so a merchant written there ("from AMAZON",
   "من كارفور") reaches the model as `[REDACTED_NAME]`; merchants written after لدى or at are kept.

## Related systems
- The Flutter app in `mobile/`: not a system page; its rules are in `mobile/AGENTS.md`.
- [Money](money.md): the ledger, where transactions recorded by the old intake stay, and the cards and wallets screen.
- [Recording spending](expense-capture.md): typed, spoken and photographed entries.
- [AI providers and usage limits](ai-platform.md): the admin's routes, the budget and the cost ledger the model call
  goes through.
- [Admin console, support and growth tools](admin.md): the capture catalog tabs and the bank-message model's settings.
- [Server platform and data](platform.md): the retention job and storage classes.
