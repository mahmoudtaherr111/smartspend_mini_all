# 0008. Purpose before person, money movements as transfers, and one taxonomy

- Status: accepted, implemented in `contracts/categories.ts`, `api/lib/category-registry.ts`,
  `api/lib/rule-engine.ts`, `api/lib/intent-detector.ts`, `api/lib/direction-governed-taxonomy.ts`,
  `api/lib/smart-pipeline.ts` (`applyPersonResolution`), `api/lib/sms-ai-parser.ts`, `api/expense-router.ts`
  (`namedPersonOf`) and `api/jobs/taxonomy-migration-job.ts`.
- Decided and recorded: 2026-09-24. Refines the owner's earlier choice that "the person is the category".

## Context
The category field carried three different things: what the money was for (أكل، مواصلات), who it went to (العائلة،
أصدقاء، موظفين) and how it was paid (انستاباي، فودافون كاش، سحب ATM). Filing every item that named a person under
the person's category lost the purpose: "دفعت مصاريف مدرسة ابني 12000" was saved as العائلة/عام, so the education
total read zero.

Money that only moved was booked as spending or income. A gam3eya payment was spending and its payout income; a loan
given was spending and a loan repaid was income ("احمد رجعلي 500" became مرتب); bank messages filed an ATM withdrawal
as متنوعات spending, so the cash was counted twice once it was spent and recorded. A refund was an investment return
(عوائد استثمار/استرجاع), and income with no named source defaulted to مرتب.

The taxonomy itself overlapped: parking, car maintenance, platforms, cafés, AI tools, hosting, taxes, traffic fines
and installments each lived in two categories. Everyday Egyptian spending had no place of its own: children (nursery,
diapers, formula), wedding and funeral money (نقطة، واجب), the Eid sacrifice, the microbus and the train. The web app
kept a hand-copied version of the list.

The owner agreed to merge the overlaps and migrate stored rows, then left the follow-up questions to engineering.

## Decision
1. **One list.** `contracts/categories.ts` is the taxonomy for the server, the web app and the migration. The merged
   categories are gone: خدمات سيارات joined مواصلات (the traffic fine is خدمات حكومية), خدمات رقمية split into
   اشتراكات and عمل, and التزامات وجمعيات split into أقساط وفوايد and تحويل/جمعية. New categories: عناية شخصية، أطفال،
   أقساط وفوايد, and on the income side هدايا وعيديات and دخل آخر.
2. **Purpose first, person beside it.** The category says what the money was for. The person the sentence names is
   kept on the item (`person_mentioned`) and linked to a contact when the item is saved (`namedPersonOf`). A person
   category (العائلة، أصدقاء، موظفين) is used only when the sentence states no purpose ("اديت ماما 1000"). An
   unknown person beside a known purpose is not a reason to stop and ask.
3. **Money movements are transfers with a direction.** Paying into and receiving a gam3eya (تحويل/جمعية), lending,
   borrowing and repaying (تحويل/دين/سلفة) and an ATM withdrawal (تحويل/سحب ATM) are type `transfer`, never spending
   or income. The direction is stored in `parsed_metadata.direction` (`incoming` or `outgoing`). Sending money to
   someone who keeps it ("حولت لماما 1000 للبيت") is spending.
4. **Money coming in is named by its source.** Salary only when salary is named (مرتب، راتب، قبضت، من الشغل). A gift
   received with a receiving verb is هدايا وعيديات; money back from a returned purchase is دخل آخر/مرتجعات واسترداد;
   the price of something sold is دخل آخر/بيع حاجة. Anything else is دخل آخر/عام at intent strength, so it is
   reviewed rather than saved as salary. A bank credit that does not say salary is دخل آخر.
5. **Stored rows move through a job, not SQL.** `LEGACY_TAXONOMY` says where each old pair lives now. The
   `taxonomy-migration` job applies it in bounded batches, because a retyped row moves money between the columns of
   `expense_daily_rollups`, which are keyed by the Cairo business day that SQL date functions would get wrong. User
   dictionaries, correction rules and budgets follow. The same rules translate old names that still arrive from
   older clients and model replies (`normalizeTransactionTaxonomy`).
6. **A refund is income for now.** Subtracting a refund from the category it came back to belongs to a single
   definition of spending that every screen reads. Screens still total spending on their own, so a negative expense
   would break each of them differently.

## Consequences
- A new category or subcategory is a row in `contracts/categories.ts`. Renaming or moving one needs a
  `LEGACY_TAXONOMY` rule, which both the input normalization and the job then apply.
- Each changed expense keeps its old values in `parsed_metadata.legacy_taxonomy`. The rollback is to restore
  `category`, `sub_category` and `type` from there and reverse the rollup delta, the job's steps in reverse.
- Gam3eya, loan and ATM rows leave the spending and income totals. Screens that count "everything that is not
  income" as spending (the AI chat, the WhatsApp report, the export) still count transfers until they share one
  spending definition.
- The benchmark fixtures in `api/qa/fixtures/` use the new names. Frozen cases changed only where a label named a
  retired category or where the new taxonomy has the better answer (دخل آخر for income with no named salary).
- Contacts are created for a person beside a purpose only when the person's relationship is known, as they already
  were for the person categories.
