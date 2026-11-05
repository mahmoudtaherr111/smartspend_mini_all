import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ settings: {} as Record<string, string>, replies: [] as string[], requests: [] as unknown[], reservation: true, adminRoutes: true }));
vi.mock("../settings-cache", () => ({ getSystemSettings: async () => state.settings }));
vi.mock("../ai-gateway", () => ({ resolveAdminRoutes: async () => ({ preferred: null, routes: state.adminRoutes ? ["primary", "backup"].map((slug) => ({ slug, model: "synthetic-model", apiKey: "synthetic", baseUrl: "https://synthetic.invalid", protocol: "openai", priority: 0 })) : [] }) }));
vi.mock("./admission", () => ({ reserveCaptureCall: vi.fn(async () => state.reservation ? { ok: true, reservation: { id: "reservation", userId: 1, userType: "local" } } : { ok: false, reason: "daily_cap" }), settleCaptureCall: vi.fn(async () => {}) }));
vi.mock("../ai-pricing", () => ({ ratesFor: async () => ({ input: 0.25, output: 1.5, cached: 0.025 }), costAtRates: (_: unknown, usage: { promptTokens: number; completionTokens: number }) => (usage.promptTokens * 0.25 + usage.completionTokens * 1.5) / 1e6 }));
vi.mock("../ai-ledger", () => ({ recordAiLedger: vi.fn(async () => {}) }));
vi.mock("./consent", () => ({ CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION: "2026-11-05", captureConsentsOf: vi.fn(async () => ({ capture: true, aiReading: true })) }));
vi.mock("../llm-router", async (load) => ({ ...await load<typeof import("../llm-router")>(), executeLlmChain: vi.fn(async (routes, request) => {
  state.requests.push({ ...request, route: routes[0] });
  const text = state.replies.shift(); if (!text) throw new Error("synthetic outage");
  return { text, route: routes[0], attempts: [{ slug: routes[0].slug, model: routes[0].model, ok: true, promptTokens: 1000, completionTokens: 200, latencyMs: 1 }] };
}) }));
import { captureRoutes, readCaptureWithModel } from "./model-reader";
import { prepareCaptureText } from "./privacy";
import { reserveCaptureCall, settleCaptureCall } from "./admission";
import { recordAiLedger } from "../ai-ledger";

const user = { userId: 1, userType: "local" as const, plan: "free", sender: "SYNTHBANK" };
const text = "Paid EGP 85 at SYNTHETIC SHOP. Balance EGP 600";
function prepared() { const result = prepareCaptureText(text); if (!result.ok) throw new Error("fixture"); return result.value; }
function reply(amount = "N1") {
  return JSON.stringify({ status: "completed", kind: "purchase", direction: "out", amount, amountEgp: null, fee: null, feeIncluded: null, balance: "N2",
    party: "SYNTHETIC SHOP", partyType: "merchant", method: "card", category: null, subcategory: null, recurring: false });
}
beforeEach(() => {
  state.settings = {};
  state.replies = []; state.requests = []; state.reservation = true; state.adminRoutes = true; vi.clearAllMocks();
});
describe("sms-v5 transport", () => {
  it("sends the labelled message and the sender, never a number the model could copy wrong", async () => {
    state.replies.push(reply());
    const result = await readCaptureWithModel(prepared(), user);
    expect(result).toMatchObject({ outcome: "read", proposal: { status: "ready", totalEgp: "85.00" }, check: { facts: { balance: { value: 600 } } } });
    expect(JSON.parse((state.requests[0] as { userPrompt: string }).userPrompt)).toEqual({ sender: "SYNTHBANK", message: "Paid EGP {N1:85} at SYNTHETIC SHOP. Balance EGP {N2:600}" });
  });
  it("uses a durable capture reservation and records the actual bill before returning", async () => {
    state.replies.push(reply());
    await readCaptureWithModel(prepared(), user);
    expect(vi.mocked(reserveCaptureCall).mock.calls[0][0]).toMatchObject({ userId: 1, userType: "local", monthlyTokens: 2_000_000, concurrency: 64 });
    expect(recordAiLedger).toHaveBeenCalledWith(expect.objectContaining({ channel: "capture", promptTokens: 1000, completionTokens: 200, metadata: { promptVersion: "sms-v5" } }));
    expect(settleCaptureCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokens: 1200 }));
  });
  it("asks the next route when a reply fails its checks or the provider is down", async () => {
    state.replies.push(reply("N9"), reply());
    expect(await readCaptureWithModel(prepared(), user)).toMatchObject({ outcome: "read", provider: "backup" });
    state.replies.push("not-json", reply());
    expect(await readCaptureWithModel(prepared(), user)).toMatchObject({ outcome: "read", provider: "backup" });
    state.replies = [];
    expect(await readCaptureWithModel(prepared(), user)).toEqual({ outcome: "failed" });
    expect(settleCaptureCall).toHaveBeenLastCalledWith(expect.anything(), null);
  });
  it("answers on the server's Gemini key when the admin set no route", async () => {
    state.adminRoutes = false;
    state.settings.ai_api_key = "synthetic-gemini";
    const routes = await captureRoutes("free");
    expect(routes.map((route) => [route.slug, route.protocol, route.model])).toEqual([["gemini", "gemini", "gemini-3.5-flash-lite"], ["gemini", "gemini", "gemini-3.1-flash-lite"]]);
    state.replies.push(reply());
    expect(await readCaptureWithModel(prepared(), user)).toMatchObject({ outcome: "read", provider: "gemini", model: "gemini-3.5-flash-lite" });
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
