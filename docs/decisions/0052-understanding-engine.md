# 0052: A model reads the sentence, the code verifies the reading

Date: 2026-11-11
Status: accepted; being built in steps. "Where it stands" at the end says what serves users today.

## Context
A sentence a person types or dictates was read by a keyword engine that decided first and saved on its own
(`api/lib/smart-pipeline.ts`, decision [0003](0003-local-first-classification.md)). A model was asked only about
clauses the keywords admitted they could not place, and could only name a category: amounts, direction, the split
into events, people and dates stayed with regular expressions.

On 160 everyday sentences written for this review and run through the local path (`api/qa/understanding/dev-set.json`
holds them with their labels):
- 107 were saved without a model or a review, and at least 11 of those were plainly wrong. «دفعت القسط التاني للمدرسة
  8000» was filed under instalments and interest; «اتبرعت ب 100 لمستشفى 57357» also saved a 57,357 health expense;
  «اتخصم 500 ضرايب من المرتب» was saved as 500 of salary income; «كتبت الكتاب ودفعت للمأذون 3000» as books.
- 6 clear sentences were answered with a question. «قسط الشقة 7000» was asked for its amount, because a number after
  «شقة» is taken for a flat's number unless a listed word precedes it (`api/lib/entity-extractor.ts`).
- Every wrong save carried a confidence of 90 or 95, the same as the right ones. The table that turns evidence into
  that number was measured on 87 hand-written cases (`api/lib/confidence-calibration.generated.ts`), and one keyword
  match lands on 0.898, which rounds to the auto-save line.
- A model's answer always went to review (`api/lib/classification-merge.ts`), a keyword's did not: the more capable
  reader was the less trusted one, and it never saw the sentences the keywords were wrong but sure about.

The cause is not a missing rule. A word list cannot tell «قسط المدرسة» from «قسط القرض», and every list added for one
sentence breaks another. The benchmark could not show it: its cases were written beside the rules they test.

Under the engine, the category field itself mixed five questions: what the money was for (أكل وشرب), who it went to
(العائلة), how it was paid (تحويل/انستاباي), how it was financed (أقساط) and whether it was spending at all (تحويل).
One sentence therefore had several defensible answers, which no reader can be consistent about.

Bank messages went through the same journey and ended in decision
[0049](0049-one-capture-path-model-decides.md): the model reads, the code keeps it honest.

## Decision
1. **A reading is a model's, and nothing in it is trusted.** One call returns the sentence's finished money events
   as JSON (`api/lib/understanding/contract.ts`): for each, the person's own words, the amount, the nature of the
   money (`kind` and `flow`, the ledger's vocabulary of `contracts/ledger-movement.ts`), the purpose (a category and
   subcategory id), the person and their role, a reference to one of the user's commitments and wallets, and a date
   when the sentence names another day. It also returns the clauses that are not finished events, every number that
   is not money with its role, and at most one question.
2. **The code verifies what can be verified exactly, and reads no words for meaning**
   (`api/lib/understanding/guard.ts`). An amount must be a number the code itself reads in the sentence, with the
   Arabic number parser as an independent witness, or a simple derivation of such numbers; every number in the
   sentence must be an event's amount, a named role, or inside a clause set aside; a quote must be the person's
   words; a category must exist and allow that kind of money; a reference must be one that was offered; a date must
   be real and not in the future. A failed check does not correct the reading: it puts a named flag on the event.
3. **No confidence numbers.** An event is clean, or it carries flags. A clean, ordinary event is saved and the app
   says what was saved, with undo. A flagged event, a large amount in a category the user never saved, a derived
   amount, an entry dated on another day, or a loan to someone the user has not named is shown first. A question is
   asked only when nothing can be recorded without the answer (`api/lib/understanding/policy.ts`). The limits are
   settings.
4. **A transaction has independent dimensions.** Purpose is the category. The person is the contact, the means is
   the wallet, the obligation is the commitment, and whether money was spent, earned or only moved is the ledger
   kind. An instalment is filed under what it pays for and linked to its commitment: «قسط المدرسة» is education.
5. **Taxonomy v2** (`contracts/taxonomy.ts`) is that purpose list: ids as identity, short Egyptian names as display
   text, a guide line per category and subcategory that says what belongs and what does not. The guide builds the
   model's prompt (`api/lib/understanding/prompt.ts`), so the taxonomy and what the model is told cannot drift
   apart. The person categories, the payment rails and "instalment" as a purpose are not in it; groceries and
   eating out, the car and paid rides, charity and gifts are separate; family support, building fees, marriage,
   work rent, pension and rent received have a place.
6. **Stored rows keep today's names for now** (`api/lib/understanding/bridge.ts`). The ledger, budgets, statistics,
   debts and both apps store and compare the Arabic names of `contracts/categories.ts`, and loan and gam3eya standing
   is read from those names. The bridge turns every v2 answer into a stored pair, a row type and a direction; a test
   holds that every v2 pair lands on a pair the ledger knows. The v2 ids travel with the reading, so no information
   is lost for the day stored rows carry ids.
7. **What the user taught is the only shortcut.** Their corrections and words go to the model as context and win;
   a sentence they saved the same way before may be answered without a model, and still passes the guard. There is
   no shared word list that answers on its own.
8. **Providers are rows, not code.** The reading goes through the existing chain (`api/lib/llm-router.ts`) with the
   admin's models first. The engine names no vendor; the same schema is valid for Gemini, OpenAI-compatible strict
   JSON Schema and Anthropic, because every field is required and has an explicit "nothing" value.
9. **Quality is measured on sentences the prompt was not written against.** The development set is open and never
   reported as a held-out number. The harness (`api/qa/understanding/`) measures the share of automatic saves that
   are wrong, the share of sentences that end in a question, each field's accuracy, tokens and time, one request at
   a time under a requests-per-minute limit, so it runs on small provider quotas.

## Consequences
- A sentence the system has not seen from this user costs one model call and its latency. A provider outage means
  the sentence waits in the phone's outbox instead of being guessed at by rules.
- The wrong-save rate is bounded by what the guard cannot check: a wrong category, kind or flow on an event whose
  numbers and words are all true. That is what the evaluation measures and what the policy's "show first" rules are
  tuned against.
- The names of the user's commitments and of their people go to the model provider with the sentence. Production
  needs a provider tier that does not train on requests, and the consent text has to say so, as for bank messages.
- Decision [0003](0003-local-first-classification.md) and [0015](0015-roles-before-categories.md) stop describing
  the path once every channel is served by the engine; decision [0012](0012-classification-without-embeddings.md)
  stands.

## What comes next (each is its own change)
- One recording service for every channel (typed text, voice, receipts, the live call, the chat action,
  clarification answers), with the engine behind a setting until it is measured.
- A commitment reference from the reading enters the strict matcher of decision
  [0051](0051-commitments-ecosystem.md) as one more way a commitment is named; its other checks do not change.
- Stored rows and both apps move to ids, and the app reads the taxonomy from the server.
- Speech-to-text behind admin routes like the text models.
- The rule engine, its lexicon, its calibration table and its benchmark are removed.

## Where it stands
- Built and tested without a model (`api/lib/understanding/`): taxonomy v2, the reply contract and its
  parser, the number and quote readers, the guard, the policy, the prompt, the bridge, the user's context for a
  reading, route resolution and the engine that runs one reading end to end.
- The evaluation harness is built and tested with a fake model (`api/qa/understanding/`, `npm run eval:understand`).
- Not serving any channel yet: `ai.parseExpense` and the other entry points still run the rule engine.
- Not measured against a model yet: no provider key was available where this was built.
