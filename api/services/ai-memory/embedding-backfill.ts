import { and, desc, eq } from "drizzle-orm";
import { aiMemoryEmbeddings, aiMemoryItems } from "../../../db/schema";
import { db } from "../../queries/connection";
import { FireworksEmbeddingClient } from "./embedding-client";
import { loadEmbeddingConfig } from "./embedding-settings";
import { contentHash } from "./text-utils";

export interface EmbeddingSmokeResult {
  ok: boolean;
  model: string;
  dimensions: number;
  vectorLength: number;
  cacheHit: boolean;
  fallback: boolean;
  fallbackReason?: string;
}

export interface BackfillMemoryEmbeddingsInput {
  limit?: number;
  userId?: number;
  userType?: string;
  forceEnabled?: boolean;
  allowFallbackVectors?: boolean;
}

export interface BackfillMemoryEmbeddingsResult {
  scanned: number;
  inserted: number;
  skippedExisting: number;
  skippedFallback: number;
  failed: number;
  model: string;
  dimensions: number;
}

export async function smokeTestEmbeddingEndpoint(): Promise<EmbeddingSmokeResult> {
  const config = await loadEmbeddingConfig("short");
  const enabledConfig = { ...config, enabled: true };
  const client = new FireworksEmbeddingClient(enabledConfig);
  const result = await client.embedText({
    text: "اختبار ذاكرة SmartSpend",
    dimensions: enabledConfig.dimensions,
  });

  return {
    ok: !result.fallback && result.vector.length === enabledConfig.dimensions,
    model: result.model,
    dimensions: result.dimensions,
    vectorLength: result.vector.length,
    cacheHit: Boolean(result.cacheHit),
    fallback: Boolean(result.fallback),
    fallbackReason: result.fallbackReason,
  };
}

export async function backfillMemoryEmbeddings(
  input: BackfillMemoryEmbeddingsInput = {},
): Promise<BackfillMemoryEmbeddingsResult> {
  const config = await loadEmbeddingConfig("memory");
  const enabledConfig = { ...config, enabled: input.forceEnabled || config.enabled };
  const result: BackfillMemoryEmbeddingsResult = {
    scanned: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedFallback: 0,
    failed: 0,
    model: enabledConfig.model,
    dimensions: enabledConfig.dimensions,
  };

  if (!enabledConfig.enabled || !enabledConfig.apiKey) {
    return result;
  }

  const filters = [eq(aiMemoryItems.status, "active")];
  if (input.userId !== undefined) filters.push(eq(aiMemoryItems.userId, input.userId));
  if (input.userType) filters.push(eq(aiMemoryItems.userType, input.userType));

  const rows = await db
    .select({
      id: aiMemoryItems.id,
      userId: aiMemoryItems.userId,
      userType: aiMemoryItems.userType,
      content: aiMemoryItems.content,
    })
    .from(aiMemoryItems)
    .where(and(...filters))
    .orderBy(desc(aiMemoryItems.updatedAt))
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 1000));

  const client = new FireworksEmbeddingClient(enabledConfig);

  for (const row of rows) {
    result.scanned += 1;

    try {
      const [existing] = await db
        .select({ id: aiMemoryEmbeddings.id })
        .from(aiMemoryEmbeddings)
        .where(
          and(
            eq(aiMemoryEmbeddings.memoryItemId, row.id),
            eq(aiMemoryEmbeddings.provider, "fireworks"),
            eq(aiMemoryEmbeddings.model, enabledConfig.model),
            eq(aiMemoryEmbeddings.dimensions, enabledConfig.dimensions),
          ),
        )
        .limit(1);

      if (existing?.id) {
        result.skippedExisting += 1;
        continue;
      }

      const embedded = await client.embedText({
        text: row.content,
        dimensions: enabledConfig.dimensions,
        userId: row.userId,
        userType: row.userType,
      });

      if (embedded.fallback && !input.allowFallbackVectors) {
        result.skippedFallback += 1;
        continue;
      }

      await db
        .insert(aiMemoryEmbeddings)
        .values({
          memoryItemId: row.id,
          userId: row.userId,
          userType: row.userType,
          provider: embedded.provider,
          model: embedded.model,
          dimensions: embedded.dimensions,
          vectorHash: contentHash(embedded.vector.join(",")),
          vector: embedded.vector,
        })
        .onDuplicateKeyUpdate({
          set: {
            vectorHash: contentHash(embedded.vector.join(",")),
            vector: embedded.vector,
          },
        });

      result.inserted += 1;
    } catch (error) {
      result.failed += 1;
      console.warn("[AI Memory] embedding backfill skipped item", {
        memoryItemId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
