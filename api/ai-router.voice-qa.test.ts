import { readFileSync } from "fs";
import { resolve } from "path";

describe("AI router voice QA contract", () => {
  const source = readFileSync(resolve(process.cwd(), "api/ai-router.ts"), "utf8");

  it("keeps the browser voice-tool QA path dev-only and on the real voice adapter", () => {
    expect(source).toContain("runVoiceToolQa: aiProcedure");
    expect(source).toContain('env.NODE_ENV === "production"');
    expect(source).toContain("createVoiceSessionState");
    expect(source).toContain("executeVoiceTool");
    expect(source).toContain("summarizeVoiceQaToolResponse");
    expect(source).toContain("finally");
    expect(source).toContain("clearVoiceSessionState");
  });

  it("limits QA execution to safe inspection tools", () => {
    expect(source).toContain('const VOICE_QA_TOOL_NAMES = ["finance_query", "memory_search", "action_draft"] as const');
    expect(source).not.toContain('const VOICE_QA_TOOL_NAMES = ["finance_query", "memory_search", "action_draft", "action_confirm"]');
  });
});
