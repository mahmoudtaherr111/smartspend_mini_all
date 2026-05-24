import { describe, expect, it } from "vitest";
import { coerceModelForProvider } from "./model-mapper";

describe("model provider coercion", () => {
  it("does not allow Groq model names on Gemini", () => {
    expect(coerceModelForProvider("llama-3.1-8b-instant", "gemini", "free")).toBe("gemini-2.0-flash");
  });

  it("does not allow Gemini model names on Groq", () => {
    expect(coerceModelForProvider("gemini-2.5-flash", "groq", "pro")).toBe("llama-3.3-70b-versatile");
  });
});
