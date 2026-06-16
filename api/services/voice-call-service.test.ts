import { readFileSync } from "fs";
import { resolve } from "path";
import {
  buildVoiceToolLimitResponse,
  normalizeVoiceToolResponse,
  shouldExecuteLiveVoiceTool,
  summarizeVoiceToolResponse,
} from "./voice-call-service";

describe("voice call service phase 0 smoke", () => {
  it("keeps JSON tool results structured for Gemini Live", () => {
    expect(normalizeVoiceToolResponse('{"total":420,"currency":"EGP"}')).toEqual({
      result: { total: 420, currency: "EGP" },
    });
  });

  it("wraps compressed text tool results without throwing", () => {
    expect(normalizeVoiceToolResponse("total_expense: 420\ncount: 3")).toEqual({
      result_text: "total_expense: 420\ncount: 3",
    });
  });

  it("summarizes voice tool results for UI trace without exposing raw facts", () => {
    const summary = summarizeVoiceToolResponse("memory_search", {
        ok: true,
        dataNeeds: [{ kind: "memory.search" }],
        facts: [
          { label: "memory_1", value: "private long memory" },
          { label: "memory_2", value: "another private memory" },
        ],
        artifacts: [],
        cacheHits: ["embedding:query_embedded", "embedding:fireworks", "embedding:rows:22"],
        result: { errors: [] },
      });

    expect(summary).toMatchObject({
      toolName: "memory_search",
      ok: true,
      dataNeeds: ["memory.search"],
      factCount: 2,
      artifactCount: 0,
      cacheHits: ["embedding:query_embedded", "embedding:fireworks", "embedding:rows:22"],
      embeddingCalls: 1,
      embeddingApiStatus: "fireworks_live_call",
      error: undefined,
      errors: [],
    });
    expect(summary.cacheRuntime).toEqual(
      expect.objectContaining({
        backend: expect.any(String),
        redisConfigured: expect.any(Boolean),
        redisConnected: expect.any(Boolean),
        memoryEntries: expect.any(Number),
      }),
    );
  });

  it("does not charge an embedding call when voice memory is served from cache", () => {
    const summary = summarizeVoiceToolResponse("memory_search", {
      ok: true,
      dataNeeds: [{ kind: "memory.search" }],
      facts: [{ label: "memory_1", value: "cached memory" }],
      artifacts: [],
      cacheHits: [
        "memory_cache:hit:memory",
        "embedding:query_embedded",
        "embedding:fireworks",
        "embedding:rows:22",
      ],
      result: { errors: [] },
    });

    expect(summary).toMatchObject({
      toolName: "memory_search",
      ok: true,
      dataNeeds: ["memory.search"],
      factCount: 1,
      cacheHits: [
        "memory_cache:hit:memory",
        "embedding:query_embedded",
        "embedding:fireworks",
        "embedding:rows:22",
      ],
      embeddingCalls: 0,
      embeddingApiStatus: "semantic_result_cache_hit",
    });
  });

  it("summarizes blocked live voice tool calls without charging embeddings", () => {
    const response = buildVoiceToolLimitResponse("memory_search", 1);
    const summary = summarizeVoiceToolResponse("memory_search", response);

    expect(summary).toMatchObject({
      toolName: "memory_search",
      ok: false,
      dataNeeds: [],
      factCount: 0,
      artifactCount: 0,
      cacheHits: [],
      embeddingCalls: 0,
      embeddingApiStatus: "skipped",
      error: "voice_tool_limit_exceeded:1",
      errors: ["voice_tool_limit_exceeded:1"],
    });
  });

  it("counts retrieval and draft voice tools toward the live tool limit", () => {
    expect(
      shouldExecuteLiveVoiceTool({
        toolName: "finance_query",
        executedToolCalls: 0,
        maxToolRounds: 1,
      }),
    ).toMatchObject({
      execute: true,
      countsTowardLimit: true,
      maxToolRounds: 1,
      reason: "within_limit",
    });

    expect(
      shouldExecuteLiveVoiceTool({
        toolName: "memory_search",
        executedToolCalls: 1,
        maxToolRounds: 1,
      }),
    ).toMatchObject({
      execute: false,
      countsTowardLimit: false,
      maxToolRounds: 1,
      reason: "tool_limit_exceeded",
    });

    expect(
      shouldExecuteLiveVoiceTool({
        toolName: "action_draft",
        executedToolCalls: 1,
        maxToolRounds: 1,
      }),
    ).toMatchObject({
      execute: false,
      countsTowardLimit: false,
      reason: "tool_limit_exceeded",
    });
  });

  it("allows voice action confirmation and cancellation after the tool limit is reached", () => {
    expect(
      shouldExecuteLiveVoiceTool({
        toolName: "action_confirm",
        executedToolCalls: 1,
        maxToolRounds: 1,
      }),
    ).toMatchObject({
      execute: true,
      countsTowardLimit: false,
      maxToolRounds: 1,
      reason: "confirmation_or_cancel",
    });

    expect(
      shouldExecuteLiveVoiceTool({
        toolName: "action_cancel",
        executedToolCalls: 99,
        maxToolRounds: 1,
      }),
    ).toMatchObject({
      execute: true,
      countsTowardLimit: false,
      maxToolRounds: 1,
      reason: "confirmation_or_cancel",
    });
  });

  it("enforces maxToolRounds before executing live voice tools", () => {
    const source = readFileSync(resolve(process.cwd(), "api/services/voice-call-service.ts"), "utf8");

    expect(source).toContain("shouldExecuteLiveVoiceTool({");
    expect(source).toContain("executedToolCalls: voiceToolCallCount");
    expect(source).toContain("buildVoiceToolLimitResponse(toolName, toolDecision.maxToolRounds)");
    expect(source).toContain("continue;");
    expect(source.indexOf("shouldExecuteLiveVoiceTool({")).toBeLessThan(
      source.indexOf("executeVoiceTool({"),
    );
    expect(source.indexOf("toolDecision.countsTowardLimit")).toBeLessThan(
      source.indexOf("executeVoiceTool({"),
    );
  });

  it("keeps the live voice websocket on the shared voice kernel, not legacy chat tools", () => {
    const source = readFileSync(resolve(process.cwd(), "api/services/voice-call-service.ts"), "utf8");

    expect(source).toContain("VOICE_TOOL_DECLARATIONS");
    expect(source).toContain("buildVoiceHotContext");
    expect(source).toContain("buildVoiceSystemPrompt");
    expect(source).toContain("executeVoiceTool({");
    expect(source).toContain("prefetchVoiceTurnContext");
    expect(source).toContain("persistVoiceCallArchive");
    expect(source).not.toContain("TOOL_DEFINITIONS.map");
    expect(source).not.toContain("executeTool(toolName");
  });
});
