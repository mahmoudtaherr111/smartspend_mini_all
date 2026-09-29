/**
 * The classification result cache: a sentence the user has typed before is answered again
 * without re-running the pipeline or paying a model, and never with an answer that the
 * current state would not give. The rules (docs/decisions/0013-caching-as-one-system.md):
 *
 * 1. The key is everything the answer depends on, not a promise that someone clears it:
 *    the text, the plan, the business scope, the model and thresholds, the code and
 *    calibration versions, and a fingerprint of the user's knowledge — their dictionary and
 *    known people, profile hints, business categories, the settings, their correction rules,
 *    what muscle memory holds, the clarification switch and the month's totals (bucketed,
 *    since they only feed the "higher than usual" check). A change to any of them misses by
 *    construction, in this process and every other, so no write needs to clear anything.
 * 2. Only a complete answer is kept: `auto_save` or `review`, and when the pipeline needed
 *    the model, only if the model answered every clause. A timeout or an outage used to be
 *    stored for seven days and kept the sentence from ever reaching the model again.
 * 3. Values are copied in and out. A caller that changes the result it was handed cannot
 *    change what the next request is served.
 * 4. A hit spends nothing and reports no model call: the attempts of the request that first
 *    produced the answer are removed, so they are not billed to the cost ledger again.
 */
import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import type { PipelineResult } from "./smart-pipeline";

const cache = new LRUCache<string, PipelineResult>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24 * 7,
});

/** Canonical JSON: object keys sorted, so the same content always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && typeof v !== "function")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function stableHash(value: unknown): string {
  return createHash("sha1").update(canonical(value)).digest("hex").slice(0, 20);
}

/**
 * Month totals only decide whether an amount is "higher than usual", so they enter the key
 * in 10% steps: a coffee saved this morning does not make every later sentence miss.
 */
export function totalsBucket(context: { totalIncome?: unknown; totalExpense?: unknown } | undefined): string {
  if (!context) return "none";
  const step = (value: unknown) => {
    const n = Math.max(0, Number(value) || 0);
    return n === 0 ? 0 : Math.floor(Math.log(n + 1) / Math.log(1.1));
  };
  return `${step(context.totalIncome)}/${step(context.totalExpense)}`;
}

export interface ClassificationCacheKeyParts {
  version: string;
  tenant: string;
  plan: string;
  scope: string;
  model: string;
  thresholds: string;
  text: string;
  /** Everything else the answer reads; hashed. */
  knowledge: Record<string, unknown>;
}

export function classificationCacheKey(parts: ClassificationCacheKeyParts): string {
  return [
    "cls",
    parts.version,
    parts.tenant,
    parts.plan,
    parts.scope,
    parts.model,
    parts.thresholds,
    stableHash(parts.knowledge),
    parts.text,
  ].join(":");
}

/** The stored answer, as a copy with no record of model calls. */
export function readCachedClassification(key: string): PipelineResult | null {
  const held = cache.get(key);
  if (!held) return null;
  const copy = structuredClone(held);
  copy.log = { ...copy.log, providerRoute: undefined };
  return copy;
}

/**
 * Keeps a finished answer. `complete` is false when the pipeline needed the model and the
 * model did not answer every clause; such an answer is served now and not kept.
 */
export function storeClassification(key: string, result: PipelineResult, complete: boolean): void {
  if (!complete) return;
  if (result.decision !== "auto_save" && result.decision !== "review") return;
  cache.set(key, structuredClone(result));
}

/** Tests only. */
export function clearClassificationCache(): void {
  cache.clear();
}
