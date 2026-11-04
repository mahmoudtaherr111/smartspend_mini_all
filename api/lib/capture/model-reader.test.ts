import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ settings: {} as Record<string, string>, replies: [] as string[], requests: [] as unknown[], reservation: true }));
vi.mock("../settings-cache", () => ({ getSystemSettings: async () => state.settings }));
vi.mock("../ai-gateway", () => ({ resolveAdminRoutes: async () => ({ preferred: null, routes: ["primary", "backup"].map((slug) => ({ slug, model: "synthetic-model", apiKey: "synthetic", baseUrl: "https://synthetic.invalid", protocol: "openai", priority: 0 })) }) }));
vi.mock("./admission", () => ({ reserveCaptureCall: vi.fn(async () => state.reservation ? { ok: true, reservation: { id: "reservation", userId: 1, userType: "local" } } : { ok: false, reason: "daily_cap" }), settleCaptureCall: vi.fn(async () => {}) }));
vi.mock("../ai-pricing", () => ({ ratesFor: async () => ({ input: 0.25, output: 1.5, cached: 0.025 }), costAtRates: (_: unknown, usage: { promptTokens: number; completionTokens: number }) => (usage.promptTokens * 0.25 + usage.completionTokens * 1.5) / 1e6 }));
vi.mock("../ai-ledger", () => ({ recordAiLedger: vi.fn(async () => {}) }));
vi.mock("./consent", () => ({ captureConsentsOf: vi.fn(async () => ({ capture: true, aiReading: true })) }));
vi.mock("../llm-router", async (load) => ({ ...await load<typeof import("../llm-router")>(), executeLlmChain: vi.fn(async (routes, request) => {
  state.requests.push(request);
  const text = state.replies.shift(); if (!text) throw new Error("synthetic outage");
  return { text, route: routes[0], attempts: [{ slug: routes[0].slug, model: routes[0].model, ok: true, promptTokens: 1000, completionTokens: 200, latencyMs: 1 }] };
}) }));
import { CAPTURE_PROMPT_DIGEST, readCaptureWithModel } from "./model-reader";
import { prepareCaptureText } from "./privacy";
import { reserveCaptureCall, settleCaptureCall } from "./admission";
import { recordAiLedger } from "../ai-ledger";

const user = { userId: 1, userType: "local" as const, plan: "free", sourceSlug: "synthetic" };
const text = "Paid EGP 85 at SYNTHETIC SHOP";
function prepared() { const result = prepareCaptureText(text); if (!result.ok) throw new Error("fixture"); return result.value; }
function reply(amount = 85) {
  return JSON.stringify({ state: "done", stateQuote: "Paid EGP 85", type: "purchase", flow: "out", flowQuote: "Paid EGP 85", ownership: "unknown", ownershipQuote: null,
    amount: { value: amount, currency: "EGP", quote: "Paid EGP 85" }, egp: null, fee: null, balance: null, limit: null,
    partyType: "merchant", party: "SYNTHETIC SHOP", partyQuote: "at SYNTHETIC SHOP", via: "card", category: null, recurring: false });
}
beforeEach(() => {
  state.settings = { capture_model_qualified: JSON.stringify({ version: "sms-v4", digest: CAPTURE_PROMPT_DIGEST, routes: ["primary", "backup"].map((slug) => ({ slug, model: "synthetic-model" })), pairs: ["synthetic:purchase"], dataProcessingApproved: true }) };
  state.replies = []; state.requests = []; state.reservation = true; vi.clearAllMocks();
});
describe("qualified sms-v4 transport", () => {
  it("uses a separate durable capture reservation and records the actual bill before returning", async () => {
    state.replies.push(reply());
    const result = await readCaptureWithModel(prepared(), user);
    expect(result).toMatchObject({ outcome: "read", proposal: { status: "ready", totalEgp: "85.00" } });
    expect(vi.mocked(reserveCaptureCall).mock.calls[0][0]).toMatchObject({ userId: 1, userType: "local", monthlyTokens: 2_000_000, concurrency: 64 });
    expect(vi.mocked(reserveCaptureCall).mock.calls[0][0].tokens).toBeGreaterThan(1800);
    expect(recordAiLedger).toHaveBeenCalledWith(expect.objectContaining({ channel: "capture", promptTokens: 1000, completionTokens: 200 }));
    expect(settleCaptureCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: 1200 }));
  });
  it("tries the other qualified provider after a semantically invalid successful HTTP response", async () => {
    state.replies.push(reply(999), reply());
    expect(await readCaptureWithModel(prepared(), user)).toMatchObject({ outcome: "read", provider: "backup" });
    expect(state.requests).toHaveLength(2); expect(settleCaptureCall).toHaveBeenCalledTimes(2);
  });
  it("tries the other provider on outage, retaining unknown usage conservatively", async () => {
    state.replies.push("not-json", reply());
    expect(await readCaptureWithModel(prepared(), user)).toMatchObject({ outcome: "read", provider: "backup" });
    state.requests = []; state.replies = [];
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "failed" });
    expect(settleCaptureCall).toHaveBeenLastCalledWith(expect.anything(), null);
  });
  it.each(["missing", "stale_digest", "one_provider", "no_processing_approval", "wrong_source"])("never calls an unqualified route: %s", async (condition) => {
    const policy = JSON.parse(state.settings.capture_model_qualified);
    if (condition === "missing") delete state.settings.capture_model_qualified;
    else {
      if (condition === "stale_digest") policy.digest = "stale";
      if (condition === "one_provider") policy.routes.pop();
      if (condition === "no_processing_approval") delete policy.dataProcessingApproved;
      if (condition === "wrong_source") policy.pairs = ["another:purchase"];
      state.settings.capture_model_qualified = JSON.stringify(policy);
    }
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "unqualified" });
    expect(state.requests).toHaveLength(0); expect(reserveCaptureCall).not.toHaveBeenCalled();
  });
  it("does not call after a refused budget or disabled model", async () => {
    state.reservation = false;
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "daily_cap" });
    state.settings.sms_ai_enabled = "false";
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "disabled" });
    expect(state.requests).toHaveLength(0);
  });
  it.each(["0", "-1", "not-a-number"])("fails closed on invalid cost cap %s", async (value) => {
    state.settings.capture_ai_daily_cost_cap_usd = value;
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "configuration" });
    expect(state.requests).toHaveLength(0); expect(reserveCaptureCall).not.toHaveBeenCalled();
  });
});
