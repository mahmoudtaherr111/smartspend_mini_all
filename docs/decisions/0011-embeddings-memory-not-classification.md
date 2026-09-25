# 0011. Gemini embeddings serve memory search, not expense classification

- Status: accepted, implemented in `api/lib/embedding-provider.ts` and `api/services/ai-memory/`; classification is
  unchanged (`api/lib/embedding-engine.ts`).
- Decided and recorded: 2026-09-26.

## Context
Embeddings had two users, both on Fireworks' `qwen3-embedding-8b`: memory search by meaning (off unless a setting
nobody could see was turned on) and a semantic layer in expense classification (`matchSegment`, and a whole-sentence
shortcut that answers instead of the model when it scores 70 or more). The Fireworks account was suspended, so both
had silently stopped. The owner asked to move embeddings to Google's `gemini-embedding-2`, which the app's Gemini keys
reach (free tier, about 90 to 100 texts a minute, a batch counting each text).

Before moving classification, it was measured. On the benchmark's 83 one-item expense sentences
(`api/qa/fixtures`), with the 391 category descriptors embedded by `gemini-embedding-2` (768 dimensions, the
classification task prefix) and each sentence given the category of its nearest descriptor:

- the local engine alone classified 34 correctly;
- `gemini-embedding-2` classified 53 (64%);
- its similarity does not say when it is right: correct answers scored 0.78 to 0.91, wrong ones 0.78 to 0.89.

## Decision
1. Memory search by meaning uses the shared embedding provider — the admin's "embedding" models first, then
   `gemini-embedding-2` — and is on by default.
2. Classification keeps its semantic layer off (it runs only with a Fireworks key the pipeline is given, and that
   account is suspended): the local rules and the model chain classify. A 64% answer with no usable confidence would
   replace the model in the shortcut and lower accuracy; the model chain is what the classification benchmark
   measures.

## Consequences
- Turning an embedding model on for classification needs the same measurement first (the script is a few dozen
  lines over `getBenchmarkCases` and `embedTexts`), and a calibration of its similarity before any threshold is used.
- Building a descriptor index of 391 texts takes about four minutes on a free Gemini key, one reason it should be
  built once and cached per model if classification ever uses it.
