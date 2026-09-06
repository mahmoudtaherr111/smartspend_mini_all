import { randomUUID } from "node:crypto";
import { persistUsageRows } from "./classification-usage-ledger";
import { businessDateKey } from "../lib/app-time";
import { priceProviderUsage, type ProviderUsage } from "../lib/provider-usage";

/** Same normalized admin accounting contract as text classification; no image, source or credentials. */
export async function recordImageProviderUsage(input: {
  userId: number;
  userType: "local" | "oauth";
  model: string;
  usage: ProviderUsage;
  finishReason: string;
  latencyMs: number;
  cacheHit?: boolean;
}): Promise<void> {
  const operationId = randomUUID();
  // This vision route has no verified DB price/capability binding yet. Unknown cost is explicit in metadata.
  const cost = priceProviderUsage(input.usage);
  const usage = input.usage;
  await persistUsageRows(async () => [
    {
      traceId: operationId,
      userId: input.userId,
      userType: input.userType,
      billingPeriod: businessDateKey().slice(0, 7),
      channel: "image",
      providerSlug: input.cacheHit ? "local" : "gemini",
      modelId: input.model,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      cachedTokens: usage.cachedTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      costUsd: (cost.usd ?? 0).toFixed(8),
      costEgp: "0",
      latencyMs: input.latencyMs,
      httpStatus: input.finishReason === "provider_error" ? 0 : 200,
      finishReason: input.finishReason,
      metadata: {
        accounting: {
          version: 1,
          operationId,
          attempt: 1,
          status: input.cacheHit
            ? "local"
            : input.finishReason === "STOP"
              ? "success"
              : "failed",
          cacheKind: input.cacheHit ? "result_cache" : "provider",
          usage,
          cost,
          exchangeRate: null,
        },
      },
    },
  ]);
}
