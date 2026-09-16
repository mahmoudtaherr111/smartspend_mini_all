# Reports, insights and the smart profile

The monthly analysis in the AI Center, the month comparison, the printable Pro report, the WhatsApp monthly report,
and the smart profile behind them: what the user tells the onboarding questions, what the app infers from their
spending, and the people they deal with. Classification prompts read the same profile.

- Facts generated from the code, with diagrams: [docs/atlas/systems/insights.md](../atlas/systems/insights.md)
- The same story for readers who do not read code: [docs/ar/systems/insights.md](../ar/systems/insights.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Analysis tab | `src/components/ai/AIMonthlyReport.tsx#AIMonthlyReport`, `src/components/insights/AIInsights.tsx#AIInsights` | Month picker, the saved or new analysis, sharing, the Pro export and the month comparison, inside the [AI Center](ai-center.md) page |
| Report API | `api/ai-router.ts` (`ai.generateMonthlyInsights`, `ai.getCachedMonthlyInsights`, `ai.compareMonths`, `ai.generateYearlyInsights`) | Builds, stores and returns reports |
| Report facts | `api/services/finance-semantic-layer/monthly-report-facts.ts#buildMonthlyReportFactsPack` | The month's totals, top categories and active goals from the finance layer of the [AI Center](ai-center.md) |
| Behaviour snapshot | `api/services/lifestyle-inference-engine.ts#buildBehaviorSnapshot` | Spending pattern, spikes, stability and month-over-month change from a month of rows |
| Printable report | `export.monthlyReportHtml` in `api/export-router.ts`, `api/services/pro-report-engine.ts#wrapReportAsPrintableHtml` | Turns the analysis the user sees into a safe HTML file |
| WhatsApp monthly report | `api/jobs/monthly-report-job.ts#runMonthlyReportJob` | Writes a short report per Pro user and sends it on WhatsApp |
| Monthly behaviour refresh | `api/jobs/monthly-behavior-job.ts#runMonthlyBehaviorJob`, `api/profile-router.ts#refreshMonthlyInferences` | Stores last month's snapshot and inferred attributes for every user |
| Smart profile | `api/services/user-profile-service.ts`, the profile procedures in `api/profile-router.ts` | Reads, merges and saves the profile, its learning events and the user's contacts |
| Onboarding questions | `api/services/adaptive-question-engine.ts`, `src/components/OnboardingCard.tsx#OnboardingCard` | The next question to ask and where each answer goes; the card on the home screen |
| Personal context | `api/services/personal-context-builder.ts`, `summarizeProfileForAI` in `api/services/user-profile-service.ts` | What prompts are told about the user: known people, subscriptions, car, smoking, salary day |

## The monthly analysis, step by step
1. **Open the tab.** `ai.getCachedMonthlyInsights` returns the report saved for the month in `ai_summaries`, if any.
   "Analyze" and "Refresh" both call `ai.generateMonthlyInsights` with `forceRefresh`.
2. **Waiting period.** When the user already has a monthly report, a new one needs `report_limit_<plan>` days since
   the last (30, 14 and 1 when the setting is empty); refreshing a month that already has a report skips this check.
3. **Facts.** The salary day comes from the smart profile. `buildMonthlyReportFactsPack` resolves the period's
   income, spending, net flow, transaction count, daily average, top categories and active goals, plus a category
   chart; it is cached for ten minutes unless the call is a refresh. The procedure also loads the month's and the
   previous period's rows: financial months from `api/services/financial-month.ts` when the salary day is after the
   1st, calendar months otherwise. A month without rows returns a fixed "nothing recorded yet" answer that is not saved.
4. **Server-side analysis.** From the rows it computes the behaviour snapshot, category and subcategory totals and
   their change from the previous period, a personality (balanced, impulsive, conservative or stressed, from the share
   of flexible categories and the monthly change), alerts (one dominant category, a large rise or fall, spending close
   to or far below income), bills that were paid last period but not yet this one, and a month-end forecast for the
   current month.
5. **Model settings.** `getAiClient("report", plan)` in `api/ai-router.ts` refuses the request when
   `<plan>_ai_analysis` is `false`, and picks the provider and model (`report_provider_<plan>`,
   `report_model_<plan>`, through `mapModelName`; Ultra uses Pro's settings), the target words and the plan's token
   limit. The admin's report settings (`ai_response_length`, `ai_focus`, `ai_system_prompt`,
   `ai_advanced_instructions`, `ai_report_structure_override`) apply only when the facts pack failed; with facts, a
   short fixed prompt is used. A user whose `ai_tokens_used` reached the plan's limit gets the basic report.
6. **The model call.** One call to NVIDIA, Fireworks, Groq or Gemini, with the facts block (or the server summary
   when the facts failed), the user's name, the salary day and the financial month, asking for JSON with the text,
   alerts, personality and a data table. Tokens are recorded (`trackTokens`) and a cost metric is written.
7. **Basic report.** When no model is used or its reply is not JSON, the server writes the text itself from the
   numbers above, with alerts, personalised cards and saving opportunities
   (`api/services/report-personalization-engine.ts#buildBackendPersonalizedInsights`) and the top categories.
8. **Checks and storage.** Numbers in the text are measured against the facts (`ai_trace.numericAccuracy`, with a
   hallucination risk). The inferred attributes are saved to the smart profile, the snapshot to
   `monthly_behavior_snapshots`, a `report_generation` learning event is recorded, and the report is saved in
   `ai_summaries`.

The screen shows the text, alerts, the personalised cards and the personality, with a share button and, for Pro,
Ultra and admins, "export Pro report": `export.monthlyReportHtml` wraps the report the screen holds in an escaped,
printable HTML file that the browser downloads.

## Comparing months and the yearly summary
- `ai.compareMonths` checks `<plan>_ai_analysis`, takes both months from the finance layer and writes the comparison
  (spending, income, net flow, transaction counts and the difference) without a model.
- `ai.generateYearlyInsights` does the same for a calendar year: totals, daily average, the peak month, active months,
  the month distribution and the top categories. No screen calls it.

## The WhatsApp monthly report
`monthly-report-generation` runs `runMonthlyReportJob` at 02:00 on the 1st of each month on replicas with
`ENABLE_CRONS=true`:
1. It takes every user whose plan is `pro`, with the phone number of a phone account or the phone in the profile;
   users without a number are skipped.
2. A report already stored in `monthly_reports` for the month with the current `MONTHLY_REPORT_CACHE_VERSION` is
   reused.
3. Otherwise it builds the facts pack and, when `chatbot_api_key` or `fireworks_api_key` is set, asks the chat model
   (`chatbot_model`) for a short report from those facts only; without a key or a usable reply it writes a fixed text
   with the totals and top categories. The report is stored in `monthly_reports`.
4. It sends the text with the WhatsApp service. If building the report failed, it sends a short "open the app"
   message instead.

## The smart profile
- **Shape.** One `user_profiles` row per user: basic information, financial information (income, its sources, the
  main goal, the salary day, debt), lifestyle (children, housing, people supported, car, pets, smoking,
  subscriptions), onboarding answers, inferred attributes and preferences, plus older columns for income, goal and
  personality.
- **Reading** (`api/services/user-profile-service.ts#getSmartProfile`): the row merged over defaults, the streaks from
  the user table, and the user's contacts. The first read of a profile copies the people named in older profile lists
  into `user_contacts` and marks the profile as migrated; after that every read loads the contacts from
  `user_contacts` and blanks the older lists. The latest learning events are appended to the inferred spending
  behaviour.
- **Saving** (`saveSmartProfile`): one upsert of every section. If it fails, only the older columns are saved.
- **Editing** (`updateSmartProfile`, behind `profile.updateSmartProfile` in Settings and the bank-sync screens):
  merges the patch section by section and marks the onboarding questions whose fields are now filled as answered.
- **Onboarding.** `api/services/adaptive-question-engine.ts#getNextOnboardingQuestion` walks
  `ADAPTIVE_ONBOARDING_QUESTIONS` in order and asks follow-ups only when they apply (the salary day only for salary
  income, children's names only with children, a partner's name when married or living with family, debt per month
  only with debt, and so on). `applyOnboardingAnswer` stores the answer or skip and copies the value into its profile
  field; the profile is complete when no question is left. `profile.submitOnboardingAnswer` also merges the answers
  the card kept, in case an earlier save was lost. The card on the home screen opens by itself after a short delay
  unless a dismissal (`profile.dismissOnboarding`) is less than 48 hours old; Settings shows and edits the profile
  (`src/components/profile/SmartProfileView.tsx`, `src/components/profile/SmartProfileSettings.tsx`).
- **Inferences.** On the 1st at 01:00, `monthly-behavior-snapshots` runs `refreshMonthlyInferences` for the previous
  month for every user with spending that month or a profile: it builds the behaviour snapshot, saves the inferred
  attributes (stability, spending behaviour, top categories and days, spikes, change, income ratio) into the profile,
  upserts `monthly_behavior_snapshots` and records a learning event.
- **Contacts.** `addDynamicContact` cleans a name and relationship taken from a message and adds or updates the
  person in `user_contacts`; `silenceContact` marks a person the user declined to explain so they are not asked
  again. Both clear the classification cache and muscle memory. [Recording spending](expense-capture.md) calls them.
- **Prompts.** `api/services/personal-context-builder.ts#buildPersonalContextPrompt` tells the classification model
  who the user's known people are and which categories to use for them, the subscriptions, the car, smoking and the
  salary day; `summarizeProfileForAI` adds a short profile summary to the parsing, receipt and goal prompts.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| The monthly analysis: prompt, fallback, alerts, waiting period | `ai.generateMonthlyInsights` in `api/ai-router.ts` | `api/ai-router.monthly-report-guard.test.ts` |
| Which facts report models receive | `api/services/finance-semantic-layer/monthly-report-facts.ts` | |
| Report plans, providers, models and words | the `report_*` and `<plan>_ai_analysis` system settings | |
| Behaviour labels and thresholds | `api/services/lifestyle-inference-engine.ts` | `api/services/lifestyle-inference-engine.test.ts` |
| The analysis screen | `src/components/insights/AIInsights.tsx`, `src/components/ai/AIMonthlyReport.tsx` | |
| The printable report | `api/services/pro-report-engine.ts`, `export.monthlyReportHtml` in `api/export-router.ts` | |
| The WhatsApp monthly report and its schedule | `api/jobs/monthly-report-job.ts`, `api/boot.ts` | `api/jobs/monthly-report-job.test.ts` |
| Onboarding questions and their order | `api/services/adaptive-question-engine.ts`; the card shows its own text and icon for known keys in `src/components/OnboardingCard.tsx` | `api/services/adaptive-question-engine.test.ts` |
| Profile fields, reading and saving | `api/services/user-profile-service.ts`; input schemas in `api/profile-router.ts` | `api/services/user-profile-service.test.ts`, `api/profile-router.schema.test.ts` |
| What classification prompts know about the user | `api/services/personal-context-builder.ts`, `summarizeProfileForAI` | `npm run bench:classify` |

## Rules for changes here
1. Numbers in a report come from the finance layer's facts. A model may word them, never produce them.
2. Read and write the profile only through `api/services/user-profile-service.ts`; people belong in `user_contacts`.
3. A report model call is paid: check the plan's switch and budget first (`assertAiBudget` in
   `api/lib/ai-usage-policy.ts`) and record the tokens afterwards.
