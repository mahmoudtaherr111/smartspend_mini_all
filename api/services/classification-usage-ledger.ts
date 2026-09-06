import { randomUUID } from "node:crypto";
import { aiTokenLedgers } from "../../db/schema";
import { db } from "../queries/connection";
import { businessDateKey } from "../lib/app-time";
import { getSystemSettings } from "../lib/settings-cache";
import {
  localUsage,
  normalizeProviderUsage,
  type UsageCost,
} from "../lib/provider-usage";
import type { PipelineInput, PipelineResult } from "../lib/smart-pipeline";

export const LEDGER_WAIT_MS = 250;
const MAX_PENDING_WRITES = 64;
let pendingWrites = 0;

/** Pure, inspectable construction; no prompts, contacts, API keys or financial text. */
export function classificationLedgerRows(
  input: Pick<PipelineInput, "userId" | "userType">,
  result: PipelineResult,
  operationId: string,
  exchangeRate: number | null,
  now = new Date(),
) {
  const cacheHit = result.log.routing?.route === "classification_cache_hit";
  const attempts = cacheHit ? [] : (result.log.providerRoute?.attempts ?? []);
  const rows = attempts.filter((a) => !a.message?.startsWith("skipped:"));
  const entries = rows.length ? rows : [null];
  return entries.map((attempt, index) => {
    const usage =
      attempt?.usage ??
      (attempt
        ? normalizeProviderUsage({
            usage: {
              prompt_tokens: attempt.promptTokens,
              completion_tokens: attempt.completionTokens,
              total_tokens: attempt.totalTokens,
              prompt_tokens_details: { cached_tokens: attempt.cachedTokens },
            },
          })
        : localUsage());
    const cost: UsageCost =
      attempt?.cost ??
      (attempt
        ? { usd: null, source: "unavailable" }
        : { usd: 0, source: "local" });
    return {
      traceId: `${operationId}:${index}`,
      userId: input.userId,
      userType: input.userType,
      billingPeriod: businessDateKey(now).slice(0, 7),
      channel: "parse",
      providerId: attempt?.providerId ?? null,
      providerSlug: attempt?.slug ?? "local",
      modelId: attempt?.model ?? (cacheHit ? "result_cache" : "local_rules"),
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      cachedTokens: usage.cachedTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      costUsd: (cost.usd ?? 0).toFixed(8),
      costEgp: (cost.usd !== null && exchangeRate !== null
        ? cost.usd * exchangeRate
        : 0
      ).toFixed(6),
      latencyMs: attempt?.latencyMs ?? result.processingTimeMs,
      httpStatus: attempt?.status ?? (attempt && !attempt.ok ? 0 : 200),
      finishReason: attempt?.finishReason ?? attempt?.failure ?? "local",
      metadata: {
        accounting: {
          version: 1,
          operationId,
          attempt: index + 1,
          status: attempt ? (attempt.ok ? "success" : "failed") : "local",
          cacheKind: cacheHit
            ? "result_cache"
            : attempt
              ? "provider"
              : "local_rules",
          resultCacheSavedTokens: cacheHit
            ? (result.resultCacheSavedTokens ?? 0)
            : 0,
          usage,
          cost,
          exchangeRate,
        },
      },
    };
  });
}

/** Shared bounded telemetry writer. This is not a durable billing outbox. */
export async function persistUsageRows(
  makeRows: () => Promise<Array<typeof aiTokenLedgers.$inferInsert>>,
): Promise<void> {
  if (pendingWrites >= MAX_PENDING_WRITES) {
    console.warn(
      "[ClassificationUsage] Ledger backlog full; measurement not persisted",
    );
    return;
  }
  pendingWrites++;
  const persist = async () => {
    try {
      await db.insert(aiTokenLedgers).values(await makeRows());
    } catch {
      console.warn("[ClassificationUsage] Ledger write failed");
    } finally {
      pendingWrites--;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      persist(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          console.warn(
            "[ClassificationUsage] Ledger write pending beyond response budget",
          );
          resolve();
        }, LEDGER_WAIT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recordClassificationUsage(
  input: PipelineInput,
  result: PipelineResult,
): Promise<void> {
  if (
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0 ||
    !["oauth", "local"].includes(input.userType)
  )
    return;
  const operationId = randomUUID();
  result.usageOperationId = operationId;
  await persistUsageRows(async () => {
    const settings = await getSystemSettings();
    const fx = Number(settings.usd_to_egp_rate);
    return classificationLedgerRows(
      input,
      result,
      operationId,
      Number.isFinite(fx) && fx > 0 ? fx : null,
    );
  });
}
