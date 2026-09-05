/**
 * A2 acceptance: a route is a unit, a deadline is real, and a breaker isolates.
 *
 * The defects reproduced here all share one shape — a value that travels between layers
 * loses part of itself on the way. A provider slug arrives without its protocol and gets
 * one guessed for it; a timeout covers the headers and not the body; a breaker records
 * that a provider is down and then tries it anyway.
 *
 * From docs/reviews/2026-09-05-expense-classification-audit.md: H11, M07, M08, M09, M10.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  executeLlmChain,
  isCircuitOpen,
  circuitSnapshot,
  resetCircuitBreakers,
  LlmChainError,
  type LlmRoute,
} from "./llm-router";
import { buildProviderChain } from "./llm-provider-chain";

const req = {
  systemPrompt: "s",
  userPrompt: "u",
  maxOutputTokens: 128,
  timeoutMs: 150,
};

const route = (over: Partial<LlmRoute> = {}): LlmRoute => ({
  slug: "groq",
  protocol: "openai",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "k",
  model: "m",
  priority: 0,
  ...over,
});

/** A complete OpenAI-compatible answer. */
function ok(content = '{"items":[]}', usage: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, ...usage },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function err(status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: "nope" }), { status, headers });
}

beforeEach(() => resetCircuitBreakers());
afterEach(() => vi.restoreAllMocks());

// ───────────────────── H11. A route is one coherent unit ─────────────────────

