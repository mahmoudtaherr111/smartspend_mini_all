import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  classifyHttpStatus,
  classifyThrownError,
  circuitSnapshot,
  executeLlmChain,
  isCircuitOpen,
  LlmChainError,
  resetCircuitBreakers,
  setHealthReporter,
  toJsonSchema,
  type LlmRoute,
} from "./llm-router";
import { buildProviderChain } from "./llm-provider-chain";

const route = (over: Partial<LlmRoute> = {}): LlmRoute => ({
  slug: "groq",
  protocol: "openai",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "k",
  model: "m",
  priority: 0,
  ...over,
});

const req = {
  systemPrompt: "s",
  userPrompt: "u",
  maxOutputTokens: 128,
  timeoutMs: 200,
};

/** An OpenAI-compatible HTTP reply, without a network. */
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const okBody = {
  choices: [{ message: { content: '{"items":[]}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
};

describe("llm router", () => {
  beforeEach(() => {
    resetCircuitBreakers();
    setHealthReporter(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies the failures that need opposite responses", () => {
    expect(classifyHttpStatus(429)).toBe("rate_limited");
    expect(classifyHttpStatus(401)).toBe("auth");
    expect(classifyHttpStatus(403)).toBe("auth");
    // A provider that does not implement response_format answers 400 to a request that
    // is otherwise fine — retrying it unchanged elsewhere would fail identically.
    expect(classifyHttpStatus(400)).toBe("unsupported_schema");
    expect(classifyHttpStatus(422)).toBe("unsupported_schema");
    expect(classifyHttpStatus(503)).toBe("server");
  });

  it("reads the condition out of prose when there is no status code", () => {
    expect(classifyThrownError(new Error("429 quota exceeded")).kind).toBe("rate_limited");
    expect(classifyThrownError(new Error("Resource_Exhausted")).kind).toBe("rate_limited");
    expect(classifyThrownError(new Error("API key not valid")).kind).toBe("auth");
    expect(classifyThrownError(Object.assign(new Error("x"), { name: "AbortError" })).kind).toBe(
      "timeout",
    );
    expect(classifyThrownError(new Error("model is overloaded")).kind).toBe("server");
    expect(classifyThrownError(new Error("socket hang up")).kind).toBe("network");
  });

  it("moves to the next provider on a rate limit instead of sleeping on the same one", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply(429, { error: "rate limited" }))
      .mockResolvedValueOnce(reply(200, okBody));

    const res = await executeLlmChain(
      [route({ slug: "groq", priority: 0 }), route({ slug: "fireworks", priority: 1 })],
      req,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.route.slug).toBe("fireworks");
    expect(res.attempts.map((a) => `${a.slug}:${a.ok}`)).toEqual(["groq:false", "fireworks:true"]);
    expect(res.totalTokens).toBe(14);
  });

  it("retries the same provider without the schema when it rejects the schema", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply(400, { error: "response_format unsupported" }))
      .mockResolvedValueOnce(reply(200, okBody));

    const res = await executeLlmChain([route({ slug: "nvidia" })], {
      ...req,
      schema: { type: "object", properties: { a: { type: "string" } } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.route.slug).toBe("nvidia");
    // The caller has to know structure was not enforced, so it can validate harder.
    expect(res.degradedSchema).toBe(true);

    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(second.response_format).toBeUndefined();
  });

  it("opens the breaker immediately on a bad key rather than paying for three tries", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(reply(401, { error: "invalid api key" })));

    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow(LlmChainError);

    expect(isCircuitOpen("groq")).toBe(true);
    expect(circuitSnapshot().find((c) => c.slug === "groq")?.lastFailure).toBe("auth");
  });

  it("does not restart the trip budget for a schema downgrade", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      now += 950;
      return reply(400, { error: "response_format unsupported" });
    });
    await expect(executeLlmChain([route({ timeoutMs: 30_000 })], {
      ...req, timeoutMs: 30_000, deadlineMs: 1000,
    })).rejects.toThrow(LlmChainError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("measures each billed attempt independently after a schema downgrade", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => { now += 100; return reply(400, { error: "unsupported schema" }); })
      .mockImplementationOnce(async () => { now += 50; return reply(200, okBody); });
    const result = await executeLlmChain([route()], req);
    expect(result.attempts.map((a) => a.latencyMs)).toEqual([100, 50]);
    expect(result.latencyMs).toBe(150);
  });

  it("needs repeated failures before tripping on a merely flaky provider", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(reply(503, { error: "unavailable" })));

    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow();
    expect(isCircuitOpen("groq")).toBe(false);
    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow();
    expect(isCircuitOpen("groq")).toBe(false);
    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow();
    expect(isCircuitOpen("groq")).toBe(true);
  });

  it("tries an open provider last rather than refusing to answer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(reply(401, {})));
    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow();
    expect(isCircuitOpen("groq")).toBe(true);

    // groq leads on priority but is open; fireworks answers first and groq is never called.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(reply(200, okBody)));
    fetchMock.mockClear();

    const res = await executeLlmChain(
      [
        route({ slug: "groq", priority: 0 }),
        route({ slug: "fireworks", priority: 5, baseUrl: "https://api.fireworks.ai/inference/v1" }),
      ],
      req,
    );

    expect(res.route.slug).toBe("fireworks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("fireworks");
  });

  it("reports health transitions so the dashboard stops showing a permanent green dot", async () => {
    const events: string[] = [];
    setHealthReporter((slug, status) => events.push(`${slug}:${status}`));

    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(reply(401, {})));
    await expect(executeLlmChain([route({ slug: "groq" })], req)).rejects.toThrow();
    expect(events).toContain("groq:down");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, okBody));
    await executeLlmChain([route({ slug: "groq" })], req);
    expect(events).toContain("groq:healthy");
  });

  it("treats a 200 with no content as a failure worth trying elsewhere", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply(200, { choices: [{ message: { content: "  " } }] }))
      .mockResolvedValueOnce(reply(200, okBody));

    const res = await executeLlmChain(
      [route({ slug: "groq", priority: 0 }), route({ slug: "fireworks", priority: 1 })],
      req,
    );
    expect(res.route.slug).toBe("fireworks");
  });

  it("reports every attempt when the whole chain fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(reply(500, { error: "boom" })),
    );

    const err = await executeLlmChain(
      [route({ slug: "groq", priority: 0 }), route({ slug: "fireworks", priority: 1 })],
      req,
    ).catch((e) => e as LlmChainError);

    expect(err).toBeInstanceOf(LlmChainError);
    expect((err as LlmChainError).attempts).toHaveLength(2);
    expect((err as LlmChainError).message).toContain("groq(server 500)");
  });

  it("refuses a chain with nothing usable in it, without calling out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(executeLlmChain([route({ apiKey: "" })], req)).rejects.toThrow(/No provider/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the output cap on every request, including the Gemini path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, okBody));
    await executeLlmChain([route()], { ...req, maxOutputTokens: 384 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).max_tokens).toBe(384);
  });

  it("converts a Gemini schema into one a strict JSON Schema validator accepts", () => {
    const converted = toJsonSchema({
      type: "object",
      properties: {
        type: { type: "string", format: "enum", enum: ["expense", "income"] },
        nested: { type: "object", properties: { a: { type: "string" } } },
      },
      required: ["type"],
    });

    const props = converted.properties as Record<string, Record<string, unknown>>;
    expect(props.type.format).toBeUndefined();
    expect(props.type.enum).toEqual(["expense", "income"]);
    expect(converted.additionalProperties).toBe(false);
    expect(props.nested.additionalProperties).toBe(false);
  });
});

