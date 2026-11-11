/**
 * The engine around a scripted model: what it asks the model, how it treats each kind of
 * reply, and that a reply it cannot read is never replaced by a guess.
 */
import { describe, expect, it, vi } from "vitest";
import { LlmChainError, type LlmAttempt, type LlmRequest, type LlmResponse, type LlmRoute } from "../llm-router";
import { READING_SCHEMA } from "./contract";
import {
  businessCategoryOf,
  outputTokensFor,
  policyFromSettings,
  routesAfter,
  understand,
  UnderstandingUnavailableError,
  type UnderstandInput,
} from "./engine";
import { DEFAULT_POLICY } from "./policy";
import { buildSystemPrompt } from "./prompt";
import { assembleContext, type ContextParts } from "./reading-context";

const route = (slug: string, priority: number, model = `${slug}-model`): LlmRoute => ({
  slug, protocol: "openai", baseUrl: "", apiKey: "key", model, priority,
});
const A = route("alpha", 0);
const B = route("beta", 1);
const C = route("gamma", 2);

const attempt = (on: LlmRoute, ok: boolean, tokens = 100): LlmAttempt => ({
  slug: on.slug, model: on.model, ok, latencyMs: 5, promptTokens: tokens, completionTokens: tokens / 2, cachedTokens: 0, totalTokens: tokens * 1.5,
});

function response(on: LlmRoute, body: unknown, tokens = 100): LlmResponse {
  return {
    text: typeof body === "string" ? body : JSON.stringify(body),
    promptTokens: tokens, completionTokens: tokens / 2, cachedTokens: 0, totalTokens: tokens * 1.5,
    route: on, latencyMs: 5, attempts: [attempt(on, true, tokens)],
    attemptTotals: { promptTokens: tokens, completionTokens: tokens / 2, cachedTokens: 0, totalTokens: tokens * 1.5 },
    degradedSchema: false,
  };
}

const ev = (over: Record<string, unknown>) => ({
  quote: "", amount: 0, kind: "spending", flow: "out", category: "misc", sub: "other", what: "", person: "",
  person_role: "none", person_relation: "", commitment: "", installments: 0, wallet: "", date: "", doubt: "none", ...over,
});
const replyOf = (events: unknown[], over: Record<string, unknown> = {}) => ({ events, ignored: [], numbers: [], ask: "", ask_about: "none", ...over });

const baseParts: ContextParts = {
  today: "2026-11-11",
  weekday: "Wednesday",
  contacts: [{ name: "أحمد" }],
  commitments: [{ cashflowId: 41, title: "مدرسة سلمى", kindLabel: "مدرسة", amount: 6500, dueDay: "2026-11-15", person: "سلمى" }],
  wallets: [{ id: 7, name: "CIB Visa" }],
};

function input(text: string, over: Partial<UnderstandInput> = {}, parts: Partial<ContextParts> = {}): UnderstandInput {
  return { text, context: assembleContext({ ...baseParts, ...parts }), settings: {}, routes: [A, B, C], ...over };
}

/** A fake `executeLlmChain` that answers each call with the next script entry. */
function scripted(...steps: Array<(routes: LlmRoute[], req: LlmRequest) => LlmResponse | Promise<LlmResponse>>) {
  let index = 0;
  return vi.fn(async (routes: LlmRoute[], req: LlmRequest) => {
    const step = steps[index++];
    if (!step) throw new Error("unexpected call");
    return step(routes, req);
  });
}

