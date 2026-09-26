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
| Receipt entry point | `api/image-router.ts#parseReceipt` | Plans whose receipts switch is on (Pro and Ultra by default): reads a photo and saves one expense directly |
| The pipeline | `api/lib/smart-pipeline.ts#runSmartPipeline` | A sentence in; items and a decision out: `auto_save`, `review` or `clarify` |
| Saving | `expense.create` and `expense.batchCreate` in `api/expense-router.ts` | Writes the items, their rollup delta, contacts and streak in one transaction |
| Clarifications | `api/expense-router.ts#answerClarification` | Takes the user's answer, re-runs the pipeline and saves |

## One sentence, step by step

### 1. The form sends the text
`ExpenseForm` calls `ai.parseExpense` with the text, `inputChannel` and `businessMode`. Offline, it keeps the
text in the browser (`smartspend_offline_texts`, up to the plan's offline limit from `ai.getUserLimits`) and
parses it when the connection returns: what the pipeline would auto-save is saved, anything else stays queued,
marked for review, while the rest of the queue keeps syncing. At the end the first entry waiting for review is parsed
again so its review card is the one on screen.

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
  150"), and a real "tomorrow" comes with a future verb. "استرجعت" cancels only when no money is named
  ("استرجعت الاوردر"); "استرجعت فلوس الكورس" is a refund.

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
   same outcome. A result logged under an old category is learned in its current place (`LEGACY_TAXONOMY`), and an
   old money movement booked as spending or income is not learned at all, nor is an answer that carried a direction
   (a refund, a loan repaid), since a pattern replays only category and type. A match scoring 90 or more answers, after
   the named people are resolved.
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
   between them unless they are joined by "أو". The category stays what the money was for and the person is kept
   beside it (`person_mentioned`): "دفعت مصاريف مدرسة ابني" is تعليم for ابني. Only money handed to someone with no
   stated purpose ("اديت ماما 1000") takes the person's category (العائلة، أصدقاء، موظفين), and only then does an
   unknown person make the result `clarify` with "مين …؟"; a loan keeps تحويل/دين/سلفة and still asks who. A
   word is taken as a person only when it is one of the user's contacts, a family word or a name the names
   dictionary knows (`api/lib/egyptian-names-dictionary.ts#isLikelyPersonName`); a leading fa is not peeled
   ("فلوسي" is not "لوسي"), "منه" right after a receiving verb is a pronoun, and the lam of "حولت لامي" is the
   preposition, so the person is "امي".
3. The user's stored corrections replace the answer (`api/lib/correction-rules.ts#applyCorrectionRules`).
4. Calibration turns each item's evidence into a probability (`api/lib/confidence-calibrator.ts#applyCalibration`,
   measured table `api/lib/confidence-calibration.generated.ts#CONFIDENCE_CALIBRATION`). Sources the corpus has no
   examples of but that are trusted by construction get a stated prior instead of staying unpriced: a user
   correction or dictionary word (0.97), a muscle-memory pattern (0.95) and a merchant-registry brand (0.95). Any
   doubt withdraws it: an ambiguous word, disagreeing resolvers, an unknown person, or a brand spelled like a name or
   a common word (`ambiguous_merchant`: كريم، سيف، شيل، بيم، نون، شاهد، فوري...).
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
| Direction only: income becomes `دخل آخر`, an expense `متنوعات` at low confidence | `intent_only` |

A kinship word from the synonym graph (أمي، ابني) and a payment rail from the merchant registry (a card, a wallet, a
bank: بالفيزا، بفودافون كاش، بانستاباي) say to whom and how the money moved, not what for. Their answers are held
while the later layers look for a purpose and are used only when none is found: "دفعت بالفيزا 300 في المطعم" is أكل
وشرب, "دفعت مصاريف مدرسة ابني" is تعليم, and "حولت 1000 بانستاباي" stays تحويل/انستاباي.

