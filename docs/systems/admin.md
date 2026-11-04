# Admin console, support and growth tools

The admin console at `/admin` (users and plans, support tickets, subscriptions, AI providers and costs,
clarifications, WhatsApp, ads, learned rules, sessions, notifications, settings), the user's
support page, the ads shown in the app, the SEO metadata of public pages and the usage events the app records.

- Facts generated from the code, with diagrams: [docs/atlas/systems/admin.md](../atlas/systems/admin.md)
- The same story for readers who do not read code: [docs/ar/systems/admin.md](../ar/systems/admin.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The new console (admin/)
The console is moving to a site of its own ([decision 0041](../decisions/0041-separate-admin-console.md)): `admin/`,
built to `dist/admin` and served by `api/boot.ts` at `/admin` (`/admin` redirects to `/admin/`, every path under it
opens the console's page, `no-store` and `noindex`). `npm run admin:dev` runs it with the API on port 3100.
- `admin/src/App.tsx` asks `adminConsole.session` (moderators and admins); anyone else sees the sign-in page, Google
  (`/api/auth/google/start?next=/admin/`) or a phone account, and a signed-in user without the role is told so.
- «النهارده» (`admin/src/pages/Today.tsx`, `adminConsole.today`): who recorded today, yesterday and this week, sign-ups, the share of
  last week's recorders who came back, today's AI cost against the daily cap, active store subscriptions, open tickets
  and the oldest one's age, AI calls and failures in the last hour, unresolved key errors, and a real check of the
  database and Redis. A count that fails reads as unknown, never as 0. «محتاج تدخلك» lists only what needs action.
- «الناس» (`admin/src/pages/People.tsx`, `adminConsole.searchPeople`) finds a person by name, phone or email across Google
  and phone accounts. A person's page (`admin/src/pages/Person.tsx`, `adminConsole.person`) shows their numbers this
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
  and whether the person corrected it.
- «الموصلات» (`admin/src/pages/Connectors.tsx`) adds a provider from a short list of known services or any
  OpenAI-compatible address after testing the key (`admin.validateApiKey`), pauses, re-keys, checks the health of all
  (`admin.checkProviderHealth`, which had no screen) and removes them, shows each provider's models, purposes and
  prices, and lists unresolved key errors. Assigning models to purposes is on «إعداد الذكاء».
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
  support moderators answer tickets and land on this page, while every other page stays with admins.
- «التشغيل» (`admin/src/pages/Operations.tsx`): the AI switches, the daily cost cap and the mobile versions and store
  links, saved through `admin.updateSettings` from a bar that appears with the count of unsaved changes (and a
  warning before leaving the page with them), and the last 30 entries of the audit log in plain words.
- «الفلوس والباقات» (`admin/src/pages/Money.tsx`, `adminConsole.money`): a monthly revenue estimate from the list
  prices in `contracts/plans.ts` (yearly divided by 12) over subscriptions that are active, cancelled but still paid,
  or in grace, before the store's share; active subscriptions by store; subscriptions started this month and those
  that expired or were refunded this month; the latest 40 with names; and the plan limits (`AdminPlansTab`).
- Screens of the previous console that moved whole live in `admin/src/pages/Hosted.tsx`, each under a plain title and
  a sentence per section: «إعداد الذكاء» (`AiCommandCenter`, where models are assigned to purposes, and the server keys
  of `AdminKeysTab`), «القاموس والأسئلة» (`AdminRulesTab`, `ClarificationsTab`), «رسايل البنوك» (`AdminCaptureTab`)
  and «التواصل والإعلانات» (`NotificationsTab`, `AdminWhatsAppTab`, `AdminAdsTab`).
- Settings sections are hosted by `admin/src/ui/SettingsEditor.tsx`: the saved values with the admin's edits on top,
  only changed keys sent to `admin.updateSettings`, and the same save bar. `updateSettings` keeps only registry keys,
  so `tests/knowledge/settings-read.test.ts` fails when a screen edits a key outside the registry, or when a registry
  key is read by no server code (a switch that does nothing).
- Each page sits in `admin/src/ui/ErrorBoundary.tsx`, keyed by path: a page that throws shows a reload button, and a
  page file missing after a deploy says a new version is out.
- «باقي الأدوات» mounts the previous console (`src/pages/Admin.tsx`) at full width for what has not moved yet; it is
  for admins only, and moderators land on «الدعم».
- `scripts/dev/seed-admin.ts` makes a phone admin on a throwaway database on port 3399.

## Who gets in
- `AdminRoute` in `src/App.tsx` waits for the verified session before deciding, sends a signed-out visitor to
  `/login` and anyone who is not an admin to `/dashboard`. The identity snapshot kept on the device carries no
  role, so the console never opens on a value read from the browser.
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
| Console | `src/pages/Admin.tsx` | The tabs below; overview, users, support and subscriptions are drawn in this file |
| Admin queries | `src/hooks/useAdmin.ts` | The dashboard, user list, role, plan, delete and revoke calls the console shares |
| Admin API | `api/admin-router.ts` | Users, sessions, settings, AI providers and telemetry, learned rules, raw messages, notification templates |
| Tab components | `src/components/admin/` | Audit, settings, rules, ads, WhatsApp, clarifications, bank messages and notifications |
| AI command center | `src/components/admin/ai-center/AiCommandCenter.tsx` | Classification quality and telemetry, providers, one user's quota, and a sandbox |
| Settings screens | `src/components/admin/settings/` | Plan limits, API keys, and the controls for a bad day (`src/components/admin/settings/AdminOperationsSection.tsx`): stop one AI feature, the daily AI cost ceiling, the oldest allowed mobile build |
| Support | `api/support-router.ts`, `src/pages/Support.tsx` | Tickets from users, answers from admins |
| Ads | `api/ads-router.ts`, `src/hooks/useAds.ts`, `src/components/ads/AdBanner.tsx` | Campaigns, the banner in the app, clicks |
| SEO | `api/seo-router.ts`, `src/components/seo/SEOMeta.tsx` | The title and description of a public page, and a sitemap |
| Usage events | `api/analytics-router.ts`, `src/hooks/useSessionTracker.ts` | Events the app records in `user_analytics` |
| User export | `export.allUsers` in `api/export-router.ts` | Every account as JSON, CSV or Excel |

## The tabs
| Tab | What it shows and does | Procedures |
| --- | --- | --- |
| Overview | Registered users, Google and phone accounts, paying users, live sessions, open tickets, and the money and today's flows from the daily rollups; below them who recorded today and in the last seven days, sign-ups of the last seven days and how many recorded anything, the share of last week's recorders who came back, new and active Pro subscriptions, the token estimate and the paid subscriptions ever bought, Pro and Ultra, counted from `pro_subscriptions` | `admin.getDashboardStats`, `admin.getFounderMetrics` |
| Users | Search by name, email or phone with role and plan filters; open a user's smart profile; list their sessions and revoke one; change role or plan; delete the account; export everyone; message one user | `admin.listAllUsers`, `admin.getUserSmartProfile`, `admin.getUserSessions`, `admin.revokeSession`, `admin.updateUserRole`, `admin.updateUserPlanV2`, `admin.deleteUser`, `export.allUsers`, `adminWhatsapp.sendDirectMessage` |
| Support | Tickets newest first with the user's name and whether they are open; reply, which also marks the ticket resolved; close | `support.listAll`, `support.respond`, `support.close` |
| AI | Recent API key errors, with resolve and clear; then the command center: classification quality over the last 7, 30 or 90 days beside the period before (share saved on its own, the silent-mistake rate — auto-saved answers the user later changed —, review, questions, corrections, share sent to a model, average time, from `classification_logs`); consumption, cost and latency this billing period by provider and channel; providers with their keys masked, the models discovered for each and every model's purposes, plans and prices; one user's quota, measured against the limit the server enforces (the user's own override, else `<plan>_token_limit`), and latest requests; a sandbox that sends a typed sentence through `ai.parseExpense` | `admin.getApiKeyErrors`, `admin.resolveApiKeyError`, `admin.clearAllApiKeyErrors`, `admin.getClassificationQuality`, `admin.getAiTelemetryOverview`, `admin.getAiProviders`, `admin.getAiModels`, `admin.addAiProvider`, `admin.updateAiProvider`, `admin.deleteAiProvider`, `admin.discoverProviderModels`, `admin.saveAiModels`, `admin.getUserAiQuota` |
| Subscriptions | The latest subscriptions with their status | `admin.listSubscriptionsAdmin` |
| Clarifications | Items the classifier could not settle; mark one resolved or ignored | `admin.getPendingClarifications`, `admin.resolveClarification` |
| WhatsApp | Delivery counts and consent, templates, direct messages, template broadcasts, the verification switch ([notifications](notifications.md)) | `adminWhatsapp.*` |
| Ads | Campaigns with placement, target plan, dates, clicks and impressions | `ads.stats`, `ads.create`, `ads.update`, `ads.delete` |
| Rules | Words users taught the classifier (`user_dictionaries`), with the owner's name and delete | `admin.getLearnedRules`, `admin.deleteLearnedRule` |
| Bank messages (رسايل البنوك) | Three inner tabs (`src/components/admin/capture/AdminCaptureTab.tsx`): the banks, wallets and apps whose notifications are read and the subscriptions recognised in card charges, both editable without a deploy ([bank messages](bank-messages.md#who-is-read-the-capture-catalog)); and the numbers (`src/components/admin/capture/AdminCaptureNumbers.tsx`): what became of the captured payments per bank and kind over 1, 7 or 30 days with the undo rate of those recorded on their own, the banks the breaker stopped, the model queue, the bulk undo of one bank's recordings in a period, counted first and confirmed once more, and one user's capture for support (phones and their health, consents, latest payments and model jobs, no message text). Admins also get in-app alerts when the breaker stops a bank or the model's queue waits more than five minutes | `captureAdmin.*` |
| Audit | The latest sessions with the user's name, IP and device; revoke one | `admin.getActivityLog`, `admin.revokeSession` |
| Notifications | Templates with create, edit, switch and delete; the activity check on demand; the send log and device statistics; a user search to target one person | the notification procedures of `admin`, `admin.listAllUsers` |
| Settings | Every setting of `api/lib/system-settings-registry.ts` with secrets masked; per plan, in one tab each for Free, Pro and Ultra, the limits (tokens, daily entries, voice, offline items, active goals, payments recorded from bank messages a month and the phones that may send them, AI calls a minute, receipt and goal token caps, reports) and the feature switches of `contracts/plan-features.ts`; chat and voice-call limits per plan; the voice call's kill switch, models, daily cost caps, the coach call's rollout percent and test accounts, Ultra Thinking's model, thinking level and plans, the capacity caps (live calls at once per model and per user), and calls dashboard ([voice calls](voice-calls.md#in-the-admin-console)); the switch that stops the bank-message model and its daily cost cap in USD (`src/components/admin/settings/AdminSmsAiSection.tsx`, [bank messages](bank-messages.md)); capture from phones (`src/components/admin/settings/AdminCaptureSection.tsx`): the switch that opens it, the closed beta's users, the platforms, the signals a user may send a day, the bank and kind pairs recorded on their own for everyone, the banks paused from that, the transfer amount always asked about and the daily question notifications; a note that the parse model is chosen in the providers tab (the per-plan token-range routing editor is gone, [AI platform](ai-platform.md)); API keys with a live check; discount codes; a settings "backup" | `admin.getSettings`, `admin.updateSettings`, `admin.getAvailableModels`, `admin.validateApiKey`, `admin.getDiscountCodes`, `admin.createDiscountCode`, `admin.deleteDiscountCode`, `admin.triggerBackupDemo`, `voice.adminStats` |

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
| A tab | `src/pages/Admin.tsx` and its component in `src/components/admin/` | |
| Support tickets | `api/support-router.ts`, `src/pages/Support.tsx` | `api/admin-router.security.test.ts` |
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
`api/admin-access.test.ts`, `api/admin-router.security.test.ts`, `api/admin-authentication.security.test.ts`
and `api/lib/admin-model-switch.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** `logAdminAction` in `api/lib/admin-audit.ts` records actions in `admin_audit_logs` and the audit tab shows them, but
   not every procedure of `api/admin-router.ts` calls it yet, and a failed write of the trail does not stop the action.
2. **Debt.** Opening the AI tab fetches `admin.getAICostOverview`, `admin.getAIClassificationStats`,
   `admin.getClassificationLogs` and `admin.getVoiceUsageStats` and displays none of them: the panel that would
   show them, `src/pages/Admin.tsx#ClassificationDashboard`, is never mounted. The classification quality itself is
   shown by the command center's quality card (`admin.getClassificationQuality`).
3. **Gap.** The backup button returns settings with secrets masked, onboarding questions and ads to the
   browser; nothing backs up the database.
4. **Gap.** `support.assign` has no screen, so tickets cannot be given to one person of the team.
5. **Gap.** No screen edits SEO pages (`seo.upsert`, `seo.list` and `seo.delete` have no caller); the sitemap is served
   at `/sitemap.xml` from the app's address.
6. **Gap.** Ads show only in the mobile app (`mobile/app/lib/src/features/ads/sponsored_card.dart`), which records
   impressions and clicks; the website shows none.
7. **Gap.** Procedures without a screen: `admin.sendPushNotification`, `admin.checkProviderHealth`,
   `admin.getAiTokenLedger`, `admin.getPipelineVersionStats`, `admin.getStorageRuntimeMetrics`,
   `admin.resetUserTokens`, `admin.setUserTokenLimit`, `admin.updateUserPlan` (the console uses the `V2` one),
   `support.getById`, `support.assign` and every statistic of `analytics`.

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