describe("understand", () => {
  it("saves a clean ordinary reading and asks the model the way the contract says", async () => {
    const execute = scripted(() => response(A, replyOf([
      ev({ quote: "دفعت 300 نت", amount: 300, category: "bills", sub: "internet_landline", what: "نت" }),
    ])));
    const result = await understand(input("  دفعت 300 نت "), { execute });

    expect(result.outcome).toBe("save");
    expect(result.source).toBe("model");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      amount: 300, reasons: [], commitmentId: null, walletId: null,
      stored: { category: "فواتير", subCategory: "إنترنت", type: "expense" },
    });
    expect(result.usage).toMatchObject({ servedBy: "alpha", model: "alpha-model", promptTokens: 100, completionTokens: 50, totalTokens: 150, degradedSchema: false });
    expect(result.versions).toEqual({ contract: expect.any(String), prompt: expect.any(String), taxonomy: expect.any(String) });

    const [routes, req] = execute.mock.calls[0];
    expect(routes).toEqual([A, B, C]);
    expect(req).toMatchObject({ schema: READING_SCHEMA, lowThinking: true, temperature: 0, timeoutMs: 8000, deadlineMs: 15000, maxOutputTokens: 350 });
    expect(req.systemPrompt).toBe(buildSystemPrompt());
    expect(req.userPrompt.split("\n").at(-1)).toBe("SENTENCE: «دفعت 300 نت»");
  });

  it("shows a reading that leaves a number of the sentence unaccounted for", async () => {
    const execute = scripted(() => response(A, replyOf([
      ev({ quote: "دفعت 100 مواصلات", amount: 100, category: "transport", sub: "other", what: "مواصلات" }),
    ])));
    const result = await understand(input("دفعت 100 مواصلات و 150 اكل"), { execute });
    expect(result.outcome).toBe("show");
    expect(result.reasons).toContain("number_unaccounted");
  });

  it("passes on the model's one question when nothing can be recorded", async () => {
    const execute = scripted(() => response(A, replyOf([], { ask: "اللاب توب كان بكام؟", ask_about: "amount" })));
    const result = await understand(input("اشتريت لاب توب جديد"), { execute });
    expect(result).toMatchObject({ outcome: "ask", question: "اللاب توب كان بكام؟", askAbout: "amount", events: [] });
  });

  it("asks for the amount of an event that has none, and keeps the event for the answer", async () => {
    const execute = scripted(() => response(A, replyOf([ev({ quote: "اشتريت شاحن", what: "شاحن", category: "shopping", sub: "electronics" })])));
    const result = await understand(input("اشتريت شاحن"), { execute });
    expect(result.outcome).toBe("ask");
    expect(result.question).toContain("شاحن");
    expect(result.events[0].reasons).toEqual(["amount_missing"]);
  });

  it("resolves offered references to ids and drops one that was never offered", async () => {
    const execute = scripted(() => response(A, replyOf([
      ev({ quote: "دفعت قسط مدرسة سلمى 6500", amount: 6500, category: "education", sub: "school_fees", commitment: "c1", installments: 1, wallet: "w1" }),
      ev({ quote: "قسط الجيم 900", amount: 900, category: "entertainment", sub: "sports_gym", commitment: "c9", installments: 1 }),
    ])));
    const result = await understand(input("دفعت قسط مدرسة سلمى 6500 بالفيزا و قسط الجيم 900"), { execute });

    expect(result.events[0]).toMatchObject({ commitment: "c1", commitmentId: 41, commitmentDueDay: "2026-11-15", walletId: 7 });
    expect(result.events[1]).toMatchObject({ commitment: "", installments: 0, commitmentId: null });
    expect(result.events[1].flags).toContain("commitment_unknown");
    expect(result.outcome).toBe("show");
  });

  it("puts the context's commitments and wallets in the user prompt, with their references", async () => {
    const execute = scripted(() => response(A, replyOf([], { ask: "دفعت كام؟", ask_about: "amount" })));
    await understand(input("دفعت المدرسة"), { execute });
    const { userPrompt } = execute.mock.calls[0][1];
    expect(userPrompt).toContain("TODAY: 2026-11-11 (Wednesday)");
    expect(userPrompt).toContain("c1 «مدرسة سلمى» مدرسة، المستحق 6500 يوم 2026-11-15، مع سلمى");
    expect(userPrompt).toContain("WALLETS: w1 «CIB Visa»");
    expect(userPrompt).toContain("PEOPLE the user knows: أحمد");
    expect(userPrompt).not.toContain("41");
  });

  it("asks the routes after the one that served once more when its reply cannot be read", async () => {
    const execute = scripted(
      () => response(A, "I'm sorry, I can't help with that", 80),
      (routes) => {
        expect(routes).toEqual([B, C]);
        return response(B, replyOf([ev({ quote: "دفعت 300 نت", amount: 300, category: "bills", sub: "internet_landline" })]), 120);
      },
    );
    const result = await understand(input("دفعت 300 نت"), { execute });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe("save");
    expect(result.usage.servedBy).toBe("beta");
    expect(result.usage.attempts.map((item) => item.slug)).toEqual(["alpha", "beta"]);
    expect(result.usage.promptTokens).toBe(200);
    expect(result.problems).toContain("unusable reply from alpha/alpha-model");
  });

  it("gives up, without guessing, when no route returns a readable reply", async () => {
    const execute = scripted(() => response(A, "nope"), () => response(B, "{\"answer\":42}"));
    const error = await understand(input("دفعت 300 نت", { routes: [A, B] }), { execute }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UnderstandingUnavailableError);
    expect((error as UnderstandingUnavailableError).attempts.map((item) => item.slug)).toEqual(["alpha", "beta"]);
    expect((error as UnderstandingUnavailableError).tokens.totalTokens).toBe(300);

    const alone = scripted(() => response(A, "nope"));
    await expect(understand(input("دفعت 300 نت", { routes: [A] }), { execute: alone })).rejects.toBeInstanceOf(UnderstandingUnavailableError);
    expect(alone).toHaveBeenCalledTimes(1);
  });

  it("turns every route failing into UnderstandingUnavailableError with the attempts", async () => {
    const failed = [{ ...attempt(A, false), failure: "rate_limited" as const }, { ...attempt(B, false, 0), failure: "timeout" as const }];
    const execute = vi.fn(async () => {
      throw new LlmChainError("all failed", failed);
    });
    const error = await understand(input("دفعت 300 نت"), { execute }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UnderstandingUnavailableError);
    expect((error as UnderstandingUnavailableError).attempts).toEqual(failed);
    expect((error as UnderstandingUnavailableError).tokens.promptTokens).toBe(100);
  });

  it("never throws anything else", async () => {
    const execute = vi.fn(async () => {
      throw new TypeError("boom");
    });
    await expect(understand(input("دفعت 300 نت"), { execute })).rejects.toBeInstanceOf(UnderstandingUnavailableError);
  });

  it("reads the policy, the limits and the timeouts from settings", async () => {
    const clean = () => response(A, replyOf([ev({ quote: "دفعت 300 نت", amount: 300, category: "bills", sub: "internet_landline" })]));

    const off = await understand(input("دفعت 300 نت", { settings: { understanding_auto_save: "false" } }), { execute: scripted(clean) });
    expect(off.outcome).toBe("show");
    expect(off.reasons).toContain("auto_save_off");

    const low = await understand(input("دفعت 300 نت", { settings: { understanding_review_amount: "200" } }), { execute: scripted(clean) });
    expect(low.events[0].reasons).toContain("large_first_time");

    const familiar = await understand(
      input("دفعت 300 نت", { settings: { understanding_review_amount: "200" } }, { recentFilings: [{ category: "فواتير", subCategory: "إنترنت" }, { category: "فواتير", subCategory: "إنترنت" }] }),
      { execute: scripted(clean) },
    );
    expect(familiar.outcome).toBe("save");

    const tight = await understand(input("دفعت 300 نت", { settings: { understanding_max_amount: "100" } }), { execute: scripted(clean) });
    expect(tight.events[0].flags).toContain("amount_out_of_range");

    const execute = scripted(clean);
    await understand(input("دفعت 300 نت", { settings: { llm_timeout_ms: "3000", llm_trip_deadline_ms: "6000" }, maxOutputTokens: 200 }), { execute });
    expect(execute.mock.calls[0][1]).toMatchObject({ timeoutMs: 3000, deadlineMs: 6000, maxOutputTokens: 200 });
  });

  it("answers empty and over-long text without a model", async () => {
    const execute = vi.fn();
    const empty = await understand(input("   "), { execute });
    expect(empty).toMatchObject({ outcome: "ask", source: "none", events: [], reasons: ["empty_text"] });
    expect(empty.question).toBeTruthy();

    const long = await understand(input("ا".repeat(2001)), { execute });
    expect(long).toMatchObject({ outcome: "ask", source: "none", reasons: ["text_too_long"] });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps the business's own category name in business mode", async () => {
    const reply = () => response(A, replyOf([
      ev({ quote: "اشتريت خامات قماش ب 2000", amount: 2000, category: "work", sub: "goods_materials", what: "خامات قماش" }),
    ]));
    const parts = { businessMode: true, businessCategories: ["قماش", "شحن", "خامات قماش"] };
    const business = await understand(input("اشتريت خامات قماش ب 2000", {}, parts), { execute: scripted(reply) });
    expect(business.events[0].businessCategory).toBe("خامات قماش");

    const personal = await understand(input("اشتريت خامات قماش ب 2000", {}, { businessCategories: ["قماش"] }), { execute: scripted(reply) });
    expect(personal.events[0].businessCategory).toBeUndefined();
  });
});