4. Month boundaries use Cairo business time from `api/lib/app-time.ts` (golden rule 6).
5. Never log phone numbers, names from messages or report text (golden rule 10).

## Tests
`api/ai-router.monthly-report-guard.test.ts`, `api/jobs/monthly-report-job.test.ts`,
`api/services/adaptive-question-engine.test.ts`, `api/services/lifestyle-inference-engine.test.ts`,
`api/services/user-profile-service.test.ts` and `api/profile-router.schema.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** The WhatsApp report describes the month that has just started: the scheduler calls `runMonthlyReportJob` without a
   month at 02:00 on the 1st, and the job takes the month from `new Date().toISOString()`.
2. **Gap.** Names given in the onboarding questions (children, partner, siblings, parents, pets, regular contacts) are saved
   in the profile but never copied into `user_contacts` once the profile is marked as migrated, which its first save
   does; `getSmartProfile` then blanks those lists, so classification prompts and reports never see them.
3. **Bug.** `getSmartProfile` appends the latest learning events, with literal `\n` text, to the inferred spending behaviour.
   Every onboarding answer or profile edit saves that value, so it grows until the next behaviour refresh replaces
   it, and `summarizeProfileForAI` sends it to classification prompts.
4. **Bug.** Refreshing a month that already has a report skips the waiting period, so the analysis of that month can be
   regenerated, with a paid model call, as often as the AI rate limit allows. A `report_limit_<plan>` of 0 falls back
   to 30 days.
5. **Bug.** Only users on the `pro` plan get the WhatsApp report: Ultra users never do, the job ignores the "send the report on
   WhatsApp" switch in Settings (`whatsappReportsEnabled`), and it writes each recipient's phone number to the log
   (golden rule 10).
6. **Bug.** With a facts pack, the report prompt ignores the admin's report settings and never includes the personal and
   family context `generateMonthlyInsights` builds; the model sees the facts, the name, the salary day and the
   financial month only.
7. **Bug.** Numbers in a model-written report are measured against the facts but not enforced: unlike the chat, a report with
   unsupported numbers is shown as it is.
8. **Bug.** The analysis and the comparison show a technical trace (route, tools, tokens, model) to every user, not only in
   development.
9. **Bug.** The basic report says the user ran out of AI tokens whenever there is no Gemini client, including when no key is
   configured; and when the client cannot be built, the `<plan>_ai_analysis` switch is never checked.
10. **Gap.** No `assertAiBudget` check runs before either report model call, and the WhatsApp job records no tokens for the
    user (`api/AGENTS.md`, rule 5).
11. **Bug.** Month boundaries use server-local dates and `toISOString()` (golden rule 6). With a salary day, the previous period
    is derived from `toISOString().slice(0, 7)` of a local date, which is a month too early on a server whose clock is
    ahead of UTC; snapshot days are grouped by UTC date.
12. **Bug.** The printable report is branded "SpinSmart" in its default header and footer (`api/services/pro-report-engine.ts`).
13. **Debt.** `saveSmartProfile` never writes `last_ai_refresh_at`, and `getSmartProfile` adds missing `user_profiles` columns
    with `ALTER TABLE` when a read fails, outside the migrations in `db/`.
14. **Debt.** The behaviour snapshots are written but not read: `getProactiveInsights` in
    `api/services/finance-semantic-layer/proactive-insights.ts` has no caller, and no caller asks the facts pack to
    prefer a snapshot.
15. **Debt.** Unused code: `api/services/batch-ai-service.ts` only simulates a Gemini batch job; `buildProReportPrompt` and
    `analyzeAndLogBehavior` have no caller; `profile.getQuestions` and the `onboarding_questions` table it reads are
    not part of the question flow; `ai.generateYearlyInsights` has no screen; `profile.refreshInferences` is called
    only from `src/components/dashboard/UserIntelligencePanel.tsx`, which no screen shows.
16. **Bug.** The flexible-spending lists in `generateMonthlyInsights` and `buildBehaviorSnapshot` name categories that
    `api/lib/category-registry.ts` no longer has (رفاهية, خروجات) or stores under another name (هدايا وصدقات).
17. **Security.** The contact helpers log the names they save or reject, which come from users' messages.

## Related systems
- [AI Center](ai-center.md): hosts the analysis tab and owns the finance layer the facts come from.
- [Recording spending](expense-capture.md): classification prompts use the personal context and add contacts.
- [Money](money.md): the ledger, goals and the financial month behind every report.
- [AI providers and usage limits](ai-platform.md): the cost policy, token caps and usage records.
- [Accounts, sign-in and security](accounts.md): the user tables the profile reads names, phones and streaks from.
- [Notifications and WhatsApp](notifications.md): the WhatsApp service the monthly report is sent with.
