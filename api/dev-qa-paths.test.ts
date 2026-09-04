import { readFileSync } from "fs";
import { resolve } from "path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dev-only browser QA paths", () => {
  it("keeps chat QA prompt and daily-limit bypass development-only", () => {
    const component = source("src/components/ai/AIChatbot.tsx");
    const router = source("api/chat-router.ts");

    expect(component).toContain("import.meta.env.DEV");
    expect(component.indexOf("import.meta.env.DEV")).toBeLessThan(component.indexOf('params.get("ai_qa_prompt")'));
    expect(component).toContain("devQaBypassDailyLimit: true");

    expect(router).toContain("devQaBypassDailyLimit: z.boolean().optional()");
    expect(router).toContain('process.env.NODE_ENV !== "production"');
    expect(router).toContain("!devQaBypassDailyLimit && todayCount >= dailyLimit");
  });

  it("keeps voice QA tool execution development-only and safe-tool-only", () => {
    const component = source("src/components/ai/AIVoiceCall.tsx");
    const router = source("api/ai-router.ts");

    expect(component).toContain("import.meta.env.DEV");
    expect(component.indexOf("import.meta.env.DEV")).toBeLessThan(component.indexOf('params.get("voice_qa_tool")'));
    expect(component).toContain('type VoiceQaToolName = "finance_query" | "memory_search" | "action_draft"');
    expect(component).not.toContain('"action_confirm" | "action_cancel"');

    expect(router).toContain('const VOICE_QA_TOOL_NAMES = ["finance_query", "memory_search", "action_draft"] as const');
    expect(router).toContain('env.NODE_ENV === "production"');
    expect(router).toContain("executeVoiceTool");
    expect(router).toContain("clearVoiceSessionState");
  });

  it("keeps expense and report QA helpers development-only while OAuth never consumes URL tokens", () => {
    const expenseForm = source("src/components/expenses/ExpenseForm.tsx");
    const insights = source("src/components/insights/AIInsights.tsx");
    const authCallback = source("src/pages/AuthCallback.tsx");

    expect(expenseForm).toContain("import.meta.env.DEV");
    expect(expenseForm.indexOf("import.meta.env.DEV")).toBeLessThan(
      expenseForm.indexOf('params.get("expense_qa_text")'),
    );

    expect(insights).toContain("import.meta.env.DEV");
    expect(insights.indexOf("import.meta.env.DEV")).toBeLessThan(
      insights.indexOf('params.get("report_qa_compare_month")'),
    );

    expect(authCallback).toContain("HttpOnly cookie");
    expect(authCallback).not.toContain('searchParams.get("token")');
    expect(authCallback).not.toContain('localStorage.setItem("local_auth_token", token)');
  });

  it("keeps AI Center QA seed and runner reproducible and secret-free", () => {
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    const seed = source("api/qa/ai-center-qa-seed.ts");
    const runner = source("api/qa/ai-center-qa-runner.ts");

    expect(pkg.scripts["qa:seed"]).toBe("tsx api/qa/ai-center-qa-seed.ts");
    expect(pkg.scripts["qa:ai-center"]).toBe("tsx api/qa/ai-center-qa-runner.ts");
    expect(seed).toContain("AI_CENTER_QA_MARKER");
    expect(seed).toContain("ai_memory_embedding_enabled");
    expect(seed).toContain("DEFAULT_EMBEDDING_MODEL");
    expect(seed).not.toMatch(/fw_[A-Za-z0-9]+/);

    expect(runner).toContain("runChatMemoryRetrievalCase");
    expect(runner).toContain("retrieveMemoryContext");
    expect(runner).toContain('embedding:fireworks');
    expect(runner).toContain('retrievalPolicy.embedding === "fireworks_qwen"');
    expect(runner).toContain("docs/AI_CENTER_QA_RUNNER_LAST_RESULT.md");
  });

  it("keeps the classification benchmark runnable and its live pass gated", () => {
    // This guard exists because its absence already cost something: `bench:classify:live`
    // was registered in package.json in stage 0 and the file it points at was written
    // five stages later. The script looked present and did nothing.
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

    expect(pkg.scripts["bench:classify"]).toContain("classification-benchmark.test.ts");
    expect(pkg.scripts["bench:classify:live"]).toBe(
      "tsx api/qa/classification-benchmark-runner.ts --mode=live",
    );
    expect(pkg.scripts["bench:classify:freeze"]).toContain("--freeze");
    expect(pkg.scripts["bench:classify:compare"]).toContain("--compare");

    // Every script must point at a file that exists. `source()` throws if it does not,
    // which is the whole point of reading them here.
    const runner = source("api/qa/classification-benchmark-runner.ts");
    source("api/qa/classification-baseline.ts");
    source("api/lib/classification-benchmark.test.ts");

    // The live pass spends real money, so each gate is named explicitly. Deleting one
    // should fail a test rather than quietly widen who can spend.
    expect(runner).toContain('process.env.CLASSIFY_BENCH_LIVE !== "1"');
    expect(runner).toContain("process.env.VITEST");
    expect(runner).toContain("--confirm-spend");
    expect(runner).toContain("maxTokens");
    expect(runner).toContain("ESTIMATED COST");
    // The ceiling has to be checked before the call; a limit enforced afterwards has
    // not limited anything.
    expect(runner).toContain("spentTokens >= opts.maxTokens");

    // The offline report path is asserted elsewhere in the pipeline; the live one is
    // separate on purpose so a live run cannot overwrite the committed baseline report.
    const report = source("api/qa/classification-report.ts");
    expect(report).toContain("docs/CLASSIFICATION_BENCHMARK_LAST_RESULT.md");
    expect(report).toContain("docs/CLASSIFICATION_BENCHMARK_LIVE_RESULT.md");
  });
});
