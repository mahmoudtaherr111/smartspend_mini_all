# 0002. No foreign keys; integrity lives in application code

- Status: in effect
- Recorded: 2026-09-14, from the code. The schema has never declared a foreign key (`.references()` and `foreignKey()` do not
  appear under `db/`); the reason was not written down.

## Decision
MySQL enforces no relationships between tables. The application keeps them consistent:

- Relations used by Drizzle's relational queries are declared in `db/relations.ts`.
- Before storing an id that points at another row (wallet, business, contact, classification log), a router checks that
  the caller owns that row with `assertEntityOwnership` in `api/lib/ownership-guard.ts`.
- Deleting a parent removes or detaches its children explicitly, inside a transaction. Account deletion goes through
  `api/services/user-purge-service.ts` (added 2026-08-26); deleting a goal clears the budgets linked to it; deleting an ad
  removes its clicks; deleting a business removes its categories and detaches its contacts and expenses.
- Every table has a storage class and lifetime in `db/table-classes.ts` (added 2026-09-05), checked by
  `tests/table-classes.test.ts`.

## Consequences
- Nothing in the database stops an orphan row. A delete path that forgets a child leaves one behind, and a write path
  that skips the ownership check can link another user's row.
- Adding a table means adding its user index, both user relations, a storage class and a line in the purge service
  (`db/AGENTS.md`).
- Derived data is checked by code, not by constraints: `api/jobs/rollup-reconciliation-job.ts` compares the daily rollups
  with the ledger and repairs drift, when scheduled jobs are enabled.