describe("the engine's helpers", () => {
  it("sizes the reply by the numbers in the sentence, under both ceilings", () => {
    expect(outputTokensFor("دفعت 300 نت")).toBe(350);
    expect(outputTokensFor("دفعت 300 نت", 100)).toBe(100);
    expect(outputTokensFor(Array.from({ length: 40 }, (_, i) => `${i + 1}`).join(" "))).toBe(4000);
    expect(outputTokensFor("مفيش أرقام", 0)).toBe(220);
  });

  it("falls back to the default policy for missing or unreadable settings", () => {
    expect(policyFromSettings({})).toEqual(DEFAULT_POLICY);
    expect(policyFromSettings({ understanding_review_amount: "abc", understanding_auto_max_events: "-2" })).toEqual(DEFAULT_POLICY);
    expect(policyFromSettings({ understanding_auto_save: "false", understanding_review_dated: "false", understanding_auto_max_events: "3" }))
      .toEqual({ ...DEFAULT_POLICY, autoSave: false, reviewDated: false, autoMaxEvents: 3 });
  });

  it("retries only on the routes after the one that served, never on one already tried", () => {
    expect(routesAfter([C, A, B], A, [attempt(A, true)])).toEqual([B, C]);
    expect(routesAfter([A, B, C], C, [attempt(A, false), attempt(B, false), attempt(C, true)])).toEqual([]);
    // A shut-out route probed last: the routes after it in priority order were already tried.
    expect(routesAfter([A, B, C], A, [attempt(B, false), attempt(C, false), attempt(A, true)])).toEqual([]);
  });

  it("matches a business category on whole words only", () => {
    expect(businessCategoryOf({ what: "شحن الطلبات", quote: "" }, ["شحن"])).toBe("شحن");
    expect(businessCategoryOf({ what: "الشحنة", quote: "" }, ["شحن"])).toBeUndefined();
  });
});
