/**
 * The claim that matters for "the site must not break on any classification": when the
 * primary provider is unavailable, the user still gets their transactions.
 *
 * Exercised through `runSmartPipeline` rather than the router alone, because the router
 * passing in isolation proves nothing about whether the pipeline actually reaches it.
 * Before this wiring, every one of these cases returned the rule engine's guess or a
 * "try again later" apology, with valid keys for other providers sitting in the same
 * request object.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runSmartPipeline } from "./smart-pipeline";
import { resetCircuitBreakers } from "./llm-router";

vi.mock("../queries/connection", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
    }),
    query: {},
  },
  pool: {},
}));

const baseInput = {
  userId: 950_001,
  userType: "local",
  userPlan: "pro",
  userDict: [],
  apiKey: "gemini-key",
  modelName: "gemini-3.1-flash-lite",
  maxTokens: 512,
  pipelineSettings: {},
  provider: "groq",
  groqApiKey: "groq-key",
  fireworksApiKey: "fireworks-key",
  // Long, multi-transaction, with a term no local rule can categorise — the shape that
  // actually reaches the model.
  text: "النهاردة صرفت 250 على حاجة غريبة مش عارف اسمها وبعدين دفعت 130 لحاجة تانية شبهها وكمان 90",
};

/** One OpenAI-compatible transaction, the shape the pipeline parses. */
const classified = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          items: [
            {
              type: "expense",
              amount: 250,
              main_category: "تسوق",
              sub_category: "عام",
              item_name: "مشتريات",
              confidence: 88,
            },
          ],
        }),
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("smart pipeline provider failover", () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers from the next provider when the primary is rate limited", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        Promise.resolve(
          String(url).includes("groq")
            ? json(429, { error: "rate limit exceeded" })
            : json(200, classified),
        ),
      );

    const result = await runSmartPipeline({ ...baseInput, userId: 950_101 } as never);

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.log.providerRoute?.servedBy).toBe("fireworks");
    expect(result.log.providerRoute?.failedOver).toBe(true);

    // The full chain, in priority order and across both protocols: the requested
    // provider first, then the Gemini key that is also on this request, then Fireworks.
    // Every one of these keys was present before and only the first was ever tried.
    expect(result.log.providerRoute?.attempts.map((a) => a.slug)).toEqual([
      "groq",
      "gemini",
      "fireworks",
    ]);
    expect(result.log.providerRoute?.attempts[0]?.failure).toBe("rate_limited");
  });

  it("keeps the locally-resolved transactions when every provider is down", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(503, { error: "service unavailable" })),
    );

    const result = await runSmartPipeline({
      ...baseInput,
      userId: 950_102,
      text: "فطرت بـ 50 وركبت اوبر بـ 80 وصرفت 250 على حاجة غريبة",
    } as never);

    // Degrade, never erase: a total outage must not cost the user the amounts the local
    // path already understood, and must not silently save what it is unsure about.
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.map((i) => i.amount)).toContain(50);
    expect(result.items.map((i) => i.amount)).toContain(80);
    expect(result.decision).not.toBe("auto_save");
  });

  it("does not call any provider when the text is not financial", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await runSmartPipeline({
      ...baseInput,
      userId: 950_103,
      text: "ازيك عامل ايه النهاردة الجو حلو اوي",
    } as never);

    // Zero tokens on meaningless input is a hard requirement, not an optimisation.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.tokensUsed).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("stops calling a provider whose key is rejected", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        Promise.resolve(
          String(url).includes("groq")
            ? json(401, { error: "invalid api key" })
            : json(200, classified),
        ),
      );

    await runSmartPipeline({ ...baseInput, userId: 950_104 } as never);
    const afterFirst = fetchMock.mock.calls.filter((c) => String(c[0]).includes("groq")).length;
    expect(afterFirst).toBe(1);

    // Second request: the breaker has already learned, so the dead key costs nothing.
    await runSmartPipeline({ ...baseInput, userId: 950_105 } as never);
    const afterSecond = fetchMock.mock.calls.filter((c) => String(c[0]).includes("groq")).length;
    expect(afterSecond).toBe(1);
  });
});
