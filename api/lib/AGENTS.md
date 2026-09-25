# api/lib/ — shared server logic

Most of this folder is the expense classification pipeline. Entry point: `smart-pipeline.ts`
(`runSmartPipeline`). The journey is drawn in `docs/architecture/flows/record-expense.c4`; the modules are
listed in `docs/atlas/modules.md` (`classification`, `arabic-nlp`, `ai-providers`, `ingestion-parsers`,
`security`, `platform`). The explanations are `docs/systems/expense-capture.md` for the pipeline and
`docs/systems/ai-platform.md` for the providers and limits; `docs/atlas/systems/files.md` maps any other file
here to its system.

## Pipeline order
Read `smart-pipeline.ts` before changing any stage.
1. `financial-event-plan.ts` splits the text into events and rejects questions, plans and negations
   (`negation-detector.ts`).
2. In-process result cache, admissibility gate (`admissibility-gate.ts`), muscle memory
   (`muscle-memory.ts`), business scoring (business mode only).
3. Per segment: `rule-engine.ts` (user dictionary, merchant registry, synonym graph, dictionaries, fuzzy
   match, embeddings), then user correction rules (`correction-rules.ts`), calibration
   (`confidence-calibrator.ts`) and the escalation decision (`classification-decision.ts`).
4. Only escalated clauses reach a model, through `llm-provider-chain.ts` and `llm-router.ts`, with a fixed
   prompt (`classification-prompt.ts`) and reply contract (`classifier-contract.ts`). The model returns
   categories; amounts, direction and people stay local.
5. Amount reconciliation (`amount-ledger.ts`), the verifier (`post-classifier-verifier.ts`), final
   calibration and the per-item decision (`final-acceptance.ts`).

## Rules
1. Categories and subcategories come from `category-registry.ts`; `taxonomy-ssot.ts` is only a view of
   it. Do not write new category strings in code.
2. Match on normalized text (`unified-normalizer.ts`). It folds ى to ي and ة to ه, so pass literal
   markers through the same function.
3. Arabic has no working `\b`: JavaScript word boundaries ignore Arabic letters, and substring markers
   misfire (`كنت ه` also matches `كنت هناك`). Match tokens with `arabic-token-match.ts`.
4. A behaviour change must keep the classification benchmark green: `npm run bench:classify`, and
   `npm run bench:classify:compare` against the frozen baseline.
5. Correction learning runs from `expense.update`, which the web app calls from the edit dialog of a saved
   item (`src/components/expenses/EditExpenseDialog.tsx`). Edits made on the review cards before saving are
   not recorded yet.
6. Model ids through `model-mapper.ts`; admin-configured providers and keys through `ai-gateway.ts`.
