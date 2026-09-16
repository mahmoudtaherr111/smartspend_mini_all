# Admin console, support and growth tools

The admin console at `/admin` (users and plans, support tickets, subscriptions, AI providers and costs,
clarifications, WhatsApp, ads, learned rules, raw bank messages, sessions, notifications, settings), the user's
support page, the ads shown in the app, the SEO metadata of public pages and the usage events the app records.

- Facts generated from the code, with diagrams: [docs/atlas/systems/admin.md](../atlas/systems/admin.md)
- The same story for readers who do not read code: [docs/ar/systems/admin.md](../ar/systems/admin.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## Who gets in
- `AdminRoute` in `src/App.tsx` waits for the verified session before deciding, sends a signed-out visitor to
  `/login` and anyone who is not an admin to `/dashboard`. The identity snapshot kept on the device carries no
  role, so the console never opens on a value read from the browser.
- Every procedure of the console uses `adminProcedure` from `api/middleware.ts`. `api/admin-access.test.ts`
  refuses users and moderators even on an Ultra plan, `api/admin-router.security.test.ts` walks the whole
  router and checks that answers carry no password hashes or session tokens, and
  `api/admin-authentication.security.test.ts` checks the session behind the role: a demoted admin, a revoked
  session, an expired token and a forged signature are all refused.
- The `moderator` role can be given but grants nothing: `moderatorProcedure` is not used by any procedure, and
  a moderator reaches only their own support tickets.

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Console | `src/pages/Admin.tsx` | The tabs below; overview, users, support and subscriptions are drawn in this file |
| Admin queries | `src/hooks/useAdmin.ts` | The dashboard, user list, role, plan, delete and revoke calls the console shares |
| Admin API | `api/admin-router.ts` | Users, sessions, settings, AI providers and telemetry, discount codes, learned rules, raw messages, notification templates |
| Tab components | `src/components/admin/` | Audit, settings, rules, ads, WhatsApp, clarifications, raw SMS and notifications |
| AI command center | `src/components/admin/ai-center/AiCommandCenter.tsx` | Telemetry, providers, one user's quota, and a sandbox |
| Settings screens | `src/components/admin/settings/` | Plan limits and model routing, API keys, discount codes |
| Support | `api/support-router.ts`, `src/pages/Support.tsx` | Tickets from users, answers from admins |
| Ads | `api/ads-router.ts`, `src/hooks/useAds.ts`, `src/components/ads/AdBanner.tsx` | Campaigns, the banner in the app, clicks |
| SEO | `api/seo-router.ts`, `src/components/seo/SEOMeta.tsx` | The title and description of a public page, and a sitemap |
| Usage events | `api/analytics-router.ts`, `src/hooks/useSessionTracker.ts` | Events the app records in `user_analytics` |
| User export | `export.allUsers` in `api/export-router.ts` | Every account as JSON, CSV or Excel |

## The tabs
| Tab | What it shows and does | Procedures |
| --- | --- | --- |
| Overview | Registered users, Google and phone accounts, paying users, live sessions, open tickets, and the money and today's flows from the daily rollups; below them daily and weekly active users, new and active Pro subscriptions, the token estimate and upgrade events | `admin.getDashboardStats`, `admin.getFounderMetrics` |
| Users | Search by name, email or phone with role and plan filters; open a user's smart profile; list their sessions and revoke one; change role or plan; delete the account; export everyone; message one user | `admin.listAllUsers`, `admin.getUserSmartProfile`, `admin.getUserSessions`, `admin.revokeSession`, `admin.updateUserRole`, `admin.updateUserPlanV2`, `admin.deleteUser`, `export.allUsers`, `adminWhatsapp.sendDirectMessage` |
| Support | Tickets newest first with the user's name and whether they are open; reply, which also marks the ticket resolved; close | `support.listAll`, `support.respond`, `support.close` |
| AI | Recent API key errors, with resolve and clear; then the command center: consumption, cost and latency this billing period by provider and channel; providers with their keys masked, the models discovered for each and every model's purposes, plans and prices; one user's quota and latest requests; a sandbox that sends a typed sentence through `ai.parseExpense` | `admin.getApiKeyErrors`, `admin.resolveApiKeyError`, `admin.clearAllApiKeyErrors`, `admin.getAiTelemetryOverview`, `admin.getAiProviders`, `admin.getAiModels`, `admin.addAiProvider`, `admin.updateAiProvider`, `admin.deleteAiProvider`, `admin.discoverProviderModels`, `admin.saveAiModels`, `admin.getUserAiQuota` |
| Subscriptions | The latest subscriptions with their status | `admin.listSubscriptionsAdmin` |
| Clarifications | Items the classifier could not settle; mark one resolved or ignored | `admin.getPendingClarifications`, `admin.resolveClarification` |
| WhatsApp | Connection and QR code, direct messages, broadcasts, the verification switch ([notifications](notifications.md)) | `adminWhatsapp.*` |
| Ads | Campaigns with placement, target plan, dates, clicks and impressions | `ads.stats`, `ads.create`, `ads.update`, `ads.delete` |
| Rules | Words users taught the classifier (`user_dictionaries`), with the owner's name and delete | `admin.getLearnedRules`, `admin.deleteLearnedRule` |
| Raw SMS | Bank and wallet messages as received, with their status and the user they belong to | `admin.getRawSmsLogs` |
| Audit | The latest sessions with the user's name, IP and device; revoke one | `admin.getActivityLog`, `admin.revokeSession` |
| Notifications | Templates with create, edit, switch and delete; the activity check on demand; the send log and device statistics; a user search to target one person | the notification procedures of `admin`, `admin.listAllUsers` |
| Settings | Every setting of `api/lib/system-settings-registry.ts` with secrets masked, plan limits, voice, SMS and token ceilings and model routing; API keys with a live check; discount codes; a settings "backup" | `admin.getSettings`, `admin.updateSettings`, `admin.getAvailableModels`, `admin.validateApiKey`, `admin.getDiscountCodes`, `admin.createDiscountCode`, `admin.deleteDiscountCode`, `admin.triggerBackupDemo` |

## How the important actions work
- **Settings.** `admin.getSettings` starts from the registry defaults, overlays the saved values and replaces
  every secret with dots plus its last four characters (`maskSettingsForClient`). `admin.updateSettings`
  accepts only registry keys, skips a value that is still masked — so saving an unrelated field cannot
  overwrite a working key with dots — upserts the rest and clears this process's settings cache.
- **Role and plan.** `admin.updateUserRole` and `admin.updateUserPlanV2` write the user row and bump the auth
  version, so cached sessions pick the change up at once.
- **Deleting a user.** `admin.deleteUser` runs `purgeUserData` in a transaction ([accounts](accounts.md)).
- **Messaging one user.** The dialog in the users tab sends through WhatsApp (`adminWhatsapp.sendDirectMessage`,
  server side) or, for email, opens the admin's own mail application with a `mailto:` link: nothing is sent or
  recorded by the server.
- **AI providers.** Keys are stored encrypted and listed masked; adding, editing or deleting a provider, or
  saving its models, refreshes the gateway cache that routes model calls ([AI providers and usage
  limits](ai-platform.md)). `admin.validateApiKey` proves a key the cheapest way there is — by listing the
  models it can reach — and works for any provider, not a fixed list.
- **Support.** Users open tickets from `src/pages/Support.tsx` (`support.create`, which prepends an optional
  phone or email to the message text) and see their own list (`support.listMine`); a ticket is readable and
  closable only by its owner or an admin.

## Ads, SEO and usage events
- `ads.list` is public: active campaigns inside their dates for a placement and plan. `src/components/ads/AdBanner.tsx`
  shows one and counts a click through `ads.click`, which also stores a row in `ad_clicks`.
- `seo.getPage` returns the saved metadata of a path, or a default Arabic title, description, keywords and
  canonical address; `SEOMeta` writes them into the document head of the public pages. `seo.sitemap` builds an
  XML sitemap of fixed routes and saved pages.
- `analytics.trackEvent` stores an event with metadata in `user_analytics`; `src/hooks/useSessionTracker.ts`
  calls it from the app shell. The same table carries the AI usage events of `api/lib/ai-usage-policy.ts` and
  the upgrade events of `api/lib/subscription-service.ts`.

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
4. After changing a user's role or plan, bump the auth version.

## Tests
`api/admin-access.test.ts`, `api/admin-router.security.test.ts`, `api/admin-authentication.security.test.ts`
and `api/lib/admin-model-switch.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Security.** `admin.revokeSession` deletes the session row but not its cached copy, so a session revoked from the audit
   tab or from a user's session list keeps working for up to fifteen minutes; `session.revokeMine` clears the
   cache and bumps the auth version.
2. **Gap.** Nothing records what admins do. The audit tab lists recent sessions, and changing a role or plan, editing
   settings, deleting an account or sending a message leaves no trail.
3. **Debt.** A settings change reaches the other replicas only when their five-minute cache expires
   (`api/lib/settings-cache.ts`).
4. **Bug.** The quota inspector compares usage with fixed ceilings of 50,000, 500,000 and 2,000,000, not with the
   `<plan>_token_limit` settings and the per-user limit that `api/lib/ai-usage-policy.ts` enforces — and that
   the settings tab writes.
5. **Debt.** Opening the AI tab fetches `admin.getAICostOverview`, `admin.getAIClassificationStats`,
   `admin.getClassificationLogs` and `admin.getVoiceUsageStats` and displays none of them: the panel that would
   show the classification numbers, `src/pages/Admin.tsx#ClassificationDashboard`, is never mounted.
6. **Gap.** The backup button returns settings with secrets masked, discount codes, onboarding questions and ads to the
   browser; nothing backs up the database.
7. **Gap.** Answering a ticket does not notify the user, while the support page promises a reply within a day. The
   reply box is drawn for moderators too, though they cannot reach the console and `support.respond` refuses
   them, and `support.assign` has no screen.
8. **Gap.** Nothing serves the sitemap: `seo.sitemap` is a tRPC query, there is no HTTP route and no file for it, and it
   would list `/admin` and a hard-coded `https://smartspend.app`. No screen edits SEO pages either
   (`seo.upsert`, `seo.list` and `seo.delete` have no caller).
9. **Bug.** Nothing calls `ads.impression`, so the impressions and the click-through rate in the ads tab stay at zero;
   `ads.list` trusts the plan the client sends, and `analytics.trackEvent` stores any event name and metadata a
   signed-in caller sends.
10. **Gap.** Procedures without a screen: `admin.sendPushNotification`, `admin.checkProviderHealth`,
    `admin.getAiTokenLedger`, `admin.getPipelineVersionStats`, `admin.getStorageRuntimeMetrics`,
    `admin.resetUserTokens`, `admin.setUserTokenLimit`, `admin.updateUserPlan` (the console uses the `V2` one),
    `support.getById`, `support.assign` and every statistic of `analytics`.
11. **Bug.** Discount codes are created here but checkout never applies them ([billing](billing.md)), and the WhatsApp
    tab always shows verification as off ([notifications](notifications.md)).
12. **Bug.** The founder metrics count active users from sessions created since the server's midnight, not Cairo's
    (golden rule 6), and upgrades only from `upgrade_to_pro` events, so an upgrade to Ultra is not counted.

## Related systems
- [Accounts, sign-in and security](accounts.md): roles, sessions and account deletion.
- [AI providers and usage limits](ai-platform.md): the gateway, the cost ledger and the limits the AI tab reads.
- [Recording spending](expense-capture.md): clarifications, learned rules and the parser the sandbox calls.
- [Bank and wallet messages](bank-messages.md): the raw messages tab.
- [Notifications and WhatsApp](notifications.md): templates and the WhatsApp tab.
- [Plans and payments](billing.md): subscriptions and discount codes.
- [Web and mobile app shell](web-app.md): the route guards, and the ads and events in the app shell.
