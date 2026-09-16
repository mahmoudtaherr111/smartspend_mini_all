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
| Home screen | `src/pages/Home.tsx#Home` | Three tabs (record, statistics, calendar) for one month, the summary cards, business mode and the onboarding card |
| Header and summary | `src/components/dashboard/HomeHeader.tsx`, `src/components/dashboard/HomeSummaryCards.tsx` | Month switcher, tabs, business toggle, streak, the month's spending as a share of income, income and spending totals |
| Record tab | `src/components/expenses/RecentExpenses.tsx`, `src/components/goals/FinancialGoalsPanel.tsx#FinancialGoalsPanel` | Beside the entry form: the month's latest items with delete, and the goal creation card |
| Statistics tab | `src/components/dashboard/StatsView.tsx#StatsView`, `src/components/dashboard/ExpenseChart.tsx#ExpenseChart`, `src/components/dashboard/BehaviorInsights.tsx`, `src/components/dashboard/GlobalSearch.tsx#GlobalSearch` | Daily average, change, top category and personality; charts by category, family, electronic payments, budget and timing; search; bank-message totals; top categories |
| Calendar tab | `src/components/dashboard/MonthlyCalendar.tsx` | Spending per day of the calendar month, and the items of a chosen day |
| Ledger API | `api/expense-router.ts` (`expense.list`, `expense.searchTransactions`, `expense.getById`, `expense.update`, `expense.delete`, `expense.getMonthSummary`, `expense.getMonthlyStats`, `expense.getYearlyStats`) | Reads, edits and deletes items and computes the month and year figures |
| Daily rollups | `api/services/expense-rollups.ts`, `api/jobs/rollup-reconciliation-job.ts#runRollupReconciliationJob` | Per-day totals kept in step with every write, and repaired every night |
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
  - spending per day, week of the month and weekday, and per Cairo hour from the month's latest 200 items;
  - a comparison with the same week of the previous period until day 24, and with the whole previous period after;
  - money sent to and received from each family member;
  - a spending behaviour (planned, spiky, emotional or concentrated, overridden by impulsive or conservative from the
    share of income spent);
  - the daily average and the month's latest 200 items.
- **Search** (`expense.searchTransactions`): up to 20 of the user's items whose category, subcategory, description or
  original text contains the query, newest first.
- **Record tab list** (`expense.list`): the month's latest items, page by page, newest id first; the calendar asks the
  same procedure for one day.
- **Business mode.** A Pro user with a business can switch the statistics and calendar to that business; the choice is
  kept in the browser.
- **Budget alert.** After a save, [Recording spending](expense-capture.md) calls `checkUserBudgetExceeded` in
  `api/notification-engine.ts`, which sends the `budget_exceeded` notification once a month when the month's spending
  passes the monthly income in the profile.

## Wallets
`wallet.getWallets`, `wallet.createWallet` (name, provider, last four digits, balance), `wallet.updateWallet` and
`wallet.deleteWallet`, which detaches the wallet from the user's items in the same transaction.
`wallet.getWalletTransactions` pages through the items of one wallet. The [AI Center](ai-center.md) can also create and
change wallets through confirmed actions.

## Budgets
A budget has a title, an optional category, a monthly limit, the day its cycle starts, an alert threshold (80% by
default), an optional linked goal and a status. `budget.list` returns every budget with what was spent in its current
cycle, counted in Cairo business days, and whether it is near or over its limit. `budget.create`, `budget.update` and
`budget.delete` check ownership and bump the finance cache. No screen calls them: budgets come from the assistant's
confirmed actions, including the budget it suggests after a new goal.

## Goals
- `goals.list` returns the user's goals and, for Free users, an upsell.
- `goals.create`: a title, a description of up to 120 characters, a target amount and date. Free users may have up to
  3 active goals.
- `goals.analyze` (Pro): asks Gemini (`ai_model_pro`, through `mapModelName`, after `assertAiBudget`) for a plan,
  weekly actions, alerts and progress from the goal, this month's spending and the profile summary, records the
  tokens and saves the plan on the goal.
- `goals.setStatus` (active, completed, paused) and `goals.delete`, which also unlinks the goal's budgets.
- On the home screen the goal card shows only while the user has no active goal and has not dismissed it; the list
  with statuses is in the profile view.

## Business mode
Pro only (`proProcedure`). A user has one active business with categories that the classification pipeline scores in
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
`api/expense-router.test.ts` (including the search's user filter), `tests/expense-rollups.test.ts`, whose database
cases run with `npm run test:db` (`docs/guides/testing.md`), and `src/components/dashboard/NativeTabPanels.test.tsx`.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** Budgets have no screen and no alert of their own: the "budget exceeded" notification compares the calendar month's
   spending, business included, with the monthly income in the profile, not with `user_budgets`.
2. **Bug.** The home screen uses the salary cycle only when "fixed salary" is switched on in Settings (`hasFixedSalary`); a
   salary day given in the onboarding questions does not change it, while the AI Center and the reports use the salary
   day either way.
3. **Bug.** The daily average divides the month's spending by the days since the user's first item ever, capped at 30, so an
   established account sees a low daily average early in the month.
4. **Bug.** The budget tab, the electronic-payments tab and the hour heatmap work from the month's latest 200 items and
   under-count busy months; the budget tab assumes a 10,000 EGP budget when neither the profile nor the month has
   income.
5. **Bug.** The statistics show the "spiky" and "concentrated" behaviours as balanced, and the statistics, the behaviour
   snapshot of [insights](insights.md) and the monthly report each define spending personality differently.
6. **Bug.** In business mode the summary cards still show personal totals: `expense.getMonthSummary` has no business filter.
7. **Gap.** The Pro goal analysis is saved but no screen shows it; a goal created without a cost gets a target of 50,000 EGP
   (`src/components/goals/FinancialGoalsPanel.tsx`); the upsell Free users see says "SpinSmart Pro".
8. **Gap.** A saved item cannot be edited in the web app: nothing calls `expense.update`, so the corrections it records never
   happen (`api/lib/AGENTS.md`, rule 5).
9. **Bug.** The calendar's day list sends local times without a time zone, which the server reads in its own zone.
10. **Gap.** `business.suggestCategories` calls a fixed Gemini model without `mapModelName`, a budget check or a token record;
    `business.get` returns the user's first business even when it is inactive.
11. **Bug.** Wallet balances are stored as whatever text the client sends.
12. **Gap.** `export.myExpenses` and `expense.getYearlyStats` have no screen; the export would label transfers and investments
    as spending, every source except voice as manual, and dates by UTC day.

## Related systems
- [Recording spending](expense-capture.md): creates the items this system reads, and triggers the budget alert.
- [Bank and wallet messages](bank-messages.md): the wallet screens and the automated items.
- [AI Center](ai-center.md): answers questions from the same ledger and creates goals, budgets and wallets.
- [Reports, insights and the smart profile](insights.md): the salary day, the profile and the monthly report.
- [Notifications and WhatsApp](notifications.md): the budget alert template and delivery.
- [Plans and payments](billing.md): the Pro plan that business mode and goal analysis need.
