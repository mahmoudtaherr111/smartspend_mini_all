# 0051: Commitments are one system, and a payment is linked to one only when it is certain

Date: 2026-11-09
Status: accepted

## Context
What a person in Egypt pays on a schedule lived in three places that did not know about each other:
- installment plans (`installment_plans`) counted payments by a keyword found in an expense's description, so any
  sentence with the word was counted and a sentence without it never was;
- scheduled cashflows (`scheduled_cashflows`, the coach) had real due dates and linked payments, but only by hand from
  a list of suggestions, and knew only one simple recurrence;
- debts and gam3eyas were ledger movements (`contracts/ledger-movement.ts`) with no dates at all.

People asked for one place for installments, subscriptions, school fees, rent, bills, debts and gam3eyas; for
reminders before each date; and for a payment they record as usual («دفعت قسط التلاجة», by voice or text) to count for
its commitment without a second step, but never for the wrong one.

## Decision
- **One table, five shapes.** Every commitment is a row of `scheduled_cashflows` with a `shape`: `fixed` (N equal
  installments: a fridge, a loan, a flat), `schedule` (its own dated amounts: school fees), `recurring` (rent, bills,
  subscriptions, salary), `balance` (a debt repaid once, in installments or on the person's own time) and `gam3eya`
  (a monthly share, with the payout as a second row whose `parentId` is the first). A date can be skipped, moved or
  given another amount this time (`commitment_overrides`), keyed by the day the rule computed, so a payment linked to
  it stays linked. The engine is pure and in Cairo days (`api/services/coach/schedule.ts`).
- **Fixed fields, not questions.** Each type of the app's form asks its own few fields (at most five, plus the
  reminder). A model never invents questions about a commitment.
- **Linking is strict** (`api/services/coach/matcher.ts#decideMatch`, deterministic, no model). A saved payment is
  linked on its own only when all hold: one commitment is named strongly (its title or a known alias with the long
  vowels folded, a phrase or SMS sender it learned, or its contact) and no other is named as well; the amount is
  exact (or k installments when the sentence says so; a part of a debt repaid by its very person); the direction and
  kind can pay it (`canPayCashflow`); and the date is open (up to ten days early, or late). An installment kind
  (installment, loan, property) also needs the sentence to say it is an installment («قسط»، «اقساط»، «قسطين»،
  «تقسيط»، «مقدم»): «دهان الشقة» never pays «قسط الشقة». Anything less asks the person with one button per
  candidate (`commitment_questions`), or does nothing. A link the person undoes teaches the matcher (−2 to the
  phrase that made it) and an answer teaches it (+1), in `commitment_hints`.
- **Where the payment is filed is the commitment's, not the sentence's.** `filingOf` gives each kind a category from
  the taxonomy (installments, loans and property under «أقساط وفوايد › أقساط», school under «تعليم», a debt or gam3eya
  as its financial movement); a commitment may set its own. Paying from the app («دفعته») writes through the ledger
  writer (decision 0027) and links in the same request; «اتدفع بره التسجيل» marks the date paid without a ledger row.
- **When a date passes without a payment, the app asks once** («اتدفع؟»): paid (links the one recorded payment that
  fits exactly, or records one), paid off the records, or «لسه»; skipping answers «لسه» for all, so the dates stay
  open and are not asked again.
- **Reminders** are `before` (days chosen per commitment, the admin's default 3), on the day, the day after, and a
  week and two weeks late (the admin's count of follow-ups), each claimed once per date, stage and channel (`commitment_reminders`, unique) by the
  `commitment-reminders` job. They go to the in-app inbox and push. WhatsApp sends only when the admin turned it on,
  set an approved template, the plan has the feature, the person consented, and inside the admin's hours and daily cap.
- **Known services** come from `subscription_catalog` (Netflix, Shahid…, with the admin's logo and colour), so the
  calendar shows the service's mark on its day and «دفعت نتفليكس» names it in Arabic or English.
- **Plans:** `commitments` is a plan feature (`contracts/plan-features.ts`) the admin turns on per plan; WhatsApp
  reminders are their own feature.
- Installment plans are moved into commitments the first time the hub opens (`migrateInstallmentPlans`); the app's
  installments screen is replaced by the commitments hub and its route redirects there.

## When the classification changes
The classification of sentences will change again (its next change is not decided yet). This design does not depend
on it:
- A link is stored as ids (`cashflow_settlements`: commitment, due day, expense), never as a category name; changing
  the taxonomy cannot unlink or relink anything.
- The matcher reads the payment's words, amount, contact, day and direction. It never reads the category the
  classifier chose, so a new classifier changes nothing it decides. `canPayCashflow` reads the stored economic kind
  (`contracts/ledger-movement.ts`: loan, gam3eya, card payment), not a category.
- Where a commitment's payments are filed is one function, `filingOf`, from the taxonomy's names; a renamed category
  is one edit there, and the taxonomy migration (`api/jobs/taxonomy-migration-job.ts`) moves rows already saved.
- The rules are held by tests that name the cases (`api/services/coach/matcher.test.ts`: Netflix in two scripts,
  «دهان الشقة», two schools, a debt repaid in parts) and by `tests/commitments-ecosystem.test.ts` on MySQL. A new
  classifier must keep them green.

## Consequences
- One place answers "what do I owe, when, and did I pay it", for the hub, the calendar, reminders and the voice coach.
- A payment is never counted twice or for the wrong commitment without the person seeing it: certain links say what
  they did with an undo, everything else is a question.
- Each new shape or kind is a change to the engine, the matcher's kind rules and `filingOf`, with tests; the app's
  form gains a type.
- The website's «خطتك والتزاماتك» page still uses the coach procedures (`coach.*`) on the same table; it is parked
  (decision 0050).
