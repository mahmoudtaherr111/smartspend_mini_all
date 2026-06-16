import { describe, expect, it } from "vitest";
import { buildParserTrace } from "./parser-trace";
import type { PipelineResult } from "../lib/smart-pipeline";

function pipeline(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    items: [{ amount: 50, category: "food", subCategory: "coffee", confidence: 98 } as any],
    decision: "auto_save",
    overallConfidence: 98,
    tokensUsed: 0,
    parsedBy: "rule_engine",
    modelUsed: "accounts/fireworks/models/deepseek-v4-flash",
    processingTimeMs: 20,
    log: {
      aiResult: { attempted: false },
      embeddingResult: { attempted: false },
      routing: { route: "smart_hybrid" },
    },
    ...overrides,
  };
}

describe("parser trace", () => {
  it("reports zero-token local rule-engine parses without phantom LLM input", () => {
    const trace = buildParserTrace({
      route: "expense_parse",
      inputChannel: "text",
      provider: "fireworks",
      estimatedInputTokens: 500,
      result: pipeline(),
      latencyMs: 30,
      financeContextSource: "finance.summary",
    });

    expect(trace).toMatchObject({
      schemaVersion: 2,
      route: "expense_parse",
      engine: "classification_engine.v1",
      agentBoundary: "independent_classification_engine",
      parsedBy: "rule_engine",
      llmCalls: 0,
      embeddingCalls: 0,
      inputTokens: 0,
      totalTokens: 0,
      hallucinationRisk: "low",
      financeContextSource: "finance.summary",
      costPolicy: {
        llm: "skipped",
        embedding: "skipped",
        sendsRawHistoryToLLM: false,
        usesFinanceSummaryOnly: true,
      },
    });
    expect(trace.tools).toEqual(["classification_engine.v1", "smart_pipeline", "rule_engine"]);
    expect(trace.dataNeeds).toEqual(["finance.summary", "classification.expense"]);
  });

  it("reports hybrid voice parses with STT and classifier cost separately", () => {
    const trace = buildParserTrace({
      route: "voice_expense_parse",
      inputChannel: "voice",
      provider: "gemini",
      estimatedInputTokens: 420,
      result: pipeline({
        parsedBy: "hybrid",
        decision: "review",
        overallConfidence: 72,
        tokensUsed: 610,
        log: {
          aiResult: { attempted: true },
          embeddingResult: { attempted: false },
          routing: { route: "smart_hybrid" },
        },
      }),
      latencyMs: 120,
      financeContextSource: "finance.summary",
      stt: {
        model: "whisper-large-v3",
        tokensUsed: 90,
        durationSeconds: 12,
      },
    });

    expect(trace).toMatchObject({
      route: "voice_expense_parse",
      engine: "classification_engine.v1",
      parsedBy: "hybrid",
      llmCalls: 1,
      embeddingCalls: 0,
      inputTokens: 420,
      totalTokens: 610,
      hallucinationRisk: "medium",
      stt: {
        model: "whisper-large-v3",
        tokensUsed: 90,
        durationSeconds: 12,
      },
    });
    expect(trace.tools).toEqual(["classification_engine.v1", "smart_pipeline", "classifier.ai"]);
    expect(trace.dataNeeds).toEqual(["finance.summary", "speech.transcription", "classification.expense"]);
  });
});
