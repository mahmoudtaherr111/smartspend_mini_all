/**
 * Fireworks Embedding Client
 * ═══════════════════════════
 * Calls qwen3-embedding-8b on Fireworks.ai for semantic classification.
 *
 * Key findings from testing:
 *  - Raw Arabic accuracy: 87.3%
 *  - With Instruct prefix: 92.1%  ← we use this
 *  - The Instruct prefix is critical for Arabic — without it, the model
 *    collapses all Arabic text into a narrow similarity band (0.85-0.97).
 *
 * Cost: ~$0.02/1M tokens. For 10K daily visits with ~15% needing embedding:
 *   1500 queries × 50 tokens = 75K tokens/day = $0.0015/day = $0.045/month.
 *
 * The client includes:
 *  - Instruct prefix wrapping (required for Arabic accuracy)
 *  - LRU cache for repeated queries (40-60% hit rate expected)
 *  - Batch embedding support (descriptors + queries in one call)
 *  - Graceful error handling (returns null → caller falls back to local engine)
 */

import { LRUCache } from "lru-cache";

const FIREWORKS_EMBEDDING_URL = "https://api.fireworks.ai/inference/v1/embeddings";
const FIREWORKS_EMBEDDING_MODEL = "accounts/fireworks/models/qwen3-embedding-8b";

const INSTRUCT_PREFIX =
  "Instruct: Classify the financial category of this Egyptian Arabic transaction. Query:";

// Cache for query embeddings (24h TTL, 2000 entries max)
const queryEmbeddingCache = new LRUCache<string, number[]>({
  max: 2000,
  ttl: 1000 * 60 * 60 * 24,
});

// Cache for descriptor embeddings (7 days TTL — they don't change)
const descriptorEmbeddingCache = new LRUCache<string, number[]>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24 * 7,
});

// A suspended/unauthorized provider will not recover on the next request.
// Keep the local classifier available and avoid turning each user action into a
// failing upstream call. Cached vectors remain usable while the circuit is open.
let providerUnavailableUntil = 0;
let lastUnavailableStatus: number | null = null;

function isProviderUnavailable(): boolean {
  return Date.now() < providerUnavailableUntil;
}

function markProviderUnavailable(status: number): void {
  // Any 4xx that is not a rate limit or a timeout is a problem with the account or the
  // request, and neither fixes itself in a minute. The list used to be enumerated, and
  // it did not include 412 — which is precisely what Fireworks answers when the account
  // is suspended for an unpaid invoice. Every classification then paid for a call that
  // could not succeed: in one live benchmark run, all 87 of them.
  const cooldownMs =
    status === 429 || status === 408
      ? 60_000
      : status >= 400 && status < 500
        ? 15 * 60_000
        : 0;
  if (!cooldownMs) return;

  const nextUnavailableUntil = Date.now() + cooldownMs;
  if (nextUnavailableUntil > providerUnavailableUntil || lastUnavailableStatus !== status) {
    providerUnavailableUntil = nextUnavailableUntil;
    lastUnavailableStatus = status;
    console.warn(`[Fireworks Embedding] Circuit opened after HTTP ${status} for ${Math.round(cooldownMs / 60_000)} minute(s)`);
  }
}

export interface FireworksEmbeddingResult {
  embedding: number[];
  cached: boolean;
}

/**
 * Get embedding for a single text with Instruct prefix.
 * Results are cached in LRU for 24 hours.
 */
export async function getFireworksEmbedding(
  text: string,
  apiKey: string,
): Promise<FireworksEmbeddingResult | null> {
  const instructText = `${INSTRUCT_PREFIX} ${text}`;
  const cacheKey = `fw:${instructText}`;

  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached) {
    return { embedding: cached, cached: true };
  }
  if (isProviderUnavailable()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(FIREWORKS_EMBEDDING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: FIREWORKS_EMBEDDING_MODEL,
        input: [instructText],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      markProviderUnavailable(resp.status);
      console.warn(
        `[Fireworks Embedding] HTTP ${resp.status}: ${errText.slice(0, 200)}`,
      );
      return null;
    }

    const data: any = await resp.json();
    const embedding: number[] = data.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.warn("[Fireworks Embedding] Empty embedding in response");
      return null;
    }

    queryEmbeddingCache.set(cacheKey, embedding);
    return { embedding, cached: false };
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[Fireworks Embedding] Request timed out (15s)");
    } else {
      console.warn(
        `[Fireworks Embedding] Error: ${err.message || String(err)}`,
      );
    }
    return null;
  }
}

