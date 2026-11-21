import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeTurns, maxTokensFor, thinkingFor, toClaudeSchema } from "./anthropic-client";
import { executeLlmChain, resetCircuitBreakers, setHealthReporter, type LlmRoute } from "./llm-router";

let keyCounter = 0;
/** A fresh key per route, so each test gets its own SDK client built over the mocked fetch. */
const claude = (over: Partial<LlmRoute> = {}): LlmRoute => ({
  slug: "anthropic",
  protocol: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: `sk-ant-test-${++keyCounter}`,
  model: "claude-haiku-5-5",
  priority: 0,
  ...over,
});

const req = { systemPrompt: "classify", userPrompt: "شريت قهوة ب 50", maxOutputTokens: 200, timeoutMs: 2_000 };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: '{"items":[]}' }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 30, output_tokens: 6, cache_read_input_tokens: 10, cache_creation_input_tokens: 0 },
  ...over,
});

const requestBody = (mock: ReturnType<typeof vi.spyOn>, call = 0) => {
  const init = mock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
};

describe("Claude request shape", () => {
  it("turns a Gemini-style or Zod schema into one the structured-output API takes", () => {
    const schema = toClaudeSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        amount: { type: "number", minimum: 0 },
        category: { type: "string", format: "enum", enum: ["food", "transport"] },
        note: { type: "string", nullable: true, maxLength: 80 },
        when: { type: "string", format: "date" },
        items: { type: "array", minItems: 1, items: { type: "object", properties: { id: { type: "string" } } } },
      },
      required: ["amount"],
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        amount: { type: "number" },
        category: { type: "string", enum: ["food", "transport"] },
        note: { type: ["string", "null"] },
        when: { type: "string", format: "date" },
        items: { type: "array", items: { type: "object", properties: { id: { type: "string" } }, additionalProperties: false } },
      },
      required: ["amount"],
      additionalProperties: false,
    });
  });

  it("turns thinking off where the model allows it, and leaves room where it does not", () => {
    expect(thinkingFor("claude-haiku-5-5").thinking).toEqual({ type: "disabled" });
    expect(thinkingFor("claude-sonnet-5-5").thinking).toEqual({ type: "between_tools" });
    expect(thinkingFor("claude-opus-5-5")).toMatchObject({ alwaysThinks: true, effort: true });
    expect(thinkingFor("claude-haiku-4-5")).toEqual({ alwaysThinks: false, effort: false });
    expect(maxTokensFor("claude-haiku-5-5", 200)).toBe(200);
    expect(maxTokensFor("claude-opus-5-5", 200)).toBe(1224);
  });

  it("puts system messages in the system field and merges turns of the same role", () => {
    expect(claudeTurns([
      { role: "system", content: "rules" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "a" },
      { role: "tool", content: "b" },
      { role: "assistant", content: "c" },
    ])).toEqual({
      system: "rules",
      turns: [
        { role: "user", content: "." },
        { role: "assistant", content: "hi" },
        { role: "user", content: "a\n\nb" },
        { role: "assistant", content: "c" },
      ],
    });
  });
});

describe("Claude through the model router", () => {
  beforeEach(() => {
    resetCircuitBreakers();
    setHealthReporter(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks with the schema, no sampling parameters, and the least thinking, and bills thinking as output", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, message({
      usage: { input_tokens: 30, output_tokens: 6, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, output_tokens_details: { thinking_tokens: 2 } },
    })));

    const res = await executeLlmChain([claude()], { ...req, lowThinking: true, temperature: 0.1, schema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } } });

    expect(res.text).toBe('{"items":[]}');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.anthropic.com/v1/messages");
    const body = requestBody(fetchMock);
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 200,
      system: "classify",
      messages: [{ role: "user", content: "شريت قهوة ب 50" }],
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", additionalProperties: false } } },
    });
    expect(body.temperature).toBeUndefined();
    expect(res.promptTokens).toBe(40);
    expect(res.cachedTokens).toBe(10);
    expect(res.completionTokens).toBe(6);
  });

  it("moves to the next model on a 429, and reads Retry-After", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after": "7" },
      }))
      .mockResolvedValueOnce(json(200, { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));

    const res = await executeLlmChain([
      claude({ priority: 0 }),
      { slug: "groq", protocol: "openai", baseUrl: "https://api.groq.com/openai/v1", apiKey: "g", model: "m", priority: 1 },
    ], req);

    expect(res.route.slug).toBe("groq");
    expect(res.attempts[0]).toMatchObject({ slug: "anthropic", ok: false, failure: "rate_limited", status: 429 });
  });

  it("treats a refusal and a cut answer as answers this model cannot give", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, message({ stop_reason: "refusal", content: [] })))
      .mockResolvedValueOnce(json(200, message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"ite' }] })))
      .mockResolvedValueOnce(json(200, message()));

    const res = await executeLlmChain([
      claude({ slug: "claude-a", priority: 0 }),
      claude({ slug: "claude-b", priority: 1 }),
      claude({ slug: "claude-c", priority: 2 }),
    ], req);

    expect(res.route.slug).toBe("claude-c");
    expect(res.attempts.map((a) => `${a.slug}:${a.ok ? "ok" : a.failure}`)).toEqual(["claude-a:empty_response", "claude-b:truncated", "claude-c:ok"]);
  });

  it("retries once without the schema when the model answers 400 to it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(400, { type: "error", error: { type: "invalid_request_error", message: "output_config.format: unsupported" } }))
      .mockResolvedValueOnce(json(200, message()));

    const res = await executeLlmChain([claude({ model: "claude-haiku-4-5" })], { ...req, schema: { type: "object", properties: {} } });

    expect(res.degradedSchema).toBe(true);
    expect(requestBody(fetchMock, 1).output_config).toBeUndefined();
  });
});
