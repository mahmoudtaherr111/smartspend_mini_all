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
| Parsers | `api/lib/sms-rule-parser.ts#parseSmsByRules`, `api/lib/sms-ai-parser.ts#parseSmsFinancialData` | Provider templates first, a Gemini call when the templates are not sure |
| Token and log procedures | `profile.getWebhookToken`, `profile.generateWebhookToken`, `profile.getSmsLogs`, `profile.generateMagicCode` in `api/profile-router.ts` | What the setup screens call |

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

### 2. The ingest route accepts or refuses
`POST /api/sms/ingest`:
- reads the token from `Authorization: Bearer` or the `token` query parameter; an unknown token gets 403;
- allows 30 messages an hour per token, counted in process memory (`api/sms-router.ts#checkRateLimit`);
- needs a `message` of at least five characters;
- applies the plan's monthly limit on messages processed since the first of the month: setting `sms_limit_<plan>`,
  and 5 on the free plan when the setting is absent;
- refuses with 409 the same message text from the same user within 24 hours;
- stores the message in `raw_sms_events` with status `pending`.

### 3. Rules first, the model second
- `parseSmsByRules` normalizes digits and letters, recognises the provider (wallets such as Vodafone Cash, InstaPay,
  Etisalat Cash, Orange Money, WE Pay; banks such as CIB, NBE, Banque Misr, QNB, AAIB, Alex Bank, Faisal Bank,
  Crédit Agricole, HSBC; Apple Pay, valU, Fawry, Meeza), filters OTPs and promotions, reads direction and category
  from provider templates (`api/lib/sms-rule-parser.ts#parseDirection`: wallet, InstaPay, and English and Arabic
  bank formats for salary, deposits, transfers, card payments, ATM and bills), and extracts the amount and the
  balance after the transaction. Its confidence adds up what it found: an amount, a direction, a known provider,
  how specific the matched template is, a balance.
- A rule result with an amount and confidence of 0.85 or more is used as it is (`parsed_by: rules`).
- Otherwise `parseSmsFinancialData` shortens the message to its financial parts
  (`api/lib/sms-rule-parser.ts#condenseSmsNotification`), looks in a per-user cache kept in memory for 15 minutes,
  and asks Gemini for a fixed JSON shape, with `GEMINI_API_KEY` and the model `mapModelName("flash")` resolves to. An
  answer that found a transaction with an amount at confidence 0.6 or more is used (`ai`); failing that, a rule
  result with an amount is used (`rules_fallback`).
- When nothing was found, there is no amount or the confidence is under 0.5, the message is marked `ignored` with
  its reason (`not_financial` or `low_confidence`) and the route answers 200 with `transaction_detected: false`.

### 4. Saving
- `api/lib/sms-ai-parser.ts#mapSmsToExpenseCategory` turns direction, message category and provider into a
  category, subcategory and type: incoming salary becomes `مرتب`; other incoming money becomes `تحويل`
  (InstaPay, wallet or bank deposit); an outgoing transfer is `تحويل`; a card payment is `تسوق` with the merchant as
  subcategory, or `متنوعات`; bills are `فواتير`; ATM withdrawals and anything else are `متنوعات`.
- In one database transaction the route inserts the expense (source `sms`, the message as raw text, a description
  from provider, merchant and sender, the message's timestamp as its date when it parses, the parse details as
  metadata), writes its `expense_details` and the daily rollup delta
  (`api/services/expense-rollups.ts#applyExpenseRollupDelta`), and marks the raw message `processed`. It then bumps
  the finance cache generation.

## Setting up a phone
**Android**
1. `AndroidSetupFlow` downloads `/downloads/smartspend-sync.apk`.
2. "Connect" calls `GET /api/sms/android-connect`, authenticated by the `google_session` cookie or a Bearer header
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
which manages cards and wallets through the wallet procedures of [Money](money.md).

Also available, with no caller in the web app today: one-time six-character codes (`profile.generateMagicCode`,
kept five minutes in process memory by `api/sms-router.ts#storeMagicCode`) exchanged at `POST /api/sms/exchange` or
at `GET /api/sms/shortcut-download`, which returns a generated Shortcut file
(`api/lib/shortcut-generator.ts#generateShortcutFile`) that posts with an Authorization header; and
`GET /api/sms/token`, `POST /api/sms/token/generate`, `GET /api/sms/logs`, `GET /api/sms/metrics` (parser
statistics per provider) and `GET /api/sms/unparsed`.

