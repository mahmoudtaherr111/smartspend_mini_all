import { describe, expect, it } from "vitest";
import { coerceModelForProvider, defaultGeminiModelForPlan, geminiFallbackChain, mapModelName } from "./model-mapper";

describe("model provider coercion", () => {
  it("does not allow Groq model names on Gemini", () => {
    expect(
      coerceModelForProvider("llama-3.1-8b-instant", "gemini", "free"),
    ).toBe("gemini-3.1-flash-lite");
  });

  it("does not allow Gemini model names on Groq", () => {
    expect(coerceModelForProvider("gemini-2.5-flash", "groq", "pro")).toBe(
      "llama-3.3-70b-versatile",
    );
  });

  it("keeps gemini-3.5-flash as passthrough", () => {
    expect(coerceModelForProvider("gemini-3.5-flash", "gemini", "free")).toBe(
      "gemini-3.5-flash",
    );
  });

  it("identifies whisper models as groq models", () => {
    expect(coerceModelForProvider("whisper-large-v3", "groq", "free")).toBe(
      "whisper-large-v3",
    );
  });
});

describe("Gemini models Google serves", () => {
  it("maps gemini-3.1-pro, which Google does not serve, and the pro shorthand to gemini-3.8-flash", () => {
    expect(mapModelName("gemini-3.1-pro")).toBe("gemini-3.8-flash");
    expect(mapModelName("gemini-1.5-pro")).toBe("gemini-3.8-flash");
    expect(mapModelName("ultra")).toBe("gemini-3.8-flash");
    expect(defaultGeminiModelForPlan("ultra")).toBe("gemini-3.8-flash");
  });

  it("falls back from a busy model to the lighter ones, then to the stronger ones nearest first", () => {
    expect(geminiFallbackChain("gemini-3.8-flash")).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
    expect(geminiFallbackChain("gemini-3.5-flash-lite")).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]);
    // The free and Pro default is the lightest; when it is busy the request still gets an answer.
    expect(geminiFallbackChain("gemini-3.1-flash-lite")).toEqual(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]);
    expect(geminiFallbackChain("gemini-3.5-flash")).toEqual(["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]);
  });
});
