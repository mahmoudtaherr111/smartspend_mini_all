# Recording spending

How SmartSpend turns what a person types, says or photographs into categorized transactions and saves them:
the entry form, the classification pipeline and the Arabic text handling it relies on, the questions it asks
when it is unsure, and the writes that put items in the ledger.

- Facts generated from the code, with diagrams: [docs/atlas/systems/expense-capture.md](../atlas/systems/expense-capture.md)
- The same story for readers who do not read code: [docs/ar/systems/expense-capture.md](../ar/systems/expense-capture.md)
- Folder rules while editing: `api/lib/AGENTS.md`, `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Entry form | `src/components/expenses/ExpenseForm.tsx#ExpenseForm`, on the Home screen | Text box, microphone and camera; the review and clarification steps; a queue for text typed offline |
| Text entry point | `api/ai-router.ts#parseExpense` | Plan and budget checks, loads the user's context, runs the pipeline, stores the trace, opens a clarification |
| Voice entry point | `api/ai-router.ts#parseVoiceExpense` | Voice quota gate, speech to text, then the same pipeline |
| Receipt entry point | `api/image-router.ts#parseReceipt` | Pro only: reads a photo and saves one expense directly |
| The pipeline | `api/lib/smart-pipeline.ts#runSmartPipeline` | A sentence in; items and a decision out: `auto_save`, `review` or `clarify` |
| Saving | `expense.create` and `expense.batchCreate` in `api/expense-router.ts` | Writes the items, their rollup delta, contacts and streak in one transaction |
| Clarifications | `api/expense-router.ts#answerClarification` | Takes the user's answer, re-runs the pipeline and saves |

## One sentence, step by step

