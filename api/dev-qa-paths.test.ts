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

  it("keeps expense, report, and local-token QA helpers development-only", () => {
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

    expect(authCallback).toContain("import.meta.env.DEV");
    expect(authCallback).toContain('searchParams.get("local") === "1"');
    expect(authCallback.indexOf("import.meta.env.DEV")).toBeLessThan(
      authCallback.indexOf('localStorage.setItem("local_auth_token", token)'),
    );
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
});