/**
 * Get embeddings for multiple texts in a single API call (batch).
 * More efficient than individual calls when building descriptor index.
 */
export async function getFireworksEmbeddingsBatch(
  texts: string[],
  apiKey: string,
): Promise<(number[] | null)[]> {
  const instructTexts = texts.map((t) => `${INSTRUCT_PREFIX} ${t}`);

  // Check which are cached
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < instructTexts.length; i++) {
    const cacheKey = `fw:${instructTexts[i]}`;
    const cached = descriptorEmbeddingCache.get(cacheKey);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(instructTexts[i]);
    }
  }

  if (uncachedTexts.length === 0) {
    return results;
  }
  if (isProviderUnavailable()) return results;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(FIREWORKS_EMBEDDING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: FIREWORKS_EMBEDDING_MODEL,
        input: uncachedTexts,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      markProviderUnavailable(resp.status);
      console.warn(
        `[Fireworks Embedding Batch] HTTP ${resp.status}: ${errText.slice(0, 200)}`,
      );
      return results;
    }

    const data: any = await resp.json();
    const embeddings: number[][] = data.data?.map((d: any) => d.embedding) || [];

    for (let i = 0; i < embeddings.length; i++) {
      const originalIndex = uncachedIndices[i];
      if (embeddings[i] && Array.isArray(embeddings[i])) {
        results[originalIndex] = embeddings[i];
        const cacheKey = `fw:${uncachedTexts[i]}`;
        descriptorEmbeddingCache.set(cacheKey, embeddings[i]);
      }
    }

    return results;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[Fireworks Embedding Batch] Request timed out (30s)");
    } else {
      console.warn(
        `[Fireworks Embedding Batch] Error: ${err.message || String(err)}`,
      );
    }
    return results;
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Pre-compute and cache descriptor embeddings.
 * Called once at startup. Uses batch API for efficiency.
 */
let descriptorIndex: Array<{
  category: string;
  subCategory: string;
  descriptor: string;
  vector: number[];
}> | null = null;

export async function buildFireworksDescriptorIndex(
  descriptors: Array<{ category: string; subCategory: string; descriptors: string[] }>,
  apiKey: string,
): Promise<void> {
  if (descriptorIndex) return;

  const allDescs: Array<{
    category: string;
    subCategory: string;
    descriptor: string;
  }> = [];
  for (const cat of descriptors) {
    for (const desc of cat.descriptors) {
      allDescs.push({
        category: cat.category,
        subCategory: cat.subCategory,
        descriptor: desc,
      });
    }
  }

  const texts = allDescs.map((d) => d.descriptor);
  const vectors = await getFireworksEmbeddingsBatch(texts, apiKey);

  descriptorIndex = [];
  for (let i = 0; i < allDescs.length; i++) {
    if (vectors[i]) {
      descriptorIndex.push({
        category: allDescs[i].category,
        subCategory: allDescs[i].subCategory,
        descriptor: allDescs[i].descriptor,
        vector: vectors[i]!,
      });
    }
  }

  console.log(
    `[Fireworks Embedding] Built descriptor index: ${descriptorIndex.length} entries`,
  );
}

export function getDescriptorIndex() {
  return descriptorIndex;
}

export function resetFireworksCache() {
  queryEmbeddingCache.clear();
  descriptorEmbeddingCache.clear();
  descriptorIndex = null;
  providerUnavailableUntil = 0;
  lastUnavailableStatus = null;
}
