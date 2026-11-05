/**
 * Claude, through Anthropic's own SDK: the one place the server talks to the Claude API.
 *
 * Every purpose the admin can route to a model (classification, bank messages, the chat, reports, the call's
 * thinking tool) may run on Claude once a connector with protocol `anthropic` exists. They all come through here,
 * so the request shape and the thinking policy are written once.
 *
 * What differs from the OpenAI shape, and why it is not sent through an OpenAI-compatible shim:
 *   - the system prompt is a field of its own, not a message;
 *   - the answer is held to a JSON schema by `output_config.format`, which current models enforce;
 *   - current models reject `temperature` and the other sampling parameters, so none is sent;
 *   - thinking is on by default and its tokens count against `max_tokens`. Every answer this app asks for is short
 *     (a category, a reply of a few sentences), so thinking is turned off where the model allows it and kept to the
 *     least effort where it does not, with room added to `max_tokens` so the answer is not cut.
 */
import Anthropic from "@anthropic-ai/sdk";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";

export interface ClaudeTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  apiKey: string;
  /** The connector's base URL; empty or Anthropic's own address uses the SDK's default. */
  baseUrl?: string;
  model: string;
  system?: string;
  messages: ClaudeTurn[];
  /** The longest answer wanted, without thinking; see `maxTokensFor`. */
  maxTokens: number;
  /** A JSON Schema the answer must follow. */
  schema?: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ClaudeResult {
  text: string;
  stopReason: string | null;
  model: string;
  /** Input tokens, cached ones included. */
  promptTokens: number;
  /** Input tokens read from Anthropic's prompt cache. */
  cachedTokens: number;
  /** Output tokens, thinking excluded. */
  completionTokens: number;
  /** Thinking tokens, billed as output. */
  reasoningTokens: number;
}

/**
 * How each model family lets thinking be reduced. Haiku 5.5 accepts `disabled` at effort `high` or below; Sonnet 5.5
 * answers 400 to `disabled` and takes `between_tools` instead (no tools here, so no thinking); Opus 5.5 and Fable
 * think always, and effort is the only control. Older models default to no thinking.
 */
export function thinkingFor(model: string): { thinking?: Anthropic.ThinkingConfigParam; alwaysThinks: boolean; effort: boolean } {
  const id = model.toLowerCase();
  if (/haiku-5/.test(id)) return { thinking: { type: "disabled" }, alwaysThinks: false, effort: true };
  if (/sonnet-5/.test(id)) return { thinking: { type: "between_tools" }, alwaysThinks: false, effort: true };
  if (/opus-5|fable|mythos/.test(id)) return { alwaysThinks: true, effort: true };
  // Older models think only when asked, and not all of them take `effort`.
  return { alwaysThinks: false, effort: /opus-4-[5-9]|sonnet-4-6/.test(id) };
}

/** Room for the thinking a model cannot turn off, so a short answer is not cut at `max_tokens`. */
const THINKING_ROOM = 1024;

export function maxTokensFor(model: string, answerTokens: number): number {
  return Math.max(1, answerTokens) + (thinkingFor(model).alwaysThinks ? THINKING_ROOM : 0);
}

/**
 * JSON Schema the API accepts. Structured outputs reject numeric and length constraints and need
 * `additionalProperties: false` on every object; Gemini's schema dialect (`format: "enum"`, `nullable`) is turned
 * into plain JSON Schema on the way.
 */
export function toClaudeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const DROP = new Set([
    "$schema", "$id", "title", "default", "format", "nullable", "propertyOrdering",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties",
  ]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      if (DROP.has(key)) continue;
      out[key] = key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, walk(child)]))
        : walk(value);
    }
    // A string format the API knows (date, uuid, …) is kept; Gemini's `format: "enum"` is not one.
    if (typeof src.format === "string" && src.format !== "enum") out.format = src.format;
    if (src.nullable === true && typeof out.type === "string") out.type = [out.type, "null"];
    if (out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"))) {
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

const clients = new Map<string, Anthropic>();

function clientFor(apiKey: string, baseUrl?: string): Anthropic {
  // Anthropic's SDK adds `/v1` itself; an address typed with it would be asked for `/v1/v1/messages`.
  const base = (baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  const key = `${base}|${apiKey}`;
  let client = clients.get(key);
  if (!client) {
    // The callers keep their own chain of models and their own deadline, so the SDK's retries would only spend that
    // deadline on one model.
    client = new Anthropic({ apiKey, maxRetries: 0, ...(base && base !== ANTHROPIC_DEFAULT_BASE_URL ? { baseURL: base } : {}) });
    if (clients.size > 32) clients.clear();
    clients.set(key, client);
  }
  return client;
}

/** Turns that alternate and start with the user, as the Messages API wants them. */
export function claudeTurns(messages: Array<{ role: string; content: string }>): { system: string; turns: ClaudeTurn[] } {
  const system: string[] = [];
  const turns: ClaudeTurn[] = [];
  for (const message of messages) {
    if (!message.content) continue;
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    const role = message.role === "assistant" ? "assistant" : "user";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${message.content}`;
    else turns.push({ role, content: message.content });
  }
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", content: "." });
  return { system: system.join("\n\n"), turns };
}

/** One Messages API call. Throws the SDK's typed errors (`Anthropic.APIError` and its subclasses). */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const { thinking, effort } = thinkingFor(req.model);
  const output: Anthropic.OutputConfig = {};
  if (effort) output.effort = "low";
  if (req.schema) output.format = { type: "json_schema", schema: toClaudeSchema(req.schema) };

  const message = await clientFor(req.apiKey, req.baseUrl).messages.create(
    {
      model: req.model,
      max_tokens: maxTokensFor(req.model, req.maxTokens),
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.length ? req.messages : [{ role: "user", content: "." }],
      ...(thinking ? { thinking } : {}),
      ...(Object.keys(output).length ? { output_config: output } : {}),
    },
    { timeout: Math.max(1, req.timeoutMs), maxRetries: 0, ...(req.signal ? { signal: req.signal } : {}) },
  );

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  const usage = message.usage;
  const cachedTokens = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cachedTokens + (usage.cache_creation_input_tokens ?? 0);
  const reasoningTokens = usage.output_tokens_details?.thinking_tokens ?? 0;
  return {
    text,
    stopReason: message.stop_reason,
    model: message.model,
    promptTokens,
    cachedTokens,
    completionTokens: Math.max(0, usage.output_tokens - reasoningTokens),
    reasoningTokens,
  };
}

/** The models a key can use, for the console's model picker. */
export async function listClaudeModels(apiKey: string, baseUrl?: string): Promise<Array<{ id: string; name: string; contextWindow?: number }>> {
  const models: Array<{ id: string; name: string; contextWindow?: number }> = [];
  for await (const model of clientFor(apiKey, baseUrl).models.list({ limit: 100 })) {
    const info = model as unknown as { id: string; display_name?: string; max_input_tokens?: number };
    models.push({ id: info.id, name: info.display_name || info.id, contextWindow: info.max_input_tokens });
  }
  return models;
}

export { Anthropic };
