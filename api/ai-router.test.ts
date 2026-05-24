import { describe, expect, it } from "vitest";
import { resolveRoutingConfig } from "./ai-router";

describe("resolveRoutingConfig", () => {
  it("falls back to a Gemini-safe model when a Groq range has no key", async () => {
    const resolved = await resolveRoutingConfig("free", 0, {
      ai_api_key: "gemini-key",
      free_routing_ranges: JSON.stringify([
        { from: 0, to: 1000, provider: "groq", key_slot: "groq", model: "llama-3.1-8b-instant" },
      ]),
    });

    expect(resolved.provider).toBe("gemini");
    expect(resolved.apiKey).toBe("gemini-key");
    expect(resolved.model.startsWith("gemini-")).toBe(true);
    expect(resolved.model).not.toContain("llama");
  });

  it("keeps Groq routing when the Groq key is configured", async () => {
    const resolved = await resolveRoutingConfig("pro", 0, {
      ai_api_key: "gemini-key",
      groq_api_key: "groq-key",
      pro_routing_ranges: JSON.stringify([
        { from: 0, to: null, provider: "groq", key_slot: "groq", model: "llama-3.3-70b-versatile" },
      ]),
    });

    expect(resolved.provider).toBe("groq");
    expect(resolved.apiKey).toBe("groq-key");
    expect(resolved.model).toBe("llama-3.3-70b-versatile");
  });

  it("coerces mismatched Gemini ranges away from Groq model names", async () => {
    const resolved = await resolveRoutingConfig("free", 0, {
      ai_api_key: "gemini-key",
      free_routing_ranges: JSON.stringify([
        { from: 0, to: null, provider: "gemini", key_slot: "key1", model: "llama-3.1-8b-instant" },
      ]),
    });

    expect(resolved.provider).toBe("gemini");
    expect(resolved.model.startsWith("gemini-")).toBe(true);
  });
});
