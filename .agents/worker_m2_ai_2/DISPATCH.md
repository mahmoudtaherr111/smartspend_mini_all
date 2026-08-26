# DISPATCH — 2026-08-25T05:12:00Z

## Assignment
You are worker_m2_ai_2.
Your working directory is E:\smartspend_V1_fixed\.agents\worker_m2_ai_2\ (metadata only, no source files).
The workspace root is E:\smartspend_V1_fixed.
The constitution is E:\smartspend_V1_fixed\AGENTS.md.
The user request is E:\smartspend_V1_fixed\.agents\ORIGINAL_REQUEST.md.
The project plan is E:\smartspend_V1_fixed\PROJECT.md.
The AI survey report is E:\smartspend_V1_fixed\.agents\survey_ai_docs_r6_r7\handoff.md.

Mission: Implement Milestone 2 (Hybrid AI Classification Engine Optimization, SMS Input Condensation & Test Suite Hardening).

File Boundaries & Exclusive Ownership:
You own and edit ONLY:
- `api/lib/sms-ai-parser.ts`
- `api/lib/sms-rule-parser.ts`
- `api/lib/smart-pipeline.ts`

Tasks:
1. `api/lib/sms-ai-parser.ts`:
   - Add a deterministic SMS input condensation pre-filter `condenseSmsNotification` before prompt generation: strip non-financial boilerplates (bank greetings, customer service hotlines e.g. `19666`, marketing teasers, disclaimers, repeated whitespace) while retaining the 7 key financial entities (action, amount, currency, merchant/counterparty, card mask, timestamp, balance). This saves 40–70% input tokens per call.
   - Replace hardcoded model string `"gemini-2.0-flash"` with `mapModelName("flash")` imported from `./model-mapper`.
2. `api/lib/sms-rule-parser.ts`:
   - Integrate and export shared SMS text normalization/cleaning logic so both rule-based and AI parsers share consistent, clean text representations.
3. `api/lib/smart-pipeline.ts`:
   - In `smart-pipeline.ts`, when database RAG fetch fails or throws (e.g. database disconnected in offline test environment) or when `options.apiKey` is empty/falsy, fail fast gracefully to deterministic local fallbacks (Layer 1 Muscle Memory, Layer 2 Rules, Layer 3 Vector) rather than attempting network AI retries with exponential backoff.
   - Ensure all tests in `api/lib/classification-golden.test.ts` and `api/lib/comprehensive-classification.test.ts` pass cleanly offline within default timeouts.