describe("H11 — the preferred provider keeps its own identity", () => {
  const dbDeepseek: LlmRoute = {
    slug: "deepseek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "deepseek-real-key",
    model: "deepseek-v4-flash",
    priority: 0,
    providerId: 7,
  };

  it("does not build a preferred route out of another provider's key and protocol", () => {
    const chain = buildProviderChain({
      preferred: "deepseek",
      preferredModel: "deepseek-v4-flash",
      plan: "pro",
      keys: { gemini: "gemini-key" },
      dbRoutes: [dbDeepseek],
    });

    const deepseek = chain.find((r) => r.slug === "deepseek");
    expect(deepseek, "the configured DeepSeek route must survive").toBeDefined();
    // The defect: with no builtin spec for "deepseek", the preferred branch fell through
    // to `keys.gemini` and `protocol ?? "gemini"`, producing a route that talks the Gemini
    // protocol with a Gemini key against DeepSeek's base URL — and then claimed the slug,
    // so the correct row above was skipped.
    expect(deepseek?.apiKey).toBe("deepseek-real-key");
    expect(deepseek?.protocol).toBe("openai");
    expect(deepseek?.providerId).toBe(7);
  });

  it("puts the admin's configured route first when it is the one asked for", () => {
    const chain = buildProviderChain({
      preferred: "deepseek",
      preferredModel: "deepseek-v4-flash",
      plan: "pro",
      keys: { gemini: "gemini-key" },
      dbRoutes: [dbDeepseek],
    });
    expect(chain[0].slug).toBe("deepseek");
  });

  it("still reaches Gemini as a fallback behind it", () => {
    const chain = buildProviderChain({
      preferred: "deepseek",
      preferredModel: "deepseek-v4-flash",
      plan: "pro",
      keys: { gemini: "gemini-key" },
      dbRoutes: [dbDeepseek],
    });
    const gemini = chain.find((r) => r.protocol === "gemini");
    expect(gemini, "a valid Gemini key must remain a fallback").toBeDefined();
    expect(gemini?.apiKey).toBe("gemini-key");
  });

  it("does not invent a route for a provider it has no key for", () => {
    const chain = buildProviderChain({
      preferred: "openrouter",
      preferredModel: "some/model",
      plan: "free",
      keys: { gemini: "gemini-key" },
    });
    // Previously this produced slug=openrouter carrying the Gemini key: a request
    // guaranteed to 401, charged to the wrong provider's health record.
    expect(chain.some((r) => r.slug === "openrouter")).toBe(false);
    expect(chain.some((r) => r.slug === "gemini")).toBe(true);
  });

  it("does not ask a provider for another vendor's model", () => {
    // `provider` and `model` come from two different settings and nothing made them
    // agree, so an install left on the default model produced a Groq route requesting
    // "gemini-3.1-flash-lite" — the first attempt of every classification, guaranteed
    // to fail, with the failure recorded against Groq.
    const chain = buildProviderChain({
      preferred: "groq",
      preferredModel: "gemini-3.1-flash-lite",
      plan: "pro",
      keys: { gemini: "g", groq: "groq-key" },
    });
    const groq = chain.find((r) => r.slug === "groq");
    expect(groq?.model).not.toBe("gemini-3.1-flash-lite");
    expect(groq?.apiKey).toBe("groq-key");
  });

  it("passes through a model name it does not recognise rather than overriding the operator", () => {
    // New models ship faster than the prefix predicates are updated. Substituting a
    // default for an unfamiliar name would silently undo an admin's configuration.
    const chain = buildProviderChain({
      preferred: "fireworks",
      preferredModel: "some-brand-new-model",
      plan: "pro",
      keys: { gemini: "g", fireworks: "fw" },
    });
    expect(chain[0]).toMatchObject({ slug: "fireworks", model: "some-brand-new-model" });
  });

  it("keeps a builtin preferred provider working exactly as before (positive control)", () => {
    const chain = buildProviderChain({
      preferred: "groq",
      preferredModel: "llama-3.3-70b-versatile",
      plan: "pro",
      keys: { gemini: "g", groq: "groq-key" },
    });
    expect(chain[0]).toMatchObject({
      slug: "groq",
      protocol: "openai",
      apiKey: "groq-key",
      model: "llama-3.3-70b-versatile",
    });
  });

  it("lets a provider offer more than one model instead of deduplicating by slug", () => {
    const chain = buildProviderChain({
      preferred: "gemini",
      preferredModel: "gemini-3.1-pro",
      plan: "pro",
      keys: { gemini: "g" },
      dbRoutes: [
        { slug: "openrouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "or", model: "model-a", priority: 1, providerId: 1 },
        { slug: "openrouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "or", model: "model-b", priority: 2, providerId: 2 },
      ],
    });
    const models = chain.filter((r) => r.slug === "openrouter").map((r) => r.model);
    expect(models).toEqual(["model-a", "model-b"]);
  });
});

// ───────────────────── M07. Deadlines that actually bound ─────────────────────

describe("M07 — the timeout covers the whole call, not just the headers", () => {
  it("gives up on a response whose body never arrives", async () => {
    // Headers land immediately; the body stalls. The timer used to be cleared in the
    // fetch's `finally`, so `await res.json()` had no deadline at all and the request
    // hung for as long as the provider kept the socket open.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        Promise.resolve(
          new Response(
            new ReadableStream({ start() { /* never enqueues, never closes */ } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ) as Promise<Response>,
    );

    const started = Date.now();
    await expect(
      executeLlmChain([route({ timeoutMs: 120 })], { ...req, timeoutMs: 120 }),
    ).rejects.toBeInstanceOf(LlmChainError);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("stops trying providers once the trip budget is spent", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(err(500)), 200)),
    );

    const routes = Array.from({ length: 6 }, (_, i) =>
      route({ slug: `p${i}`, priority: i, timeoutMs: 150 }),
    );

    const started = Date.now();
    await expect(
      executeLlmChain(routes, { ...req, timeoutMs: 150, deadlineMs: 400 }),
    ).rejects.toBeInstanceOf(LlmChainError);
    const elapsed = Date.now() - started;

    // Six routes at 150ms each is 900ms of sequential waiting with no ceiling.
    expect(elapsed).toBeLessThan(900);
  });

  it("does not start a route it cannot finish inside the remaining budget", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        () => new Promise<Response>((resolve) => setTimeout(() => resolve(err(500)), 250)),
      );

    const routes = Array.from({ length: 4 }, (_, i) =>
      route({ slug: `q${i}`, priority: i, timeoutMs: 300 }),
    );

    await expect(
      executeLlmChain(routes, { ...req, timeoutMs: 300, deadlineMs: 350 }),
    ).rejects.toBeInstanceOf(LlmChainError);

    expect(fetchMock.mock.calls.length).toBeLessThan(4);
  });

  it("answers normally when the budget is ample (positive control)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    const res = await executeLlmChain([route()], { ...req, deadlineMs: 5_000 });
    expect(res.text).toBe('{"items":[]}');
    expect(res.attempts).toHaveLength(1);
  });
});

