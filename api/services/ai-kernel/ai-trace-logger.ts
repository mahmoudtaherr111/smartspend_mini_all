import type { AITraceEvent } from "./types";

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function serializeTraceEvent(event: AITraceEvent): Record<string, unknown> {
  return {
    traceId: event.traceId,
    mode: event.mode,
    status: event.status,
    channel: event.channel,
    userId: event.userId,
    userType: event.userType,
    userPlan: event.userPlan,
    conversationId: event.conversationId,
    route: event.intent.kind,
    confidence: event.intent.confidence,
    dataNeeds: event.dataNeeds.map((need) => ({
      id: need.id,
      kind: need.kind,
      priority: need.priority,
      scope: need.scope,
      cache: need.cache,
    })),
    cacheHits: event.cacheHits,
    cost: event.cost,
    estimatedInputTokens: event.contextPack?.estimatedInputTokens,
    latencyMs: event.latencyMs,
    error: event.error,
    metadata: event.metadata,
  };
}

export function logAITrace(event: AITraceEvent): void {
  try {
    console.info("[AI Kernel Trace]", JSON.stringify(serializeTraceEvent(event)));
  } catch (error) {
    console.warn("[AI Kernel Trace] failed_to_serialize", safeError(error));
  }
}
