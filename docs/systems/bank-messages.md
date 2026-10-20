# Bank and wallet messages

How a bank or wallet notification on the user's phone becomes a transaction without the user typing anything: the
Android companion app and the iPhone Shortcut that forward messages, the public ingest route that receives them,
the rule parser and the model that read them, and the setup screens.

- Facts generated from the code, with diagrams: [docs/atlas/systems/bank-messages.md](../atlas/systems/bank-messages.md)
- The same story for readers who do not read code: [docs/ar/systems/bank-messages.md](../ar/systems/bank-messages.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`; building the Android app:
  `android-app/README.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Setup screen | `src/pages/BankSyncPage.tsx#BankSyncPage`, route `/bank-sync` | Picks the iPhone or Android setup from the user agent; once the user has a webhook token it shows the digital wallet view instead |
| iPhone setup | `src/components/bank-sync/IosSetupFlow.tsx#IosSetupFlow` | Creates or rotates the token, copies the ingest address for the Shortcut, shows recent messages |
| Android setup | `src/components/bank-sync/AndroidSetupFlow.tsx#AndroidSetupFlow` | Downloads the companion app and hands it the token through a deep link |
| Android companion | `android-app/app/src/main/java/com/smartspend/sync/SyncService.kt#SyncService` and `DeepLinkActivity` | Reads notifications, keeps the bank and wallet ones, posts them to the ingest route |
| Ingest route | `POST /api/sms/ingest` in `api/sms-router.ts#smsApp` | Token check, limits, duplicate check, parsing, saving |
| Parsers | `api/lib/sms-rule-parser.ts#parseSmsByRules`, `api/lib/sms-ai-parser.ts#parseSmsFinancialData`, `api/lib/sms-ai-contract.ts` | Provider templates first; when they are not sure, a model the admin chose for bank messages, on the redacted text, with its reply checked against a versioned contract |
| Redaction | `api/lib/anonymizer.ts#redactWithFindings` | Removes card and account digits, IBANs, phones, references, e-mails, codes and people's names before the text leaves for a model |
| Admin controls | the `sms` purpose in the AI providers screen (`contracts/ai-models.ts`); `sms_ai_enabled` and `sms_ai_daily_cost_cap_usd` in `src/components/admin/settings/AdminSmsAiSection.tsx` | Which provider and model read messages, the switch that stops the model, and the daily cost cap in USD |
| Filing | `api/services/sms-ledger.ts` | The category of a parsed message, the ledger write, and the suggestions kept over the monthly limit |
| Suggestions | `profile.getSmsSuggestions`, `profile.confirmSmsSuggestion`, `profile.dismissSmsSuggestion` in `api/profile-router.ts`; `src/components/bank-sync/SmsSuggestionsCard.tsx#SmsSuggestionsCard` on the Home record tab | Messages kept over the monthly limit, which the user saves or dismisses |
| Token and log procedures | `profile.getWebhookToken`, `profile.generateWebhookToken`, `profile.getSmsLogs`, `profile.generateMagicCode` in `api/profile-router.ts` | What the setup screens call |
| Capture catalog | `api/lib/capture/catalog.ts`, tables `capture_sources` and `subscription_catalog`; `capture.sources` in `api/capture-router.ts`; `captureAdmin.*` in `api/capture-admin-router.ts`; the console's رسايل البنوك section (`src/components/admin/capture/AdminCaptureTab.tsx#AdminCaptureTab`) | Which banks, wallets and apps are read, and which subscriptions card charges are recognised as ([decision 0024](../decisions/0024-capture-catalog.md)) |

## One message, step by step

### 1. A phone forwards it
- **Android**: `SyncService` is a notification listener. It ignores chat and social apps, SMS from personal phone
  numbers, notifications without digits, and OTP or verification messages. It forwards a notification when it looks
  transactional: from a known financial app (or a package whose name suggests a bank, wallet or payment app) with a
  transaction keyword; from an SMS app with a bank sender and a transaction keyword, or with a transaction keyword and
  a financial marker; from any other app with both. It posts `message`, `sender`, `timestamp` and `source` with
  `Authorization: Bearer <token>` to the stored ingest address. A send that fails is queued in the app's preferences
  and retried after the next successful send; a retry the server rejects is dropped.
- **iPhone**: the user builds a Shortcuts automation on messages that contain a keyword, running a SmartSpend
  Shortcut that posts the message to the address the setup screen copied, `<origin>/api/sms/ingest?token=<token>`.
- **The Flutter app** (`mobile/`, [decision 0022](../decisions/0022-flutter-mobile-app.md)) is meant to replace both
  paths. Today its plugin, `mobile/packages/bank_capture`, only tells the app how the phone can capture (the
  notification listener on Android, a Shortcuts automation on iOS), whether the user allowed it, and opens the
  screen where they can. Its Android listener is a stub: nothing is read, queued or posted yet, so the two paths
  above are still the only ones that deliver a message.

### 2. The ingest route accepts or refuses
`POST /api/sms/ingest`:
- reads the token from `Authorization: Bearer` or the `token` query parameter; an unknown token gets 403;
- allows 30 messages an hour per token, counted in Redis so every server process shares the count
  (`api/sms-router.ts#withinRateLimit`, a sliding window keyed by a hash of the token);
- needs a `message` of at least five characters;
- refuses with 409 the same message text from the same user within 24 hours;
- counts the messages saved automatically (`processed`) since the first of the Cairo month against the plan's limit,
  `sms_limit_<plan>` (5 on the free plan when the setting is absent). A message past it is kept as a suggestion
  instead of being saved (step 5);
- stores the message in `raw_sms_events` with status `pending`.

### 3. Rules first, the model second
- `parseSmsByRules` normalizes digits and letters, recognises the provider from the sender the app posted, or else from the
  text (wallets such as Vodafone Cash, InstaPay,
  Etisalat Cash, Orange Money, WE Pay; banks such as CIB, NBE, Banque Misr, QNB, AAIB, Alex Bank, Faisal Bank,
  Crédit Agricole, HSBC; Apple Pay, valU, Fawry, Meeza), filters OTPs and promotions, reads direction and category
  from provider templates (`api/lib/sms-rule-parser.ts#parseDirection`: wallet, InstaPay, and English and Arabic
  bank formats for salary, deposits, transfers, card payments, ATM and bills), and extracts the amount and the
  balance after the transaction. Its confidence adds up what it found: an amount, a direction, a known provider,
  how specific the matched template is, a balance.
- A rule result with an amount and confidence of 0.85 or more is used as it is (`parsed_by: rules`).
- Otherwise `parseSmsFinancialData` may ask a model ([decision 0025](../decisions/0025-bank-message-model-through-admin-gateway.md)),
  in this order, and stops at the first refusal:
  1. the admin's switch `sms_ai_enabled` (off when it is `false`);
  2. the text is shortened to its financial parts (`api/lib/sms-rule-parser.ts#condenseSmsNotification`) and redacted
     (`api/lib/anonymizer.ts#redactWithFindings`): card and account digits, IBANs, Egyptian phone numbers, reference
     numbers, e-mails, codes and the names after من، إلى، لـ، to, from or Dear become markers such as
     `[REDACTED_CARD]`; amounts, balances, fees, dates and merchants stay. The sender is redacted the same way. The last
     four digits of a card stay on the server;
  3. a per-user cache kept in memory for 15 minutes, keyed by the prompt version and the exact prompt (it stores and
     hands out copies);
  4. the routes: the models the admin assigned to the `sms` purpose for the user's plan, in their priority order
     ([AI platform](ai-platform.md#choosing-a-provider)), and no built-in provider behind them. With none configured,
     `GEMINI_API_KEY` with the model `mapModelName("flash")` resolves to, as before (temporary);
  5. the plan budget, `assertAiBudget` on the `sms` channel (the burst guard counts `ai_sms` events);
  6. the daily cap `sms_ai_daily_cost_cap_usd` (0 means none): what the ledger holds for `sms` since Cairo midnight,
     across all users, plus the most this call could cost at the routes' prices (`api/lib/ai-pricing.ts`). With a cap,
     a route without a price is left out, and none left means the cap is reached.
  Then one call carries this one message of this one user (`executeLlmChain`, with low thinking and at most 512 output
  tokens). Its attempts go to the [AI cost ledger](ai-platform.md#how-a-call-is-recorded) at each provider's price,
  and the tokens to the user's plan budget (`trackAiTokens`).
- The reply is checked by `api/lib/sms-ai-contract.ts` (`SMS_PROMPT_VERSION`): the kind of message (card purchase,
  ATM withdrawal, wallet send, salary, declined, one-time code…), direction (`in`, `out`, `internal`), amount and
  currency, EGP equivalent, fee, balance, counterparty type, rail, category from `contracts/categories.ts`, a
  subscription hint and a confidence per field. It is discarded when the amount is not written in the redacted text,
  the currency is not an ISO code, the category is not in the list or the direction does not fit the kind; a fee,
  balance, EGP equivalent or merchant not written in the text is dropped. A valid reply is mapped onto the parse result
  the route already reads (the card's last four digits are filled in from the redaction).
- What the route does with it: a checked reading of a declined payment, a hold, a code, an offer, a statement or a
  balance is final, so the rules' guess is not saved either; a transaction with an amount at confidence 0.6 or more is
  used (`ai`); a foreign amount with no EGP equivalent in the text is not used. Failing that, a rule result with an
  amount is used (`rules_fallback`). When the model was skipped (switched off, budget, cap, failure, discarded reply),
  the outcome is stored as `model_outcome` on the raw message and on a saved expense.
- When nothing was found, there is no amount or the confidence is under 0.5, the message is marked `ignored` with
  its reason (`not_financial`, `low_confidence`, or `model_unavailable` when no model answered and the rules found no
  amount) and the route answers 200 with `transaction_detected: false`. The raw message stays.

### 4. Saving
- `api/services/sms-ledger.ts#categorizeSms` files the message.
  `api/lib/sms-ai-parser.ts#mapSmsToExpenseCategory` turns direction, message category and provider into a
  category, subcategory and type, always a pair the taxonomy holds: incoming salary becomes `مرتب/مرتب أساسي`;
  other incoming money is `دخل آخر/عام` (the message does not say where it came from); an outgoing transfer is
  `تحويل` with its rail (`انستاباي`, `فودافون كاش` or `تحويل بنكي`) as subcategory; a card payment is `تسوق/عام`
  with a merchant, else `متنوعات/عام`; bills are `فواتير/عام`; an ATM withdrawal is `تحويل/سحب ATM` of type
  `transfer`, because the cash is still the user's (docs/decisions/0008-money-movements-and-taxonomy.md).
- A card payment to a merchant the classification engine knows well takes the merchant's category instead
  (`classifySmsMerchant`): the rule engine reads the merchant's name, normalized and then as written, since bank
  messages spell merchants in Latin letters, and only a merchant, synonym or dictionary match counts. "UBER *TRIP"
  is مواصلات/أوبر/كريم and "Talabat" أكل وشرب.
- In one database transaction the route inserts the expense (source `sms`, the message as raw text, a description
  from provider, merchant and sender, the message's timestamp as its date when it parses, the parse details as
  metadata), writes the daily rollup delta
  (`api/services/expense-rollups.ts#applyExpenseRollupDelta`), and marks the raw message `processed`. It then bumps
  the finance cache generation.

### 5. Over the monthly limit
A message past the plan's limit is not lost (docs/decisions/0009-bank-messages-over-the-limit.md):
- it is read by the rules alone, so no model is paid for; when they find a transaction with an amount, the raw
  message gets status `suggested` and a suggestion in its metadata (amount, direction, type, category from
  `categorizeSms`, provider, merchant, description, time); otherwise it is `ignored` with reason
  `monthly_limit_unread`;
- the route answers 200 with `saved: false` and `suggested`, so the phone does not retry it;
- the Home record tab shows the waiting suggestions (`SmsSuggestionsCard`, from `profile.getSmsSuggestions`). The
  user keeps or changes the category (a list of the categories of the message's kind) and saves it
  (`profile.confirmSmsSuggestion`), or dismisses it (`profile.dismissSmsSuggestion`, status `dismissed`);
- saving moves the status from `suggested` to `confirmed` in the same transaction as the expense, the day's rollup
  delta and the details, and only when it was still `suggested`, so a second tap saves nothing. The finance caches
  are bumped and budget alerts checked, as after an automatic save. A confirmed message does not count toward the
  limit.

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
Nothing reads the catalog yet when a message arrives: the rules parser still detects the provider with its own
patterns (known issue 10).

## Setting up a phone
**Android**
1. `AndroidSetupFlow` downloads `/downloads/smartspend-sync.apk`.
2. "Connect" calls `GET /api/sms/android-connect` with the browser's cookies, authenticated by the `google_session`
   cookie, a Bearer header, or the HttpOnly `smartspend_token` cookie of a phone and password account
   (`api/sms-router.ts#getUserFromSession`). It creates a token when the user has none and returns
   `smartspend://connect?token=…&url=…`, which the page opens.
3. `DeepLinkActivity` stores the token and address and leads the user to grant notification access.
   `POST /api/sms/android-status` lets the app report that it is running.

**iPhone**
1. `IosSetupFlow` shows the token. Creating a new one (`profile.generateWebhookToken`) deletes the old one, so a
   phone set up with the old token stops working.
2. "Connect iPhone" copies the ingest address with the token and opens a public iCloud Shortcut.
3. The keyword for the automation is saved in the smart profile as `preferences.smsTriggerKeyword`; only the
   instructions on the screen use it.
4. Recent messages come from `profile.getSmsLogs`, refreshed every ten seconds.

With a token in place, `BankSyncPage` shows `src/components/bank-sync/DigitalBankingSuite.tsx#DigitalBankingSuite`,
which manages cards and wallets through the wallet procedures of [Money](money.md). Its badge says what arrived, not
that a token exists: `profile.getWebhookToken` also returns `lastReceivedAt`, the latest stored message
(`raw_sms_events`), and the badge reads "no message yet", the day of the last one (green within three days), or how
many days ago it was with a prompt to check the phone (amber). A wallet's balance is what the user entered; messages
are saved as transactions and do not move it.

Also available, with no caller in the web app today: one-time six-character codes (`profile.generateMagicCode`,
kept five minutes as shared state by `api/sms-router.ts#storeMagicCode`, so any server process can exchange one; a new
code retires the user's previous one, and the code names the user, not the token, so the token handed out is the
user's current one) exchanged at `POST /api/sms/exchange` or
at `GET /api/sms/shortcut-download`, which returns a generated Shortcut file
(`api/lib/shortcut-generator.ts#generateShortcutFile`) that posts with an Authorization header; and
`GET /api/sms/token`, `POST /api/sms/token/generate`, `GET /api/sms/logs`, `GET /api/sms/metrics` (parser
statistics per provider) and `GET /api/sms/unparsed`.

## Data
- `webhook_tokens`: one token per user, `sms_` followed by random hex.
- `raw_sms_events`: every message received, with its status (`pending`, `processed`, `ignored`, `suggested`,
  `confirmed`, `dismissed`) and parse metadata; a suggestion is in `metadata.suggestion`.
- `capture_sources` and `subscription_catalog`: the capture catalog above, shared by all users.
- Account deletion removes `webhook_tokens` and `raw_sms_events` (`api/services/user-purge-service.ts`). An admin procedure in `api/admin-router.ts`
  lists raw messages across users.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which notifications the Android app forwards | `android-app/app/src/main/java/com/smartspend/sync/SyncService.kt` | a build of the app (`android-app/README.md`) |
| The bank and wallet formats the rules read | `api/lib/sms-rule-parser.ts` (provider detection, `parseDirection`, amount and balance extraction) | `tests/adversarial-challenger-2.test.ts`, plus new cases |
| Which provider and model read messages | the AI providers screen, purpose «قراءة رسايل البنوك والمحافظ» (`sms`) | `api/lib/sms-ai-parser.test.ts` |
| Whether the model is asked, and its daily cap | the `sms_ai_enabled` and `sms_ai_daily_cost_cap_usd` settings; the order of the checks in `api/lib/sms-ai-parser.ts` | `api/lib/sms-ai-parser.test.ts`, `api/sms-router.ingest.test.ts` |
| What the model is asked and what is accepted back | `api/lib/sms-ai-contract.ts` (prompt, schema, checks); change `SMS_PROMPT_VERSION` with it | `api/lib/sms-ai-parser.test.ts` |
| What is removed before a model sees the text | `api/lib/anonymizer.ts` | `api/lib/anonymizer.test.ts` |
| The thresholds and what a skipped model leaves behind | the ingest route | `api/sms-router.ingest.test.ts` |
| How a parsed message becomes a category | `api/lib/sms-ai-parser.ts#mapSmsToExpenseCategory`; merchants in `api/services/sms-ledger.ts#classifySmsMerchant` and the classification dictionaries | `api/lib/sms-ai-parser.test.ts`, `api/services/sms-ledger.test.ts` |
| Plan limits | the `sms_limit_<plan>` settings | |
| What happens over the limit, and saving or dismissing a suggestion | the ingest route, `api/services/sms-ledger.ts`, the suggestion procedures, `src/components/bank-sync/SmsSuggestionsCard.tsx` | `api/services/sms-ledger.test.ts` |
| The setup screens | `src/components/bank-sync/`, `src/pages/BankSyncPage.tsx` | |
| Building and publishing the APK | `.github/workflows/build-apk.yml`, `android-app/` | |
| The banks, wallets, apps and subscriptions shipped with the app | `api/lib/capture/seed-sources.ts`, `api/lib/capture/seed-subscriptions.ts` (confirm every package on Google Play and every sender id from a real message) | `api/lib/capture/catalog.test.ts` |
| Them in production, without a deploy | the console's رسايل البنوك section | `src/components/admin/capture/AdminCaptureTab.test.tsx` |

## Rules for changes here
1. `/api/sms/ingest` is public and the webhook token is its only credential: every read and write stays scoped to
   the token's user, and nothing about other users may leave the route.
2. Keep the rules path first. A model call per message costs money, and the templates are exact for the formats
   they know.
3. A saved message is a money-moving write: one transaction with the rollup delta (`api/AGENTS.md`, rule 4).
4. Never log message text (golden rule 10 in the root `AGENTS.md`): the route and the parser log an event with the
   user, the type, the provider, the model, the outcome or the message's length (`sms.ingested`, `sms.parse.cache_hit`,
   `sms.ai.read`, `sms.ai.skipped`, `sms.ai.reply_rejected` with the names of the failed checks), never the text, the
   amount or the category.
5. Nothing reaches a model before `redactWithFindings`, and one call carries one message of one user: never batch
   messages of different users into one prompt. A model is only the one the admin assigned to `sms` (or, until then,
   the server's Gemini key), behind the switch, the budget and the cap.
6. The rate limit and the one-time codes are shared by every server process: Redis, through
   `executeSlidingWindowRateLimit` and `stateSet` in `api/lib/redis-client.ts` (`api/AGENTS.md`, rule 6). The AI
   parse cache stays in one process's memory, which is harmless: an identical message is refused as a duplicate.

## Tests
`tests/adversarial-challenger-2.test.ts` checks that condensing messages from several banks keeps their amounts,
cards, dates and balances. `api/lib/anonymizer.test.ts` checks what redaction removes and what it keeps.
`api/lib/sms-ai-parser.test.ts` runs the model path against a fake provider (the admin's route is used and nothing
else, the server key without one, a redacted prompt, one message per call, the switch, the budget and the cap, the
reply checks) and the category mapping. `api/sms-router.ingest.test.ts` checks that a skipped model loses no message
and that a declined reading is not saved from the rules. `api/services/sms-ledger.test.ts` checks the merchant
categories, the suggestions and a confirmation saved once. `api/sms-router.pairing.test.ts` exchanges pairing codes
once and retires an older code, and `api/lib/sms-rule-parser.sender.test.ts` reads the provider from the sender.
`api/lib/capture/catalog.test.ts` checks the seed (unique slugs, one owner per app, every licensed bank, no guessed
sender id), the lookups by app, sender and merchant name, the admin's input rules and which rows the seed may write.
The rule templates are not tested one by one.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** The APK behind `/downloads/smartspend-sync.apk` is a debug build that `.github/workflows/build-apk.yml` commits
   when `android-app/` changes; it is signed with the runner's throwaway debug key, so a newer build cannot install
   over an older one until a release key is configured.
2. **Debt.** Until the admin assigns a model to the `sms` purpose, `parseSmsFinancialData` falls back to `GEMINI_API_KEY`
   with `mapModelName("flash")` (`smsRoutes` in `api/lib/sms-ai-parser.ts`). It is meant to go once the key is
   registered as a provider in the console (decision 0025).
3. **Gap.** A model's reading at confidence 0.6 or more is saved on its own; nothing sends it to review first. The
   category it proposes (`model_category` in the expense metadata) is stored but not used: filing still follows
   `categorizeSms`.
4. **Gap.** A message no model read and the rules could not read is kept as `ignored` with `model_unavailable`, and
   nothing reads it again when the model is back.
5. **Gap.** The route saves the amount without its currency (`insertSmsExpense` in `api/services/sms-ledger.ts` takes
   none), so a dollar amount the rules read is saved as pounds. The model path refuses a foreign amount without an EGP
   equivalent instead.
6. **Gap.** Redaction masks every name-like word after من، إلى، to or from, so a merchant written there ("from AMAZON",
   "من كارفور") reaches the model as `[REDACTED_NAME]`; merchants written after لدى or at are kept.
7. **Gap.** Only a merchant the engine knows well changes the fixed map (a card payment, or a refund from it, which is
   saved as a negative expense in that merchant's category): a card payment to any other merchant is
   `تسوق/عام`, and an outgoing transfer is saved as spending under `تحويل`, its rail as subcategory. Messages are not
   classified by the full pipeline, and a suggestion is not reviewed before the limit is reached.
8. **Gap.** Raw messages are deleted 90 days after they arrive (`RETENTION_POLICIES` in
   `api/jobs/data-retention-job.ts`), a suggestion left unanswered included; until then the full text, with account
   digits and balances, is stored as received.
9. **Debt.** `src/components/settings/SmsWebhookSettings.tsx` is not rendered anywhere.
10. **Gap.** The capture catalog is not read when a message arrives: `api/lib/sms-rule-parser.ts#detectProvider` keeps its
   own patterns, and the Android companion its own package list, five of whose twelve finance app ids are not the apps'
   Google Play ids ([decision 0024](../decisions/0024-capture-catalog.md)).

## Related systems
- The Flutter app in `mobile/` (see step 1): not a system page; its rules are in `mobile/AGENTS.md`.
- [Money](money.md): the ledger the messages are saved into, and the wallets the digital wallet view manages.
- [Recording spending](expense-capture.md): typed, spoken and photographed entries use a different pipeline.
- [Accounts, sign-in and security](accounts.md): the sessions the setup routes read.
- [AI providers and usage limits](ai-platform.md): the admin's routes, the budget and the cost ledger the model call
  goes through.
- [Admin console, support and growth tools](admin.md): the raw messages tab.
- [Server platform and data](platform.md): the retention job and storage classes.