## Data
- `webhook_tokens`: one token per user, `sms_` followed by random hex.
- `raw_sms_events`: every message received, with its status (`pending`, `processed`, `ignored`) and parse metadata.
- Account deletion removes both (`api/services/user-purge-service.ts`). An admin procedure in `api/admin-router.ts`
  lists raw messages across users.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which notifications the Android app forwards | `android-app/app/src/main/java/com/smartspend/sync/SyncService.kt` | a build of the app (`android-app/README.md`) |
| The bank and wallet formats the rules read | `api/lib/sms-rule-parser.ts` (provider detection, `parseDirection`, amount and balance extraction) | `tests/adversarial-challenger-2.test.ts`, plus new cases |
| When the model is asked and what it is asked | `api/lib/sms-ai-parser.ts` (prompt, schema, cache); the thresholds in the ingest route | |
| How a parsed message becomes a category | `api/lib/sms-ai-parser.ts#mapSmsToExpenseCategory` | |
| Plan limits | the `sms_limit_<plan>` settings | |
| The setup screens | `src/components/bank-sync/`, `src/pages/BankSyncPage.tsx` | |
| Building and publishing the APK | `.github/workflows/build-apk.yml`, `android-app/` | |

## Rules for changes here
1. `/api/sms/ingest` is public and the webhook token is its only credential: every read and write stays scoped to
   the token's user, and nothing about other users may leave the route.
2. Keep the rules path first. A model call per message costs money, and the templates are exact for the formats
   they know.
3. A saved message is a money-moving write: one transaction with the rollup delta (`api/AGENTS.md`, rule 4).
4. Never log message text (golden rule 10 in the root `AGENTS.md`): the route and the parser log an event with the
   user, the type, the provider or the message's length (`sms.ingested`, `sms.parse.cache_hit`), never the text,
   the amount or the category.
5. The rate limit, the one-time codes and the AI cache live in one server process's memory.

## Tests
`tests/adversarial-challenger-2.test.ts` checks that condensing messages from several banks keeps their amounts,
cards, dates and balances. Nothing tests the ingest route, the rule templates or the category mapping directly.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** Connecting Android fails for phone and password accounts: `AndroidSetupFlow` sends `auth_token` from browser
   storage, which the app never writes (login stores `local_auth_token`, and the `smartspend_token` session cookie is
   HttpOnly), while `getUserFromSession` accepts only the `google_session` cookie or a Bearer header.
2. **Bug.** The APK link, `/downloads/smartspend-sync.apk`, is not in the repository, so the download serves the web app
   instead (`android-app/README.md`).
3. **Gap.** The model path skips the controls other model calls go through: `parseSmsFinancialData` uses `GEMINI_API_KEY`
   directly, ignores the providers the admin configured, checks no AI budget and records no tokens.
4. **Bug.** Most subcategories `mapSmsToExpenseCategory` writes (for example "انستاباي وارد", "سحب نقدي / ATM",
   "Apple Pay") are not in the category registry, card payments use the merchant's name as subcategory, and nothing
   normalizes them against the registry.
5. **Bug.** The monthly limit counts from the first of the month in server time rather than Cairo business time (golden
   rule 6).
6. **Debt.** `raw_sms_events` has storage class E, pruned on a schedule according to `db/table-classes.ts`, but
   `api/jobs/data-retention-job.ts` has no policy for it: full message texts stay until the account is deleted.
7. **Bug.** The route calls `parseSmsByRules` without the sender, so provider detection from the sender name never runs.
8. **Bug.** With several server processes, a one-time code created on one cannot be exchanged on another, and each process
   counts the rate limit on its own.
9. **Gap.** Saving a message does not check budget alerts as `expense.create` does, and
   `src/components/settings/SmsWebhookSettings.tsx` is not rendered anywhere.

## Related systems
- [Money](money.md): the ledger the messages are saved into, and the wallets the digital wallet view manages.
- [Recording spending](expense-capture.md): typed, spoken and photographed entries use a different pipeline.
- [Accounts, sign-in and security](accounts.md): the sessions the setup routes read.
- [AI providers and usage limits](ai-platform.md): the budgets and providers the SMS model call does not use yet.
- [Admin console, support and growth tools](admin.md): the raw messages tab.
- [Server platform and data](platform.md): the retention job and storage classes.
