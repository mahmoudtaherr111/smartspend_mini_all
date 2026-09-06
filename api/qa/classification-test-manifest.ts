/**
 * Which tests guard the classification path — one list, derived from imports.
 *
 * The first version of the verification command carried a hand-copied list of 19 files
 * taken from a previous handoff. An independent review found 17 more that exercise the
 * same modules and were in no CI job at all: the event gate, the number engine,
 * corrections, muscle memory, taxonomy, model mapping, the LLM router, and the three A2
 * acceptance suites. Editing model selection or the voice quota could go green.
 *
 * A hand list has one failure mode and it is silent: a file appears, nobody adds it, and
 * the command keeps passing while covering less. So the list below is checked against
 * the repository by `classification-test-manifest.test.ts`, which fails when a test file
 * imports the classification surface and appears in neither `INCLUDED` nor `EXCLUDED`.
 * Adding a guard now forces a decision instead of quietly widening the gap.
 *
 * SCOPE_MODULES is the definition of "classification test". Membership is decided by
 * what a file IMPORTS, not by what it is called — `debug-atm.test.ts` reads like scratch
 * work and asserts real behaviour of the intent detector.
 */

/**
 * The modules that make a test file a classification test.
 *
 * Matched as substrings of an import specifier, so `./rule-engine` and
 * `../lib/rule-engine` both count.
 */
export const SCOPE_MODULES: readonly string[] = [
  // Event understanding and extraction
  "smart-pipeline",
  "financial-event-plan",
  "final-acceptance",
  "narrative-decomposer",
  "admissibility-gate",
  "amount-ledger",
  "entity-extractor",
  "arabic-number-parser",
  "negation-detector",
  "normalizer-v2",
  "text-normalizer",
  "arabic-token-match",
  "fuzzy-match",
  // Category resolution
  "rule-engine",
  "intent-detector",
  "egyptian-dictionary",
  "category-registry",
  "taxonomy-ssot",
  "direction-governed-taxonomy",
  "embedding-engine",
  "fireworks-embedding-client",
  "person-resolver",
  // Decision, confidence, learning
  "classification-decision",
  "classification-merge",
  "classification-evidence",
  "classification-prompt",
  "classifier-contract",
  "financial-capture",
  "notification-evidence",
  "sms-router",
  "payment-purpose",
  "receipt-evidence",
  "provider-usage",
  "receipt-image-parser",
  "extended-actions",
  "confidence-calibrator",
  "confidence-calibration.generated",
  "post-classifier-verifier",
  "correction-rules",
  "muscle-memory",
  // Provider routing and the voice gate that feeds the pipeline
  "llm-router",
  "llm-provider-chain",
  "model-mapper",
  "ai-provider-registry",
  "ai-gateway",
  "provider-health",
  "voice-intake-gate",
  "system-settings-registry",
  // The measuring apparatus. Bare names, because a sibling in api/qa imports
  // "./classification-scorer" while a test in api/lib imports "../qa/classification-scorer",
  // and a prefix-qualified entry only matches the second.
  "classification-scorer",
  "classification-system-metrics",
  "classification-core-report",
  "classification-baseline",
  "classification-cases",
  "qa/fixtures",
];

/**
 * Provider keys the command blanks before running anything.
 *
 * `vitest.config.ts` calls `dotenv.config()`, so a developer's real `.env` is loaded into
 * every test process. `e2e-classification.test.ts` reads `FIREWORKS_API_KEY` and passes
 * it to the embedding engine — which is a legitimate opt-in pattern, and which means that
 * on a machine with a real key the "offline" suite would quietly make a paid call.
 *
 * Policing the test files is the wrong lever: any of them may legitimately read a key.
 * The command guarantees the value instead, so being offline is a property of how the
 * suite is invoked rather than a promise each file has to keep.
 */
export const NEUTRALISED_PROVIDER_KEYS: readonly string[] = [
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "NVIDIA_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
];

/**
 * Every in-scope test file the verification command runs.
 *
 * Offline by construction: each either touches no I/O or mocks the boundary itself, and
 * the command blanks every provider key listed above before the first test starts.
 */