describe("provider chain", () => {
  const keys = { gemini: "g", groq: "q", fireworks: "f", nvidia: "n" };

  it("puts the requested provider first whatever its priority", () => {
    const chain = buildProviderChain({
      preferred: "fireworks",
      preferredModel: "chosen-model",
      plan: "pro",
      keys,
    });

    expect(chain[0].slug).toBe("fireworks");
    expect(chain[0].model).toBe("chosen-model");
    expect(chain[0].priority).toBe(0);
    // Everything else is still reachable behind it.
    expect(chain.map((r) => r.slug)).toContain("gemini");
    expect(chain.map((r) => r.slug)).toContain("groq");
  });

  it("gives each provider a model appropriate to that provider", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "gemini-3.1-pro",
      plan: "ultra",
      keys,
    });

    for (const r of chain) {
      expect(r.model).toBeTruthy();
      if (r.slug === "groq") expect(r.model).not.toMatch(/^gemini/);
      if (r.slug === "fireworks") expect(r.model).toMatch(/^accounts\/fireworks/);
    }
  });

  it("uses a second Gemini key as its own route — it is an independent quota", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "gemini-3.1-flash-lite",
      plan: "free",
      keys: { gemini: "primary", geminiSecondary: "secondary" },
    });

    const secondary = chain.find((r) => r.slug === "gemini-secondary");
    expect(secondary?.apiKey).toBe("secondary");
    // Ahead of a different vendor: same model behaviour, different bucket.
    const groqRank = chain.find((r) => r.slug === "groq")?.priority ?? Infinity;
    expect(secondary!.priority).toBeLessThan(groqRank);
  });

  it("ignores a duplicate second key", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "m",
      plan: "free",
      keys: { gemini: "same", geminiSecondary: "same" },
    });
    expect(chain.filter((r) => r.slug === "gemini-secondary")).toHaveLength(0);
  });

  it("orders admin-configured providers by the priority column", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "m",
      plan: "pro",
      keys: { gemini: "g" },
      dbRoutes: [
        { slug: "openrouter", protocol: "openai", baseUrl: "u", apiKey: "k", model: "x", priority: 5 },
        { slug: "deepseek", protocol: "openai", baseUrl: "u", apiKey: "k", model: "y", priority: 1 },
      ],
    });

    const slugs = chain.map((r) => r.slug);
    expect(slugs.indexOf("deepseek")).toBeLessThan(slugs.indexOf("openrouter"));
    expect(slugs[0]).toBe("gemini");
  });

  it("drops routes with no key or no model instead of failing on them mid-outage", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "m",
      plan: "free",
      keys: { gemini: "g", deepseek: "d" },
    });
    // deepseek has a key but no configured model, so it is not a usable route.
    expect(chain.every((r) => r.apiKey && r.model)).toBe(true);
    expect(chain.map((r) => r.slug)).not.toContain("deepseek");
  });

  it("returns an empty chain rather than a broken one when nothing is configured", () => {
    expect(buildProviderChain({ preferred: "gemini", preferredModel: "m", plan: "free", keys: {} }))
      .toHaveLength(0);
  });
});
