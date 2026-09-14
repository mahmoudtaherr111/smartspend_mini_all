# 0003. Local-first classification; a model only chooses categories

- Status: in effect
- Introduced: release v2.1.0, commit 33795ec, 2026-09-05 (see `docs/releases/v2.1.0-classification-core-2026-09-05.md`)
- Recorded: 2026-09-14, from the code and that release note.

## Context
People describe spending in free Egyptian Arabic, typed or spoken. The costly mistakes are a wrong amount, a wrong
direction (money in or out), or saving something that did not happen: a negated, planned or questioned purchase. Model
calls add cost and latency, and a model can invent facts.

## Decision
- Deterministic code decides whether a finished transaction exists. `api/lib/financial-event-plan.ts` splits the text
  into events and keeps negated, planned and question sentences out; amounts, direction and people are extracted locally.
- Only clauses the local path could not settle are sent to a model, and the model may only name a category for them. It
  cannot add an event, change an amount or flip a direction (`api/lib/classifier-contract.ts`,
  `api/lib/classification-merge.ts`).
- Confidence is calibrated per item. A group is saved automatically only when its weakest item qualifies, and a blocker
  raised by one layer survives every later layer (`api/lib/final-acceptance.ts`).
- A provider route is a complete unit (provider, model, key and protocol) with a deadline for the whole trip and a
  circuit breaker per route (`api/lib/llm-provider-chain.ts`, `api/lib/llm-router.ts`).

## Consequences
- `api/lib/classification-acceptance.test.ts` and `api/lib/provider-route-acceptance.test.ts` defend these rules through
  the real entry points; a change that breaks one of them is a change to this decision.
- Accuracy is measured separately by the classification benchmark (`npm run bench:classify`).
- A sentence the local path cannot read ends in review or a question rather than in a model's guess about amounts.
- The release note lists what this did not cover: currency and date persistence, correction learning, and idempotency
  across every ingestion path.
