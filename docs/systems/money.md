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
| Home screen | `src/pages/Home.tsx#Home` | Three tabs (record, statistics, calendar) for one month, the summary cards, business mode, the onboarding card, and, for users the rebuilt [voice call](voice-calls.md) is open to, a button that starts it (`src/components/voice/CallSmartButton.tsx#CallSmartButton`) |
| Header and summary | `src/components/dashboard/HomeHeader.tsx`, `src/components/dashboard/HomeSummaryCards.tsx` | Month switcher, tabs, business toggle, streak, the month's spending as a share of income, income and spending totals |
| Record tab | `src/components/expenses/RecentExpenses.tsx`, `src/components/expenses/EditExpenseDialog.tsx`, `src/components/goals/FinancialGoalsPanel.tsx#FinancialGoalsPanel` | Beside the entry form: the entries waiting for an answer to their question ("محتاج ردك", [recording spending](expense-capture.md#clarifications)), the bank messages waiting for the user's confirmation when there are any ([bank messages](bank-messages.md#5-over-the-monthly-limit)), the month's latest items, each with details, an edit dialog (amount, kind, category, date, description; `expense.update` stores the category through the registry and records a changed one as the user's correction) and delete, each category badge in the colour the taxonomy gives it, and the goal creation card |
| Statistics tab | `src/components/dashboard/StatsView.tsx#StatsView`, `src/components/dashboard/ExpenseChart.tsx#ExpenseChart`, `src/components/dashboard/BehaviorInsights.tsx`, `src/components/dashboard/GlobalSearch.tsx#GlobalSearch` | Daily average, change, top category and personality; charts by category, family, electronic payments, budget and timing; search; bank-message totals; top categories |
| Calendar tab | `src/components/dashboard/MonthlyCalendar.tsx` | Spending per day of the calendar month, and the items of a chosen day |
| Ledger API | `api/expense-router.ts` (`expense.list`, `expense.searchTransactions`, `expense.getById`, `expense.update`, `expense.delete`, `expense.getMonthSummary`, `expense.getMonthlyStats`, `expense.getYearlyStats`) | Reads, edits and deletes items and computes the month and year figures |
| Daily rollups | `api/services/expense-rollups.ts`, `api/jobs/rollup-reconciliation-job.ts#runRollupReconciliationJob` | Per-day totals kept in step with every write, and repaired every night |
| Taxonomy migration | `api/jobs/taxonomy-migration-job.ts#runTaxonomyMigrationJob` | Moves stored rows still filed under an old category to the current taxonomy |
| Financial month | `api/services/financial-month.ts#getFinancialMonthDayRange` | Month boundaries from a salary day, in Cairo business days |
| Wallets, budgets, goals, business | `api/wallet-router.ts`, `api/budget-router.ts`, `api/goals-router.ts`, `api/business-router.ts` | Their own records and rules |
| People | the contact procedures in `api/profile-router.ts` (`profile.listContacts`, `profile.addContact`, `profile.updateContact`, `profile.deleteContact`, `profile.mergeContacts`) | The people behind transfers and family spending |
| Export | `export.myExpenses` in `api/export-router.ts` | The user's items as JSON, CSV or Excel, protected against spreadsheet formulas |

Screens of other systems use these APIs: wallets in `src/components/bank-sync/DigitalBankingSuite.tsx`
([bank messages](bank-messages.md)), people in `src/components/settings/PeopleSettingsView.tsx`, the business in
`src/components/settings/BusinessSettingsView.tsx`, and the goal list with its status in
`src/components/profile/SmartProfileView.tsx`.

## The ledger and its daily rollups
- An item is a row of `expenses` with a type (income, expense, transfer, investment), an amount, a category and
  subcategory, a date, a source, a status, and optional wallet, business and contact. Its original text and parsed
  metadata sit beside it in `expense_details` (`syncExpenseDetails`).
- **Refunds.** An expense whose money came back (direction `incoming`) is stored with a negative amount in the
  category it was bought from (`ledgerAmount` in `api/services/expense-rollups.ts`), so the rollups, the category
  breakdown, budgets and the AI Center net it without knowing about refunds. `expense.update` takes `refund` and keeps
  the stored sign in line with the kind; the list, calendar, search and edit dialog show the magnitude as "مرتجع"
  (docs/decisions/0010-refunds-net-their-category.md).
- Every write that adds, changes or removes an item runs in a transaction that applies a delta to
  `expense_daily_rollups`, one row per user, business (0 for personal) and Cairo business day
  (`expenseToRollupDelta`, `applyExpenseRollupDelta`). Only confirmed items count; items from bank messages also
  count as automated income or spending. A day that goes negative is logged.
- `expense.update` backs out the old row's delta and applies the new one, stores new text in the details, checks that
  a referenced wallet, business or contact belongs to the user, clears muscle memory and the classification cache,
  adds a contact for a person category, and when the category changed marks the classification log as corrected and
  records a correction rule.
- `expense.delete` locks the row, deletes it and its details, backs out its delta, lowers the contact's count and
  clears the same caches.
- After a write, the user's cache generation is bumped (`invalidateExpenseCache`), which drops the month summaries and
  statistics cached in Redis and the finance facts of the [AI Center](ai-center.md).
- **Nightly repair.** `nightly-rollup-reconciliation` runs at 04:00 on replicas with `ENABLE_CRONS=true` and, for every
  user with items or rollups in the last 60 days, recomputes each day from the confirmed items
  (`reconcileRollupsForRange`): missing days are inserted, wrong days rewritten, days without items deleted, and the
  caches bumped when anything changed.
- **Streak.** Saving an item updates the user's streak in the same transaction (`updateStreak`): the same Cairo day
  keeps it, the next day adds one, a gap restarts it.
- **Money movements.** A gam3eya payment or payout, a loan given, taken or repaid, and an ATM withdrawal are
  `transfer` items (تحويل/جمعية, تحويل/دين/سلفة, تحويل/سحب ATM), so they count as neither spending nor income. Which
  way the money went is in `parsed_metadata.direction` (`incoming` or `outgoing`)
  (docs/decisions/0008-money-movements-and-taxonomy.md).
- **Taxonomy migration.** `taxonomy-migration` runs every 30 minutes on replicas with `ENABLE_CRONS=true` and moves
  up to 500 stored items still filed in an old place (`LEGACY_TAXONOMY` in `contracts/categories.ts`: a retired
  category, a merged subcategory, a money movement booked as spending or income) to where they live now. Each item
  moves in its own transaction: it keeps its old category, subcategory and type in
  `parsed_metadata.legacy_taxonomy` (also in `expense_details`), and when its type changes the rollup delta moves
  with it. User dictionaries, correction rules and budgets that name a retired category follow. Once every row is
  current a run changes nothing. Undoing it means restoring the three values from `legacy_taxonomy` and moving the
  rollup delta back.

## The home screen
- **Month and cycle.** The month comes from the address or today's month. When the profile has a fixed salary switched
  on with a salary day, the summary and statistics use the salary cycle from `getFinancialMonthDayRange`; the calendar
  always uses the calendar month.
- **Summary cards** (`expense.getMonthSummary`): income, spending, transfers, investments, net flow and count of the
  personal rollups in the period, cached for a day per cache generation.
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
  - the daily average and the month's items (the columns the charts read, up to `MONTH_ITEMS_BOUND`, 5,000).
- **Search** (`expense.searchTransactions`): up to 20 of the user's items whose category, subcategory, description or
  original text contains the query, newest first.
- **Record tab list** (`expense.list`): the month's latest items, page by page, newest id first; the calendar asks the
  same procedure for one day.
- **Business mode.** A Pro user with a business can switch the statistics and calendar to that business; the choice is
  kept in the browser.
- **Budget alert.** After a save (typed, a bank message, a confirmed suggestion), `checkUserBudgetExceeded` in
  `api/notification-engine.ts` runs. A user with budgets gets `budget_near_limit` once per cycle when a budget reaches
  its alert threshold and `budget_category_exceeded` once when it passes its limit (`checkBudgetAlerts`; the cycles
  already warned are kept in the budget's metadata). A user without budgets gets `budget_exceeded` once a month when
  the month's spending passes the monthly income in the profile.

## Wallets
`wallet.getWallets`, `wallet.createWallet` (name, provider, last four digits, balance), `wallet.updateWallet` and
`wallet.deleteWallet`, which detaches the wallet from the user's items in the same transaction.
`wallet.getWalletTransactions` pages through the items of one wallet. The [AI Center](ai-center.md) can also create and
change wallets through confirmed actions.

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
`expense.getDebtBalances` reads every confirmed loan (transfer under تحويل/دين/سلفة with a direction) and nets it per
person (`api/services/debt-ledger.ts`): money that went out (lent, or a debt repaid) raises what the person owes the
user, money that came in lowers it. People are the loan's contact, else "من غير اسم"; settled people are left out.
The statistics tab shows the open balances under the budgets (`src/components/debts/DebtsPanel.tsx`), with the totals
owed to and by the user. The same procedure returns the gam3eya standing (`getGam3eyaStanding`: installments paid in,
payouts taken, and what the gam3eya still holds for the user, from transfers under تحويل/جمعية), shown in the same
panel; nothing renders without loans or a gam3eya.

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
  (a soft delete) and `business.linkContact` clear the classification cache;
- `business.delete` removes the categories, turns linked contacts back into personal ones, moves the business rollups
  and items to personal, and deletes the business in one transaction.

## People
- `profile.listContacts` counts each person's items from `expenses` and filters personal, business or silenced people.
- `profile.addContact` refuses a duplicate name; `profile.updateContact` changes the name, relation, type, business
  or silence.
- `profile.deleteContact` removes the name from the profile's older people lists, detaches the person's items and
  deletes the contact; `profile.mergeContacts` moves the second person's items to the first and keeps the richer
  relation, type and business.
- All of them clear the classification cache and muscle memory, since classification prompts name these people.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
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

## Rules for changes here
1. Every write to `expenses` runs in a transaction with its rollup delta (`api/AGENTS.md`, rule 4) and bumps the
   cache generation afterwards; the nightly repair is a safety net, not the mechanism.
2. Filter by `userId` and `userType`, and check referenced wallets, businesses, goals and contacts with
   `api/lib/ownership-guard.ts`.
3. Build alternatives with `or(...)`: `and()` does not parenthesize a raw fragment, and an `OR` left bare inside it
   returns other users' rows (`api/AGENTS.md`, rule 3, checked by `tests/knowledge/architecture.test.ts`).
4. Days and months are Cairo business days (golden rule 6): use `api/lib/app-time.ts` or
   `getFinancialMonthDayRange`, never server-local dates.

## Tests
`api/expense-router.test.ts` (including the search's user filter and the person a saved item names),
`tests/expense-rollups.test.ts` and `tests/taxonomy-migration.test.ts`, whose database cases run with
`npm run test:db` (`docs/guides/testing.md`), `api/jobs/taxonomy-migration-job.test.ts`, and
`src/components/dashboard/NativeTabPanels.test.tsx`.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** The home screen uses the salary cycle only when "fixed salary" is switched on in Settings (`hasFixedSalary`); a
   salary day given in the onboarding questions does not change it, while the AI Center and the reports use the salary
   day either way.
2. **Bug.** The daily average divides the month's spending by the days since the user's first item ever, capped at 30, so an
   established account sees a low daily average early in the month.
3. **Gap.** The chart's "budget" tab compares the month's spending with the user's budget for all spending
   (`budget.list`); with none it falls back to the profile's income or the month's income, and with neither it asks
   the user to make a budget. A user with only category budgets sees the income comparison there.
4. **Bug.** The statistics show the "spiky" and "concentrated" behaviours as balanced, and the statistics, the behaviour
   snapshot of [insights](insights.md) and the monthly report each define spending personality differently.
5. **Bug.** In business mode the summary cards still show personal totals: `expense.getMonthSummary` has no business filter.
6. **Gap.** The Pro goal analysis is saved but no screen shows it; a goal created without a cost gets a target of 50,000 EGP
   (`src/components/goals/FinancialGoalsPanel.tsx`).
7. **Bug.** The calendar's day list sends local times without a time zone, which the server reads in its own zone.
8. **Gap.** `business.suggestCategories` calls a fixed Gemini model without `mapModelName`, a budget check or a token record;
    `business.get` returns the user's first business even when it is inactive.
9. **Bug.** Wallet balances are stored as whatever text the client sends.
10. **Gap.** `export.myExpenses` and `expense.getYearlyStats` have no screen; the export would label transfers and investments
    as spending, every source except voice as manual, and dates by UTC day.
11. **Gap.** A bank message's refund nets its category only when the merchant is one the engine knows well
    (`categorizeSms` with `readsAsSmsRefund` in `api/services/sms-ledger.ts`); any other refund arrives as an incoming
    credit under دخل آخر, and rows saved before decision 0010 keep their income filing. A category can show net negative
    spending in a month when the purchase fell in an earlier one.

## Related systems
- [Recording spending](expense-capture.md): creates the items this system reads, and triggers the budget alert.
- [Bank and wallet messages](bank-messages.md): the wallet screens and the automated items.
- [AI Center](ai-center.md): answers questions from the same ledger and creates goals, budgets and wallets.
- [Reports, insights and the smart profile](insights.md): the salary day, the profile and the monthly report.
- [Notifications and WhatsApp](notifications.md): the budget alert template and delivery.
- [Plans and payments](billing.md): the Pro plan that business mode and goal analysis need.