// ───────────────────── M08. A breaker that isolates ─────────────────────

describe("M08 — an open circuit stops costing requests", () => {
  it("does not re-try every dead provider on every request during a broad outage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(err(500));

    const routes = ["a", "b", "c"].map((slug, i) =>
      route({ slug, baseUrl: `https://${slug}.example/v1`, priority: i }),
    );

    for (let i = 0; i < 3; i++) {
      await executeLlmChain(routes, req).catch(() => {});
    }
    expect(routes.every((r) => isCircuitOpen(r.slug))).toBe(true);

    fetchMock.mockClear();
    await executeLlmChain(routes, req).catch(() => {});

    // The defect: open routes were only moved to the BACK of the queue, so with every
    // provider down each subsequent request still paid for all three round trips —
    // exactly when the system is least able to afford them. One probe is enough to
    // learn whether anything recovered.
    expect(fetchMock.mock.calls.length).toBeLessThan(3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("prefers a healthy provider over an open one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      Promise.resolve(String(url).includes("bad.example") ? err(500) : ok()),
    );

    const bad = route({ slug: "bad", baseUrl: "https://bad.example/v1", priority: 0 });
    const good = route({ slug: "good", baseUrl: "https://good.example/v1", priority: 1 });

    for (let i = 0; i < 3; i++) await executeLlmChain([bad, good], req);
    expect(isCircuitOpen("bad")).toBe(true);

    fetchMock.mockClear();
    const res = await executeLlmChain([bad, good], req);

    expect(res.route.slug).toBe("good");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("bad.example"))).toBe(false);
  });

  it("still probes an open route when it is the only one left", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(err(500));
    const bad = route({ slug: "bad" });

    for (let i = 0; i < 3; i++) await executeLlmChain([bad], req).catch(() => {});
    expect(isCircuitOpen("bad")).toBe(true);

    // Refusing outright would turn a degraded provider into a total outage, and the
    // recovery probe is how the breaker ever closes again.
    await expect(executeLlmChain([bad], req)).rejects.toBeInstanceOf(LlmChainError);
  });

  it("does not consume the half-open probe just by reading the breaker state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(err(500));
    const bad = route({ slug: "bad" });
    for (let i = 0; i < 3; i++) await executeLlmChain([bad], req).catch(() => {});

    const past = Date.now() + 61_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(past);
    try {
      const first = circuitSnapshot().find((s) => s.slug === "bad");
      circuitSnapshot();
      circuitSnapshot();
      const later = circuitSnapshot().find((s) => s.slug === "bad");

      // The admin dashboard polls this. Reading the state used to DECREMENT the failure
      // count as a side effect, so watching a broken provider quietly reset its own
      // breaker — and three dashboard refreshes granted three free attempts.
      expect(later?.failures).toBe(first?.failures);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps health per route, not per provider name", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return Promise.resolve(body.model === "broken-model" ? err(401) : ok());
    });

    const broken = route({ slug: "openrouter", model: "broken-model", baseUrl: "https://openrouter.ai/api/v1", priority: 0 });
    const working = route({ slug: "openrouter", model: "working-model", baseUrl: "https://openrouter.ai/api/v1", priority: 1 });

    const res = await executeLlmChain([broken, working], req);

    // A 401 on one model of a gateway says nothing about a sibling model behind a
    // different row. Keying the breaker on the slug alone condemned both.
    expect(res.route.model).toBe("working-model");
  });

  it("records what the provider asked us to wait when it sends Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      Promise.resolve(
        String(url).includes("limited.example") ? err(429, { "Retry-After": "120" }) : ok(),
      ),
    );

    const limited = route({ slug: "limited", baseUrl: "https://limited.example/v1", priority: 0 });
    const spare = route({ slug: "spare", baseUrl: "https://spare.example/v1", priority: 1 });

    const res = await executeLlmChain([limited, spare], req);
    expect(res.route.slug).toBe("spare");
    const rateLimited = res.attempts.find((a) => a.slug === "limited");
    expect(rateLimited?.failure).toBe("rate_limited");
    expect(rateLimited?.retryAfterMs).toBe(120_000);
  });

  it("honours a Retry-After longer than the default cooldown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(err(429, { "Retry-After": "600" }));
    const limited = route({ slug: "limited" });
    for (let i = 0; i < 3; i++) await executeLlmChain([limited], req).catch(() => {});

    // Past the 60s default cooldown but well inside the 600s the provider named.
    expect(isCircuitOpen("limited", Date.now() + 120_000)).toBe(true);
  });
});

