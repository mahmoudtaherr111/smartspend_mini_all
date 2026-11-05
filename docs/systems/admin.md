# Admin console, support and growth tools

The admin console at `/admin` (people and plans, support tickets, subscriptions, AI connectors, models and costs,
bank messages, the learned dictionary, notifications, WhatsApp, ads, settings and the audit log), the support tickets
users open from the app, the ads shown in the app, the SEO metadata of public pages and the usage events the app records.

- Facts generated from the code, with diagrams: [docs/atlas/systems/admin.md](../atlas/systems/admin.md)
- The same story for readers who do not read code: [docs/ar/systems/admin.md](../ar/systems/admin.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The new console (admin/)
The console is moving to a site of its own ([decision 0041](../decisions/0041-separate-admin-console.md)): `admin/`,
built to `dist/admin` and served by `api/boot.ts` at `/admin` (`/admin` redirects to `/admin/`, every path under it
opens the console's page, `no-store` and `noindex`). `npm run dev` (or `admin:dev`) runs it with the API on port 3000. It shares no code with the website in `src/`
(decision 0050).
- `admin/src/App.tsx` asks `adminConsole.session` (moderators and admins); anyone else sees the sign-in page, Google
  (`/api/auth/google/start?next=/admin/`) or a phone account, and a signed-in user without the role is told so.
- «النهارده» (`admin/src/pages/Today.tsx`, `adminConsole.today`): who recorded today, yesterday and this week, sign-ups, the share of
  last week's recorders who came back, today's AI cost against the daily cap, active store subscriptions, open tickets
  and the oldest one's age, AI calls and failures in the last hour, unresolved key errors, and a real check of the
  database and Redis. A count that fails reads as unknown, never as 0. «محتاج تدخلك» lists only what needs action.
- «الناس» (`admin/src/pages/People.tsx`, `adminConsole.searchPeople`) finds a person by name, phone or email across Google
  and phone accounts, and downloads everyone as CSV after a warning that it is personal data (`export.allUsers`, which
  now writes `EXPORT_ALL_USERS` to the audit log). A person's page (`admin/src/pages/Person.tsx`, `adminConsole.person`) shows their numbers this
  month, their last 20 operations and last 10 AI calls with tokens and cost, their devices (platform read from the
  user agent) with a sign-out per device, store subscriptions and tickets; plan, role, monthly AI limit, resetting AI
  usage and deleting go through the existing admin procedures after a confirmation that says what will happen, and
  making someone an admin or deleting asks for a typed word.
- «نداءات الذكاء» (`admin/src/pages/AiCalls.tsx`, `adminConsole.aiCalls`) lists every row of the cost ledger with
  who, what for, provider and model, tokens each way and the cost, filters by period, purpose and failures, totals by
  purpose and by model with average latency, and opens one call's token anatomy (system prompt, memory, history,
  user input, tools, cached and thinking tokens).
- «التصنيف وسببه» (`admin/src/pages/Classifications.tsx`, `adminConsole.classifications`) lists classification logs
  with each item's category and the reason in plain words, from the evidence's match kind
  (`admin/src/ui/ai-words.ts`), the agreeing and disagreeing resolvers, the candidates, the confidence, the decision
  and whether the person corrected it. Above the list (`admin/src/pages/ClassificationTools.tsx`): the quality of the
  period beside the one before (`admin.getClassificationQuality`: saved on its own, the silent mistakes — saved on its
  own and changed later —, review, questions, the share sent to a model, the time), and «جرّب جملة», which sends a
  sentence through `ai.parseExpense` as the admin with `skipClarification`, so nothing is saved and no question is left.
- «الموصلات» (`admin/src/pages/Connectors.tsx`) adds a provider from a short list of known services (Claude first,
  then Gemini, OpenRouter, Groq, DeepSeek, Fireworks, NVIDIA) or any OpenAI-compatible address after testing the key
  (`admin.validateApiKey`, which lists the models the key reaches), pauses, re-keys, checks the health of all
  (`admin.checkProviderHealth`) and removes them, shows each provider's models, purposes and prices, and lists
  unresolved key errors.
- «إعداد الذكاء» (`admin/src/pages/ai/`, `aiSetup.*` in `api/ai-setup-router.ts`): «الوظايف» shows, for each purpose
  and plan, the models in the order the server asks them (the first answers, the next takes over), what answers when
  there is none (the server's Gemini key, or a red line when there is no key either), moves a model up or down
  (`aiSetup.reorder`, one order shared by every purpose) and calls a model once for real (`aiSetup.test`: the reply, the
  time and the cost, or the failure in words). «الموديلات» lists each connector's models, adds one from the list the
  connector's saved key reaches (`aiSetup.discover`) with the published price filled in, edits its purposes, plans,
  price and switch (`aiSetup.saveModel`) and removes it (`aiSetup.removeModel`). «تحويل الصوت لكلام» sets the voice-note
  model per plan and its fallback, and «مفاتيح السيرفر» the server's own keys, both through `admin.updateSettings`. The
  previous screen's RAG fields and processing mode were dropped: nothing reads them.
- «النمو» (`admin/src/pages/Growth.tsx`, `adminConsole.growth`): per Cairo day, who recorded and who signed up; the
  share of new accounts that recorded within 24 hours; weekly cohorts of the last six weeks and the share of each
  that recorded in each later week; how operations were recorded (by source); people per platform in the last 7 days
  and the mobile versions in use, from the `app_seen` events `noteAppSeen` (`api/lib/client-platform.ts`) writes once
  per person per Cairo day from `authedProcedure`, read from the app's user agent
  (`SmartSpend-Mobile (android; production; 1.4.0)`), kept 30 days like other usage events; store subscriptions by
  store and status.
- The retention and activation queries name the outer table in full inside their subqueries: a bare column there
  resolved to the subquery's own row, which made «رجعوا بعد أسبوع» and the activation counts wrong.
- «الدعم» (`admin/src/pages/Support.tsx`): the oldest waiting ticket first, how long each has waited, the person's
  message and any reply, and the reply box; `support.listAll` and `support.respond` take `moderatorProcedure`, so
  support moderators answer tickets and land on this page, while every other page stays with admins. An admin also
  closes a ticket (`support.close`, which refuses anyone but the ticket's owner or an admin).
- «التشغيل» (`admin/src/pages/Operations.tsx`): the AI switches, the daily cost cap and the mobile versions and store
  links, saved through `admin.updateSettings` from a bar that appears with the count of unsaved changes (and a
  warning before leaving the page with them); the background jobs (`adminConsole.jobs`, `admin/src/pages/Jobs.tsx`):
  each job in words with how often it runs, its last run and how long it took or the error's class, its last success,
  its runs and failures in the last day, the late and failing ones first ([platform](platform.md#jobs)); and the last
  30 entries of the audit log in plain words.
- «الفلوس» (`admin/src/pages/Money.tsx`, `adminConsole.money`): a monthly revenue estimate from the list
  prices in `contracts/plans.ts` (yearly divided by 12) over subscriptions that are active, cancelled but still paid,
  or in grace, before the store's share; active subscriptions by store; subscriptions started this month and those
  that expired or were refunded this month; the latest 40 with names.
- «الباقات والحدود» (`admin/src/pages/plans/`): one table per kind of setting, a row per setting and a column per plan
  (`PlanMatrix`), saved with the save bar through `admin.updateSettings`. «المميزات»: AI parsing and the monthly analysis
  per plan (`<plan>_ai_parse`, `<plan>_ai_analysis`), the chat (`chatbot_enabled_<plan>`) and the switches of
  `contracts/plan-features.ts`. «الحدود»: monthly tokens, daily parses, the reply caps of parsing, chat, receipts and
  goals, AI calls a minute, voice-note seconds a month and per note, the wait between monthly analyses and their length,
  active goals, offline items, payments recorded from bank messages and the phones that may send them. «المكالمة
  الصوتية»: the kill switch, per plan whether calls are on, minutes a month, the longest call, the daily cost cap, «تفكير
  أعمق» and the model; the call, coach, thinking-tool, price-tool and memory models; the coach's rollout and test
  accounts; the capacity caps; and `voice.adminStats` for the last day, 7 or 30 days, with no word said in a call.
- «رسايل البنوك» (`admin/src/pages/bank/`): «جرّب رسالة» sends a typed or example message through capture into the
  admin's own ledger and shows what the user meets (the phone's notice, then the row in the app's list, with the details
  behind it); «الأرقام» per bank and kind over 1, 7 or 30 days with the undo rate, the banks the breaker stopped, the
  model's queue and the bulk undo of one bank's recordings, counted first and confirmed with a typed word; the banks and
  wallets and the subscriptions of the catalog, editable without a deploy; and capture's switches and limits
  (`captureAdmin.*`, `admin.updateSettings`, [bank messages](bank-messages.md)). Admins also get in-app alerts when the
  breaker stops a bank or the model's queue waits more than five minutes.
- «القاموس والأسئلة» (`admin/src/pages/rules/Rules.tsx`): the words people taught the app (`admin.getLearnedRules`, 50 a
  page, with the owner and a delete that makes the app classify the word afresh, `admin.deleteLearnedRule`), and the
  questions the app asked about an unfinished sentence (`admin.getPendingClarifications`), closed as solved or left
  (`admin.resolveClarification`).
- «التواصل والإعلانات» (`admin/src/pages/comms/`): push notifications — send one now to everyone, a plan or one person,
  with the phone's preview and a confirmation (`admin.sendInstantNotification`, which now also takes Ultra), the
  automatic texts per event with the values each may use and a switch, the scheduled ones (Cairo time, plan, device,
  minimum activity) and the last 100 sent; the WhatsApp number — whether it is configured, consent and today's
  delivery, the code, report and marketing switches, the templates and their review at Meta, the outbox with masked
  numbers, and a reply within the 24-hour window; and the sponsored card's campaigns with views, presses and their
  rate. `adminWhatsapp.broadcastTemplate` has no screen on purpose: the three templates are transactional.
- «سجل الأدمن» (`admin/src/pages/Audit.tsx`, `admin.getAuditLogs`): every audit entry, filtered by action and Cairo
  day, 50 a page, each action in words (`auditAction` in `admin/src/ui/words.ts`); «التشغيل» shows the last 30. Every
  staff mutation is in it: one without an entry of its own is recorded by `api/middleware.ts` by its procedure and
  whether it succeeded (it caught `localAuth.deleteUser` and `localAuth.updateRole`, which wrote none), and an admin
  closing a ticket writes `CLOSE_SUPPORT_TICKET`.
- «حالة السيرفر» (`admin/src/pages/Status.tsx`, `adminConsole.status`): each outside system and setting the server
  needs, green, amber or red, with what it means for the app and what to set ([platform](platform.md)), refreshed every
  minute; a red one also appears on «النهارده».
- «كل الإعدادات» (`admin/src/pages/AllSettings.tsx`, `adminConsole.settingsCatalog`): every key of the registry (193),
  searchable, by group, with its default and a reset to it, the right control for its value (a switch, a number, a
  choice for the settings that take a few values, a masked field for a secret) and the page that explains it; the 42
  settings no other page edits carry Arabic words. `capture_financial_version` is shown and never edited: the cutover
  sets it. `admin/src/pages/AllSettings.test.ts` fails on a label for a key the server does not have.
- «النهارده» also lists the admin's alerts (`adminConsole.alerts`, `adminConsole.markAlertsRead`), a red server check
  and the late or failing jobs.
- «الدعم»: an admin gives a ticket to an admin or support moderator, or takes it back (`support.assign`, by id and
  account type, refusing anyone without a staff role; the ticket keeps its status), and «اللي معايا» shows one's own
  (`adminConsole.supportTeam`). Assignments live in `support_assignments` (migration 0049) apart from the ticket, so
  tickets read and write as before until it is applied; the page then hides the assignment controls.
- «التصنيف وسببه» carries «إعدادات الفهم»: the auto-save, review and model thresholds and the three local steps of the
  parser. «الفلوس» carries the dollar rate the AI cost's EGP column uses (`usd_to_egp_rate`).
- Pages load on demand (`React.lazy` in `admin/src/App.tsx`), and the console's Tailwind (`admin/tailwind.config.cjs`)
  scans only `admin/`: the first load is a 193 kB script and a 37 kB stylesheet instead of 460 kB and 219 kB.
- No screen of the previous console is mounted any more: `admin/` imports nothing from `src/`, and
  `tests/knowledge/architecture.test.ts` (`console-and-server-without-website`) fails if it, or `api/`, does.
- Settings sections are hosted by `admin/src/ui/SettingsEditor.tsx`: the saved values with the admin's edits on top,
  only changed keys sent to `admin.updateSettings`, and the same save bar. `updateSettings` keeps only registry keys,
  so `tests/knowledge/settings-read.test.ts` fails when a screen edits a key outside the registry, or when a registry
  key is read by no server code (a switch that does nothing).
- Each page sits in `admin/src/ui/ErrorBoundary.tsx`, keyed by path: a page that throws shows a reload button, and a
  page file missing after a deploy says a new version is out.
- `scripts/dev/seed-admin.ts` makes a phone admin on a throwaway database on port 3399.

## Who gets in
- The console opens only on `adminConsole.session`, which the server answers from the verified session
  (`moderatorProcedure`): a signed-out visitor sees the sign-in page and a signed-in user without the role is told so.
  Nothing read from the browser decides it.
- Every procedure of the console uses `adminProcedure` from `api/middleware.ts`. `api/admin-access.test.ts`
  refuses users and moderators even on an Ultra plan, `api/admin-router.security.test.ts` walks the whole
  router and checks that answers carry no password hashes or session tokens, and
  `api/admin-authentication.security.test.ts` checks the session behind the role: a demoted admin, a revoked
  session, an expired token and a forged signature are all refused.
- The `moderator` role answers support and nothing else: `support.listAll` and `support.respond` use
  `moderatorProcedure` (decision 0041), and every other staff procedure stays `adminProcedure`; the security test
  checks both sides.

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Console | `admin/src/App.tsx`, `admin/src/shell/Shell.tsx`, `admin/src/pages/`, its own kit in `admin/src/kit/` | The pages above, on the API only |
| Console API | `api/admin-console-router.ts`, `api/ai-setup-router.ts`, `api/capture-admin-router.ts` | The console's own reads and the AI setup |
| Admin API | `api/admin-router.ts`, `api/admin-whatsapp-router.ts` | Users, sessions, settings, AI providers, learned rules, notification templates, WhatsApp |
| Support | `api/support-router.ts` | Tickets users open from the app, answers from the team |
| Ads | `api/ads-router.ts`, `mobile/app/lib/src/features/ads/sponsored_card.dart` | Campaigns and the sponsored card in the app |
| SEO | `api/seo-router.ts` | The title and description of a public page, and a sitemap |
| Usage events | `api/analytics-router.ts` | Events the app records in `user_analytics` |
| User export | `export.allUsers` in `api/export-router.ts` | Every account as JSON, CSV or Excel |

The previous console (`src/pages/Admin.tsx`, `src/components/admin/`) is part of the parked website and is reached
from nowhere ([decision 0050](../decisions/0050-backend-and-console-without-the-website.md)).

## How the important actions work
- **Settings.** `admin.getSettings` starts from the registry defaults, overlays the saved values and replaces
  every secret with dots plus its last four characters (`maskSettingsForClient`). `admin.updateSettings`
  accepts only registry keys, skips a value that is still masked — so saving an unrelated field cannot
  overwrite a working key with dots — upserts the rest and clears this process's settings cache.
- **Role, plan and sessions.** `admin.updateUserRole`, `admin.updateUserPlanV2`, `admin.revokeSession` and
  `admin.deleteUser` go through `api/lib/access-control.ts`, which writes the row and invalidates the cached
  principal in the same call: a changed role, a changed plan and a revoked session take effect on the next
  request rather than up to fifteen minutes later.
- **Deleting a user.** `admin.deleteUser` runs `purgeUserData` in a transaction ([accounts](accounts.md)).
- **Messaging one user.** The dialog in the users tab sends through WhatsApp (`adminWhatsapp.sendDirectMessage`,
  server side) or, for email, opens the admin's own mail application with a `mailto:` link: nothing is sent or
  recorded by the server.
- **AI providers.** Keys are stored encrypted and listed masked; adding, editing or deleting a provider, or
  saving its models, refreshes the gateway cache that routes model calls ([AI providers and usage
  limits](ai-platform.md)). Each provider's card says which secret its key is sealed with — a warning while it is
  `JWT_SECRET`, in red when no configured secret opens it — and "تغيير المفتاح" saves a new key through
  `admin.updateAiProvider` without deleting the provider or its models. The dot beside the name follows
  `ai_providers.healthStatus`: grey until the breaker has seen the provider, and red for a key nothing opens. `admin.validateApiKey` proves a key the cheapest way there is — by listing the
  models it can reach — and works for any provider, not a fixed list. Discovery lists every model the key reaches,
  with a search box; only the ones the admin ticks are saved, with no purpose and the provider's published price when
  one is known (`contracts/ai-models.ts`). "تعديل" on a saved model (`src/components/admin/ai-center/modals/AiModelEditDialog.tsx`)
  sets what it serves (classification, chat, reports, embeddings, reading bank messages), its plans, whether it is the
  default, whether it is active, and its price per million tokens, which the [AI cost ledger](ai-platform.md#how-a-call-is-recorded)
  charges; a model without a price is marked so. The models table names each purpose by its label. Only the models
  given the bank-message purpose (`sms`) read bank messages ([bank messages](bank-messages.md)).
- **Support.** Users open tickets from `src/pages/Support.tsx` (`support.create`, which prepends an optional
  phone or email to the message text) and see their own list (`support.listMine`); a ticket is readable and
  closable only by its owner or an admin.

## Ads, SEO and usage events
- `ads.list` is public: active campaigns inside their dates for a placement, targeted at `all` or at the caller's own
  plan — `free` for a visitor or a Free account, `pro` for Pro and Ultra. The `userPlan` the request names is ignored (the
  app always sent `free`). `src/components/ads/AdBanner.tsx`
  shows one and counts a click through `ads.click`, which also stores a row in `ad_clicks`.
- `seo.getPage` returns the saved metadata of a path, or a default Arabic title, description, keywords and
  canonical address; `SEOMeta` writes them into the document head of the public pages. `seo.sitemap` builds an
  XML sitemap of fixed routes and saved pages.
- `analytics.trackEvent` stores an event in `user_analytics`: only the names in `CLIENT_ANALYTICS_EVENTS`
  (`session_duration` today), with at most ten metadata keys holding short strings, numbers or booleans; `src/hooks/useSessionTracker.ts`
  calls it from the app shell. The same table carries the AI usage events of `api/lib/ai-usage-policy.ts` and
  the upgrade events of `api/lib/subscription-service.ts`; the founder metrics count upgrades from `pro_subscriptions`
  instead, since these events are pruned after thirty days.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Who may call an admin procedure | the builder in `api/admin-router.ts` | `api/admin-access.test.ts`, `api/admin-router.security.test.ts` |
| What an admin answer may contain | `api/lib/admin-safe-fields.ts` | `api/admin-router.security.test.ts` |
| A setting the console can edit | `api/lib/system-settings-registry.ts` | `api/lib/system-settings-registry.test.ts` |
| A console page | `admin/src/pages/`, its route in `admin/src/App.tsx` and its entry in `admin/src/shell/Shell.tsx` | `tests/knowledge/architecture.test.ts` |
| Support tickets | `api/support-router.ts`, `admin/src/pages/Support.tsx` | `api/admin-router.security.test.ts` |
| Ads, SEO, events | `api/ads-router.ts`, `api/seo-router.ts`, `api/analytics-router.ts` | |

## Rules for changes here
1. Anything that reads or changes other users uses `adminProcedure` (`api/AGENTS.md`, rule 1).
2. Admin answers select explicit fields through `api/lib/admin-safe-fields.ts`; never return password hashes,
   session tokens or unmasked keys.
3. A settings write goes through `admin.updateSettings` or calls `invalidateSettingsCache()` (golden rule 5,
   checked by `tests/knowledge/architecture.test.ts`).
4. Role, plan and session writes go through `api/lib/access-control.ts`; nothing else may make them
   (`tests/knowledge/architecture.test.ts`).

## Tests
`api/admin-access.test.ts`, `api/admin-router.security.test.ts`, `api/admin-authentication.security.test.ts`,
`api/lib/admin-model-switch.test.ts`, `api/lib/ai-route-order.test.ts`, `admin/src/ui/words.test.ts` (times typed in
the console are Cairo time) and the console rule of `tests/knowledge/architecture.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** `logAdminAction` in `api/lib/admin-audit.ts` records actions in `admin_audit_logs` and the audit tab shows them, but
   not every procedure of `api/admin-router.ts` calls it yet, and a failed write of the trail does not stop the action.
2. **Gap.** Nothing backs up the database from the console; `admin.triggerBackupDemo` (settings with secrets masked,
   onboarding questions and ads) has no screen.
3. **Gap.** No screen edits SEO pages (`seo.upsert`, `seo.list` and `seo.delete` have no caller); the sitemap is served
   at `/sitemap.xml` from the app's address.
4. **Gap.** Ads show only in the mobile app (`mobile/app/lib/src/features/ads/sponsored_card.dart`), which records
   impressions and clicks; the website shows none.
5. **Gap.** Procedures without a screen: `admin.sendPushNotification` (web push only), `admin.getAiTokenLedger`,
   `admin.getPipelineVersionStats`, `admin.getStorageRuntimeMetrics`, `admin.updateUserPlan` (the console uses the
   `V2` one), `admin.getAICostOverview`, `admin.getAIClassificationStats`, `admin.getVoiceUsageStats`,
   `admin.getUserAiQuota`, `admin.getUserSmartProfile`, `admin.listAllUsers`, `admin.listSubscriptionsAdmin`,
   `admin.listStorePurchasesAdmin`, `admin.getDashboardStats`, `admin.getFounderMetrics`, `admin.getActivityLog`,
   `admin.getUserSessions`, `admin.discoverProviderModels`, `admin.saveAiModels`, the discount codes (store billing has
   none), `support.getById` and every statistic of `analytics`. The console's own procedures cover
   what these showed.

## Voice capacity and release controls
The voice settings expose per-model input TPM and the per-call reservation, in addition to seat caps. The effective cap reserves 20% headroom; 65k TPM and 30k reserved allows one standard call. A quota below one reservation refuses calls. Extended defaults to 65k TPM and 60k reserved and stays off until task qualification and capacity permit it. All capacity inputs have accessible names. Model-segment statistics attribute switched-call time and cost to each effective model. A hidden apology or a successful tool invocation is not a task-qualification result.

## Related systems
- [Accounts, sign-in and security](accounts.md): roles, sessions and account deletion.
- [AI providers and usage limits](ai-platform.md): the gateway, the cost ledger and the limits the AI tab reads.
- [Recording spending](expense-capture.md): clarifications, learned rules and the parser the sandbox calls.
- [Bank and wallet messages](bank-messages.md): the capture catalog tabs.
- [Notifications and WhatsApp](notifications.md): templates and the WhatsApp tab.
- [Plans and payments](billing.md): subscriptions and plans.
- [Web and mobile app shell](web-app.md): the route guards, and the ads and events in the app shell.


Financial analytics now uses the shared financial bucket for income/spending. Export labeling follows that bucket; internal movements are named as transfers/investments even when physically stored as income or expense.
