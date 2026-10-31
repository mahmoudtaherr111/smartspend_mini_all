# Money: expenses, wallets, budgets, goals and businesses

The ledger after an item is saved: the home screen with its summary, statistics and calendar, the expense list and
search, daily rollups and their nightly repair, wallets, budgets, savings goals, business mode, the people the user
deals with, and the expense export. Saving a new item belongs to [Recording spending](expense-capture.md).

- Facts generated from the code, with diagrams: [docs/atlas/systems/money.md](../atlas/systems/money.md)
- The same story for readers who do not read code: [docs/ar/systems/money.md](../ar/systems/money.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Home screen | `src/pages/Home.tsx#Home` | Three tabs (record, statistics, calendar) for one month, the summary cards, business mode, the onboarding card, and, for users whose plan has [voice calls](voice-calls.md), a button that starts one (`src/components/voice/CallSmartButton.tsx#CallSmartButton`) |
| Header and summary | `src/components/dashboard/HomeHeader.tsx`, `src/components/dashboard/HomeSummaryCards.tsx` | Month switcher, tabs, business toggle, streak, the month's spending as a share of income, income and spending totals |
| Record tab | `src/components/expenses/RecentExpenses.tsx`, `src/components/expenses/EditExpenseDialog.tsx`, `src/components/goals/FinancialGoalsPanel.tsx#FinancialGoalsPanel` | Beside the entry form: the entries waiting for an answer to their question ("محتاج ردك", [recording spending](expense-capture.md#clarifications)), the month's latest items, each with details, an edit dialog (amount, kind, category, date, description; `expense.update` stores the category through the registry and records a changed one as the user's correction) and delete, each category badge in the colour the taxonomy gives it, and the goal creation card |
| Statistics tab | `src/components/dashboard/StatsView.tsx#StatsView`, `src/components/dashboard/ExpenseChart.tsx#ExpenseChart`, `src/components/dashboard/BehaviorInsights.tsx`, `src/components/dashboard/GlobalSearch.tsx#GlobalSearch` | Daily average, change, top category and personality; charts by category, family, electronic payments, budget and timing; search; bank-message totals; top categories |
| Calendar tab | `src/components/dashboard/MonthlyCalendar.tsx` | Spending per day of the calendar month, and the items of a chosen day |
| Ledger API | `api/expense-router.ts` (`expense.list`, `expense.searchTransactions`, `expense.getById`, `expense.update`, `expense.delete`, `expense.getMonthSummary`, `expense.getMonthlyStats`, `expense.getYearlyStats`) | Reads, edits and deletes items and computes the month and year figures |
| Ledger writer | `api/services/ledger-writer.ts` | Adds, changes and removes a row with everything that moves with it (decision 0027) |
| Daily rollups | `api/services/expense-rollups.ts`, `api/jobs/rollup-reconciliation-job.ts#runRollupReconciliationJob` | Per-day totals kept in step with every write, and repaired every night |
| Taxonomy migration | `api/jobs/taxonomy-migration-job.ts#runTaxonomyMigrationJob` | Moves stored rows still filed under an old category to the current taxonomy |
| Financial month | `api/services/financial-month.ts#getFinancialMonthDayRange` | Month boundaries from a salary day, in Cairo business days |
| Wallets, budgets, goals, business | `api/wallet-router.ts`, `api/budget-router.ts`, `api/goals-router.ts`, `api/business-router.ts` | Their own records and rules |
| Cards and wallets screen | `src/pages/WalletsPage.tsx`, route `/wallets`, linked from the More page and the sidebar; `src/components/wallets/DigitalBankingSuite.tsx#DigitalBankingSuite` | The user's cards and wallets through `wallet.*`: add one (name, kind, last four digits, balance), delete one, and a chosen one's transactions with its money in and out (`wallet.getWalletMonth`). A balance is what the user entered |
| Commitments and plans | `api/coach-router.ts`, `api/services/coach/`, the page `src/pages/PlanPage.tsx#PlanPage` at `/plan` | Scheduled commitments and expected income, which payment paid which due date, what is free until payday, the coaching plan the user accepted, and its reminders ([below](#commitments-and-plans)) |
| People | the contact procedures in `api/profile-router.ts` (`profile.listContacts`, `profile.addContact`, `profile.updateContact`, `profile.deleteContact`, `profile.mergeContacts`) | The people behind transfers and family spending |
| Export | `export.myExpenses` in `api/export-router.ts`, the "نزّل مصاريفك" card of the More page (`src/components/expenses/ExportExpensesCard.tsx`) | The user's items, up to 10,000 newest first, as Excel or CSV (JSON too through the API), protected against spreadsheet formulas: each row dated by Cairo's day, named by its kind (دخل، مصروف، تحويل، استثمار، مرتجع for a refund, with its signed amount), with its subcategory and its source (`exportRow`) |

Screens of other systems use these APIs: people in `src/components/settings/PeopleSettingsView.tsx`, the business in
`src/components/settings/BusinessSettingsView.tsx`.

## The ledger and its daily rollups
- An item is a row of `expenses` with a type (income, expense, transfer, investment), an amount, a category and
  subcategory, a date, a source, a status, and optional wallet, business and contact, with its original text
  (`raw_text`) and parsed metadata (`parsed_metadata`) on the same row. A side table that copied those two,
  `expense_details`, was read by nothing and kept the text of deleted expenses; migration
  `db/migrations/0025_drop_expense_details.sql` removed it.
- **Refunds.** An expense whose money came back (direction `incoming`) is stored with a negative amount in the
  category it was bought from (`ledgerAmount` in `api/services/expense-rollups.ts`), so the rollups, the category
  breakdown, budgets and the AI Center net it without knowing about refunds. `expense.update` takes `refund` and keeps
  the stored sign in line with the kind; the list, calendar, search and edit dialog show the magnitude as "مرتجع"
  (docs/decisions/0010-refunds-net-their-category.md).
- Every write that adds, changes or removes an item runs in a transaction that applies a delta to
  `expense_daily_rollups`, one row per user, business (0 for personal) and Cairo business day
  (`expenseToRollupDelta`, `applyExpenseRollupDelta`). Only confirmed items count; items recorded from bank messages
  (source `sms`, saved by the old intake) also count as automated income or spending. A negative net-spending day can be a legitimate refund and does not raise a corruption alert. Negative non-spending totals or transaction counts request reconciliation; the log records ids and the day, never financial totals.
- **The ledger writer** (`api/services/ledger-writer.ts`, decision 0027) holds these steps for `expense.create`,
  `expense.batchCreate`, `expense.update`, `expense.delete` and the clarification saves. `createLedgerEntry` inserts
  the row with its signed amount, rollup delta, contact count and (unless the caller says the save does not count)
  the streak in one transaction, gives back the row already saved under the same `clientRequestId` instead of
  writing again, then runs the caller's `afterCommit` and clears the caches and checks budgets for new spending.
  Changing the category of a row recorded from a bank message also teaches the user's capture memory where that
  merchant goes ([bank and wallet messages](bank-messages.md)).
  `insertLedgerEntriesInTx` and `bumpStreakInTx` are the same steps inside a caller's own transaction. The caller
  still checks ownership, finds or creates the contact and normalizes the category.
- `expense.update` checks that a referenced wallet, business or contact belongs to the user and normalizes the
  category through the registry; `updateLedgerEntry` locks the row, keeps its sign in line with its kind and refund,
  reconciles what it paid toward, backs out the old row's delta and applies the new one, and marks muscle memory stale
  (its Redis generation). Then the procedure adds a contact for a person category, and when the category changed marks
  the classification log as corrected and records a correction rule.
- `expense.delete` (`deleteLedgerEntry`) locks the row, deletes it, releases what it paid toward, backs out its delta,
  lowers the contact's count and marks muscle memory stale. A row recorded from a bank message also marks its capture
  event deleted in the same transaction, so a late message of the same payment does not bring it back.
- After a write, the user's cache generation is bumped (`invalidateLedgerCaches`), which drops the month summaries and
  statistics cached in Redis and the finance facts of the [AI Center](ai-center.md). So do deleting a wallet and
  deleting or merging a person, which change expense rows too. The classification cache needs no clearing: its key
  holds what the answer depends on (docs/decisions/0013-caching-as-one-system.md).
- **Nightly repair.** `nightly-rollup-reconciliation` runs at 04:00 on replicas with `ENABLE_CRONS=true` and, for every
  user with items or rollups in the last 60 days, recomputes each day from the confirmed items
  (`reconcileRollupsForRange`): missing days are inserted, wrong days rewritten, days without items deleted, and the
  caches bumped when anything changed.
- **Streak.** Saving an item updates the user's streak in the same transaction (`bumpStreakInTx`): the same Cairo
  day keeps it, the next day adds one, a gap restarts it. The writer's caller decides whether a save counts
  (`countsForStreak`); every save the user makes does.
- **Money movements.** A gam3eya payment or payout, a loan given, taken or repaid, and an ATM withdrawal are
  `transfer` items (تحويل/جمعية, تحويل/دين/سلفة, تحويل/سحب ATM), so they count as neither spending nor income. Which
  way the money went is in `parsed_metadata.direction` (`incoming` or `outgoing`)
  (docs/decisions/0008-money-movements-and-taxonomy.md).
- **Taxonomy migration.** `taxonomy-migration` runs every 30 minutes on replicas with `ENABLE_CRONS=true` and moves
  up to 500 stored items still filed in an old place (`LEGACY_TAXONOMY` in `contracts/categories.ts`: a retired
  category, a merged subcategory, a money movement booked as spending or income) to where they live now. Each item
  moves in its own transaction: it keeps its old category, subcategory and type in
  `parsed_metadata.legacy_taxonomy`, and when its type changes the rollup delta moves
  with it. User dictionaries, correction rules and budgets that name a retired category follow. Once every row is
  current a run changes nothing. Undoing it means restoring the three values from `legacy_taxonomy` and moving the
  rollup delta back.

## The home screen
- **Month and cycle.** The month comes from the address, or else the month that holds today. When the profile has a
  fixed salary with a salary day (set in Settings, the profile or the onboarding question), the summary and statistics
  use the salary cycle from `getFinancialMonthDayRange`, and a cycle is named after the calendar month it starts in, so
  before payday the month that holds today is the previous one; the calendar draws and counts the same cycle. The
  health badge compares spending with the month's recorded income, or the profile's income when none is recorded. The tab
  bar carries a month only when the user picked one. A budget alert opens the statistics tab at the budgets card
  (`#budget`).
- **Summary cards** (`expense.getMonthSummary`): income, spending, transfers, investments, net flow and count of the
  period's rollups, personal or, in business mode, the active business's, cached per cache generation for five
  minutes while the month (or the salary cycle spilling into it) is open and a day once it is closed
  (`ledgerCacheTtl`); the year's figures likewise.
- **Statistics** (`expense.getMonthlyStats`, cached the same way, for personal items or the active business):
  - totals and automated totals from the rollups, and the previous period's totals;
  - category and subcategory breakdowns from the confirmed items, with their change from the previous period, and
    likely recurring items (subscriptions, packages, instalments, internet, electricity);
  - spending per day, week of the month and weekday, and per Cairo hour from all of the month's items;
  - a comparison with the same week of the previous period until day 24, and with the whole previous period after;
  - money sent to and received from each family member;
  - a spending behaviour (planned, spiky, emotional or concentrated, overridden by impulsive or conservative from the
    share of income spent), whose discretionary share counts `DISCRETIONARY_CATEGORIES` from
    `contracts/categories.ts` (ترفيه، تسوق، أكل وشرب، عناية شخصية، اشتراكات);
  - the daily average: the month's spending over the Cairo calendar days of the month so far, from its first day or
    from the user's first item when that is later (`dailyAverageDays` in `api/expense-router.ts`), so a clock change
    does not add a day;
  - the month's items (the columns the charts read, up to `MONTH_ITEMS_BOUND`, 5,000).
- **Search** (`expense.searchTransactions`): up to 20 of the user's items whose category, subcategory, description or
  original text contains the query, newest first.
- **Record tab list** (`expense.list`): the month's latest items, page by page, newest id first; the calendar asks the
  same procedure for one day, whose bounds it writes without a time zone and the server reads as Cairo's day
  (`api/lib/app-time.ts#parseBusinessInstant`).
- **Business mode.** A Pro user with a business can switch the statistics and calendar to that business; the choice is
  kept in the browser.
- **Budget alert.** After a save (typed, spoken or from a receipt), `checkUserBudgetExceeded` in
  `api/notification-engine.ts` runs. A user with budgets gets `budget_near_limit` once per cycle when a budget reaches
  its alert threshold and `budget_category_exceeded` once when it passes its limit (`checkBudgetAlerts`; the cycles
  already warned are kept in the budget's metadata). A user without budgets gets `budget_exceeded` once a month when
  the month's spending passes the monthly income in the profile.

## Wallets
`wallet.getWallets`, `wallet.createWallet` (name, provider, last four digits, balance: an amount, Arabic digits and
thousands separators read, anything else refused by `walletBalanceSchema`), `wallet.updateWallet` and
`wallet.deleteWallet`, which detaches the wallet from the user's items in the same transaction.
`wallet.getWalletTransactions` pages through the items of one wallet. `wallet.getWalletMonth` sums a wallet's money in
and out over one Cairo month (from payday when the caller passes a salary day): income and refunds are money in,
spending is money out, transfers count in neither, and items waiting for confirmation are left out. The web card and the
mobile wallet screen both show this sum, over every row of the month rather than a page of them. The [AI Center](ai-center.md) can also create and
change wallets through confirmed actions. A balance is what the user entered or a bank message said, not a running
total (no saved item moves it): each one given is stamped with when and by what (`balance_observed_at`,
`balance_source`: `user` from these procedures, `assistant` from a confirmed action, `bank_message` when a captured
payment on the wallet is recorded and its message is newer, [bank and wallet messages](bank-messages.md)); balances saved before this was kept have an unknown age and are said
so, never taken for today's.

## Budgets
A budget has a title, an optional category, a monthly limit, the day its cycle starts, an alert threshold (80% by
default), an optional linked goal and a status. `budget.list` returns every budget with what was spent in its current
cycle, counted in Cairo business days, and whether it is near or over its limit. `budget.create`, `budget.update` and
`budget.delete` check ownership and bump the finance cache; a budget's category is stored through the registry
(`storageCategoryName`), so it matches what the ledger stores. The statistics tab shows them first
(`src/components/budgets/BudgetsPanel.tsx`): a progress bar per budget, a form to add one for a category or for all
spending, and delete. The assistant can also create them. The standing of each budget comes from
`api/services/budget-status.ts#listBudgetStatuses` (expense rows only, in the budget's own cycle).

## ليك وعليك (who owes whom)
`expense.getDebtBalances` reads every confirmed personal loan (transfer under تحويل/دين/سلفة with a direction) and nets it per
person (`api/services/debt-ledger.ts`): money that went out (lent, or a debt repaid) raises what the person owes the
user, money that came in lowers it. People are the loan's contact, else "من غير اسم"; settled people are left out.
The statistics tab shows the open balances under the budgets (`src/components/debts/DebtsPanel.tsx`), with the totals
owed to and by the user. The same procedure returns the gam3eya standing (`getGam3eyaStanding`: installments paid in,
payouts taken, and what the gam3eya still holds for the user, from transfers under تحويل/جمعية), shown in the same
panel; nothing renders without loans or a gam3eya.

## Installments (فاضل كام قسط)
An installment plan (`installment_plans`: title, the keyword the user writes when paying, monthly amount, number of
installments, installments paid before the plan was added) is added from the panel under the budgets
(`src/components/installments/InstallmentsPanel.tsx`, `expense.createInstallmentPlan`). `expense.listInstallmentPlans`
counts the user's expenses under أقساط وفوايد since the plan was added whose description or subcategory contains the
keyword, adds the ones paid before, and returns paid, remaining and the remaining amount
(`api/services/installments.ts#installmentProgress`, capped at the plan's count). A plan that has a schedule of due
dates ([commitments](#commitments-and-plans)) is counted from the payments linked to them instead
(`installmentProgressFromLinked`): a partial payment counts for what it paid, an installment is paid once its whole
amount is in, and a payment whose words also name another plan is not counted twice. `countedBy` says which. `expense.deleteInstallmentPlan`
archives a plan.

## Seasons (رمضان كلفني كام)
A season is a date range, not a category (`api/lib/seasons.ts`): Ramadan and the two Eids come from the Hijri calendar
(Umm al-Qura, from the runtime's ICU), the school start (1 September to 15 October) and summer (June to August) are
fixed, and days are Cairo business days. `expense.getSeasonSpending` sums the user's personal expenses between the
dates by category (refunds net, being stored negative), for the given year or the latest season that has started, with
the same season a year earlier; `src/components/seasons/SeasonsPanel.tsx` shows it with a tab per season.

## Commitments and plans
What the user expects to pay or receive on a schedule lives in `scheduled_cashflows` (`api/services/coach/cashflows.ts`):
rent, bills, subscriptions, school fees, an installment, a debt repayment, a gam3eya turn, a salary or freelance
income, with a direction, an amount or none (unknown), a recurrence (once, weekly, monthly, yearly), a first due day or
none (unknown), and a certainty (`confirmed`, or `estimated` for income that varies). An installment plan has at most
one schedule (`scheduled_cashflows_plan_unique`), so the same installment is never a second commitment. It is a
promise about the future, never a ledger row.
Dates must be real calendar days, with an end on or after the start; invalid legacy anchors yield no occurrences
instead of entering a recurrence loop. The page preserves piastres and accepts Arabic decimal/thousands separators.
Debt commitments can carry an owned contact id, displayed with the current contact name. The form lets the user
choose whether they will repay or receive a repayment, and which personal contact it concerns. The voice coach
resolves the exact normalized name the user said; duplicate names require a choice, an unknown name remains
explicitly unlinked, and no person or loan is created implicitly. Merging contacts moves both expenses and schedules
to the primary contact; deleting one clears both links in the same transaction, leaving the commitment itself.
For duplicate names the tool returns owned contact choices with their relationships; the coach asks the user to
identify one before preparing a draft. An unknown person's name is retained in the commitment title.
- **Due dates** (`api/services/coach/schedule.ts#dueDays`, pure, Cairo day keys): a monthly 31st falls on a short
  month's last day and comes back to the 31st; a yearly 29 February is the 28th in other years; no start day means no
  dated occurrence.
- **Paid or not** (`occurrences`): `cashflow_settlements` links a payment to one due date, `linked` to a ledger row or
  `declared` when the user says it was paid off the records. `settle` checks, in one transaction with row locks, that
  the schedule and the expense are the user's (same id and type), that the day is one of the schedule's due dates,
  that the confirmed personal expense is money going the right way (a transfer needs explicit incoming/outgoing
  metadata, and a refund or income never pays a rent), and that neither the due date
  nor the expense is allocated beyond its amount; a partial payment leaves the rest owed. A due date is `paid`,
  `partial`, `due`, `overdue`, or `unconfirmed`: the last due date before the schedule was added (within 45 days) is
  asked about, never owed or overdue, and earlier ones are not tracked. Deleting a paying expense, or editing it below
  what it paid, releases its settlements inside the same transaction. Edits that change the contact, kind, scope
  or direction also release incompatible links (`releaseSettlementsOf`,
  `reconcileSettlementsOf`, called from `expense.delete`, `expense.update` and the action runtime's undo).
  A debt repayment must be a loan transfer (`تحويل/دين/سلفة`) for the linked contact. An off-record declaration
  changes only the due date's payment status, never the loan balance. Changing a schedule so an existing payment
  no longer fits, reducing it below the paid amount, or moving a paid date is refused until its settlements are unlinked.
  The allocated amounts are read with `FOR UPDATE` after taking the expense lock, so concurrent settlements for
  different schedules cannot reuse the older transaction snapshot and allocate that payment twice.
- **Free until payday** (`cashPosition`): the wallets as last entered, minus what is due and unpaid before the next
  payday (the profile's salary day, else the first of next month), with confirmed income added apart and estimated
  income apart again; unknown amounts, unconfirmed dates and undated commitments are listed, never subtracted. Decimal
  throughout.
- **Suggestions** (`suggestPayments`): eligible payments within a week of a due date, using the amount still free
  after all allocations. A linked contact must match; otherwise available amount or a title word suggests a match.
  Fully allocated, unconfirmed, business and wrong-direction payments are excluded. Multiple schedules on the same
  day are selected by schedule id; nothing is linked without the user's tap or consent.

A coaching plan (`coaching_plans`, `coaching_steps`, `api/services/coach/plans.ts`) is what the user accepted with the
coach: a title, a goal in their words, the figures it rests on (`evidence`), up to eight steps (a spending limit a day
for a category, a saving, a payment, recording, a review), and a review day. `acceptPlan` saves it as the one active
plan in a transaction; a plan it replaces ends as `replaced` and its reminders stop. A step is done by the user's word
or the records, never inferred from a balance. A reminder is its own consent: `setReminder` (a future time, the day and
hour read on Cairo's clock) raises the step's reminder revision; the `coaching-reminders` job (every five minutes,
`scheduleProtectedJob` in `api/boot.ts`) delivers each due one as an in-app notification in the same transaction that
moves it from `scheduled` to `sent` for that revision (`deliverDueReminders`), so a restart, a retry or a second
replica sends nothing twice and a moved or cancelled reminder never fires the old one. The notification says a step is
due, never an amount.

The page «خطتك والتزاماتك» (`/plan`, linked from the More page and from the reminder) shows what is free until payday
with every unknown named, the active plan with its steps (done, skipped, back), a reminder per step (set on Cairo's
clock, cancel), the due dates of 45 days either side with a payment to confirm from the suggestions or "paid off the
records", and a form to add a commitment or expected income. A partial date shows the amount paid and remaining;
paid dates can be opened to inspect and unlink each settlement (`coach.unsettle`), which never deletes or changes
the ledger payment. `overview` includes settlement ids scoped to the same account and 90-day window. The [voice call](voice-calls.md)'s coach reads the same
figures and saves plans, steps, reminders and commitments through the same services after the user's consent.

## Goals
- `goals.list` returns the user's goals and, when the plan has no goal analysis, an upsell.
- `goals.create`: a title, a description of up to 120 characters, a target amount and date. The number of active
  goals is the plan's `goals_active_limit_<plan>` (3 on Free by default, 0 = no limit); the assistant's goal action
  applies the same limit.
- `goals.analyze` (the plan switch `feature_goal_analysis_<plan>`, Pro and Ultra by default): asks Gemini (`ai_model_pro`, through `mapModelName`, after `assertAiBudget`) for a plan,
  weekly actions, alerts and progress from the goal, this month's spending and the profile summary, records the
  tokens and saves the plan on the goal.
- `goals.setStatus` (active, completed, paused) and `goals.delete`, which also unlinks the goal's budgets.
- On the home screen the goal card shows only while the user has no active goal and has not dismissed it; the list
  with statuses is in the profile view.

## Business mode
A plan feature (`feature_business_<plan>`, Pro and Ultra by default; `businessProcedure`). A user has one active business with categories that the classification pipeline scores in
business mode:
- `business.suggestCategories` asks Gemini for categories with Egyptian keywords and examples from the business
  description;
- `business.create`, `business.update`, `business.addCategory`, `business.updateCategory`, `business.removeCategory`
  (a soft delete) and `business.linkContact` change the categories the classification cache key carries, so the
  next parse sees them;
- `business.delete` removes the categories, turns linked contacts back into personal ones, moves the business rollups
  and items to personal, and deletes the business in one transaction.

A plan without the feature is told on the first screen of Settings → business (`business.get` answers FORBIDDEN, and
`src/components/settings/BusinessSettingsView.tsx` shows the lock and a link to the plans instead of the setup steps).

## People
- `profile.listContacts` counts each person's items from `expenses` and filters personal, business or silenced people.
- `profile.addContact` refuses a duplicate name; `profile.updateContact` changes the name, relation, type, business
  or silence.
- `profile.deleteContact` removes the name from the profile's older people lists, detaches the person's items and
  deletes the contact; `profile.mergeContacts` moves the second person's items to the first and keeps the richer
  relation, type and business.
- All of them mark muscle memory stale; the classification cache key carries the known people, so the next parse
  sees the change. Deleting and merging also bump the ledger generation, since they change expense rows.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| What moves with a saved, edited or deleted row | `api/services/ledger-writer.ts` | `tests/ledger-writer.test.ts`, `tests/expense-rollups.test.ts` (`npm run test:db`) |
| How a write updates the daily totals | `api/services/expense-rollups.ts` | `tests/expense-rollups.test.ts` |
| Where old categories move, and how stored rows follow | `LEGACY_TAXONOMY` in `contracts/categories.ts`; the job in `api/jobs/taxonomy-migration-job.ts` | `api/jobs/taxonomy-migration-job.test.ts`, `tests/taxonomy-migration.test.ts` (`npm run test:db`) |
| The month summary or the statistics | `expense.getMonthSummary`, `expense.getMonthlyStats` in `api/expense-router.ts` | |
| Search and the expense list | `expense.searchTransactions`, `expense.list` in `api/expense-router.ts` | `api/expense-router.test.ts` |
| Salary-cycle boundaries | `api/services/financial-month.ts` | |
| The home tabs and cards | `src/pages/Home.tsx` and `src/components/dashboard/` | `src/components/dashboard/NativeTabPanels.test.tsx` |
| Budget rules | `api/budget-router.ts`; the alert in `api/notification-engine.ts` | |
| Goal limits and the goal analysis | `api/goals-router.ts` | |
| Business categories | `api/business-router.ts` | |
| People | the contact procedures in `api/profile-router.ts`; the screen `src/components/settings/PeopleSettingsView.tsx` | |
| Due dates, payments, what is free until payday | `api/services/coach/schedule.ts`, `api/services/coach/cashflows.ts` | `api/services/coach/schedule.test.ts`, `tests/coach-follow-up.test.ts` (`npm run test:db`) |
| Plans, steps and reminders | `api/services/coach/plans.ts`, the job in `api/boot.ts`, the page `src/pages/PlanPage.tsx` | `tests/coach-follow-up.test.ts` |

## Rules for changes here
1. Every write to `expenses` runs in a transaction with its rollup delta (`api/AGENTS.md`, rule 4) and bumps the
   cache generation afterwards; the nightly repair is a safety net, not the mechanism. A new writer uses
   `api/services/ledger-writer.ts` (decision 0027) instead of writing these steps again.
2. Filter by `userId` and `userType`, and check referenced wallets, businesses, goals and contacts with
   `api/lib/ownership-guard.ts`.
3. Build alternatives with `or(...)`: `and()` does not parenthesize a raw fragment, and an `OR` left bare inside it
   returns other users' rows (`api/AGENTS.md`, rule 3, checked by `tests/knowledge/architecture.test.ts`).
4. Days and months are Cairo business days (golden rule 6): use `api/lib/app-time.ts` or
   `getFinancialMonthDayRange`, never server-local dates.

## Tests
`api/expense-router.test.ts` (including the search's user filter and the person a saved item names),
`tests/ledger-writer.test.ts` (retries, the streak choice, refunds, several rows for one contact, edits, deletes and
the user-type pair), `tests/expense-rollups.test.ts`, `tests/taxonomy-migration.test.ts` and `tests/coach-follow-up.test.ts` (partial and
over-allocated payments, release on delete and edit, another account's ids, one schedule per installment plan, one
active plan, a reminder delivered once under two concurrent runs and never after it moved or was cancelled), whose
database cases run with
`npm run test:db` (`docs/guides/testing.md`), `api/jobs/taxonomy-migration-job.test.ts`, and
`src/components/dashboard/NativeTabPanels.test.tsx`.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** The chart's "budget" tab compares the month's spending with the user's budget for all spending
   (`budget.list`); with none it falls back to the profile's income or the month's income, and with neither it asks
   the user to make a budget. A user with only category budgets sees the income comparison there.
2. **Bug.** The statistics show the "spiky" and "concentrated" behaviours as balanced, and the statistics, the behaviour
   snapshot of [insights](insights.md) and the monthly report each define spending personality differently.
3. **Gap.** The Pro goal analysis is saved but no screen shows it; a goal created without a cost gets a target of 50,000 EGP
   (`src/components/goals/FinancialGoalsPanel.tsx`).
4. **Gap.** `business.suggestCategories` calls a fixed Gemini model without `mapModelName` or a budget check (its cost does reach the AI cost ledger);
    `business.get` returns the user's first business even when it is inactive.
5. **Gap.** `expense.getYearlyStats` has no screen.
6. **Gap.** Refunds the old bank-message intake recorded netted their category only when the merchant was one the
    engine knew well; the others were saved as income under دخل آخر and keep that filing, as do rows saved before
    decision 0010. A category can show net negative
    spending in a month when the purchase fell in an earlier one.
7. **Gap.** Commitments, plans and wallet balances are the personal ledger's only: `business_id` exists on
    `scheduled_cashflows` and `coaching_plans` but nothing writes or reads it yet (`api/services/coach/`).
8. **Gap.** Reminders reach the in-app notifications only, not web push (`api/services/coach/plans.ts#deliverDueReminders`).
9. **Debt.** Writers outside `api/expense-router.ts` still write `expenses` with their own steps instead of the ledger
    writer: receipts (`api/image-router.ts#parseReceipt`), the AI Center's actions
    (`api/services/action-runtime/extended-actions.ts`), business, profile and wallet changes
    (`api/business-router.ts`, `api/profile-router.ts`, `api/wallet-router.ts`), the taxonomy migration and account
    purge. Each moves to it as its own change (decision 0027).

## Related systems
- [Recording spending](expense-capture.md): creates the items this system reads, and triggers the budget alert.
- [Bank and wallet messages](bank-messages.md): the wallet screens and the automated items.
- [AI Center](ai-center.md): answers questions from the same ledger and creates goals, budgets and wallets.
- [Reports, insights and the smart profile](insights.md): the salary day, the profile and the monthly report.
- [Notifications and WhatsApp](notifications.md): the budget alert template and delivery.
- [Plans and payments](billing.md): the Pro plan that business mode and goal analysis need.

### Installment attribution
`expense.listInstallmentPlans` groups linked settlements by plan and due date: partial payments on two dates never count as a fully paid installment on either. Unlinked keyword payments use net recorded personal amounts, not row counts, and remain estimates. A word shared by two plans is ambiguous; no final remaining amount is claimed by voice and the installment panel requests linking instead of displaying false precision. Business ledger payments and schedules are excluded from personal installment progress. `tests/coach-follow-up.test.ts` holds these boundaries on migrated MySQL.
