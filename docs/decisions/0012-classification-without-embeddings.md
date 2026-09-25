# 0012. Expense classification has no semantic (embedding) layer

- Status: accepted, implemented by removing the classification embedding engine, its Fireworks client and the
  unused per-plan route helper; the rule engine and `api/lib/smart-pipeline.ts` no longer call them.
- Decided and recorded: 2026-09-26.

## Context
The rule engine ended with a semantic fallback: a local character n-gram index over 39 category descriptions (31 of
them named with categories that no longer exist), then Fireworks embeddings when a key was given. The pipeline also had
a whole-sentence shortcut that took the nearest descriptor instead of the model and turned only the first amount into
an item. Decision [0011](0011-embeddings-memory-not-classification.md) had measured embeddings for classification at
64% with a similarity that cannot tell right from wrong, and left the layer off; the Fireworks account is suspended.

## Decision
1. The layer and the shortcut are removed. A sentence the rules cannot place goes to the model chain, which the
   classification benchmark measures, or to review.
2. The two benchmark sentences only the n-gram index placed now have their words in the synonym graph (أوفر تايم,
   شغل جانبي). The benchmark is unchanged: dev 0.978, frozen 0.826.
3. Embeddings keep serving memory search (0011).

## Consequences
- One less layer that answered with a made-up confidence (`embedding` evidence) and a network call per amount.
- Bringing embeddings back to classification needs 0011's measurement and a calibrated threshold first.
