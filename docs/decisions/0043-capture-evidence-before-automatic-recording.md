# 0043. Evidence-grounded capture before automatic recording

- Status: accepted; sms-v4 contract and offline evaluation implemented, runtime migration pending.
- Date: 2026-11-03.

## Context
The owner requires automatic recording from the first closed release. A transaction with unknown purpose is saved
under a general category; a later optional question can be skipped or answered to update that same transaction.
A loan is spending and its repayment income, while debt balances still follow the movements. Own-account movements,
ATM-to-cash, credit-card repayments and investment transfers do not inflate month income or spending. These are the
approved v8 outcomes; the old per-payment confirmation design is not the target.

An amount merely occurring in a message does not prove its role, and schema-valid output does not prove a completed
transaction. Ownership mixed into direction loses the side of an internal transfer. Fee inclusion and currency must
be known to avoid adding included fees twice. No production activation or money migration is authorised by this change.

## Decision
- Introduce sms-v4 alongside sms-v2, with strict source quotes, explicit unknown state, separate ownership and flow,
  and fees with their own currency and explicit inclusion evidence. Category repair cannot change the money direction.
- Calculate a pure fixed-decimal EGP proposal after validation. An unresolved financial fact remains waiting rather
  than using a guessed rate, amount or fee relation. No database or provider call is part of this contract.
- Add a local offline evaluator of supplied candidate replies. It reports contract consistency, never live accuracy
  or qualification. Public cases are invented; private messages remain outside the repository, and reports omit text
  and financial values.
- Keep existing readers and intake behavior until the remaining privacy, qualification, shared accounting, dedup,
  queue and client work is tested. Runtime callers must still verify consent, account ownership, source qualification
  and idempotency. The source checks alone never authorise a ledger write.

## Consequences
- A prompt/schema change requires a new version and corpus evaluation. Both production providers must be qualified
  on private held-out data; that corpus is not yet available.
- Automatic recording is enabled only after the complete path, failure recovery and capacity are verified. The
  retained sms-v2 path remains current while this foundation is being assembled.
- This decision supersedes the confirmation-first target of decisions 0028, 0030 and 0031 for the future v8 flow;
  their current implementation remains documented until replaced. The financial migration will update decision 0008
  when the shared money implementation actually changes.
