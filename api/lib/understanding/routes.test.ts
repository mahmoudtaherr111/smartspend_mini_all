/**
 * The chain a reading runs on: the admin's classification models for the plan first, the
 * built-in providers with a key after, and the built-ins alone when the console cannot be read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => ({ resolveAdminRoutes: vi.fn() }));
vi.mock("../ai-gateway", () => gateway);

import { builtinRouting, resolveUnderstandingRoutes, tierOf } from "./routes";

const adminRoute = (slug: string, model: string, priority: number) => ({
  slug, protocol: "openai", baseUrl: `https://${slug}.example/v1`, apiKey: `${slug}-key`, model, priority, providerId: priority + 1, suppressReasoning: false,
});

beforeEach(() => {
  gateway.resolveAdminRoutes.mockReset();
});

describe("resolveUnderstandingRoutes", () => {
  it("leads with the admin's models for classification at the user's plan", async () => {
    const routes = [adminRoute("openrouter", "qwen/qwen3-235b", 0), adminRoute("openrouter", "meta/llama-4", 1)];
    gateway.resolveAdminRoutes.mockResolvedValue({ preferred: routes[0], routes });

    const chain = await resolveUnderstandingRoutes("pro", { ai_api_key: "gem-key", groq_api_key: "groq-key" });

    expect(gateway.resolveAdminRoutes).toHaveBeenCalledWith("classification", "pro");
    expect(chain.slice(0, 2).map((route) => [route.slug, route.model, route.priority])).toEqual([
      ["openrouter", "qwen/qwen3-235b", 0],
      ["openrouter", "meta/llama-4", 1],
    ]);
    expect(chain[0]).toMatchObject({ protocol: "openai", apiKey: "openrouter-key", providerId: 1 });
    const later = chain.slice(2);
    expect(later.find((route) => route.slug === "gemini")).toMatchObject({ apiKey: "gem-key", protocol: "gemini" });
    expect(later.find((route) => route.slug === "groq")).toMatchObject({ apiKey: "groq-key" });
  });

  it("falls back to the built-ins when the admin configured nothing, with the plan's own model", async () => {
    gateway.resolveAdminRoutes.mockResolvedValue({ preferred: null, routes: [] });
    const chain = await resolveUnderstandingRoutes("ultra", { ai_api_key: "gem-key", ai_model_ultra: "flash" });
    expect(gateway.resolveAdminRoutes).toHaveBeenCalledWith("classification", "ultra");
    expect(chain[0]).toMatchObject({ slug: "gemini", apiKey: "gem-key", priority: 0, model: builtinRouting("ultra", { ai_model_ultra: "flash" }).model });
    expect(chain[0].model).not.toBe("flash");
  });

  it("still answers from the built-ins when the console's routes cannot be read", async () => {
    gateway.resolveAdminRoutes.mockRejectedValue(new Error("database unavailable"));
    const chain = await resolveUnderstandingRoutes("free", { ai_api_key: "gem-key" });
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0].slug).toBe("gemini");
  });

  it("reads the server's own key when the settings hold none", () => {
    // vitest.config.ts injects a dummy GEMINI_API_KEY.
    expect(builtinRouting("free", {}).keys.gemini).toBe(process.env.GEMINI_API_KEY);
    expect(builtinRouting("free", { ai_api_key: "a", ai_api_key_2: "b" }).keys).toMatchObject({ gemini: "a", geminiSecondary: "b" });
  });

  it("maps any plan it does not know to free", () => {
    expect(tierOf("pro")).toBe("pro");
    expect(tierOf("ultra")).toBe("ultra");
    expect(tierOf("enterprise")).toBe("free");
    expect(tierOf(undefined)).toBe("free");
  });
});