Direction comes from `api/lib/intent-detector.ts#detectIntent`. Gift words (هدية، عيدية، نقطة) are spending on their
own and income only beside a receiving verb (خدت، جالي، وصلني). Money back from a returned purchase ("رجعت الجزمة
واخدت فلوسي") and the price of something sold ("بعت الموبايل ب 4000", but not an errand: "بعت الواد يجيب عيش") read
as income too. When the direction is income but the words named something bought, the source decides the category:
a gift received is هدايا وعيديات, a refund an expense in the bought thing's category with direction `incoming`
(stored negative, docs/decisions/0010-refunds-net-their-category.md; money back from nothing named stays دخل
آخر/مرتجعات واسترداد), a sale دخل آخر/بيع حاجة, pay "من الشغل" مرتب,
and anything else دخل آخر. Those are capped at intent strength (`intent_only`) and go to review; income is filed as
مرتب only when salary is named (مرتب، راتب، قبضت) (docs/decisions/0008-money-movements-and-taxonomy.md).

After a layer answers, negated clauses are dropped, and the money movements whose direction depends on the verb
(الجمعية, سلفة, رجعلي, "اللي عليا") become transfers through
`api/lib/direction-governed-taxonomy.ts#resolveGovernedTaxonomy`: تحويل/جمعية or تحويل/دين/سلفة, with the direction
the verb gave (`direction`: `incoming` or `outgoing`). A bank loan's installment or interest paid ("دفعت قسط القرض",
"دفعت فوائد القرض") is not a loan moving but spending under أقساط وفوايد. Profile
hints apply last (children lead to education, or to أطفال/حضانة for a nursery; running the household to
groceries).

### 6. The model, only for what is left
When events escalated, the pipeline:
- writes one numbered clause per escalated event, each carrying the amount and direction already extracted,
  plus known people, the user's frequent categories from recent expenses and the business's categories
  (`api/lib/classification-prompt.ts#buildClassificationUserPrompt`, fixed system prompt
  `CLASSIFICATION_SYSTEM_PROMPT`);
- asks the provider chain for **categories only** (`api/lib/ai-gateway.ts#resolveAdminRoutes` for routes the
  admin configured, `api/lib/llm-provider-chain.ts#buildProviderChain`, `api/lib/llm-router.ts#executeLlmChain`),
  with a timeout per route (setting `llm_timeout_ms`, 8 seconds by default) and one deadline for the whole trip
  (`llm_trip_deadline_ms`, 15 seconds; a trip that ends unanswered keeps the local answer and goes to review),
  asking a Gemini 3 model for low thinking (asked again without it if the model refuses);
- sends a static prompt (`api/lib/classification-prompt.ts`): the category is the purpose and a person goes in
  `person` (a person category only when nothing names a purpose), a payment rail is not a category, the boundaries of
  categories that get confused, the local candidates as "تخميناتنا", and `direction_doubt` when the settled direction
  looks wrong;
- validates the reply (`api/lib/classifier-contract.ts#validateClassifierReply`) and merges the categories onto
  the local items (`api/lib/classification-merge.ts#mergeCategoryDecisions`). Amounts, direction and people never
  come from the model. The model's purpose replaces a local person category; a person category from the model is
  kept only when the local pass found no purpose either; `direction_doubt` adds the review reason
  `model_doubts_direction`; a business subcategory the user owns stays the subcategory of عمل. A missing or invalid answer adds a blocker to the item instead of dropping it, and a
  category for a clause with no extracted amount becomes a question;
- when every provider fails, keeps the local items and marks them for review.

There is no semantic (embedding) layer: a sentence the rules cannot place goes to the model
(docs/decisions/0012-classification-without-embeddings.md).

### 7. Checks before the decision
- **Amounts**: `api/lib/amount-ledger.ts#reconcileAmounts` checks, in integer cents, that every amount the user
  said belongs to an item; splits are allowed. A missing amount is recovered from a deterministic pass when
  possible; otherwise one question names every missing amount (`describeUnconsumed`).
