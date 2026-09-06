import type { PipelineResult } from "../lib/smart-pipeline";

export type ParserTraceRoute = "expense_parse" | "voice_expense_parse";
export type ParserTraceInputChannel = "text" | "voice";
export type ParserFinanceContextSource = "finance.summary" | "fallback_zero";
export type ParserTraceEngine = "classification_engine.v1";
export type ParserTraceAgentBoundary = "independent_classification_engine";

export interface ParserTraceInput {
  route: ParserTraceRoute;
  inputChannel: ParserTraceInputChannel;
  provider: string;
  estimatedInputTokens: number;
  result: PipelineResult;
  latencyMs: number;
  financeContextSource: ParserFinanceContextSource;
  stt?: {
    model: string;
    tokensUsed: number;
    durationSeconds: number;
  };
}

function parseRisk(
  result: Pick<PipelineResult, "decision" | "overallConfidence">,
): "low" | "medium" | "high" {
  if (result.decision === "clarify" || result.overallConfidence < 60) return "high";
  if (result.decision === "review" || result.overallConfidence < 85) return "medium";
  return "low";
}

export function buildParserTrace(input: ParserTraceInput) {
  const attempts = input.result.log.providerRoute?.attempts?.filter((a) => !a.message?.startsWith("skipped:"));
  const cacheHit = input.result.log.routing?.route === "classification_cache_hit";
  const llmCalls = cacheHit ? 0 : attempts?.length ?? (input.result.log.aiResult?.attempted ? 1 : 0);
  const measuredInput = attempts?.reduce((sum, a) => sum + (a.usage?.promptTokens ?? a.promptTokens ?? 0), 0);
  const measuredOutput = attempts?.reduce((sum, a) => sum + (a.usage?.completionTokens ?? a.completionTokens ?? 0), 0);
  const embeddingCalls = input.result.log.embeddingResult?.attempted ? 1 : 0;
  const classifierTool = input.result.parsedBy === "rule_engine" ? "rule_engine" : "classifier.ai";
  const dataNeeds = [
    input.financeContextSource,
    input.inputChannel === "voice" ? "speech.transcription" : null,
    "classification.expense",
  ].filter(Boolean);

  return {
    schemaVersion: 2,
    route: input.route,
    engine: "classification_engine.v1" as ParserTraceEngine,
    engineRole: "expense_classification",
    agentBoundary: "independent_classification_engine" as ParserTraceAgentBoundary,
    tools: ["classification_engine.v1", "smart_pipeline", classifierTool],
    dataNeeds,
    costPolicy: {
      llm: llmCalls > 0 ? "conditional_classifier_fallback" : "skipped",
      embedding: embeddingCalls > 0 ? "candidate_category_lookup" : "skipped",
      sendsRawHistoryToLLM: false,
      usesFinanceSummaryOnly: input.financeContextSource === "finance.summary",
    },
    inputChannel: input.inputChannel,
    provider: input.result.log.providerRoute?.servedBy ?? (llmCalls ? input.provider : "local"),
    model: input.result.actualModelUsed ?? (llmCalls ? input.result.modelUsed : "local"),
    parsedBy: input.result.parsedBy,
    decision: input.result.decision,
    confidence: input.result.overallConfidence,
    itemCount: input.result.items.length,
    llmCalls,
    embeddingCalls,
    inputTokens: llmCalls > 0 ? measuredInput ?? input.estimatedInputTokens : 0,
    outputTokens: llmCalls > 0 ? measuredOutput ?? null : 0,
    usageSource: attempts ? "provider_attempts" : llmCalls ? "estimate" : "local",
    operationId: input.result.usageOperationId,
    resultCacheSavedTokens: input.result.resultCacheSavedTokens ?? 0,
    totalTokens: input.result.tokensUsed,
    cachedTokens: input.result.cachedTokens ?? 0,
    latencyMs: input.latencyMs,
    financeContextSource: input.financeContextSource,
    hallucinationRisk: parseRisk(input.result),
    routing: input.result.log.routing ?? null,
    stt: input.stt,
  };
}