describe("M09 — a truncated answer is not a successful one", () => {
  it("reports a length-truncated reply as a failure worth failing over", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      call++;
      return Promise.resolve(
        call === 1
          ? new Response(
              JSON.stringify({
                choices: [{ message: { content: '{"items":[{"i":1,' }, finish_reason: "length" }],
                usage: { prompt_tokens: 10, completion_tokens: 128, total_tokens: 138 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          : ok(),
      );
    });

    const res = await executeLlmChain(
      [route({ slug: "truncating", priority: 0 }), route({ slug: "complete", priority: 1 })],
      req,
    );

    // Transport said 200. The answer was cut off mid-object, which is a semantic
    // failure the caller used to receive as a success and then fail to parse alone.
    expect(res.route.slug).toBe("complete");
    expect(res.attempts[0]).toMatchObject({ slug: "truncating", ok: false, failure: "truncated" });
  });

  it("asks a reasoning provider to stop thinking in the dialect that provider understands", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      return Promise.resolve(ok());
    });

    await executeLlmChain(
      [route({ slug: "deepseek", baseUrl: "https://api.deepseek.com/v1", suppressReasoning: true })],
      req,
    );

    // `chat_template_kwargs.thinking=false` is a vLLM/NVIDIA extension. DeepSeek's own
    // API documents `thinking: { type: "disabled" }`, and thinking is on by default.
    expect(bodies[0]).toMatchObject({ thinking: { type: "disabled" } });
  });

  it("keeps sending the vLLM form to providers that use it", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      return Promise.resolve(ok());
    });

    await executeLlmChain(
      [route({ slug: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1", suppressReasoning: true })],
      req,
    );
    expect(bodies[0]).toMatchObject({ chat_template_kwargs: { thinking: false } });
  });

  it("does not send a thinking flag to a model that does not reason", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      return Promise.resolve(ok());
    });
    await executeLlmChain([route()], req);
    expect(bodies[0].thinking).toBeUndefined();
    expect(bodies[0].chat_template_kwargs).toBeUndefined();
  });
});

describe("M10 — every attempt reports what it actually spent", () => {
  it("records tokens on the attempt that spent them, not only on the winner", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      call++;
      return Promise.resolve(
        call === 1
          ? new Response(
              JSON.stringify({
                choices: [{ message: { content: "" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 90, completion_tokens: 0, total_tokens: 90 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            )
          : ok('{"items":[]}', { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 }),
      );
    });

    const res = await executeLlmChain(
      [route({ slug: "wasteful", priority: 0 }), route({ slug: "useful", priority: 1 })],
      req,
    );

    const wasteful = res.attempts.find((a) => a.slug === "wasteful");
    const useful = res.attempts.find((a) => a.slug === "useful");

    // An empty answer still consumed the input tokens. Billing that reads only the
    // winning call under-reports the request by exactly the failed attempts.
    expect(wasteful?.promptTokens).toBe(90);
    expect(useful?.promptTokens).toBe(40);
    expect(useful?.completionTokens).toBe(12);
    expect(res.attemptTotals?.promptTokens).toBe(130);
  });

  it("reports cached prompt tokens separately from fresh ones", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok('{"items":[]}', {
        prompt_tokens: 100,
        completion_tokens: 10,
        total_tokens: 110,
        prompt_tokens_details: { cached_tokens: 80 },
      }),
    );
    const res = await executeLlmChain([route()], req);
    expect(res.cachedTokens).toBe(80);
    expect(res.attempts[0].cachedTokens).toBe(80);
  });
});
