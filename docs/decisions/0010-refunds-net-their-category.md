# 0010. A refund is spending coming back to its category

- Status: accepted, implemented in `ledgerAmount()` in `api/services/expense-rollups.ts`, the refund branch of
  `api/lib/rule-engine.ts` (`readsAsRefund` in `api/lib/intent-detector.ts`), the save paths of
  `api/expense-router.ts` and the list, calendar, search and edit screens.
- Decided and recorded: 2026-09-25.

## Context
"رجعت الجزمة واخدت فلوسي 300" was saved as income under دخل آخر/مرتجعات واسترداد. The month's income grew by money
that was never earned, and تسوق kept the 300 as spent, so the category, its budget and every report overstated
shopping. Decision 0008 left this open until spending had one definition; the AI Center, Home and the budgets now
all count expense rows.

## Decision
1. A refund is an expense in the category it was bought from with direction `incoming`. The parser sets this when
   the sentence says money came back (`readsAsRefund`) and names what was bought; money back from something
   unnamed ("جالي استرداد 200") stays income under دخل آخر/مرتجعات واسترداد.
2. The ledger stores it as a negative amount (`ledgerAmount(type, direction, amount)`), in every save path:
   `expense.create`, `expense.batchCreate`, the two clarification saves and `expense.update` (which takes
   `refund`). Every sum of expense rows therefore nets it with no change: the daily rollups, Home, the category
   breakdown, budgets and the AI Center. Transfers keep a positive amount and their direction in metadata.
3. Screens show the magnitude with "مرتجع" and a plus sign (`getTransactionDisplayMeta` reads the sign); the edit
   dialog offers "مرتجع" as a kind.
4. "استرجعت" with the money named ("استرجعت فلوس الكورس") is a refund, not a cancellation; with no money named
   ("استرجعت الاوردر") it is still a cancellation.
5. Muscle memory does not learn an answer that carried a direction, since a replayed pattern keeps only category
   and type.

## Consequences
- A month or a day can hold net negative spending in one category (bought last month, returned this month). Charts
  that expect positive slices must skip it.
- Bank messages do not recognize refunds yet: a card refund arrives as an incoming credit under دخل آخر.
- Rows saved before this keep their income filing.
