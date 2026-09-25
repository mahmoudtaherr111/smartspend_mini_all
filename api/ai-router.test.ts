import { describe, expect, it, vi } from "vitest";

// These cases are about keys in the settings; keys in the developer's own .env must not decide them.
vi.mock("./lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/env")>();
  return { ...actual, env: { ...actual.env, GROQ_API_KEY: undefined, FIREWORKS_API_KEY: undefined, NVIDIA_API_KEY: undefined } };
});

import { resolveRoutingConfig } from "./ai-router";

describe("the parse's fallback route", () => {
  it("is Gemini with each plan's own model, whatever the user has spent", async () => {
    const cfg = { ai_api_key: "gemini-key", ai_model_free: "gemini-3.1-flash-lite", ai_model_pro: "gemini-3.5-flash", ai_model_ultra: "gemini-3.8-flash" };
    for (const [plan, model] of [["free", "gemini-3.1-flash-lite"], ["pro", "gemini-3.5-flash"], ["ultra", "gemini-3.8-flash"]]) {
      const resolved = await resolveRoutingConfig(plan, cfg);
      expect(resolved.provider).toBe("gemini");
      expect(resolved.apiKey).toBe("gemini-key");
      expect(resolved.model).toBe(model);
    }
  });

  it("never names a non-Gemini model for Gemini", async () => {
    const resolved = await resolveRoutingConfig("free", { ai_api_key: "k", ai_model_free: "llama-3.1-8b-instant" });
    expect(resolved.model.startsWith("gemini-")).toBe(true);
  });

  it("hands every built-in fallback key to the chain, not only the one a range picked", async () => {
    const resolved = await resolveRoutingConfig("pro", { ai_api_key: "g", groq_api_key: "q", nvidia_api_key: "n" });
    expect(resolved.keys).toMatchObject({ groq: "q", nvidia: "n", fireworks: "" });
  });
});