export const INCLUDED: readonly string[] = [
  "api/sms-ingest.test.ts",
  "api/services/image-usage-ledger.test.ts",
  "src/components/expenses/FinancialCaptureInbox.test.tsx",
  "api/services/ai-center.creative-smoke.test.ts",
  "api/lib/classification-usage-integration.test.ts",
  "api/services/classification-usage-ledger.test.ts",
  "api/lib/provider-usage.test.ts",
  "api/lib/financial-event-scope.test.ts",
  "api/lib/financial-capture-state.test.ts",
  "api/lib/classification-prompt-context.test.ts",
  "api/lib/admin-model-switch.test.ts",
  "api/lib/admissibility-gate.test.ts",
  "api/lib/ai-routing.test.ts",
  "api/lib/amount-ledger.test.ts",
  "api/lib/arabic-number-parser.test.ts",
  "api/lib/arabic-token-match.test.ts",
  "api/lib/category-registry.integrity.test.ts",
  "api/lib/classification-acceptance.test.ts",
  "api/lib/classification-benchmark.test.ts",
  "api/lib/classification-cache-invalidation.test.ts",
  "api/lib/classification-cache-scope.test.ts",
  "api/lib/classification-evidence.test.ts",
  "api/lib/classification-golden.test.ts",
  "api/lib/classification-prompt-injection.test.ts",
  "api/lib/classifier-contract.test.ts",
  "api/lib/complex-sentences.test.ts",
  "api/lib/comprehensive-classification.test.ts",
  "api/lib/correction-rules.test.ts",
  "api/lib/debug-atm.test.ts",
  "api/lib/debug-atm2.test.ts",
  "api/lib/direction-governed-taxonomy.test.ts",
  "api/lib/e2e-classification.test.ts",
  "api/lib/embedding-engine.test.ts",
  "api/lib/financial-event-pipeline.test.ts",
  "api/lib/financial-event-quality.test.ts",
  "api/lib/financial-event-verification.test.ts",
  "api/lib/fireworks-embedding-client.test.ts",
  "api/lib/learning-loop.test.ts",
  "api/lib/llm-router.test.ts",
  "api/lib/model-mapper.test.ts",
  "api/lib/muscle-memory.regression.test.ts",
  "api/lib/negation-detector.test.ts",
  "api/lib/normalizer-v2.test.ts",
  "api/lib/person-resolver.test.ts",
  "api/lib/provider-route-acceptance.test.ts",
  "api/lib/r1-acceptance.test.ts",
  "api/lib/rule-engine-lexical.test.ts",
  "api/lib/smart-pipeline-failover.test.ts",
  "api/lib/smart-pipeline.test.ts",
  "api/lib/system-settings-registry.test.ts",
  "api/lib/voice-intake-gate.test.ts",
  "api/lib/receipt-image-parser.test.ts",
  "api/qa/classification-core-report.test.ts",
  "api/services/action-runtime/extended-actions.test.ts",
  "api/services/parser-trace.test.ts",
  "src/lib/financial-taxonomy.contract.test.ts",
  "tests/adversarial-challenger-2.test.ts",
];

export interface ExclusionRecord {
  file: string;
  /** Why this in-scope file is not in the command. Must be a reason, not a shrug. */
  reason: string;
}

/**
 * Files that reach the classification surface and are still left out, each with the
 * reason that earned it.
 *
 * These four came from opening the 114 test files the import scan had put out of scope
 * and asking a question the scan cannot: does this test ASSERT on classification, or
 * does it merely reach it through three layers of imports? Thirty-seven reach it
 * transitively; six assert on it; two of those are real guards and are now in the
 * command; these four are not, for the reasons below.
 *
 * The list exists so an exclusion has to be written down rather than made by omission —
 * which is how the original nineteen-file list came to cover less than half of what it
 * claimed.
 */
export const EXCLUDED: readonly ExclusionRecord[] = [
  {
    file: "api/qa/journey-challenge.test.ts",
    reason:
      "New 100-case diagnostic, run separately by qa:classification:journey; known unsolved fact/intent cases are reported as nonzero, never counted in the established core baseline.",
  },
  {
    file: "api/services/financial-capture-store.integration.test.ts",
    reason:
      "Requires dedicated MySQL 8 capture_test on localhost:33071 and explicit RUN_CAPTURE_MYSQL_INTEGRATION=1; run by test:capture:mysql, not an offline test.",
  },
  {
    file: "api/services/action-runtime/index.test.ts",
    reason:
      "Genuinely guards the taxonomy convention at the write boundary — it asserts that expenses.category stores the Arabic name_ar rather than the English id. It is excluded ONLY because one of its three cases fails on main today for an unrelated reason: the test's database mock has no `transaction`, so `executeExpenseCreate` throws `db.transaction is not a function`. Including it would make the classification gate red for a defect G1-R did not cause and is not authorised to fix. Fix the mock, then move this into INCLUDED.",
  },
  {
    file: "api/services/ai-kernel/intent-router.test.ts",
    reason:
      "Belongs to the chat agent, not the expense classifier. It routes a question like «صرفت كام النهارده؟» to a data need; the category it asserts is a query slot, not a classification output. Owned by the unit-tests job.",
  },
  {
    file: "api/services/ai-kernel/agent-golden-contract.test.ts",
    reason:
      "The chat agent's end-to-end contract — intent to data need to resolver to response. It reaches the surface only through `fuzzy-match`, a shared string utility, and asserts nothing about how a transaction is classified. Owned by the unit-tests job.",
  },
  {
    file: "src/providers/trpc.test.ts",
    reason:
      "Tests tRPC client headers and tunnel-bypass removal. A category string appears once as incidental fixture data inside an offline-draft case; nothing in the file would change if the classifier did.",
  },
];

/**
 * Areas outside this command, and the job that owns each.
 *
 * Recorded because "not in this list" and "not tested anywhere" look identical from
 * inside this file, and the difference matters when someone asks what CI covers.
 */
export const OUT_OF_SCOPE_AREAS: ReadonlyArray<{
  pattern: string;
  owner: string;
}> = [
  { pattern: "tests/e2e/**", owner: "the `e2e-tests` job (Playwright)" },
  { pattern: "api/*-router.security.test.ts", owner: "the `unit-tests` job" },
  {
    pattern: "api/services/ai-kernel/**",
    owner: "the chat agent, not the expense classifier",
  },
  {
    pattern: "api/services/voice-kernel/**",
    owner: "the live-call path, a separate pipeline",
  },
  {
    pattern: "src/**",
    owner: "the `unit-tests` job, except the taxonomy contract test",
  },
  {
    pattern: "**/*.integration.test.ts",
    owner: "`npm run test:redis`, opt-in, needs a server",
  },
];

/** Does an import specifier reach the classification surface? */
export function importsScope(specifier: string): boolean {
  return SCOPE_MODULES.some((module) => specifier.includes(module));
}

/** The command's file list, in a stable order. */
export function includedFiles(): string[] {
  return [...INCLUDED].sort();
}
