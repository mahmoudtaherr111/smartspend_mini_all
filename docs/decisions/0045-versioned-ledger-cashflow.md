# 0045: Separate economic nature from ledger direction

Date: 2026-11-04

Status: accepted; deployment guarded, production cutover pending

## Context
A transfer-shaped loan must enter the owner's requested spending/income totals while own-account movement must
not. Treating a category or physical `type` as all three decisions made wallets, debt and totals disagree.

## Decision
Keep compatibility readers and gate canonical writes behind `capture_financial_version=cashflow-v1`. Store only
income/expense for new canonical rows and versioned metadata for kind/direction/exclusion. Exclusion is derived
from validated kinds, never a client boolean. Share a pure contract and SQL lens across aggregates and consumers.
Represent an internal movement once with a validated counter-wallet link. Serialize owner lifecycle changes with
ledger writes. AI confirmed actions use the same writer.

Migrate in bounded, resumable batches, report unknown directions, and activate only after an exclusive flag lock
has drained writers holding shared locks and a fresh count is zero. Preview is default. Rollback restores only
HMAC-authenticated snapshots whose protected fields still match; later user edits are never overwritten. Keep the
key ring and compatible readers through rollback. Do not run production migration or enablement as part of code shipping.

## Consequences and validation
Loan/gam3eya totals intentionally change; debt standing must not. Internal movement is excluded from budgets and
month totals but enters both wallet views. Refunds remain negative expense. The disposable-MySQL suites cover
cashflow conservation, owner-pair validation, concurrent cutover, authentic/forged/edited rollback and reconciliation.
No real-message qualification or capacity claim follows from these tests. A wallet-kind marker prevents interpreting
credit availability as cash without adding a rolling-deployment-sensitive column to the existing wallet table.