- **Clean-up**: duplicates from different parsers are merged, implausible amounts for investment, real estate
  and rent fall back to `متنوعات`, category names are normalized against the registry
  (`api/lib/category-registry.ts#normalizeTransactionTaxonomyList`), and `متنوعات` items are rescued through the
  subcategory map. Normalization first moves old names to the current taxonomy (`LEGACY_TAXONOMY` in
  `contracts/categories.ts`: a retired category, a merged subcategory, a money movement once booked as spending or
  income). It keeps a category the item already has: evidence from the sentence may only fill a missing or
  `متنوعات` category, refine `مرتب` (to عمل حر or عوائد استثمار), the unknown-income default `دخل آخر` (to مرتب, عمل
  حر or عوائد استثمار) and `استثمار` (to its returns).
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
`parseExpense` records the tokens, an AI cost metric and one [AI cost ledger](ai-platform.md#how-a-call-is-recorded) row per model call the chain made
(failovers included, each at its own provider's price), writes the trace to `classification_logs` with
`api/lib/smart-pipeline.ts#SMART_PIPELINE_VERSION`. For `clarify` it stores a
`pending_clarifications` row whose context holds the items and a queue of the unknown names (`pendingNames`), and
returns its id with the question. The response carries the items, the decision, the parser trace
(`api/services/parser-trace.ts#buildParserTrace`) and the log id. The form shows the trace, an English diagnostic
panel, to admins only.

### 10. The form reacts and the items are saved
- `auto_save`: the form saves at once, one item through `expense.create` and several through
  `expense.batchCreate`, with source `ai_parsed` or `voice`, the log id and, for queued offline text, a client
  request id. When saving fails, the items are shown for review. The saved toast says what was saved (amount and
  category, or the count and total) and offers "تراجع", which deletes exactly the saved ids (`expense.create`
  returns its id, `expense.batchCreate` its `ids`). When the saved category differs from the one the parser
  proposed for a one-item sentence (found through the log id), the save records it as the user's correction and
  marks the log corrected, as editing a saved item does.
- `review`: editable cards with totals per direction; the user fixes or removes rows, then saves. A card's
  category list holds the categories of its item's kind (`src/lib/financial-taxonomy.ts#getCategoryOptionsForType`),
  and a newly picked category starts at its general subcategory.
- `clarify`: the question, with relation shortcuts (أبويا, أمي, أخويا, صاحبي, ...) for "who is" questions and a
  skip button. Answers go to `expense.answerClarification`.

`expense.create` and `expense.batchCreate` (up to 100 items) are idempotent on `clientRequestId`, check that
referenced wallets, businesses and contacts belong to the user
(`api/lib/ownership-guard.ts#assertEntityOwnership`), and link the named person to a contact
(`api/expense-router.ts#namedPersonOf`): the person subcategory of a person category, or the `personName` and
`personRelationship` the form sends for a person named beside a purpose. A transfer's direction is stored in
`parsed_metadata.direction`. In one
transaction they insert the rows, apply the daily rollup delta
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
`image.parseReceipt` is gated by the plan's receipts switch (`receiptsProcedure`, `feature_receipts_<plan>`). It checks the payload size and the image signature (JPEG, PNG or WebP),
reserves the image budget and calls `api/lib/receipt-image-parser.ts#parseReceiptImage`: with an OCR text hint it
reads the amount locally and runs the pipeline on a short sentence; otherwise a Gemini vision call (the
`ai_model_pro` setting, else `GEMINI_MODEL_PRO`, whose default is `gemini-3.5-flash`, through `mapModelName`) reads
the receipt and the pipeline runs on its OCR text. The first item is normalized against the registry. The entry form
asks with `saveExpense: false`, so nothing is saved: the item opens the review card like a typed sentence, and saving
it there stores it with source `image` through `expense.batchCreate`. (`saveExpense: true`, the default, still saves
at once; nothing in the app calls it that way.) The form offers the camera only when `pro.myPlan` reports the receipts feature for the plan, and only online.

## Clarifications
`expense.answerClarification` works in one of two modes, chosen by what the clarification stored:
- **Name queue**, when `pendingNames` is present: the answer resolves one or more names (a relation such as
  "أخويا", or "تخطي" to stop asking about that contact). While names remain, the question is updated and returned.
  When none remain, the sentence is rewritten with "name (relation)" (`enrichTextWithNameRelation`), the pipeline
  runs without asking again, contacts are created and the items are saved in one transaction.
- **Free answer**: the answer is appended to the sentence and the pipeline runs again. Another `clarify` updates
  the question; a result under 70 is refused; anything else is saved.

A question is answered once: the save transaction moves it from `pending` to `resolved` only if it was still
pending (`claimClarification`), so a second tap or a retry saves nothing and gets "اتجاوب قبل كده".

Both modes save through `saveClarifiedItems`, as `expense.create` saves: each item on the date the sentence named,
else the day the question was asked (`clarifiedItemDate`); with the source the sentence came in (`voice` for a
spoken one, whose question stores `source`, else `manual`); with its contact, classification log, direction and
signed amount (`ledgerAmount`); with the rollup delta and the streak in the same transaction. Afterwards muscle
memory, the classification cache and the finance caches are cleared, and the saved items come back (`saved`): the
entry form and the "محتاج ردك" card say what was saved and offer "تراجع", which deletes exactly those ids.

`expense.getPendingClarifications` lists the open questions. The Home record tab shows them under "محتاج ردك"
(`src/components/expenses/PendingQuestionsCard.tsx`): each can be answered there, which saves it, or dropped with
`expense.dismissClarification` (status `ignored`). The live call reads them too and can finish one with the user's
answer ([voice calls](voice-calls.md#the-tools)).

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| How a sentence splits into events, or what counts as planned, negated or a question | `api/lib/financial-event-plan.ts`, `api/lib/negation-detector.ts`, `api/lib/narrative-decomposer.ts` | the benchmark below |
| How a spoken or written amount becomes a number | `api/lib/arabic-number-parser.ts` | `api/lib/arabic-number-parser.test.ts`, the benchmark |
| Words, merchants and phrases that map to categories | `api/lib/rule-engine.ts` (merchant registry, subcategory map), `api/lib/egyptian-dictionary.ts`, `api/lib/taxonomy-adapter.ts` | the benchmark |
| The categories and their subcategories | `contracts/categories.ts#CATEGORIES`, shared with the web app; moving or renaming a pair needs a `LEGACY_TAXONOMY` rule there, which stored rows then follow through the `taxonomy-migration` job ([Money](money.md)) | `api/lib/category-registry.integrity.test.ts`, `src/lib/financial-taxonomy.contract.test.ts`, the benchmark |
| Category aliases and the evidence that refines a category | `api/lib/category-registry.ts` | `api/lib/category-registry.integrity.test.ts`, the benchmark |
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
  `api/lib/classification-golden.test.ts`, `api/lib/everyday-phrases.test.ts` (everyday Egyptian sentences the
  engine used to save wrongly).
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
1. **Gap.** A clarification saves as soon as it is answered; the saved items are shown afterwards with "تراجع"
   rather than for confirmation first. Questions stored before the source was kept save a spoken sentence as `manual`.
2. **Bug.** A receipt's amount on the review card is the first item the pipeline read from the OCR text,
   which can differ from the total the vision model returned, and a base64 image longer than the parser's cap
   is cut short instead of refused (`api/lib/receipt-image-parser.ts#guardImagePayloadSize`), although the
   procedure accepts larger payloads.
3. **Bug.** The voice endpoints count the month differently: `speechToText` from the subscription or sign-up day,
   `parseVoiceExpense` from the first of the calendar month. `parseVoiceExpense` also creates contacts for the
   people it resolves while parsing, before the user saves anything.
4. **Gap.** A category changed on the review card teaches a rule only when the sentence was one item
   (`api/expense-router.ts#reviewCorrection`); in a multi-item sentence it is saved but not learned. `ai.learnWord`, `expense.createCategory` and
   `expense.getCategoryList` have no caller in the web app, and `src/components/expenses/ReceiptCapture.tsx` is
   not rendered anywhere.
5. **Debt.** The comment above the threshold settings in `classifyAdmittedEvents` says the older `confidence_*` keys win;
   the code reads the `parser_*` keys first.

## Related systems
- [Money](money.md): lists, statistics, wallets, budgets, and the rollups these saves feed.
- [AI providers and usage limits](ai-platform.md): plan limits, budgets, routing, the provider chain and model names.
- [Reports, insights and the smart profile](insights.md): the profile and known people the pipeline reads.
- [Bank and wallet messages](bank-messages.md): bank notifications have their own parsers, not this pipeline.
- [Admin console, support and growth tools](admin.md): the rule sandbox and the clarifications tab.
- [AI Center](ai-center.md): the assistant can also propose recording an expense.
