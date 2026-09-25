/**
 * Text embeddings for the app, from the providers the admin assigns to the purpose "embedding" in the console (any
 * provider: Google's native API, or the OpenAI-compatible shape OpenAI, OpenRouter and Fireworks share), in their
 * priority order, then Google's `gemini-embedding-2` with the Gemini keys (`ai_embedding_model` overrides the model).
 * A provider that is out of quota, failing or too slow is rested for a while and the next one answers; with none left
 * the caller gets null and falls back to what it does without vectors.
 *
 * Vectors from different models are not comparable: callers store and compare them per model, which every answer
 * names.
 */
import { env } from "./env";
import { resolveAdminRoutes } from "./ai-gateway";
import { getSystemSettings } from "./settings-cache";
import { createLogger } from "./log";

const log = createLogger("embedding-provider");

export type EmbeddingTask = "query" | "document" | "classification";

export interface EmbeddingRoute {
  slug: string;
  protocol: "gemini" | "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  providerId: number | null;
}

export interface EmbeddingBatch {
  vectors: number[][];
  model: string;
  provider: string;
  /** Characters sent, for a cost estimate: embedding APIs rarely report tokens. */
  characters: number;
}

export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const TIMEOUT_MS = 8_000;
/** Google's batch endpoint takes up to 100 texts a request. */
const BATCH = 100;

const restingUntil = new Map<string, number>();

/** One rest per key and model: two keys of the same provider rest apart. */
const restKey = (route: EmbeddingRoute) => `${route.slug}:${route.model}:${route.apiKey.slice(-6)}`;

function rest(route: EmbeddingRoute, status: number): void {
  const ms = status === 429 || status === 408 || status >= 500 ? 60_000 : [401, 402, 403, 412].includes(status) ? 15 * 60_000 : 0;
  if (ms) restingUntil.set(restKey(route), Date.now() + ms);
}

function resting(route: EmbeddingRoute): boolean {
  return (restingUntil.get(restKey(route)) ?? 0) > Date.now();
}

/** The admin's embedding routes, every plan's, in priority order; then Google with each Gemini key. */
export async function embeddingRoutes(): Promise<EmbeddingRoute[]> {
  const routes: EmbeddingRoute[] = [];
  const seen = new Set<string>();
  for (const tier of ["free", "pro", "ultra"] as const) {
    const set = await resolveAdminRoutes("embedding", tier).catch(() => ({ routes: [] }));
    for (const route of set.routes) {
      if (route.protocol !== "gemini" && route.protocol !== "openai") continue;
      const key = `${route.slug}:${route.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ slug: route.slug, protocol: route.protocol, baseUrl: route.baseUrl, apiKey: route.apiKey, model: route.model, providerId: route.providerId });
    }
  }
  const settings = await getSystemSettings();
  // The setting names Google's model; a value from another provider (an older Fireworks one) would only 404 here.
  const configured = (settings.ai_embedding_model || "").replace(/^models\//, "");
  const model = /^gemini-/.test(configured) ? configured : DEFAULT_EMBEDDING_MODEL;
  const keys = [...new Set([settings.ai_api_key || env.GEMINI_API_KEY || "", settings.ai_api_key_2 || ""].filter(Boolean))];
  // Both keys reach the same model, so their vectors are one family: both are "gemini".
  for (const apiKey of keys) routes.push({ slug: "gemini", protocol: "gemini", baseUrl: GEMINI_BASE, apiKey, model, providerId: null });
  return routes;
}

/** The text as the model expects a task to be stated. */
export function taskText(model: string, task: EmbeddingTask, text: string): string {
  if (/embedding-2/.test(model)) {
    if (task === "document") return `title: none | text: ${text}`;
    return `task: ${task === "classification" ? "classification" : "search result"} | query: ${text}`;
  }
  if (/qwen3-embedding/i.test(model) && task !== "document") {
    return task === "classification"
      ? `Instruct: Classify the financial category of this Egyptian Arabic transaction. Query:${text}`
      : `Instruct: Given a question, retrieve what the user said before that answers it. Query:${text}`;
  }
  return text;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

async function callGemini(route: EmbeddingRoute, texts: string[], dimensions: number, task: EmbeddingTask): Promise<number[][]> {
  const model = route.model.replace(/^models\//, "");
  const taskType = task === "document" ? "RETRIEVAL_DOCUMENT" : task === "classification" ? "CLASSIFICATION" : "RETRIEVAL_QUERY";
  const response = await fetch(`${route.baseUrl.replace(/\/+$/, "")}/v1beta/models/${model}:batchEmbedContents`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": route.apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text: taskText(model, task, text) }] },
        output_dimensionality: dimensions,
        // The older model takes the task as a field instead of in the text.
        ...(/embedding-2/.test(model) ? {} : { taskType }),
      })),
    }),
  });
  if (!response.ok) throw Object.assign(new Error(`embedding_http_${response.status}`), { status: response.status });
  const body = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
  const vectors = (body.embeddings ?? []).map((item) => item.values ?? []);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) throw new Error("embedding_bad_answer");
  // gemini-embedding-2 normalizes a shortened vector itself; the older model does not.
  return /embedding-2/.test(model) ? vectors : vectors.map(normalize);
}

async function callOpenAiShape(route: EmbeddingRoute, texts: string[], dimensions: number, task: EmbeddingTask): Promise<number[][]> {
  const response = await fetch(`${route.baseUrl.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${route.apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ model: route.model, input: texts.map((text) => taskText(route.model, task, text)), dimensions }),
  });
  if (!response.ok) throw Object.assign(new Error(`embedding_http_${response.status}`), { status: response.status });
  const body = (await response.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
  const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = rows.map((row) => row.embedding ?? []);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) throw new Error("embedding_bad_answer");
  return vectors;
}

/** Embeds the texts with the first provider that answers, or returns null when none does. */
export async function embedTexts(
  texts: string[],
  options: { dimensions: number; task: EmbeddingTask; routes?: EmbeddingRoute[] },
): Promise<EmbeddingBatch | null> {
  if (!texts.length) return { vectors: [], model: "", provider: "", characters: 0 };
  const routes = options.routes ?? (await embeddingRoutes());
  for (const route of routes) {
    if (resting(route)) continue;
    try {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += BATCH) {
        const chunk = texts.slice(start, start + BATCH);
        vectors.push(...(route.protocol === "gemini"
          ? await callGemini(route, chunk, options.dimensions, options.task)
          : await callOpenAiShape(route, chunk, options.dimensions, options.task)));
      }
      return { vectors, model: route.model.replace(/^models\//, ""), provider: route.slug, characters: texts.reduce((sum, text) => sum + text.length, 0) };
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      rest(route, status || 500);
      log.warn({ event: "embedding.route_failed", provider: route.slug, model: route.model, status }, "Embedding provider failed; trying the next");
    }
  }
  return null;
}
