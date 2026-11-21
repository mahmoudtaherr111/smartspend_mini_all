# 0027. One ledger writer: a row of `expenses` is added, changed and removed through `api/services/ledger-writer.ts`

- Status: accepted. Built in `api/services/ledger-writer.ts`; `expense.create`, `expense.batchCreate`,
  `expense.update`, `expense.delete` and the clarification saves in `api/expense-router.ts` use it. The other
  writers (`parseReceipt` in `api/image-router.ts`, the AI Center's actions in
  `api/services/action-runtime/extended-actions.ts`, business, profile, wallet and taxonomy updates, account purge)
  still write their own steps and move to it one at a time.
- Decided and recorded: 2026-10-27.

## Context
A ledger write is more than the row. The daily rollup takes its delta, the linked contact's count follows it, a
commitment it paid toward is reconciled or released, a save the user made moves the streak, and after the commit
muscle memory and the finance caches forget, and new spending is checked against the budgets. `expense.create` wrote
every step inline, and `expense.batchCreate`, the clarification saves, `expense.update` and `expense.delete` each
wrote their own copy; the helpers they shared (`updateStreak`, `invalidateExpenseCache`) were private to the router.

Automatic capture from bank and wallet messages (the capture plan, decision 0026) is the next writer. It needs the
same steps with two differences: a row recorded without the user's tap must not keep their streak alive, and its
undo, merge and correction must change and delete rows the same way an edit does. Copying the steps a sixth time
would have let it drift from the rest.

## Decision
1. **`createLedgerEntry`, `updateLedgerEntry` and `deleteLedgerEntry`** each run one transaction with every step a
   write needs, then clear the caches (and check budgets for new spending). `insertLedgerEntriesInTx` and
   `bumpStreakInTx` are the same steps for a caller that must also write something else in its own transaction (a
   clarification is claimed in the transaction that saves its items).
2. **Callers decide what is written; the writer decides how.** Ownership of referenced wallets, businesses and
   contacts (`assertEntityOwnership`), finding or creating a contact, the category the taxonomy holds and the source
   stay with the caller. The stored sign (`ledgerAmount`, decision 0010), the rollup, the contact count, settlements
   and caches are the writer's.
3. **The streak is a choice of the caller** (`countsForStreak`, on by default). Rows the user saved count; rows
   recorded for them without a tap will not.
4. **Idempotency stays on `clientRequestId`.** The writer returns the row already saved under the same key instead of
   writing again; a caller that does work before saving (creating a contact) looks the key up first with
   `ledgerEntriesByRequestId`.
5. **`afterCommit`** runs after the commit and before the caches forget, for learning the cleared caches must see (the
   review card's correction). It is also where capture will keep its own records in step (an event marked deleted
   when its row is deleted, a correction taught to the merchant memory).

## Consequences
- The behaviour of the moved procedures did not change: the rollup and database suites pass as before, and
  `tests/ledger-writer.test.ts` covers retries, the streak choice, refunds, several rows with one contact, edits,
  deletes and the user-type pair.
- Two orders moved without effect on results: an edit now clears the finance caches before it learns a correction
  (muscle memory was already cleared first), and the writer logs through `createLogger` where the router used
  `console`.
- Writers outside the router still repeat the steps; each move to the writer is its own change, checked by the same
  suites.
