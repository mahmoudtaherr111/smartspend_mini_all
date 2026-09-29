# 0015. Every number and every word gets its role before anything is classified

- Status: accepted, implemented in `api/lib/amount-roles.ts`, `api/lib/clause-roles.ts` and `api/lib/refund-context.ts`,
  measured by `api/qa/fixtures/classification-cases.generalization.ts`.
- Decided and recorded: 2026-09-29.

## Context
The local engine's wrong answers were patched one sentence at a time, and new sentences kept failing the same ways.
Reading the failures by mechanism rather than by sentence showed four causes:

1. **Every number was money.** A corrected price ("بـ 20 لأ بـ 25"), the bill before it was split ("900 وقسمناه على
   3"), a count, a model or route number, a time and a list marker each became a transaction.
2. **Direction came from the verb alone.** "خدت" and "جالي" read as income whatever they took, so "خدت ميكروباص من
   الموقف" was income; a cancellation word dropped the clause even when the money came back.
3. **Every word voted on the category, whatever its role.** The place passed through ("راجع من الشغل"), a companion
   ("مع صحابي") and the source after "من" voted like the thing bought; the occasion a thing was for and the kind of shop
   did not vote at all.
4. **Typos were read on the whole token.** "الورث" had the edit budget of a five-letter word and became الورد.

## Decision
1. A stage before clause splitting gives each number its role and rewrites the sentence to what was paid
   (`resolveAmountRoles`). A share the engine divides out itself, and a sentence that held instructions to the app,
   are confirmed rather than saved alone.
2. The words of a clause are read by role (`readClauseRoles`): scene, companion and source words do not vote; an
   occasion and a venue are purpose clues. The weighing gains three overrides: `occasion_gift`, `purpose_over_scene`
   and `purpose_over_guess`.
3. An acquiring verb's direction follows its object (`refineDirectionByObject`). Money that came back from an undone
   purchase is one reading shared by the negation detector, the loan rule and the intent detector (`api/lib/refund-context.ts`).
4. The typo budget is measured on the stem.
5. New cases are written by mechanism before the fix, with controls that must not change, and are never edited to
   match output. The frozen split stays the honest number.

## Consequences
On the offline benchmark, every case: 170 of 230 before, 209 after, with no case that passed before failing now. The
frozen split, which no one tuned against, went from triple F1 0.843 to 0.920. Remaining failures are vocabulary gaps
(subcategories such as أسنان and رخصة) and long monologues, which the model still handles.