### 1. The form sends the text
`ExpenseForm` calls `ai.parseExpense` with the text, `inputChannel` and `businessMode`. Offline, it keeps the
text in the browser (`smartspend_offline_texts`, up to the plan's offline limit from `ai.getUserLimits`) and
parses it when the connection returns: what the pipeline would auto-save is saved, anything else stays queued
for the user to review.

### 2. The entry point checks and gathers context
`parseExpense`:
- refuses when the plan's parse feature is switched off (setting `<plan>_ai_parse`) or the daily request limit
  is reached, and checks the AI token budget (`api/lib/ai-usage-policy.ts#assertAiBudget`);
- resolves the provider and model for the plan and its usage (`api/ai-router.ts#resolveRoutingConfig`);
- loads the user dictionary (`user_dictionaries`), the smart profile, this month's income and expense
  (`api/services/finance-semantic-layer/resolvers.ts#getFinanceSummary`) and the active business's categories;
- adds the people from the profile to the dictionary, except transfers, so a known name resolves to its
  category.

When no Gemini key is configured, `api/ai-router.ts#getAiClient` throws and `parseExpense` continues with its
built-in limits; the local pipeline still runs.

### 3. Events before categories
`api/lib/financial-event-plan.ts#planFinancialEvents` splits the text into clauses and marks each one:
- **admitted**: a transaction that happened, with an amount;
- **incomplete**: no amount, such as "دفعت الكهربا";
- **rejected**: a question, a plan or future tense ("هدفع بكرة"), or a negation ("ماشتريتش"), detected by
  `api/lib/negation-detector.ts#detectNegation`. "غدا" is not a plan marker: in Egyptian it is lunch ("جبت غدا ب
  150"), and a real "tomorrow" comes with a future verb.

It also keeps a stated total ("والإجمالي 500") as a check, applies a "قصدي 300" correction to the amount beside
it, and adds review reasons for approximate wording, foreign currencies, dates and clauses with more than one
amount. When no event is admitted, the pipeline answers `clarify` with a question and spends nothing.

### 4. Cheap answers first
`classifyAdmittedEvents` in `api/lib/smart-pipeline.ts` tries, in order:
1. **Result cache**: an in-process LRU keyed by `api/lib/smart-pipeline.ts#makeCacheKey`, which holds everything
   the answer depends on (pipeline and calibration versions, user, plan, business scope, model, thresholds,
   normalized text). Results decided `auto_save` or `review` are kept for a week. Saving, editing or deleting an
   expense clears the user's entries (`invalidateUserClassificationCache`), and so do changes to businesses and
   contacts.
2. **Admissibility gate**: `api/lib/admissibility-gate.ts#checkAdmissibility` answers chatter, questions about
   spending and negated single-amount statements with a reply before anything costs money.
3. **Muscle memory**, for single-event sentences: `api/lib/muscle-memory.ts#muscleMemoryLookup` compares the
   sentence's template (its amount replaced by a placeholder) with patterns learned from the user's own
   classification logs of the last 90 days: single-item, auto-saved, uncorrected results that repeated with the
   same outcome. A match scoring 90 or more answers, after the named people are resolved.
4. **Business scoring**, in business mode only: keywords of the business's categories are weighed against
   personal keywords; a dominant match on a sentence with exactly one amount becomes `مشروع` with the business
   category as subcategory, its direction taken from the verb.

A shortcut never grants itself `auto_save`. Its items pass `api/lib/final-acceptance.ts#gateShortcutResult`
(admissible, every amount owned, decided per item), and a shortcut that does not account for every amount stands
aside for the full path.

### 5. The local classifier, per event
For each admitted event:
1. `api/lib/rule-engine.ts#runRuleEngine` finds each amount and classifies the words around it (layers below).
   Spoken and written amounts become digits in one place, `api/lib/arabic-number-parser.ts#parseArabicNumbers`:
   Egyptian teens and hundreds ("خمستاشر", "خمسميت"), a spoken unit before a separate hundred ("خمس مية" is 500),
   halves ("ألفين ونص") and Arabic-Indic digits. "واحد" is a number only inside a tens compound ("واحد وخمسين" is
   51) or when it closes an amount ("مية وواحد جنيه" is 101), so "واحد صاحبي" stays a person. "مية" is water when
   the word before it is a container or a bill ("ازازة مية 10") or the word after it is "معدنية"; "تمن" before a
   noun is a price ("دفعت تمن الأكل 50"); and `api/lib/entity-extractor.ts#extractAmounts` reads 80/90/92/95 right
   after "بنزين" as the grade when another number gives the price.
2. Named people are resolved (`api/lib/smart-pipeline.ts#applyPersonResolution`,
   `api/lib/person-resolver.ts#resolvePersonForTransaction`). One amount with several named people is split
   between them unless they are joined by "أو". An unknown person makes the result `clarify` with "مين …؟". A
   word is taken as a person only when it is one of the user's contacts, a family word or a name the names
   dictionary knows (`api/lib/egyptian-names-dictionary.ts#isLikelyPersonName`); a leading fa is not peeled
   ("فلوسي" is not "لوسي"), and "منه" right after a receiving verb is a pronoun.
3. The user's stored corrections replace the answer (`api/lib/correction-rules.ts#applyCorrectionRules`).
4. Calibration turns each item's evidence into a probability (`api/lib/confidence-calibrator.ts#applyCalibration`,
   measured table `api/lib/confidence-calibration.generated.ts#CONFIDENCE_CALIBRATION`).
5. `api/lib/classification-decision.ts#shouldEscalate` decides whether the event goes to the model. An
   unresolved category (`متنوعات`), an unattached amount, ambiguous wording or disagreeing resolvers escalate; a
   user-taught answer (a correction, the user dictionary, muscle memory) never does; otherwise a probability
   under the escalate threshold escalates.

The layers `runRuleEngine` tries for the text around one amount, with the evidence kind each one records:

| Layer | Evidence kind |
| --- | --- |
| Verb and noun patterns: coffee, fast food, recharges, rides | `verb_noun_regex` |
| The user's own dictionary, which overrides the patterns | `user_dictionary` |
| Merchant registry of brand names, with disambiguation for names that are also people | `merchant_registry` |
| Synonym graph, `api/lib/taxonomy-adapter.ts#findTaxonomyMatch`, matched on whole words (`api/lib/arabic-token-match.ts`), so "واخيرا" does not match "اخي" | `synonym_graph` |
| Category dictionary phrases, then subcategory phrases, of three and two words | `dict_trigram`, `dict_bigram`, `subcat_trigram`, `subcat_bigram` |
| A single word in the subcategory map, then in the category dictionary | `subcat_unigram`, `dict_unigram` |
| Typo match, with an edit budget scaled to the word's length | `fuzzy` |
| Semantic match on a local character n-gram index, and Fireworks embeddings when the request carries a Fireworks key (`api/lib/embedding-engine.ts#matchSegment`) | `embedding` |
| Direction only: income becomes `مرتب`, an expense `متنوعات` at low confidence | `intent_only` |

Direction comes from `api/lib/intent-detector.ts#detectIntent`. Gift words (هدية، عيدية، نقطة) are spending on their
own and income only beside a receiving verb (خدت، جالي، وصلني). When the direction is income but the words named
something bought, the item becomes `مرتب` at intent strength (`intent_only`), so it goes to review.

After a layer answers, negated clauses are dropped, nouns whose direction depends on the verb (الجمعية, قسط,
سلفة) take their subcategory from `api/lib/direction-governed-taxonomy.ts#resolveGovernedTaxonomy`, and profile
hints apply (children lead to education, running the household to groceries).

### 6. The model, only for what is left
When events escalated, the pipeline:
- writes one numbered clause per escalated event, each carrying the amount and direction already extracted,
  plus known people, the user's frequent categories from recent expenses and the business's categories
  (`api/lib/classification-prompt.ts#buildClassificationUserPrompt`, fixed system prompt
  `CLASSIFICATION_SYSTEM_PROMPT`);
- asks the provider chain for **categories only** (`api/lib/ai-gateway.ts#resolveAdminRoutes` for routes the
  admin configured, `api/lib/llm-provider-chain.ts#buildProviderChain`, `api/lib/llm-router.ts#executeLlmChain`),
  with a timeout per route (setting `llm_timeout_ms`) and one deadline for the whole trip (`llm_trip_deadline_ms`);
- validates the reply (`api/lib/classifier-contract.ts#validateClassifierReply`) and merges the categories onto
  the local items (`api/lib/classification-merge.ts#mergeCategoryDecisions`). Amounts, direction and people never
  come from the model. A missing or invalid answer adds a blocker to the item instead of dropping it, and a
  category for a clause with no extracted amount becomes a question;
- when every provider fails, keeps the local items and marks them for review.

One shortcut comes before the model: when no event was accepted locally, the sentence has at most three amounts,
no person is involved and a Fireworks key is present, a whole-sentence embedding match scoring 70 or more is used
instead of the model (see known issues).

### 7. Checks before the decision
- **Amounts**: `api/lib/amount-ledger.ts#reconcileAmounts` checks, in integer cents, that every amount the user
  said belongs to an item; splits are allowed. A missing amount is recovered from a deterministic pass when
  possible; otherwise one question names every missing amount (`describeUnconsumed`).
- **Clean-up**: duplicates from different parsers are merged, implausible amounts for investment, real estate
  and rent fall back to `متنوعات`, category names are normalized against the registry
  (`api/lib/category-registry.ts#normalizeTransactionTaxonomyList`), and `متنوعات` items are rescued through the
  subcategory map. Normalization keeps a category the item already has: evidence from the sentence may only fill
  a missing or `متنوعات` category, refine the income default `مرتب` (to عمل حر or عوائد استثمار) and `استثمار` (to
  its returns), and remap legacy names.
- **Verifier**: `api/lib/post-classifier-verifier.ts#verifyClassifiedItems` flags duplicates, conflicts between
  direction and category, unknown categories, amount sanity and anomalies against the month's income and
  expense. Setting `parser_local_verifier_enabled` switches it off.
- Calibration runs once more, so answers from the model are priced too.

### 8. The decision
`api/lib/final-acceptance.ts#decidePerItem` judges every item with `api/lib/classification-decision.ts#decide`
and keeps the strictest outcome:
- `clarify`: a question is pending, an amount is unattached, or the probability is under the review threshold;
- `review`: the item carries a blocker or `needsReview`, its evidence bucket has no calibration data
  ("unpriced"), or its probability is under the auto-save threshold;
- `auto_save`: everything else.

The pipeline then turns `auto_save` into `review` when the verifier raised a warning or an error, or when any
item is unpriced. Back in `runSmartPipeline`, every event's amounts are reconciled on their own: a stated total
that does not match, an incomplete event or an item that belongs to no event makes the result `clarify`, and an
event with review reasons turns `auto_save` into `review`.

The thresholds are probabilities in `api/lib/classification-decision.ts#DEFAULT_THRESHOLDS`. Admins override
them in system settings on a 0 to 100 scale with `parser_auto_save_threshold`, `parser_review_threshold` and
`parser_escalate_threshold`; when those are not set, the older `confidence_auto_save` and `confidence_review` are
read. The blocker codes are `api/lib/final-acceptance.ts#BlockerReason`.

### 9. After the pipeline
`parseExpense` records the tokens and an AI cost metric, writes the trace to `classification_logs` with
`api/lib/smart-pipeline.ts#SMART_PIPELINE_VERSION`, and writes an `ai_summaries` row. For `clarify` it stores a
`pending_clarifications` row whose context holds the items and a queue of the unknown names (`pendingNames`), and
returns its id with the question. The response carries the items, the decision, the parser trace
(`api/services/parser-trace.ts#buildParserTrace`) and the log id.

### 10. The form reacts and the items are saved
- `auto_save`: the form saves at once, one item through `expense.create` and several through
  `expense.batchCreate`, with source `ai_parsed` or `voice`, the log id and, for queued offline text, a client
  request id. When saving fails, the items are shown for review.
- `review`: editable cards with totals per direction; the user fixes or removes rows, then saves.
- `clarify`: the question, with relation shortcuts (أبويا, أمي, أخويا, صاحبي, ...) for "who is" questions and a
  skip button. Answers go to `expense.answerClarification`.

`expense.create` and `expense.batchCreate` (up to 100 items) are idempotent on `clientRequestId`, check that
referenced wallets, businesses and contacts belong to the user
(`api/lib/ownership-guard.ts#assertEntityOwnership`), and turn a person subcategory into a contact. In one
transaction they insert the rows and their `expense_details`, apply the daily rollup delta
(`api/services/expense-rollups.ts#applyExpenseRollupDelta`), count the contact's transactions and update the
streak. Afterwards they clear muscle memory, the classification cache and the finance caches, and check budget
alerts (`api/notification-engine.ts#checkUserBudgetExceeded`).

## Voice
`parseVoiceExpense` refuses before it spends anything: `api/lib/voice-intake-gate.ts#checkVoiceIntake` checks the
payload size, the audio type, that the claimed duration is positive, the per-recording limit and the month's
seconds, from the per-plan settings `voice_limit_<plan>` and `voice_per_req_<plan>`
(`api/lib/voice-intake-gate.ts#resolveVoiceLimits`). It reserves the speech budget, transcribes with
`api/ai-router.ts#runSTTPipeline` (the plan's speech model, then `gemini-2.0-flash`), records the billable seconds
in `voice_usage`, and runs the same pipeline on the transcript with business mode off. The form stops a recording
at the plan's per-recording limit and at the seconds left this month.

`ai.speechToText` transcribes without parsing; no screen calls it.

## Receipts
`image.parseReceipt` is a Pro procedure. It checks the payload size and the image signature (JPEG, PNG or WebP),
reserves the image budget and calls `api/lib/receipt-image-parser.ts#parseReceiptImage`: with an OCR text hint it
reads the amount locally and runs the pipeline on a short sentence; otherwise a Gemini vision call (the
`ai_model_pro` setting, else `GEMINI_MODEL_PRO`, whose default is `gemini-3.5-flash`, through `mapModelName`) reads
the receipt and the pipeline runs on its OCR text. The first item is normalized against the registry and saved as one
expense with source `image`, without a review step. The form offers the camera only to Pro users, and only online.

## Clarifications
`expense.answerClarification` works in one of two modes, chosen by what the clarification stored:
- **Name queue**, when `pendingNames` is present: the answer resolves one or more names (a relation such as
  "أخويا", or "تخطي" to stop asking about that contact). While names remain, the question is updated and returned.
  When none remain, the sentence is rewritten with "name (relation)" (`enrichTextWithNameRelation`), the pipeline
  runs without asking again, contacts are created and the items are saved in one transaction.
- **Free answer**: the answer is appended to the sentence and the pipeline runs again. Another `clarify` updates
  the question; a result under 70 is refused; anything else is saved.

`expense.getPendingClarifications` lists the open questions, but no screen shows that list: the form only refreshes
it. The live call reads them and can finish one with the user's answer ([voice calls](voice-calls.md#the-tools)).

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| How a sentence splits into events, or what counts as planned, negated or a question | `api/lib/financial-event-plan.ts`, `api/lib/negation-detector.ts`, `api/lib/narrative-decomposer.ts` | the benchmark below |
| How a spoken or written amount becomes a number | `api/lib/arabic-number-parser.ts` | `api/lib/arabic-number-parser.test.ts`, the benchmark |
| Words, merchants and phrases that map to categories | `api/lib/rule-engine.ts` (merchant registry, subcategory map), `api/lib/egyptian-dictionary.ts`, `api/lib/taxonomy-adapter.ts` | the benchmark |
| The categories and their aliases | `api/lib/category-registry.ts#CATEGORIES` | `api/lib/category-registry.integrity.test.ts`, the benchmark |
| When the model is asked; save, review or ask | `api/lib/classification-decision.ts`, `api/lib/final-acceptance.ts`, the threshold settings | `npm run bench:classify:compare` |
| The probabilities | re-measure with `npm run bench:classify:calibrate`; never edit the generated table by hand | the benchmark |
| What the model is asked, and what is accepted from it | `api/lib/classification-prompt.ts`, `api/lib/classifier-contract.ts`, `api/lib/classification-merge.ts` | `api/lib/classifier-contract.test.ts`, `api/lib/classification-prompt-injection.test.ts` |
| Which provider and model answer | [AI providers and usage limits](ai-platform.md), and the admin's AI settings | |
| Voice limits | the `voice_limit_<plan>` and `voice_per_req_<plan>` settings; the policy in `api/lib/voice-intake-gate.ts` | `api/lib/voice-intake-gate.test.ts` |
| The form, review and clarification screens | `src/components/expenses/ExpenseForm.tsx` | `src/components/expenses/ExpenseForm.quick-save.test.ts` |
| What a save writes | `api/expense-router.ts`, `api/services/expense-rollups.ts` | `npx vitest related --run api/expense-router.ts` |

## Rules for changes here
1. Follow `api/lib/AGENTS.md`: categories only from the registry, match on normalized text, no `\b` around Arabic
   words, keep the benchmark green, model ids through the mapper.
2. A shortcut may produce the answer but may not skip the gate: send its items through `gateShortcutResult`, and
   never return `auto_save` from a branch of its own.
3. The model names categories and nothing else. Do not ask it for amounts, direction, people or segmentation, and
   do not trust a confidence it reports about itself.
4. Everything an answer depends on belongs in `makeCacheKey`. An input that changes the result without being in
   the key serves stale answers for up to a week.
5. Every amount the user said ends in an item, a rejected clause or a question. Never save part of a sentence
   silently.
6. The result cache, muscle memory and the settings cache live in each process. A change that must reach every
   server belongs in Redis or MySQL.

## Tests and benchmarks
- Pipeline behaviour: `api/lib/smart-pipeline.test.ts`, `api/lib/smart-pipeline-failover.test.ts`,
  `api/lib/financial-event-pipeline.test.ts`, `api/lib/financial-event-quality.test.ts`,
  `api/lib/financial-event-verification.test.ts`, `api/lib/classification-acceptance.test.ts`,
  `api/lib/classification-golden.test.ts`.
- Single pieces: `api/lib/admissibility-gate.test.ts`, `api/lib/amount-ledger.test.ts`,
  `api/lib/correction-rules.test.ts`, `api/lib/muscle-memory.regression.test.ts`,
  `api/lib/negation-detector.test.ts`, `api/lib/classification-cache-scope.test.ts`,
  `api/lib/classification-cache-invalidation.test.ts`, `api/lib/voice-intake-gate.test.ts`,
  `api/lib/receipt-image-parser.test.ts`.
- Benchmark: `npm run bench:classify` runs `api/lib/classification-benchmark.test.ts` offline with the database
  mocked. `npm run bench:classify:compare` compares the run with the frozen baseline
  `api/lib/__baselines__/classification-benchmark.baseline.json` and fails when a gate is crossed
  (`api/qa/classification-baseline.ts`). `npm run bench:classify:live` calls real providers.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** Answering a clarification twice saves its items twice: `answerClarification` loads the row by id and owner
   without checking that its status is still `pending`.
2. **Bug.** Saves made from a clarification skip what `expense.create` does after writing: muscle memory and the
   classification cache are not cleared, the streak is not updated, the rows get source `manual`, and the
   free-answer mode links no contact and no classification log.
3. **Bug.** Receipts are saved without review. The saved amount is the first item the pipeline read from the OCR text,
   which can differ from the total the vision model returned, and a base64 image longer than the parser's cap
   is cut short instead of refused (`api/lib/receipt-image-parser.ts#guardImagePayloadSize`), although the
   procedure accepts larger payloads.
4. **Bug.** The voice endpoints count the month differently: `speechToText` from the subscription or sign-up day,
   `parseVoiceExpense` from the first of the calendar month. `parseVoiceExpense` also creates contacts for the
   people it resolves while parsing, before the user saves anything.
5. **Bug.** When every event escalates and a Fireworks key is present, the whole-sentence embedding shortcut makes one item
   from the first amount; the other amounts then become a question.
6. **Gap.** Correction learning cannot be reached from the app: `api/lib/correction-rules.ts#recordCorrection` runs only in
   `expense.update`, which the web app does not call. `ai.learnWord`, `expense.createCategory` and
   `expense.getCategoryList` have no caller in the web app, and `src/components/expenses/ReceiptCapture.tsx` is
   not rendered anywhere.
7. **Debt.** The comment above the threshold settings in `classifyAdmittedEvents` says the older `confidence_*` keys win;
   the code reads the `parser_*` keys first.
8. **Gap.** An entry whose question the user left unanswered stays unrecorded, and the app never shows it again: the
   form asks only while it is open, and `src/components/expenses/ExpenseForm.tsx` refreshes
   `expense.getPendingClarifications` without displaying it. Only the live call (`money_query` `pending`) and the
   admin's clarifications tab list them.

## Related systems
- [Money](money.md): lists, statistics, wallets, budgets, and the rollups these saves feed.
- [AI providers and usage limits](ai-platform.md): plan limits, budgets, routing, the provider chain and model names.
- [Reports, insights and the smart profile](insights.md): the profile and known people the pipeline reads.
- [Bank and wallet messages](bank-messages.md): bank notifications have their own parsers, not this pipeline.
- [Admin console, support and growth tools](admin.md): the rule sandbox and the clarifications tab.
- [AI Center](ai-center.md): the assistant can also propose recording an expense.
